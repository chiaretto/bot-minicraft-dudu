import type { HotColdConfig } from '../../config/schema.js'
import type { GamePhase, GameResult, GameRole } from '../../domain/games.js'
import { temperature, TEMPERATURE_ENTRY, type Temperature } from '../../domain/hot-cold.js'
import type { Vec3Like } from '../../domain/types.js'
import { horizontalDistance, sampleCandidates } from './spots.js'
import { GameAborted, type GameWorld } from './world.js'

/**
 * Uma rodada de quente e frio.
 *
 * O bot escolhe um ponto secreto perto do jogador e vai dizendo se ele está
 * esquentando ou esfriando. É o jogo mais barato do registro em movimento —
 * ninguém persegue ninguém — e o mais generoso em conversa: o bot fala o tempo
 * todo, que é o que uma criança de 7 anos quer de um amigo.
 *
 * A regra que atravessa a classe: **o ponto é do bot e nunca é dito** até a
 * rodada acabar. Contar onde é acabaria com a brincadeira, e o bot é honesto
 * demais para escapar disso sozinho.
 * Ver: bot_games_delta.md → "Quente e frio".
 */
export interface HotColdDeps {
  world: GameWorld
  config: HotColdConfig
  role: GameRole
  signal: AbortSignal | null
  random?: () => number
}

export class HotColdSession {
  private phase: GamePhase = 'fim'
  private startedAt = 0
  private giveUpRequested = false
  private secret: Vec3Like | null = null
  /** Distância do passo anterior. É o que transforma distância em temperatura. */
  private previous: number | null = null
  private readonly random: () => number

  constructor(private readonly deps: HotColdDeps) {
    this.random = deps.random ?? Math.random
  }

  get currentPhase(): GamePhase {
    return this.phase
  }

  /** O jogador desistiu: a rodada acaba mostrando onde era. */
  requestReveal(): void {
    this.giveUpRequested = true
  }

  async run(): Promise<GameResult> {
    this.startedAt = this.deps.world.now()
    try {
      return await this.runHiding()
    } catch (err) {
      if (err instanceof GameAborted) return this.finish('cancelado')
      throw err
    }
  }

  private async runHiding(): Promise<GameResult> {
    const world = this.deps.world

    this.phase = 'escondendo_tesouro'
    const ponto = this.chooseSecret()
    if (ponto === null) {
      // Sem lugar nenhum onde pôr o tesouro: recusa honesta, como o
      // esconde-esconde faz quando não há esconderijo.
      world.say('qf_sem_lugar')
      return this.finish('cancelado')
    }

    this.secret = ponto
    world.say('qf_comecou')

    this.phase = 'esquentando'
    while (true) {
      await world.sleep(this.deps.config.tickMs)

      if (this.giveUpRequested) return await this.reveal('perdeu')
      if (world.now() - this.startedAt > this.deps.config.roundTimeoutMs) {
        return await this.reveal('tempo_esgotado')
      }

      const owner = world.ownerPosition()
      // Jogador sumiu (saiu, trocou de dimensão): a rodada não tem sentido.
      if (owner === null) return this.finish('cancelado')

      const distancia = horizontalDistance(owner, ponto)
      const palavra = temperature({
        distance: distancia,
        previous: this.previous,
        foundRadius: this.deps.config.foundRadius,
      })
      this.previous = distancia

      if (palavra === 'achou') {
        world.say(TEMPERATURE_ENTRY.achou)
        return this.finish('perdeu')
      }
      this.saySometimes(palavra)
    }
  }

  /**
   * Fala a temperatura, mas não toda vez que ela é a mesma.
   *
   * Repetir "frio" oito vezes seguidas enche o chat e faz a criança parar de
   * ler. Mudança de temperatura sempre sai; repetição sai de vez em quando,
   * para ela saber que o bot continua ali.
   */
  private lastSpoken: Temperature | null = null
  private repeats = 0

  private saySometimes(palavra: Temperature): void {
    if (palavra !== this.lastSpoken) {
      this.lastSpoken = palavra
      this.repeats = 0
      this.deps.world.say(TEMPERATURE_ENTRY[palavra])
      return
    }

    this.repeats++
    if (this.repeats >= this.deps.config.repeatEvery) {
      this.repeats = 0
      this.deps.world.say(TEMPERATURE_ENTRY[palavra])
    }
  }

  /**
   * Mostra onde era.
   *
   * Rodada de esconder que acaba sem revelar deixa a criança sem fecho — e sem
   * saber se o bot estava mesmo com um lugar em mente.
   */
  private async reveal(outcome: 'perdeu' | 'tempo_esgotado'): Promise<GameResult> {
    const world = this.deps.world
    world.say('qf_revela')
    if (this.secret) {
      try {
        await world.goto(this.secret)
      } catch (err) {
        if (err instanceof GameAborted) throw err
        // Não chegar no próprio tesouro é chato, não é fim de mundo.
      }
    }
    return this.finish(outcome)
  }

  /**
   * Escolhe o ponto secreto: perto o bastante para caber numa brincadeira, e
   * num lugar onde dê para ficar de pé.
   */
  private chooseSecret(): Vec3Like | null {
    const world = this.deps.world
    const owner = world.ownerPosition()
    if (owner === null) return null

    const candidatos = sampleCandidates(
      owner,
      {
        minDistance: this.deps.config.hideMinDistance,
        maxDistance: this.deps.config.hideMaxDistance,
        samples: this.deps.config.candidateSamples,
      },
      this.random,
    )

    for (const candidato of candidatos) {
      const chao = world.groundAt(candidato.position)
      if (chao === null) continue
      if (!world.isReachable(chao)) continue
      return chao
    }
    return null
  }

  private finish(outcome: GameResult['outcome']): GameResult {
    const phase = this.phase
    this.phase = 'fim'
    this.deps.world.stopMoving()
    return { game: 'quente_frio', role: this.deps.role, outcome, phase }
  }
}
