import { randomUUID } from 'node:crypto'
import type { Config, Secrets } from '../config/schema.js'
import type { Logger } from '../logging/logger.js'
import { MinecraftClient } from '../minecraft/client.js'
import { buildSnapshot } from '../minecraft/snapshot.js'
import { Repertoire } from '../dialogue/repertoire.js'
import { loadCatalog } from '../dialogue/loader.js'
import { MemoryStore } from '../memory/store.js'
import { AiLayer } from '../ai/index.js'
import { MessageRouter } from '../behaviors/router.js'
import { StateMachine } from '../behaviors/state-machine.js'
import { classifyThreats, planDefense, canStrike } from '../behaviors/defense/threat-watcher.js'
import { goals } from 'mineflayer-pathfinder'
import {
  equipBestWeapon,
  runIntent,
  ActionAborted,
  ActionRefused,
  NoProgress,
} from '../behaviors/actions/index.js'
import { bestWeapon } from '../domain/mobs.js'
import type { Intent } from '../domain/intent.js'
import type { WorldSnapshot } from '../domain/types.js'

const THREAT_TICK_MS = 250

/**
 * Composition root: monta as dependências e liga os laços.
 *
 * Regra que atravessa a classe inteira: o laço de defesa (`tickDefense`) é
 * síncrono e determinístico, e NUNCA espera por uma chamada de IA.
 */
export class CompanionBot {
  private readonly mc: MinecraftClient
  private readonly repertoire: Repertoire
  private readonly memory: MemoryStore
  private readonly ai: AiLayer
  private readonly router: MessageRouter
  private readonly state = new StateMachine()

  private defenseEnabled: boolean
  private readonly recentAttackers = new Set<number>()
  private threatTimer: ReturnType<typeof setInterval> | null = null
  private engagementStartedAt: number | null = null
  private wasNight: boolean | null = null

  constructor(
    private readonly config: Config,
    secrets: Secrets,
    private readonly logger: Logger,
  ) {
    this.defenseEnabled = config.defense.enabled

    const catalogReport = loadCatalog(config.dialogue.catalogPath)
    for (const warning of catalogReport.warnings) logger.warn(warning)
    logger.info(
      { entries: catalogReport.entryCount, responses: catalogReport.responseCount },
      'repertório carregado',
    )

    this.repertoire = new Repertoire({
      catalog: catalogReport.catalog,
      dialogue: config.dialogue,
      persona: config.persona,
      owner: config.ownerPlayer,
    })

    this.memory = new MemoryStore({
      config: config.memory,
      sessionId: randomUUID(),
      onWriteError: (err) => logger.error({ err: err.message }, 'falha ao gravar histórico'),
      onWarning: (message) => logger.warn(message),
    })

    this.ai = new AiLayer({
      llm: config.llm,
      secrets,
      onCircuitChange: (provider, open) =>
        logger[open ? 'warn' : 'info']({ provider }, open ? 'circuito aberto' : 'circuito fechado'),
    })

    this.router = new MessageRouter({
      repertoire: this.repertoire,
      ai: this.ai,
      persona: config.persona,
      owner: config.ownerPlayer,
      onFiller: (text) => this.say(text, 'repertoire', 'espera'),
      fillerAfterMs: config.llm.fillerAfterMs,
      history: () => this.memory.shortTerm(),
    })

    this.mc = new MinecraftClient(config, secrets, logger)
    this.wireEvents()
  }

  async start(): Promise<void> {
    this.memory.init()

    const removed = this.memory.applyRetention()
    for (const file of removed) this.logger.info({ file }, 'histórico expirado removido')

    const resumed = this.memory.resume()
    if (resumed.loaded > 0) {
      this.logger.info({ turns: resumed.loaded }, 'contexto do dia retomado')
    }

    // Fallback de nuvem com primário local significa que, na falha do local,
    // a mensagem da criança PASSA A SAIR da máquina. Isso precisa ser dito.
    if (this.ai.leaksToCloudOnFallback) {
      this.logger.warn(
        'ATENÇÃO PRIVACIDADE: com o Ollama fora do ar, as mensagens do jogador ' +
          'serão enviadas para o Gemini (nuvem). Use llm.fallbackProvider: null ' +
          'para que nada saia desta máquina.',
      )
    }

    // Falha de aquecimento NUNCA impede o bot de iniciar.
    const warmUpError = await this.ai.warmUp()
    if (warmUpError) {
      this.logger.warn(
        { provider: warmUpError.provider },
        `IA indisponível — o bot vai operar por comandos e repertório.\n${warmUpError.toActionableMessage()}`,
      )
    }

    this.mc.connect()
  }

  private wireEvents(): void {
    this.mc.on('spawn', () => {
      this.state.reset()
      const greeting = this.repertoire.say('saudacao', this.snapshot())
      if (greeting) this.say(greeting.text, 'repertoire', greeting.entryId)
      this.startThreatWatcher()
    })

    this.mc.on('chat', (username, message) => {
      void this.onChat(username, message)
    })

    this.mc.on('ownerHurt', () => {
      // Marca quem machucou o dono. O laço de defesa consome no próximo tick,
      // sem passar por IA.
      for (const entity of this.snapshot().nearbyEntities) {
        if (entity.type === 'hostile' && (entity.distanceToOwner ?? 99) < 5) {
          this.recentAttackers.add(entity.id)
        }
      }
    })

    this.mc.on('entityGone', (id) => this.recentAttackers.delete(id))

    this.mc.on('death', () => {
      this.state.reset()
      this.say('Ai, eu morri! Já tô voltando...', 'spontaneous')
    })

    this.mc.on('end', () => this.stopThreatWatcher())
    this.mc.on('giveUp', () => this.stop())
  }

  private snapshot(): WorldSnapshot {
    const bot = this.mc.raw
    if (!bot) {
      return buildSnapshot({}, { ownerName: this.config.ownerPlayer, state: this.state.state })
    }
    const snap = buildSnapshot(bot as never, {
      ownerName: this.config.ownerPlayer,
      state: this.state.state,
      entityTargets: this.mc.entityTargets,
    })
    const owner = bot.players[this.config.ownerPlayer]?.entity
    // `health` do outro jogador nem sempre vem; quando vem, entra no snapshot.
    const ownerHealth = (owner as { health?: number } | undefined)?.health
    return { ...snap, ownerHealth: ownerHealth ?? null }
  }

  private say(
    text: string,
    source: 'repertoire' | 'llm' | 'command' | 'spontaneous',
    entryId?: string,
    provider?: string,
  ): void {
    this.mc.say(text)
    this.memory.record({
      speaker: this.config.persona.name,
      text,
      source,
      botState: this.state.state,
      ...(entryId ? { entryId } : {}),
      ...(provider ? { provider } : {}),
    })
  }

  // ─────────────────────────────── CHAT ────────────────────────────────

  private async onChat(username: string, message: string): Promise<void> {
    const isOwner = username === this.config.ownerPlayer

    this.memory.record({
      speaker: username,
      text: message,
      source: 'command',
      botState: this.state.state,
    })

    if (!isOwner) {
      // Outros jogadores conversam, mas não comandam.
      const parsed = await this.router.route(message, this.snapshot())
      if (parsed.intent !== null) {
        this.say(`Desculpa ${username}, eu só obedeço o ${this.config.ownerPlayer}!`, 'repertoire')
      } else if (parsed.reply) {
        this.say(
          parsed.reply,
          parsed.source === 'llm' ? 'llm' : 'repertoire',
          parsed.entryId,
          parsed.provider,
        )
      }
      return
    }

    const snapshot = this.snapshot()
    const result = await this.router.route(message, snapshot)

    if (result.reply) {
      this.say(
        result.reply,
        result.source === 'llm' ? 'llm' : 'repertoire',
        result.entryId,
        result.provider,
      )
      return
    }

    if (result.intent) {
      await this.execute(result.intent)
      return
    }

    // Nem comando nem conversa: tenta interpretar como pedido de ação.
    const intent = await this.router.interpret(message, snapshot)
    if (intent) await this.execute(intent)
  }

  // ──────────────────────────── INTENÇÕES ──────────────────────────────

  private async execute(intent: Intent): Promise<void> {
    // Emergência recusa qualquer ordem até estar seguro.
    if (this.state.state === 'EMERGENCY') {
      this.say('Peraí! Tô muito machucado, não consigo agora.', 'repertoire')
      return
    }

    switch (intent.type) {
      case 'FOLLOW':
        return this.startFollow()
      case 'STAY':
        return this.startStay()
      case 'STOP':
        return this.stopEverything()
      case 'DEFENSE_ON':
        this.defenseEnabled = true
        this.say('Pode deixar, eu te defendo!', 'command')
        return
      case 'DEFENSE_OFF':
        this.defenseEnabled = false
        if (this.state.state === 'DEFEND') this.state.resume()
        this.say('Tá bom, não brigo mais.', 'command')
        return
      default:
        return this.runWorldAction(intent)
    }
  }

  private startFollow(): void {
    if (!this.snapshot().ownerVisible) {
      this.say('Não tô te vendo! Cadê você?', 'command')
      return
    }
    this.state.command('FOLLOW')
    this.mc.followOwner(this.config.behavior.followDistance)
    this.say('Tô indo!', 'command')
  }

  private startStay(): void {
    const position = this.snapshot().position
    this.state.command('STAY', { stayPoint: { ...position } })
    this.mc.stopMoving()
    this.say('Tá bom, fico aqui de guarda!', 'command')
  }

  private stopEverything(): void {
    this.state.command('IDLE')
    this.mc.stopMoving()
    this.say('Parei!', 'command')
  }

  private async runWorldAction(intent: Intent): Promise<void> {
    const bot = this.mc.raw
    if (!bot) return

    this.state.command('ACTION', { actionLabel: intent.type })

    try {
      const outcome = await runIntent(
        {
          bot,
          behavior: this.config.behavior,
          ownerName: this.config.ownerPlayer,
          signal: this.state.signal,
        },
        intent,
      )
      this.say(outcome.message, 'command')
    } catch (err) {
      if (err instanceof ActionAborted) return // já avisou no `dudu, para`
      if (err instanceof ActionRefused) this.say(`Ahh, ${err.message}.`, 'command')
      else if (err instanceof NoProgress) this.say('Não consegui chegar lá, desculpa!', 'command')
      else {
        this.logger.error({ err: String(err) }, 'ação falhou')
        this.say('Deu ruim aqui, não consegui.', 'command')
      }
    } finally {
      if (this.state.state === 'ACTION') this.state.resume()
    }
  }

  // ──────────────────────────── DEFESA ─────────────────────────────────

  private startThreatWatcher(): void {
    this.stopThreatWatcher()
    this.threatTimer = setInterval(() => this.tickDefense(), THREAT_TICK_MS)
  }

  private stopThreatWatcher(): void {
    if (this.threatTimer) clearInterval(this.threatTimer)
    this.threatTimer = null
  }

  /**
   * Laço de defesa. Síncrono, determinístico, sem nenhuma chamada de IA:
   * uma chamada de modelo leva segundos e um zumbi mata em segundos.
   */
  private tickDefense(): void {
    const bot = this.mc.raw
    if (!bot) return

    const snapshot = this.snapshot()
    this.tickAmbientEvents(snapshot)

    const threats = classifyThreats(snapshot, {
      defense: { ...this.config.defense, enabled: this.defenseEnabled },
      ownerName: this.config.ownerPlayer,
      recentAttackers: this.recentAttackers,
    })

    const plan = planDefense(snapshot, threats, {
      defense: { ...this.config.defense, enabled: this.defenseEnabled },
      ownerName: this.config.ownerPlayer,
      weapon: bestWeapon(bot.inventory.items())?.name ?? null,
    })

    switch (plan.kind) {
      case 'none':
        this.finishCombatIfNeeded()
        return

      case 'retreat':
        if (this.state.interrupt('EMERGENCY')) {
          this.sayCombat('combate_recuo', snapshot)
          this.retreatToOwner(snapshot)
        }
        return

      case 'flee-creeper':
        if (this.state.canInterrupt('DEFEND') && this.state.interrupt('DEFEND')) {
          this.sayCombat('combate_creeper', snapshot)
        }
        this.fleeFrom(plan.threat.entity.position)
        return

      case 'unarmed':
        if (this.state.canInterrupt('DEFEND') && this.state.interrupt('DEFEND')) {
          this.sayCombat('combate_desarmado', snapshot)
        }
        this.retreatToOwner(snapshot)
        return

      case 'engage':
        this.engage(plan.threat.entity.id, snapshot)
        return
    }
  }

  private engage(entityId: number, snapshot: WorldSnapshot): void {
    const bot = this.mc.raw
    if (!bot) return

    if (this.state.state !== 'DEFEND') {
      if (!this.state.interrupt('DEFEND', { targets: [entityId] })) return
      this.engagementStartedAt = Date.now()
      this.sayCombat('combate_inicio', snapshot)
      void equipBestWeapon(bot).catch(() => {})
    }

    // Timeout de engajamento: alvo inalcançável não pode prender o bot.
    if (
      this.engagementStartedAt !== null &&
      Date.now() - this.engagementStartedAt > this.config.defense.engagementTimeoutMs
    ) {
      this.say('Não consegui alcançar esse aí, desisti.', 'spontaneous')
      this.finishCombat()
      return
    }

    const target = bot.entities[entityId]
    if (!target) {
      this.finishCombat()
      return
    }

    // Segunda checagem, no instante do golpe: a entidade pode ter mudado de
    // estado desde a seleção.
    const fresh = snapshot.nearbyEntities.find((e) => e.id === entityId)
    if (!fresh || !canStrike(fresh)) {
      this.finishCombat()
      return
    }

    void bot.pathfinder.goto(makeNearGoal(target.position)).catch(() => {})
    if (fresh.distanceToBot <= 3.5) {
      try {
        bot.attack(target)
      } catch {
        /* alvo sumiu entre a checagem e o golpe */
      }
    }
  }

  private finishCombatIfNeeded(): void {
    if (this.state.state === 'DEFEND' || this.state.state === 'EMERGENCY') this.finishCombat()
  }

  private finishCombat(): void {
    const snapshot = this.snapshot()
    this.engagementStartedAt = null
    this.recentAttackers.clear()

    const previous = this.state.resume()
    this.sayCombat('combate_fim', snapshot)

    // Retomada: volta a seguir, ou volta à coordenada memorizada do STAY.
    if (previous.to === 'FOLLOW') this.mc.followOwner(this.config.behavior.followDistance)
    else if (previous.to === 'STAY') {
      const point = this.state.ctx.stayPoint
      if (point) this.mc.gotoPosition(point.x, point.y, point.z)
    }
  }

  private sayCombat(entryId: string, snapshot: WorldSnapshot): void {
    const line = this.repertoire.say(entryId, snapshot)
    if (line) this.say(line.text, 'repertoire', line.entryId)
  }

  private retreatToOwner(snapshot: WorldSnapshot): void {
    const owner = snapshot.ownerPosition
    if (owner) this.mc.gotoPosition(owner.x, owner.y, owner.z, 2)
  }

  private fleeFrom(position: { x: number; y: number; z: number }): void {
    const me = this.snapshot().position
    const dx = me.x - position.x
    const dz = me.z - position.z
    const norm = Math.hypot(dx, dz) || 1
    this.mc.gotoPosition(me.x + (dx / norm) * 12, me.y, me.z + (dz / norm) * 12, 2)
  }

  /** Falas espontâneas por evento do jogo. */
  private tickAmbientEvents(snapshot: WorldSnapshot): void {
    if (this.wasNight === null) {
      this.wasNight = snapshot.isNight
      return
    }
    if (snapshot.isNight === this.wasNight) return

    this.wasNight = snapshot.isNight
    const entryId = snapshot.isNight ? 'evento_anoiteceu' : 'evento_amanheceu'
    const line = this.repertoire.spontaneous(entryId, snapshot)
    if (line) this.say(line.text, 'spontaneous', line.entryId)
  }

  stop(): void {
    this.stopThreatWatcher()
    this.mc.quit()
  }
}

function makeNearGoal(position: { x: number; y: number; z: number }) {
  return new goals.GoalNear(position.x, position.y, position.z, 2)
}
