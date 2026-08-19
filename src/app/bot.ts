import { randomUUID } from 'node:crypto'
import type { Config, Secrets } from '../config/schema.js'
import type { Logger } from '../logging/logger.js'
import { MinecraftClient } from '../minecraft/client.js'
import { buildSnapshot } from '../minecraft/snapshot.js'
import { Repertoire } from '../dialogue/repertoire.js'
import { loadCatalog } from '../dialogue/loader.js'
import { MemoryStore } from '../memory/store.js'
import { AiLayer } from '../ai/index.js'
import { MessageRouter, type RouteResult } from '../behaviors/router.js'
import { StateMachine } from '../behaviors/state-machine.js'
import { classifyThreats, planDefense, canStrike } from '../behaviors/defense/threat-watcher.js'
import {
  createSession,
  GameAborted,
  resolveGame,
  type GameSession,
  type GameWorld,
} from '../behaviors/games/index.js'
import type { GameName, GameRole } from '../domain/games.js'
import { isGiveUp, parseRoleAnswer } from '../behaviors/commands.js'
import {
  blockSourceFrom,
  coverAround,
  hasLineOfSight,
  isInFieldOfView,
  raycastWorldFrom,
  resolveGround,
  DEFAULT_FOV_HALF_ANGLE,
} from '../minecraft/visibility.js'
import { distance } from '../minecraft/snapshot.js'
import pathfinderPkg from 'mineflayer-pathfinder'
import {
  equipBestWeapon,
  runIntent,
  escape,
  openDoor,
  blockedByDoor,
  ActionAborted,
  ActionRefused,
  NoProgress,
} from '../behaviors/actions/index.js'
import { needsEscape } from '../domain/escape.js'
import { bestWeapon } from '../domain/mobs.js'
import type { Intent } from '../domain/intent.js'
import type { Vec3Like, WorldSnapshot } from '../domain/types.js'

const { goals } = pathfinderPkg

const THREAT_TICK_MS = 250

/** Folga do `GoalNear` ao caminhar durante o jogo. */
const GAME_GOAL_RANGE = 1

/** Teto por caminhada dentro de uma rodada, para a busca não passar do tempo. */
const GAME_WALK_TIMEOUT_MS = 8_000

/** Entrada do repertório que faz a pergunta de papel de cada jogo. */
const ROLE_QUESTION_ENTRY: Record<GameName, string> = {
  esconde_esconde: 'jogo_quem_esconde',
  pega_pega: 'jogo_quem_corre',
}

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
  /** Rodada em andamento, ou `null`. */
  private game: GameSession | null = null
  /** Dimensão em que a rodada começou: trocar de dimensão encerra o jogo. */
  private gameDimension: string | null = null
  /**
   * Pergunta de papel esperando resposta.
   *
   * NÃO é estado da máquina de estados: enquanto espera, o bot segue em `IDLE`
   * (ou no que estava), livre para seguir, parar, conversar e se defender. Um
   * estado só para segurar uma pergunta daria prioridade a algo que não faz
   * nada. Guarda o jogo porque `eu` significa papéis opostos nos dois.
   * Ver: bot_games_delta.md → "Escolha de papel pendente".
   */
  private pendingRole: { game: GameName; expiresAt: number; reasked: boolean } | null = null
  /** Vigia de "preso": posição e desde quando ele não sai do lugar seguindo. */
  private lastFollowPos: Vec3Like | null = null
  private stuckSince: number | null = null
  /** Evita reentrar na subida enquanto uma já está em andamento. */
  private escaping = false

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

    // Conecta primeiro: em CPU, carregar o modelo leva minutos, e o bot não
    // pode ficar fora do mundo esperando isso — a criança está lá olhando.
    // Comandos e repertório já funcionam sem a IA estar quente.
    this.mc.connect()

    // Falha de aquecimento NUNCA impede o bot de iniciar.
    const warmUpError = await this.ai.warmUp()
    if (warmUpError) {
      this.logger.warn(
        { provider: warmUpError.provider },
        `IA indisponível — o bot vai operar por comandos e repertório.\n${warmUpError.toActionableMessage()}`,
      )
    }
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
      // `reset()` aborta o sinal e com ele a rodada em andamento.
      const wasPlaying = this.game !== null
      this.state.reset()
      this.say('Ai, eu morri! Já tô voltando...', 'spontaneous')
      if (wasPlaying) this.sayGame('jogo_cancelado')
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

  /**
   * Registra no log o que a IA recebeu e devolveu.
   *
   * Também registra o caso em que ela NÃO respondeu: com a IA ligada, uma
   * resposta `nao_entendi` só acontece quando o provider estourou o tempo ou
   * falhou — é o sinal para ajustar `llm.ollama.timeoutMs`.
   */
  private logLlm(question: string, result: RouteResult): void {
    if (result.source === 'llm') {
      this.logger.info(
        {
          pergunta: question,
          resposta: result.reply,
          // A ação proposta precisa aparecer no log: é por aqui que se descobre
          // se a IA está propondo ação demais, de menos ou errada.
          acao: result.action ? result.action.type : null,
          params: result.action ? result.action.params : null,
          provider: result.provider,
          latencyMs: result.latencyMs,
        },
        'IA respondeu',
      )
      return
    }

    if (this.ai.enabled && result.entryId === 'nao_entendi') {
      this.logger.warn(
        { pergunta: question },
        'IA não respondeu (timeout, erro ou circuito aberto) — caiu no repertório',
      )
    }
  }

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
      this.logLlm(message, parsed)
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

    // Desistir só faz sentido com uma rodada rolando. Fora dela, `cade voce`
    // é conversa e desce na cascata normalmente.
    if (this.game !== null && isGiveUp(message, this.config.persona.name)) {
      this.game.requestReveal()
      return
    }

    // Resposta da pergunta de papel. Vem antes da cascata pelo mesmo motivo do
    // `isGiveUp`: `eu` só significa "eu me escondo" enquanto a pergunta está de
    // pé. Sem pendência viva, desce como conversa normal.
    const answered = this.takeRoleAnswer(message)
    if (answered) {
      await this.startGame(answered.game, answered.role)
      return
    }

    const snapshot = this.snapshot()
    const result = await this.router.route(message, snapshot)
    this.logLlm(message, result)

    // Comando reconhecido descarta a pergunta: quem manda `me segue` mudou de
    // ideia sobre brincar, e uma pendência sobrevivente faria um `eu` solto lá
    // na frente iniciar uma rodada que ninguém pediu.
    if (result.intent) this.pendingRole = null

    if (result.reply) {
      this.say(
        result.reply,
        result.source === 'llm' ? 'llm' : 'repertoire',
        result.entryId,
        result.provider,
      )

      // A fala vem antes da ação de propósito: a criança ouve "já vou pegar!"
      // e SÓ ENTÃO vê o bot sair andando. Agir calado parece bug.
      // Ver: ai_companion_delta.md → "Resposta da IA carrega a ação".
      if (result.action) {
        this.pendingRole = null
        await this.execute(result.action)
        return
      }

      // Depois de responder, não antes: a criança falou de outra coisa, o bot
      // atende e só então lembra que tinha perguntado.
      this.reaskRoleOnce()
      return
    }

    if (result.intent) {
      await this.execute(result.intent)
      return
    }

    this.reaskRoleOnce()
  }

  // ────────────────────── PERGUNTA DE PAPEL ────────────────────────────

  /**
   * Lê a mensagem como resposta da pergunta de papel e consome a pendência.
   *
   * Devolve `null` quando não há pergunta de pé, quando o prazo estourou, ou
   * quando a mensagem não responde nada — nesses casos ela segue na cascata
   * como qualquer outra.
   */
  private takeRoleAnswer(message: string): { game: GameName; role: GameRole } | null {
    const pending = this.pendingRole
    if (pending === null) return null

    if (Date.now() >= pending.expiresAt) {
      // Expira em silêncio: a criança saiu de perto, e o bot falando sozinho
      // no chat minutos depois não ajudaria ninguém.
      this.pendingRole = null
      return null
    }

    const role = parseRoleAnswer(message, this.config.persona.name, pending.game)
    if (role === null) return null

    this.pendingRole = null
    return { game: pending.game, role }
  }

  /** Lembra a pergunta uma única vez. Insistir vira cobrança, não convite. */
  private reaskRoleOnce(): void {
    const pending = this.pendingRole
    if (pending === null || pending.reasked) return
    if (Date.now() >= pending.expiresAt) {
      this.pendingRole = null
      return
    }

    pending.reasked = true
    this.sayGame(ROLE_QUESTION_ENTRY[pending.game])
  }

  /** Pergunta quem faz o quê e passa a esperar a resposta. */
  private askRole(game: GameName): void {
    this.pendingRole = {
      game,
      expiresAt: Date.now() + this.config.games.roleQuestionTimeoutMs,
      reasked: false,
    }
    this.sayGame(ROLE_QUESTION_ENTRY[game])
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
      case 'PLAY_GAME':
        return this.startGame(intent.params.game, intent.params.role)
      case 'ASK_WHICH_GAME':
        // Perguntar "qual você quer?" com as brincadeiras desligadas seria
        // oferecer o que o bot não pode fazer. Ver project.md → "Público do bot".
        this.sayGame(this.config.games.enabled ? 'jogo_qual_brincadeira' : 'jogo_desligado')
        return
      default:
        return this.runWorldAction(intent)
    }
  }

  /**
   * Vigia de "preso num buraco".
   *
   * Seguir o dono é fogo-e-esquece: `GoalFollow` não avisa quando não existe
   * caminho. Sem isto, a criança chama e o bot simplesmente fica parado no
   * fundo da ravina, calado.
   *
   * Geometria local não distingue "poço largo" de "campo aberto" — o sinal
   * confiável é: mandaram seguir, ele não sai do lugar, e o dono está bem
   * acima. Ver: player_commands_delta.md → "Sair de buraco".
   */
  private tickStuck(): void {
    if (this.escaping || this.game !== null || this.state.state !== 'FOLLOW') {
      this.stuckSince = null
      this.lastFollowPos = null
      return
    }

    const bot = this.mc.raw
    if (!bot) return

    const pos = bot.entity.position
    const agora = Date.now()

    if (this.lastFollowPos !== null && distance(pos, this.lastFollowPos) >= 0.5) {
      // Andou: não está preso.
      this.lastFollowPos = { x: pos.x, y: pos.y, z: pos.z }
      this.stuckSince = agora
      return
    }

    if (this.lastFollowPos === null) {
      this.lastFollowPos = { x: pos.x, y: pos.y, z: pos.z }
      this.stuckSince = agora
      return
    }

    if (this.stuckSince === null) this.stuckSince = agora
    if (agora - this.stuckSince < this.config.behavior.escapeStuckMs) return

    const owner = bot.players[this.config.ownerPlayer]?.entity?.position ?? null
    const config = {
      minDrop: this.config.behavior.escapeMinDrop,
      maxHeight: this.config.behavior.escapeMaxHeight,
    }

    // Porta fechada vem antes de buraco: é causa mais comum, muito mais barata
    // de resolver, e acontece no mesmo nível — onde a regra do buraco nem vale.
    const deps = this.actionDeps(bot)
    if (blockedByDoor(deps)) {
      void this.unstickAndResumeFollow('porta')
      return
    }

    if (!needsEscape(pos, owner, config)) {
      // Parado, mas nem porta nem buraco: o vigia não tem o que fazer aqui.
      this.stuckSince = agora
      return
    }

    void this.unstickAndResumeFollow('buraco')
  }

  /** Dependências das ações de mundo, do jeito que `runWorldAction` monta. */
  private actionDeps(bot: NonNullable<typeof this.mc.raw>) {
    return {
      bot,
      behavior: this.config.behavior,
      ownerName: this.config.ownerPlayer,
      signal: this.state.signal,
    }
  }

  /**
   * Destrava e volta a seguir.
   *
   * A fala vem antes da ação: a criança precisa saber por que o bot sumiu do
   * caminho por um minuto.
   */
  private async unstickAndResumeFollow(motivo: 'porta' | 'buraco'): Promise<void> {
    const bot = this.mc.raw
    if (!bot) return

    this.escaping = true
    this.stuckSince = null
    this.say(
      motivo === 'porta'
        ? 'Tem uma porta fechada no caminho! Já abro.'
        : 'Peraí, caí num buraco! Vou fazer uma escadinha.',
      'command',
    )

    try {
      const deps = this.actionDeps(bot)
      const outcome = motivo === 'porta' ? await openDoor(deps) : await escape(deps)
      this.say(outcome.message, 'command')
      this.logger.info({ motivo, ok: outcome.ok }, 'destravou o caminho')
    } catch (err) {
      if (err instanceof ActionAborted) return
      if (err instanceof ActionRefused) this.say(`Ahh, ${err.message}.`, 'command')
      else {
        this.logger.error({ motivo, err: String(err) }, 'não consegui destravar')
        this.say('Não consegui passar, vem me buscar?', 'command')
      }
    } finally {
      this.escaping = false
      this.lastFollowPos = null
      // Volta a seguir: o objetivo antigo pode ter sido descartado no caminho.
      if (this.state.state === 'FOLLOW') {
        this.mc.followOwner(this.config.behavior.followDistance)
      }
    }
  }

  private startFollow(): void {
    if (!this.snapshot().ownerVisible) {
      this.say('Não tô te vendo! Cadê você?', 'command')
      return
    }
    const wasPlaying = this.game !== null
    this.state.command('FOLLOW')
    if (wasPlaying) this.sayGame('jogo_cancelado')
    this.mc.followOwner(this.config.behavior.followDistance)
    this.say('Tô indo!', 'command')
  }

  private startStay(): void {
    const position = this.snapshot().position
    const wasPlaying = this.game !== null
    this.state.command('STAY', { stayPoint: { ...position } })
    if (wasPlaying) this.sayGame('jogo_cancelado')
    this.mc.stopMoving()
    this.say('Tá bom, fico aqui de guarda!', 'command')
  }

  private stopEverything(): void {
    const wasPlaying = this.game !== null
    // `command()` aborta o sinal, e é isso que faz a sessão do jogo terminar.
    this.state.command('IDLE')
    this.mc.stopMoving()
    if (wasPlaying) this.sayGame('jogo_cancelado')
    else this.say('Parei!', 'command')
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

  // ───────────────────────────── JOGOS ─────────────────────────────────

  /**
   * Começa uma rodada. Todo caminho de recusa fala no chat: uma criança que
   * convidou para brincar não pode receber silêncio de volta.
   */
  private async startGame(game: string, role?: GameRole): Promise<void> {
    // Fala própria, não a de jogo desconhecido: aquela OFERECE o
    // esconde-esconde, e oferecer o que está desligado é prometer o que o bot
    // não faz.
    if (!this.config.games.enabled) {
      this.sayGame('jogo_desligado')
      return
    }

    if (this.game !== null) {
      this.sayGame('jogo_ja_rolando')
      return
    }

    const bot = this.mc.raw
    if (!bot) return

    if (!this.snapshot().ownerVisible) {
      this.say('Não tô te vendo! Cadê você?', 'command')
      return
    }

    const known = resolveGame(game)
    if (known === null) {
      this.sayGame('jogo_desconhecido')
      return
    }

    // Convite que não diz quem faz o quê não escolhe pela criança: pergunta.
    // Nada de sessão nem de estado `GAME` enquanto não houver resposta.
    // Ver: bot_games_delta.md → "Papel ausente é pergunta, não padrão".
    if (!role) {
      this.askRole(known)
      return
    }

    this.pendingRole = null

    // O estado precisa existir antes da sessão: é dele que sai o `AbortSignal`
    // que `dudu, para` e a defesa usam para cancelar a rodada de verdade.
    this.state.command('GAME', { actionLabel: game })

    const session = createSession(
      { game, role },
      {
        world: this.gameWorld(),
        hideAndSeek: this.config.games.hideAndSeek,
        tag: this.config.games.tag,
        signal: this.state.signal,
      },
    )

    // Jogo que o bot não conhece — ou papel que não é daquele jogo: recusa
    // honesta e volta ao que estava fazendo.
    if (!session) {
      this.state.command('IDLE')
      this.sayGame('jogo_desconhecido')
      return
    }

    this.game = session
    this.gameDimension = this.snapshot().dimension

    try {
      const result = await session.run()
      this.logger.info(
        { jogo: result.game, papel: result.role, desfecho: result.outcome, fase: result.phase },
        'rodada encerrada',
      )
    } catch (err) {
      // Cancelamento já foi anunciado por quem cancelou.
      if (!(err instanceof GameAborted)) {
        this.logger.error({ err: String(err) }, 'rodada falhou')
        this.say('Deu ruim na brincadeira, desculpa!', 'command')
      }
    } finally {
      this.game = null
      this.gameDimension = null
      // Rodada cancelada não pode deixar o bot correndo pelo mundo: a sessão
      // desliga o sprint no caminho normal, mas quem foi interrompido no meio
      // de uma falha pode nunca ter chegado lá.
      this.mc.setSprinting(false)
      // Só volta para IDLE se ninguém já assumiu o estado (defesa, novo comando).
      if (this.state.state === 'GAME') this.state.command('IDLE')
    }
  }

  private sayGame(entryId: string): void {
    const line = this.repertoire.say(entryId, this.snapshot())
    if (line) this.say(line.text, 'repertoire', line.entryId)
  }

  /**
   * Adapta o mundo real para a interface estreita que a sessão do jogo usa.
   *
   * Toda percepção "cara" (raycast) mora aqui, sob demanda: no laço de defesa,
   * que roda a cada 250 ms, ela não entra.
   */
  private gameWorld(): GameWorld {
    const ownerName = this.config.ownerPlayer
    const seeDistance = this.config.games.hideAndSeek.seeDistance

    const ownerEntity = () => this.mc.raw?.players[ownerName]?.entity ?? null

    return {
      ownerPosition: () => {
        const owner = ownerEntity()
        if (!owner) return null
        // Trocar de dimensão encerra a rodada: o jogador não está mais no mesmo
        // mundo, mesmo que a entidade ainda apareça por um instante.
        if (this.gameDimension && this.snapshot().dimension !== this.gameDimension) return null
        return { x: owner.position.x, y: owner.position.y, z: owner.position.z }
      },

      botPosition: () => this.snapshot().position,

      ownerYaw: () => (ownerEntity() as { yaw?: number } | null)?.yaw ?? 0,

      ownerCanSee: (position) => {
        const owner = ownerEntity()
        if (!owner) return false
        // O alcance cobre TODA a faixa de esconderijo, de propósito.
        // Com um alcance menor que `hideMaxDistance`, todo ponto além dele
        // voltava "não visível" por pura aritmética — e o bot ia parar no meio
        // do campo aberto achando que estava escondido.
        return hasLineOfSight(raycastWorldFrom(this.mc.raw), owner.position, position, {
          maxDistance: Math.max(seeDistance, this.config.games.hideAndSeek.hideMaxDistance + 8),
        })
      },

      ownerFacing: (position) => {
        const owner = ownerEntity()
        if (!owner) return false
        const yaw = (owner as { yaw?: number }).yaw ?? 0
        return isInFieldOfView(owner.position, yaw, position, DEFAULT_FOV_HALF_ANGLE)
      },

      coverAt: (position) => coverAround(blockSourceFrom(this.mc.raw), position),

      groundAt: (position) => resolveGround(blockSourceFrom(this.mc.raw), position),

      botCanSeeOwner: () => {
        const owner = ownerEntity()
        if (!owner) return false
        return hasLineOfSight(
          raycastWorldFrom(this.mc.raw),
          this.snapshot().position,
          owner.position,
          { maxDistance: seeDistance },
        )
      },

      // Sem consulta cara: o pathfinder só descobre de verdade tentando andar.
      // O que dá para descartar de graça é o que está fora do mundo carregado.
      isReachable: (position) => Number.isFinite(position.x) && Number.isFinite(position.z),

      goto: (position) => this.gameGoto(position),

      // Objetivo DINÂMICO: o pathfinder recalcula sozinho enquanto o jogador
      // corre. Um ponto parado não serve para perseguir quem se move — quando o
      // bot chegasse, o jogador já não estaria lá.
      chaseOwner: (distance) => {
        this.mc.followOwner(distance)
      },

      setSprinting: (on) => this.mc.setSprinting(on),

      stopMoving: () => this.mc.stopMoving(),

      say: (entryId) => this.sayGame(entryId),

      sayRaw: (text) => this.say(text, 'command'),

      sleep: (ms) => this.gameSleep(ms),

      now: () => Date.now(),
    }
  }

  /**
   * Caminha até um ponto durante o jogo. Resolve `false` quando não chegou —
   * a sessão decide o que fazer, e nenhuma falha de pathfinder chega ao chat
   * como erro técnico.
   */
  private async gameGoto(position: Vec3Like): Promise<boolean> {
    const bot = this.mc.raw
    if (!bot) return false

    try {
      // Teto por caminhada. Sem ele, um pathfinder emperrado seguraria a busca
      // por esconderijo além do tempo prometido — e o `hideSearchMs` só é
      // conferido ENTRE as caminhadas.
      await Promise.race([
        bot.pathfinder.goto(
          new goals.GoalNear(position.x, position.y, position.z, GAME_GOAL_RANGE),
        ),
        this.gameSleep(GAME_WALK_TIMEOUT_MS),
      ])
    } catch {
      // Caminho travado, rota recalculada ou rodada cancelada: quem trata o
      // cancelamento é o `guard()` da sessão, no próximo passo.
    }

    return distance(this.snapshot().position, position) <= GAME_GOAL_RANGE + 1
  }

  /** Espera cancelável: o `abort` da rodada não pode ficar preso num timer. */
  private gameSleep(ms: number): Promise<void> {
    const signal = this.state.signal
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new GameAborted('rodada cancelada'))

      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, ms)

      function onAbort(): void {
        clearTimeout(timer)
        reject(new GameAborted('rodada cancelada'))
      }

      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  // ──────────────────────────── DEFESA ─────────────────────────────────

  private startThreatWatcher(): void {
    this.stopThreatWatcher()
    this.threatTimer = setInterval(() => {
      this.tickDefense()
      this.tickStuck()
    }, THREAT_TICK_MS)
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
        if (this.interruptForDefense('EMERGENCY')) {
          this.sayCombat('combate_recuo', snapshot)
          this.retreatToOwner(snapshot)
        }
        return

      case 'flee-creeper':
        if (this.state.canInterrupt('DEFEND') && this.interruptForDefense('DEFEND')) {
          this.sayCombat('combate_creeper', snapshot)
        }
        this.fleeFrom(plan.threat.entity.position)
        return

      case 'unarmed':
        if (this.state.canInterrupt('DEFEND') && this.interruptForDefense('DEFEND')) {
          this.sayCombat('combate_desarmado', snapshot)
        }
        this.retreatToOwner(snapshot)
        return

      case 'engage':
        this.engage(plan.threat.entity.id, snapshot)
        return
    }
  }

  /**
   * Interrompe por prioridade e, se havia brincadeira, avisa que ela acabou.
   *
   * A rodada NÃO é retomada depois do combate: o esconderijo já foi queimado e
   * a criança já saiu do lugar. Ver: bot_games_delta.md → "Fim do combate não
   * retoma o jogo".
   */
  private interruptForDefense(
    to: 'DEFEND' | 'EMERGENCY',
    context: { targets?: number[] } = {},
  ): boolean {
    const wasPlaying = this.game !== null
    const result = this.state.interrupt(to, context)
    if (!result) return false
    if (wasPlaying) this.sayGame('jogo_cancelado_monstro')
    return true
  }

  private engage(entityId: number, snapshot: WorldSnapshot): void {
    const bot = this.mc.raw
    if (!bot) return

    if (this.state.state !== 'DEFEND') {
      if (!this.interruptForDefense('DEFEND', { targets: [entityId] })) return
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
