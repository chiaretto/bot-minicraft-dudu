import type { Vec3Like } from '../../domain/types.js'

/**
 * Escolha de esconderijo e dos pontos de busca falsa.
 *
 * Módulo PURO de propósito: nada de `mineflayer`, nada de I/O, nada de relógio.
 * É aqui que mora a regra da brincadeira, e regra que dá para testar sem
 * servidor é regra que continua valendo depois do próximo refactor.
 * Ver: bot_games_delta.md → "Esconde-esconde — o bot se esconde".
 */

export interface Candidate {
  position: Vec3Like
  /** Distância até o jogador, já calculada na amostragem. */
  distanceToOwner: number
}

export function horizontalDistance(a: Vec3Like, b: Vec3Like): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export interface SampleOptions {
  minDistance: number
  maxDistance: number
  samples: number
}

/**
 * Pontos num anel ao redor do jogador, distribuídos em ângulo.
 *
 * O ângulo é varrido em passo regular com um deslocamento aleatório, em vez de
 * sorteado ponto a ponto: sorteio puro amontoa candidatos de um lado só e o bot
 * acaba se escondendo sempre na mesma direção — coisa que uma criança percebe
 * na terceira rodada.
 */
export function sampleCandidates(
  owner: Vec3Like,
  options: SampleOptions,
  random: () => number = Math.random,
): Candidate[] {
  const { minDistance, maxDistance, samples } = options
  if (samples <= 0) return []

  const out: Candidate[] = []
  const step = (Math.PI * 2) / samples
  const offset = random() * Math.PI * 2

  for (let i = 0; i < samples; i++) {
    const angle = offset + step * i
    // Raiz do sorteio: distribui a área do anel por igual, em vez de concentrar
    // os candidatos perto da borda de dentro.
    const t = random()
    const radius = Math.sqrt(minDistance ** 2 + t * (maxDistance ** 2 - minDistance ** 2))

    out.push({
      position: {
        x: owner.x + Math.cos(angle) * radius,
        y: owner.y,
        z: owner.z + Math.sin(angle) * radius,
      },
      distanceToOwner: radius,
    })
  }

  return out
}

export interface HidingSpotOptions {
  minDistance: number
  maxDistance: number
  /** `true` quando o jogador ENXERGA o ponto — candidato assim é descartado. */
  isVisibleToOwner: (position: Vec3Like) => boolean
  /** `true` quando o ponto está no cone de visão atual do jogador. */
  isInOwnerFov?: (position: Vec3Like) => boolean
  /** `false` derruba o candidato — usado para exigir ponto alcançável. */
  isReachable?: (position: Vec3Like) => boolean
}

/**
 * Escolhe o esconderijo, ou `null` quando não existe ponto bom ali.
 *
 * `null` não é falha: em túnel ou dentro de casa pode realmente não haver lugar
 * sem linha de visão, e a resposta certa é o bot dizer isso no chat — nunca
 * ficar mudo nem se esconder num lugar que o jogador está olhando.
 */
export function pickHidingSpot(
  candidates: readonly Candidate[],
  options: HidingSpotOptions,
): Vec3Like | null {
  const viable = candidates.filter((c) => {
    if (c.distanceToOwner < options.minDistance) return false
    if (c.distanceToOwner > options.maxDistance) return false
    if (options.isReachable && !options.isReachable(c.position)) return false
    // A regra que não se negocia: o jogador não pode estar enxergando o ponto.
    return !options.isVisibleToOwner(c.position)
  })

  if (viable.length === 0) return null

  // Desempate: entre dois pontos igualmente escondidos, o que está às costas do
  // jogador é melhor — a caminhada até lá aparece menos.
  const behind = options.isInOwnerFov
    ? viable.filter((c) => !options.isInOwnerFov!(c.position))
    : []
  const pool = behind.length > 0 ? behind : viable

  // Entre os do bolso escolhido, o mais longe: mais tempo de brincadeira.
  let best = pool[0] as Candidate
  for (const candidate of pool) {
    if (candidate.distanceToOwner > best.distanceToOwner) best = candidate
  }
  return best.position
}

export interface FakeSearchOptions {
  count: number
  /** Nenhuma busca falsa pode chegar mais perto que isto do jogador. */
  minDistanceFromOwner: number
  /** Teto de distância, para o teatro não virar expedição. */
  maxDistanceFromOwner: number
  /** Distância mínima entre duas buscas falsas, para não repetir o lugar. */
  minSpacing?: number
}

/**
 * Pontos onde o bot vai fingir que procura, antes de procurar de verdade.
 *
 * Estes pontos são a brincadeira inteira. O bot recebe a posição do jogador
 * pelo protocolo e sabe onde ele está o tempo todo; sem os erros de propósito
 * o esconde-esconde acabaria em três segundos.
 * Ver: bot_games_delta.md → "Cegueira deliberada durante o fingimento".
 */
export function pickFakeSearchSpots(
  owner: Vec3Like,
  bot: Vec3Like,
  options: FakeSearchOptions,
  random: () => number = Math.random,
): Vec3Like[] {
  if (options.count <= 0) return []

  const minSpacing = options.minSpacing ?? options.minDistanceFromOwner / 2
  const spots: Vec3Like[] = []

  // Começa na direção oposta à do jogador e vai girando: garante que o primeiro
  // lugar errado seja convincentemente errado, e que os seguintes não se
  // amontoem no mesmo canto.
  const away = Math.atan2(bot.z - owner.z, bot.x - owner.x)
  const step = (Math.PI * 2) / Math.max(options.count, 3)
  const spread = Math.max(0, options.maxDistanceFromOwner - options.minDistanceFromOwner)

  // A contagem é uma GARANTIA, não uma tentativa: a spec exige exatamente
  // `count` lugares errados. Um candidato descartado por espaçamento não pode
  // virar uma busca falsa a menos, então gira o ângulo e tenta de novo.
  const maxAttempts = options.count * 8
  for (let attempt = 0; attempt < maxAttempts && spots.length < options.count; attempt++) {
    // Jitter pequeno: dois convites seguidos não levam ao mesmo lugar.
    const angle = away + step * attempt + (random() - 0.5) * step * 0.5
    const radius = options.minDistanceFromOwner + random() * spread

    const position = {
      x: owner.x + Math.cos(angle) * radius,
      y: owner.y,
      z: owner.z + Math.sin(angle) * radius,
    }

    // Nem em cima de uma busca falsa já escolhida.
    if (spots.some((s) => horizontalDistance(s, position) < minSpacing)) continue

    spots.push(position)
  }

  return spots
}
