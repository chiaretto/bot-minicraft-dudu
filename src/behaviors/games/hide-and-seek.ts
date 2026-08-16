import type { HideAndSeekConfig } from '../../config/schema.js'
import type { GamePhase, GameResult, GameRole } from '../../domain/games.js'
import type { Vec3Like } from '../../domain/types.js'
import {
  pickFakeSearchSpots,
  pickScoutPoint,
  rankHidingSpots,
  sampleCandidates,
  horizontalDistance,
  type Candidate,
  type ScoredSpot,
} from './spots.js'
import { GameAborted, POLL_MS, type GameWorld } from './world.js'

/** Cobertura que faz o bot parar de procurar na hora: um canto, uma parede. */
const IDEAL_COVER = 2

/**
 * Piso absoluto de cobertura. Abaixo disto não é esconderijo, é campo aberto
 * fora da linha de visão por acaso — e o jogador vira a cabeça.
 */
const MIN_COVER = 1

// Reexportados para não quebrar quem já importava daqui: o contrato do mundo
// virou módulo próprio quando o segundo jogo passou a usá-lo.
export { GameAborted, type GameWorld } from './world.js'

export interface HideAndSeekDeps {
  world: GameWorld
  config: HideAndSeekConfig
  role: GameRole
  signal: AbortSignal | null
  random?: () => number
}

/**
 * Uma rodada de esconde-esconde.
 *
 * A regra que atravessa a classe inteira: o bot **sabe** onde o jogador está o
 * tempo todo — o protocolo entrega a posição de graça. O que faz disto um jogo
 * são as duas buscas erradas de propósito e o fato de "achei" exigir linha de
 * visão de verdade. Sem essas duas coisas a rodada acaba em três segundos.
 * Ver: bot_games_delta.md → "Esconde-esconde".
 */
export class HideAndSeekSession {
  private phase: GamePhase = 'fim'
  private startedAt = 0
  private revealRequested = false
  private readonly random: () => number

  constructor(private readonly deps: HideAndSeekDeps) {
    this.random = deps.random ?? Math.random
  }

  get currentPhase(): GamePhase {
    return this.phase
  }

  /** O jogador desistiu: o bot sai do esconderijo e se entrega. */
  requestReveal(): void {
    this.revealRequested = true
  }

  async run(): Promise<GameResult> {
    this.startedAt = this.deps.world.now()
    try {
      return this.deps.role === 'bot_esconde' ? await this.runHiding() : await this.runSeeking()
    } catch (err) {
      if (err instanceof GameAborted) return this.finish('cancelado')
      throw err
    }
  }

  // ───────────────────────────── PAPEL: SE ESCONDER ─────────────────────────

  private async runHiding(): Promise<GameResult> {
    const world = this.deps.world
    this.phase = 'escolhendo_esconderijo'

    if (!world.ownerPosition()) {
      world.say('jogo_sem_esconderijo')
      return this.finish('cancelado')
    }

    world.say('jogo_aceito')
    world.say('jogo_mande_contar')

    // Procurar leva tempo: o bot anda pelo entorno até achar algo que realmente
    // tape. Sem isso ele aceitava o primeiro ponto fora da linha de visão e
    // ficava parado no campo aberto, de costas para a criança.
    const spot = await this.searchForHidingSpot()
    this.guard()

    // Em túnel ou dentro de casa pode não existir lugar com cobertura.
    // Recusar em voz alta é melhor que se esconder onde o jogador está olhando.
    if (!spot) {
      world.stopMoving()
      world.say('jogo_sem_esconderijo')
      return this.finish('cancelado')
    }

    this.phase = 'indo_para_esconderijo'
    // Nada de falar `pode procurar` antes de chegar: seria entregar o caminho.
    await world.goto(spot)
    this.guard()
    world.stopMoving()

    // Onde ele parou é o que vale, não onde ele pediu para ir: o pathfinder
    // entrega "perto o suficiente", e perto o suficiente pode ser descampado.
    const parou = world.botPosition()
    if (world.ownerCanSee(parou) || world.coverAt(parou) < MIN_COVER) {
      world.say('jogo_sem_esconderijo')
      return this.finish('cancelado')
    }

    this.phase = 'escondido'
    world.say('jogo_pode_procurar')
    return this.waitToBeFound()
  }

  /**
   * Anda pelo entorno procurando um esconderijo de verdade, até o tempo acabar.
   *
   * Duas coisas justificam o passeio. A primeira é que o raycast só enxerga
   * chunk carregado, então procurar sem sair do lugar devolve sempre a mesma
   * resposta. A segunda é que exigir cobertura de verdade descarta a maioria dos
   * pontos — e é aceitável demorar, porque a criança está contando até 10.
   */
  private async searchForHidingSpot(): Promise<Vec3Like | null> {
    const world = this.deps.world
    const { hideSearchMs, hideMinDistance, hideMaxDistance } = this.deps.config
    const deadline = world.now() + hideSearchMs

    // Melhor achado até agora, com cobertura abaixo do ideal. Serve de reserva:
    // esconder atrás de pouca coisa ainda é melhor que desistir da brincadeira.
    let fallback: ScoredSpot | null = null

    while (world.now() < deadline) {
      this.guard()

      const owner = world.ownerPosition()
      if (!owner) return null

      const ranked = this.rankSpotsFromHere(owner)

      // Cobertura em pelo menos 2 direções: um canto, uma parede, uma árvore
      // grossa. Com 1 só o jogador contorna e vê na hora.
      const solid = ranked.find((s) => s.cover >= IDEAL_COVER)
      if (solid) return solid.position

      // A reserva NUNCA é campo aberto. Um ponto com cobertura 0 está fora da
      // linha de visão só neste instante — o jogador vira a cabeça e acabou.
      // Aceitar isso era o que fazia o bot "se esconder" à vista de todos.
      const best = ranked.find((s) => s.cover >= MIN_COVER)
      if (best && (!fallback || best.cover > fallback.cover)) fallback = best

      // Nada bom daqui: muda de vista e tenta de novo.
      const scout = pickScoutPoint(
        owner,
        world.botPosition(),
        { minDistance: hideMinDistance, maxDistance: hideMaxDistance },
        this.random,
      )
      await world.goto(scout)
    }

    return fallback?.position ?? null
  }

  private rankSpotsFromHere(owner: Vec3Like): ScoredSpot[] {
    const world = this.deps.world
    const { hideMinDistance, hideMaxDistance, hideCandidateSamples } = this.deps.config

    const sampled = sampleCandidates(
      owner,
      {
        minDistance: hideMinDistance,
        maxDistance: hideMaxDistance,
        samples: hideCandidateSamples,
      },
      this.random,
    )

    // Cada candidato desce (ou sobe) até o chão de verdade ANTES de ser medido.
    // Medir na altura do jogador faz um ponto no morro parecer enterrado —
    // cobertura máxima, invisível — e o bot acaba de pé no topo, à vista.
    const candidates: Candidate[] = []
    for (const c of sampled) {
      const ground = world.groundAt(c.position)
      // Sem chão conhecido (chunk fora de alcance) o candidato não serve.
      if (!ground) continue
      candidates.push({ position: ground, distanceToOwner: horizontalDistance(ground, owner) })
    }

    return rankHidingSpots(candidates, {
      minDistance: hideMinDistance,
      maxDistance: hideMaxDistance,
      isVisibleToOwner: (p) => world.ownerCanSee(p),
      isInOwnerFov: (p) => world.ownerFacing(p),
      isReachable: (p) => world.isReachable(p),
      coverAt: (p) => world.coverAt(p),
    })
  }

  /** Fica parado até ser tocado, até o jogador desistir, ou até o tempo acabar. */
  private async waitToBeFound(): Promise<GameResult> {
    const world = this.deps.world
    const { touchDistance } = this.deps.config

    while (!this.timedOut()) {
      await world.sleep(POLL_MS)
      this.guard()

      if (this.revealRequested) {
        world.say('jogo_me_entrego')
        return this.finish('ganhou')
      }

      const owner = world.ownerPosition()
      // Jogador saiu do servidor ou trocou de dimensão.
      if (!owner) return this.finish('cancelado')

      if (horizontalDistance(owner, world.botPosition()) <= touchDistance) {
        world.say('jogo_fui_achado')
        return this.finish('perdeu')
      }
    }

    world.say('jogo_me_entrego')
    return this.finish('tempo_esgotado')
  }

  // ────────────────────────────── PAPEL: PROCURAR ───────────────────────────

  private async runSeeking(): Promise<GameResult> {
    const world = this.deps.world

    world.say('jogo_aceito')
    await this.countOutLoud()

    const fakeResult = await this.performFakeSearches()
    if (fakeResult) return fakeResult

    return this.searchForReal()
  }

  private async countOutLoud(): Promise<void> {
    const world = this.deps.world
    const { countTo, countIntervalMs } = this.deps.config

    this.phase = 'contando'
    for (let n = 1; n <= countTo; n++) {
      this.guard()
      world.sayRaw(String(n))
      await world.sleep(countIntervalMs)
    }
    this.guard()
    world.say('jogo_contando_fim')
  }

  /**
   * As duas buscas erradas de propósito.
   *
   * Enquanto finge, o bot é DELIBERADAMENTE cego: nenhuma checagem de visão do
   * jogador acontece aqui. Sem isso, esbarrar nele no primeiro passo acabaria a
   * brincadeira antes de ela começar.
   */
  private async performFakeSearches(): Promise<GameResult | null> {
    const world = this.deps.world
    this.phase = 'busca_falsa'

    const owner = world.ownerPosition()
    if (!owner) return this.finish('cancelado')

    const spots = pickFakeSearchSpots(
      owner,
      world.botPosition(),
      {
        count: this.deps.config.fakeSearches,
        minDistanceFromOwner: this.deps.config.fakeSearchMinDistanceFromOwner,
        maxDistanceFromOwner: this.deps.config.seeDistance,
      },
      this.random,
    )

    for (const spot of spots) {
      this.guard()
      // Não chegar num lugar errado não é problema: o lugar era errado.
      await world.goto(spot)
      this.guard()
      world.say('jogo_busca_errada')

      if (this.timedOut()) {
        world.say('jogo_nao_achei')
        return this.finish('tempo_esgotado')
      }
    }

    return null
  }

  /** Agora sim: procura de verdade, e só declara vitória depois de ver. */
  private async searchForReal(): Promise<GameResult> {
    const world = this.deps.world
    this.phase = 'busca_real'

    while (!this.timedOut()) {
      this.guard()

      const owner = world.ownerPosition()
      if (!owner) return this.finish('cancelado')

      // A regra justa: quem está atrás de uma parede não é achado, mesmo com a
      // coordenada na mão.
      if (world.botCanSeeOwner()) return this.approachAndDeclare()

      const step = this.stepTowards(world.botPosition(), owner)
      // Já está em cima do jogador e ainda assim não o enxerga (parede, buraco):
      // esperar é melhor que andar em círculo.
      if (!step) await world.sleep(POLL_MS)
      else await world.goto(step)
    }

    world.say('jogo_nao_achei')
    return this.finish('tempo_esgotado')
  }

  private async approachAndDeclare(): Promise<GameResult> {
    const world = this.deps.world
    this.phase = 'indo_ate_jogador'

    const owner = world.ownerPosition()
    if (!owner) return this.finish('cancelado')

    // Falar "achei" de longe não vale: ele vai até o jogador primeiro.
    await world.goto(owner)
    this.guard()
    world.stopMoving()

    world.say('jogo_achei')
    return this.finish('ganhou')
  }

  /**
   * Um passo na direção do jogador, limitado para o bot reavaliar a visão pelo
   * caminho em vez de só no fim da caminhada.
   */
  private stepTowards(from: Vec3Like, to: Vec3Like): Vec3Like | null {
    const maxStep = Math.max(2, this.deps.config.seeDistance / 2)
    const dx = to.x - from.x
    const dz = to.z - from.z
    const span = Math.hypot(dx, dz)
    if (span < 1) return null
    if (span <= maxStep) return { ...to }
    return { x: from.x + (dx / span) * maxStep, y: to.y, z: from.z + (dz / span) * maxStep }
  }

  // ────────────────────────────────── COMUM ─────────────────────────────────

  private timedOut(): boolean {
    return this.deps.world.now() - this.startedAt >= this.deps.config.roundTimeoutMs
  }

  private guard(): void {
    if (this.deps.signal?.aborted) throw new GameAborted('rodada cancelada')
  }

  private finish(outcome: GameResult['outcome']): GameResult {
    const result: GameResult = {
      game: 'esconde_esconde',
      role: this.deps.role,
      outcome,
      phase: this.phase,
    }
    this.phase = 'fim'
    this.deps.world.stopMoving()
    return result
  }
}
