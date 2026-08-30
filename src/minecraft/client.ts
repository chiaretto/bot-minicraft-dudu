import mineflayer, { type Bot } from 'mineflayer'
// `mineflayer-pathfinder` é CommonJS e o cjs-module-lexer do Node não detecta
// `goals` como named export (ele nasce de um `require()` dentro do
// module.exports). Import default + destructure funciona em ESM e em CJS.
import pathfinderPkg from 'mineflayer-pathfinder'
import { EventEmitter } from 'node:events'
import type { Config, Secrets } from '../config/schema.js'
import type { Logger } from '../logging/logger.js'
import { Backoff, shouldReconnect, type DisconnectReason } from './reconnect.js'
import { ChatSender, isSystemEcho } from './chat.js'

const { pathfinder, Movements, goals } = pathfinderPkg

export class VersionMismatchError extends Error {
  override name = 'VersionMismatchError'
}

export interface McEvents {
  spawn: []
  chat: [username: string, message: string]
  health: []
  death: []
  ownerHurt: [attackerId: number | null]
  /** O dono morreu, e onde. É o lugar onde as coisas dele ficaram. */
  ownerDied: [position: { x: number; y: number; z: number }]
  entityGone: [entityId: number]
  kicked: [reason: string]
  end: [reason: string]
  giveUp: []
}

/**
 * Wrapper fino sobre o mineflayer: conexão, reconexão e eventos normalizados.
 * Nenhuma regra de comportamento mora aqui.
 */
export class MinecraftClient extends EventEmitter {
  private bot: Bot | null = null
  private backoff: Backoff
  private chatSender: ChatSender | null = null
  private stopped = false
  /** Quem cada mob está perseguindo, quando o servidor informa. */
  readonly entityTargets = new Map<number, string>()

  constructor(
    private readonly config: Config,
    private readonly secrets: Secrets,
    private readonly logger: Logger,
  ) {
    super()
    this.backoff = new Backoff(config.server.reconnect)
  }

  get raw(): Bot | null {
    return this.bot
  }

  get connected(): boolean {
    return this.bot !== null
  }

  connect(): void {
    if (this.stopped) return

    const { server } = this.config
    this.logger.info(
      { host: server.host, port: server.port, version: server.version },
      'conectando ao servidor',
    )

    const bot = mineflayer.createBot({
      host: server.host,
      port: server.port,
      username: server.username,
      version: server.version,
      auth: server.auth === 'microsoft' ? 'microsoft' : 'offline',
      ...(this.secrets.minecraftPassword ? { password: this.secrets.minecraftPassword } : {}),
      checkTimeoutInterval: 60_000,
    })

    this.bot = bot
    this.wire(bot)
  }

  private wire(bot: Bot): void {
    bot.loadPlugin(pathfinder)

    bot.once('spawn', () => {
      this.backoff.reset()

      // A versão só é conhecida de verdade depois do handshake. Divergência é
      // erro terminal: reconectar em loop não conserta protocolo incompatível.
      const actual = bot.version
      if (actual !== this.config.server.version) {
        const err = new VersionMismatchError(
          `versão incompatível: configurado ${this.config.server.version}, servidor ${actual}`,
        )
        this.logger.error({ err: err.message }, 'versão incompatível')
        this.stopped = true
        bot.quit()
        this.emit('giveUp')
        return
      }

      const movements = new Movements(bot)
      movements.allowSprinting = true
      movements.canDig = false // o bot não escava caminho por conta própria
      bot.pathfinder.setMovements(movements)

      this.chatSender = new ChatSender({ send: (text) => bot.chat(text) })
      this.logger.info({ version: actual }, 'bot entrou no mundo')
      this.emit('spawn')
    })

    bot.on('chat', (username, message, translate) => {
      if (username === bot.username) return
      // Retorno de comando do jogo chega aqui como se fosse fala do dono. O
      // corte é na borda de propósito: um filtro só protege a cascata, o
      // histórico, a chamada de IA e o cache de comandos aprendidos.
      if (isSystemEcho(message, translate)) {
        this.logger.debug({ texto: message, translate }, 'recado do jogo ignorado')
        return
      }
      this.emit('chat', username, message)
    })

    bot.on('health', () => {
      this.emit('health')
    })
    bot.on('death', () => {
      this.emit('death')
    })

    // Dano no dono: gatilho direto da defesa, sem passar por chat nem por IA.
    bot.on('entityHurt', (entity) => {
      if (entity?.username === this.config.ownerPlayer) {
        this.emit('ownerHurt', null)
      }
    })

    // Morte do dono: guarda ONDE, que é o que interessa. As coisas dele ficam
    // caídas ali por cinco minutos, e é isso que dá tempo de ir buscar.
    bot.on('entityDead', (entity) => {
      if (entity?.username !== this.config.ownerPlayer) return
      const p = entity.position
      this.emit('ownerDied', { x: p.x, y: p.y, z: p.z })
    })

    bot.on('entityGone', (entity) => {
      if (entity?.id !== undefined) {
        this.entityTargets.delete(entity.id)
        this.emit('entityGone', entity.id)
      }
    })

    bot.on('kicked', (reason) => {
      const text = typeof reason === 'string' ? reason : JSON.stringify(reason)
      this.logger.warn({ reason: text }, 'bot expulso do servidor')
      this.emit('kicked', text)
      this.teardown('kicked')
    })

    bot.on('error', (err) => {
      this.logger.error({ err: err.message }, 'erro de conexão')
    })

    bot.on('end', (reason) => {
      this.emit('end', String(reason))
      this.teardown('end')
    })
  }

  private teardown(reason: DisconnectReason): void {
    this.bot = null
    this.chatSender = null
    if (this.stopped) return

    if (!shouldReconnect(reason, this.config.server.reconnect.enabled)) {
      this.logger.info({ reason }, 'não vou reconectar')
      this.emit('giveUp')
      return
    }

    const delay = this.backoff.next()
    if (delay === null) {
      this.logger.error(
        { attempts: this.backoff.attempts },
        'teto de tentativas de reconexão atingido; desistindo',
      )
      this.emit('giveUp')
      return
    }

    this.logger.warn({ delayMs: delay, attempt: this.backoff.attempts }, 'reconectando')
    setTimeout(() => this.connect(), delay)
  }

  say(text: string): void {
    this.chatSender?.say(text)
  }

  /** Manda o bot seguir o dono, mantendo a distância configurada. */
  followOwner(distance: number): boolean {
    const bot = this.bot
    const owner = bot?.players[this.config.ownerPlayer]?.entity
    if (!bot || !owner) return false
    bot.pathfinder.setGoal(new goals.GoalFollow(owner, distance), true)
    return true
  }

  /**
   * Liga ou desliga a corrida de verdade no cálculo de rota.
   *
   * É o botão de equilíbrio do pega-pega: com sprint nos dois papéis o bot pega
   * sempre e a criança desiste de brincar; sem sprint em nenhum, ele nunca pega
   * ninguém. O objetivo é reemitido para a rota atual ser recalculada — mudar a
   * flag sozinha só valeria para o próximo caminho.
   */
  setSprinting(allowed: boolean): void {
    const bot = this.bot
    const movements = bot?.pathfinder.movements as { allowSprinting?: boolean } | undefined
    if (!bot || !movements || movements.allowSprinting === allowed) return

    movements.allowSprinting = allowed
    bot.pathfinder.setMovements(movements as Parameters<typeof bot.pathfinder.setMovements>[0])
  }

  gotoPosition(x: number, y: number, z: number, range = 1): boolean {
    const bot = this.bot
    if (!bot) return false
    bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, range))
    return true
  }

  stopMoving(): void {
    this.bot?.pathfinder.setGoal(null)
  }

  quit(): void {
    this.stopped = true
    this.bot?.quit()
    this.bot = null
  }
}
