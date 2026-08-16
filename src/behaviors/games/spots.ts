import type { Vec3Like } from '../../domain/types.js'

/**
 * Escolha de esconderijo, dos pontos de busca falsa e do rumo de fuga.
 *
 * Módulo PURO de propósito: nada de `mineflayer`, nada de I/O, nada de relógio.
 * É aqui que mora a regra da brincadeira, e regra que dá para testar sem
 * servidor é regra que continua valendo depois do próximo refactor.
 * Ver: bot_games_delta.md → "Esconde-esconde — o bot se esconde" e
 * "Pega-pega — o bot foge".
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
  /**
   * Quantas direções ao redor do ponto têm bloco sólido. É o que separa
   * "atrás de uma parede" de "no descampado, fora da linha de visão por acaso".
   */
  coverAt?: (position: Vec3Like) => number
  /** Abaixo disto o ponto não conta como esconderijo de verdade. */
  minCover?: number
}

export interface ScoredSpot {
  position: Vec3Like
  cover: number
  distanceToOwner: number
  behind: boolean
}

/**
 * Ordena os esconderijos possíveis, do melhor para o pior.
 *
 * Critério, em ordem: **cobertura** (tem o que tapar), depois estar fora do
 * cone de visão atual, depois distância. A cobertura vem primeiro de propósito
 * — foi justamente ordenar por distância que fazia o bot atravessar o mapa e
 * parar no meio do nada, de costas para a criança.
 */
export function rankHidingSpots(
  candidates: readonly Candidate[],
  options: HidingSpotOptions,
): ScoredSpot[] {
  const viable: ScoredSpot[] = []

  for (const c of candidates) {
    if (c.distanceToOwner < options.minDistance) continue
    if (c.distanceToOwner > options.maxDistance) continue
    if (options.isReachable && !options.isReachable(c.position)) continue
    // A regra que não se negocia: o jogador não pode estar enxergando o ponto.
    if (options.isVisibleToOwner(c.position)) continue

    const cover = options.coverAt ? options.coverAt(c.position) : 0
    if (options.minCover !== undefined && cover < options.minCover) continue

    viable.push({
      position: c.position,
      cover,
      distanceToOwner: c.distanceToOwner,
      behind: options.isInOwnerFov ? !options.isInOwnerFov(c.position) : false,
    })
  }

  return viable.sort((a, b) => {
    if (b.cover !== a.cover) return b.cover - a.cover
    if (a.behind !== b.behind) return a.behind ? -1 : 1
    return b.distanceToOwner - a.distanceToOwner
  })
}

/**
 * Escolhe o esconderijo, ou `null` quando não existe ponto bom ali.
 *
 * `null` não é falha: em túnel ou dentro de casa pode realmente não haver lugar
 * sem linha de visão, e a resposta certa é o bot continuar procurando — e, no
 * fim do tempo, dizer isso no chat.
 */
export function pickHidingSpot(
  candidates: readonly Candidate[],
  options: HidingSpotOptions,
): Vec3Like | null {
  return rankHidingSpots(candidates, options)[0]?.position ?? null
}

/**
 * Para onde andar quando nenhum candidato daqui presta.
 *
 * Serve para mudar de vista e carregar outro pedaço do mundo: o raycast só
 * enxerga chunk carregado, então procurar sem sair do lugar devolve sempre a
 * mesma resposta.
 */
export function pickScoutPoint(
  owner: Vec3Like,
  bot: Vec3Like,
  options: { minDistance: number; maxDistance: number },
  random: () => number = Math.random,
): Vec3Like {
  // Gira em torno do jogador em vez de sortear do zero: assim o bot varre o
  // entorno de forma parecida com quem procura mesmo, sem ficar indo e voltando.
  const current = Math.atan2(bot.z - owner.z, bot.x - owner.x)
  const angle = current + (Math.PI / 2) * (0.6 + random() * 0.8)
  const spread = options.maxDistance - options.minDistance
  const radius = options.minDistance + random() * Math.max(0, spread)

  return {
    x: owner.x + Math.cos(angle) * radius,
    y: owner.y,
    z: owner.z + Math.sin(angle) * radius,
  }
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

export interface FleeOptions {
  /** Salto mínimo a partir de onde o bot está agora. */
  stepMin: number
  stepMax: number
  /** Teto de distância até o jogador: fugir demais some do campo de visão. */
  maxDistanceFromOwner: number
  samples: number
  /** Onde o bot ficaria de pé nessa coluna. Candidato sem chão é descartado. */
  groundAt?: (position: Vec3Like) => Vec3Like | null
  isReachable?: (position: Vec3Like) => boolean
}

/**
 * Para onde correr quando alguém está vindo te pegar.
 *
 * Duas camadas de critério, e a segunda existe por um motivo concreto: no teto
 * de distância (`maxDistanceFromOwner`) TODO ponto que aumenta a distância está
 * fora do teto, e exigir ganho positivo deixaria o bot parado esperando ser
 * pego. Então:
 *
 * 1. o melhor ponto que **aumenta** a distância até o jogador, dentro do teto;
 * 2. se nenhum aumenta, o mais distante do jogador que ainda não corre para os
 *    braços dele — é a corrida de lado, que é o que uma criança faz também.
 *
 * `null` quer dizer encurralado: nem lateral sobrou. Quem chama tenta de novo
 * no próximo passo, em vez de travar a rodada.
 */
export function pickFleePoint(
  owner: Vec3Like,
  bot: Vec3Like,
  options: FleeOptions,
  random: () => number = Math.random,
): Vec3Like | null {
  const { stepMin, stepMax, maxDistanceFromOwner, samples } = options
  if (samples <= 0) return null

  const current = horizontalDistance(bot, owner)
  const step = (Math.PI * 2) / samples
  // Começa na direção contrária à do jogador: o rumo óbvio é avaliado primeiro,
  // e o giro completo cobre o resto quando ele está bloqueado.
  const away = Math.atan2(bot.z - owner.z, bot.x - owner.x)
  const spread = Math.max(0, stepMax - stepMin)

  let best: { position: Vec3Like; distance: number } | null = null
  let lateral: { position: Vec3Like; distance: number } | null = null

  for (let i = 0; i < samples; i++) {
    const angle = away + step * i + (random() - 0.5) * step * 0.5
    const radius = stepMin + random() * spread

    const raw = {
      x: bot.x + Math.cos(angle) * radius,
      y: bot.y,
      z: bot.z + Math.sin(angle) * radius,
    }

    // Medir na altura do bot num terreno acidentado escolhe ponto dentro do
    // morro, exatamente como acontecia na escolha de esconderijo.
    const position = options.groundAt ? options.groundAt(raw) : raw
    if (!position) continue
    if (options.isReachable && !options.isReachable(position)) continue

    const distance = horizontalDistance(position, owner)
    if (distance > maxDistanceFromOwner) continue

    if (distance > current) {
      if (!best || distance > best.distance) best = { position, distance }
      continue
    }

    // Reserva: de lado serve, correr para cima de quem persegue não.
    if (distance >= stepMin && (!lateral || distance > lateral.distance)) {
      lateral = { position, distance }
    }
  }

  return (best ?? lateral)?.position ?? null
}
