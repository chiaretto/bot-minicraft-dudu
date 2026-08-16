import type { TagConfig } from '../../config/schema.js'
import type { GamePhase, GameResult, GameRole } from '../../domain/games.js'
import type { Vec3Like } from '../../domain/types.js'
import { horizontalDistance, pickFleePoint } from './spots.js'
import { GameAborted, POLL_MS, type GameWorld } from './world.js'

/**
 * De quanto em quanto o objetivo de perseguição é reemitido.
 *
 * O objetivo é dinâmico e o pathfinder recalcula sozinho enquanto o jogador
 * corre; reemitir a cada passo do laço só faria a rota ser jogada fora 4 vezes
 * por segundo. Isto aqui é sobrevida: se o objetivo se perder (rota impossível,
 * queda, respawn de chunk), em 2 s ele volta.
 */
const CHASE_REISSUE_MS = 2_000

export interface TagDeps {
  world: GameWorld
  config: TagConfig
  role: GameRole
  signal: AbortSignal | null
  random?: () => number
}

/**
 * Uma rodada de pega-pega.
 *
 * A regra que atravessa a classe: **quem cansa, perde e diz isso**. Nos dois
 * papéis o fim por tempo tem fala no chat e o bot parando de se mover — rodada
 * que acaba em silêncio, com o bot ainda correndo, é indistinguível de defeito
 * para uma criança de 7 anos.
 *
 * Diferente do esconde-esconde, aqui não há linha de visão em fase nenhuma:
 * ninguém está escondido, e o que decide a rodada é distância e tempo.
 * Ver: bot_games_delta.md → "Pega-pega".
 */
export class TagSession {
  private phase: GamePhase = 'fim'
  private startedAt = 0
  private giveUpRequested = false
  private readonly random: () => number

  constructor(private readonly deps: TagDeps) {
    this.random = deps.random ?? Math.random
  }

  get currentPhase(): GamePhase {
    return this.phase
  }

  /** O jogador desistiu. O que isso significa depende de quem está correndo. */
  requestReveal(): void {
    this.giveUpRequested = true
  }

  async run(): Promise<GameResult> {
    this.startedAt = this.deps.world.now()
    try {
      return this.deps.role === 'bot_pega' ? await this.runChasing() : await this.runFleeing()
    } catch (err) {
      if (err instanceof GameAborted) return this.finish('cancelado')
      throw err
    }
  }

  // ────────────────────────────── PAPEL: PEGAR ──────────────────────────────

  private async runChasing(): Promise<GameResult> {
    const world = this.deps.world

    if (!world.ownerPosition()) {
      world.say('jogo_cancelado')
      return this.finish('cancelado')
    }

    world.say('pega_aceito_pego')
    await this.countOutLoud()
    world.say('pega_vou_pegar')

    return this.chase()
  }

  /**
   * A contagem é a vantagem de saída da criança, então o bot fica PARADO
   * enquanto conta. Contar andando não é pega-pega, é emboscada.
   */
  private async countOutLoud(): Promise<void> {
    const world = this.deps.world
    const { countTo, countIntervalMs } = this.deps.config

    this.phase = 'contando'
    world.stopMoving()

    for (let n = 1; n <= countTo; n++) {
      this.guard()
      world.sayRaw(String(n))
      await world.sleep(countIntervalMs)
    }
    this.guard()
  }

  private async chase(): Promise<GameResult> {
    const world = this.deps.world
    const { touchDistance, chaseFollowDistance, chaseSprint, chaseTimeoutMs } = this.deps.config

    this.phase = 'perseguindo'
    world.setSprinting(chaseSprint)

    const deadline = world.now() + chaseTimeoutMs
    let reissueAt = 0

    while (world.now() < deadline && !this.timedOut()) {
      this.guard()

      const owner = world.ownerPosition()
      // Saiu do servidor ou trocou de dimensão: não há mais quem pegar.
      if (!owner) return this.finish('cancelado')

      if (horizontalDistance(owner, world.botPosition()) <= touchDistance) {
        world.say('pega_te_peguei')
        return this.finish('ganhou')
      }

      // O jogador parou de correr e se entregou: o bot vai até ele e ganha.
      if (this.giveUpRequested) return this.catchUp(owner)

      if (world.now() >= reissueAt) {
        world.chaseOwner(chaseFollowDistance)
        reissueAt = world.now() + CHASE_REISSUE_MS
      }

      await world.sleep(POLL_MS)
    }

    if (this.timedOut()) return this.finish('tempo_esgotado', 'jogo_cancelado')

    // Cansar é regra do jogo, não rodada dando errado: por isso `perdeu`.
    world.say('pega_cansei_pegando')
    return this.finish('perdeu')
  }

  /** O jogador se entregou: encosta nele antes de cantar vitória. */
  private async catchUp(owner: Vec3Like): Promise<GameResult> {
    const world = this.deps.world
    await world.goto(owner)
    this.guard()
    world.say('pega_te_peguei')
    return this.finish('ganhou')
  }

  // ────────────────────────────── PAPEL: FUGIR ──────────────────────────────

  private async runFleeing(): Promise<GameResult> {
    const world = this.deps.world
    const { touchDistance, fleeSprint, fleeTimeoutMs } = this.deps.config

    if (!world.ownerPosition()) {
      world.say('jogo_cancelado')
      return this.finish('cancelado')
    }

    // Sem contagem: quem conta é quem pega, e aqui quem pega é a criança.
    world.say('pega_aceito_fujo')

    this.phase = 'fugindo'
    world.setSprinting(fleeSprint)

    const deadline = world.now() + fleeTimeoutMs

    while (world.now() < deadline && !this.timedOut()) {
      this.guard()

      const owner = world.ownerPosition()
      if (!owner) return this.finish('cancelado')

      if (horizontalDistance(owner, world.botPosition()) <= touchDistance) {
        world.say('pega_fui_pego')
        return this.finish('perdeu')
      }

      if (this.giveUpRequested) {
        world.say('pega_me_entrego')
        return this.finish('perdeu')
      }

      const destino = this.nextFleePoint(owner)
      // Encurralado: espera um passo e tenta de novo, em vez de travar a rodada.
      if (!destino) {
        await world.sleep(POLL_MS)
        continue
      }

      await this.runHop(destino, deadline)
    }

    if (this.timedOut()) return this.finish('tempo_esgotado', 'jogo_cancelado')

    return this.surrender()
  }

  private nextFleePoint(owner: Vec3Like): Vec3Like | null {
    const world = this.deps.world
    const cfg = this.deps.config

    return pickFleePoint(
      owner,
      world.botPosition(),
      {
        stepMin: cfg.fleeStepMin,
        stepMax: cfg.fleeStepMax,
        maxDistanceFromOwner: cfg.fleeMaxDistanceFromOwner,
        samples: cfg.fleeCandidateSamples,
        groundAt: (p) => world.groundAt(p),
        isReachable: (p) => world.isReachable(p),
      },
      this.random,
    )
  }

  /**
   * Um trecho da fuga, conferindo o toque **durante** a corrida.
   *
   * Esperar a caminhada inteira terminar para só então olhar a distância faria o
   * bot continuar fugindo segundos depois de já ter sido pego — e ouvir "eu
   * encostei em você!" sem resposta é o pior jeito de perder uma rodada.
   */
  private async runHop(destino: Vec3Like, deadline: number): Promise<void> {
    const world = this.deps.world
    const { touchDistance, fleeStepMin } = this.deps.config

    let walking = true
    let failure: unknown = null
    // A caminhada solta fica pendurada de propósito: o próximo trecho reemite o
    // destino, e o cancelamento chega pelo `guard()` do laço.
    void world.goto(destino).then(
      () => {
        walking = false
      },
      (err: unknown) => {
        walking = false
        failure = err
      },
    )

    // A espera vem ANTES das checagens, e isso não é detalhe de estilo: todo
    // trecho de fuga precisa fazer o relógio andar. Sem isso, um destino que o
    // jogador já invalidou no primeiro instante — ou uma caminhada que falha na
    // hora — faria a fuga girar em falso, sem tempo passando e sem ceder o
    // processador.
    do {
      this.guard()
      await world.sleep(POLL_MS)

      // Falha de verdade sobe, como no esconde-esconde: pathfinder que não
      // chega devolve `false`, não estoura. Se estourou, é defeito — e defeito
      // engolido aqui viraria uma rodada girando em silêncio.
      if (failure !== null) throw failure

      if (world.now() >= deadline || this.timedOut()) return

      const owner = world.ownerPosition()
      if (!owner) return

      const distancia = horizontalDistance(owner, world.botPosition())
      if (distancia <= touchDistance) return
      // Quem persegue chegou perto: muda de rumo antes de chegar ao destino.
      if (distancia <= fleeStepMin) return
      if (this.giveUpRequested) return
    } while (walking)
  }

  /** Cansou: para de propósito, avisa, e espera parado até alguém encostar. */
  private async surrender(): Promise<GameResult> {
    const world = this.deps.world
    const { touchDistance, surrenderTimeoutMs } = this.deps.config

    this.phase = 'entregue'
    world.stopMoving()
    world.setSprinting(false)
    world.say('pega_cansei_fugindo')

    const deadline = world.now() + surrenderTimeoutMs

    while (world.now() < deadline && !this.timedOut()) {
      this.guard()
      await world.sleep(POLL_MS)

      const owner = world.ownerPosition()
      if (!owner) return this.finish('cancelado')

      if (horizontalDistance(owner, world.botPosition()) <= touchDistance) {
        world.say('pega_fui_pego')
        return this.finish('perdeu')
      }
    }

    // Ninguém veio buscar: ele já tinha dito que perdeu, e continua perdendo.
    return this.finish('perdeu')
  }

  // ────────────────────────────────── COMUM ─────────────────────────────────

  /** Rede de segurança do `roundTimeoutMs`, distinta do cansaço do jogo. */
  private timedOut(): boolean {
    return this.deps.world.now() - this.startedAt >= this.deps.config.roundTimeoutMs
  }

  private guard(): void {
    if (this.deps.signal?.aborted) throw new GameAborted('rodada cancelada')
  }

  private finish(outcome: GameResult['outcome'], entryId?: string): GameResult {
    const result: GameResult = {
      game: 'pega_pega',
      role: this.deps.role,
      outcome,
      phase: this.phase,
    }
    this.phase = 'fim'
    // Parar de correr é parte de terminar, não consequência dele: um bot que
    // continua correndo depois do fim parece defeito.
    this.deps.world.stopMoving()
    this.deps.world.setSprinting(false)
    if (entryId) this.deps.world.say(entryId)
    return result
  }
}
