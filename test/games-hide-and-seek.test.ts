import { describe, it, expect } from 'vitest'
import {
  HideAndSeekSession,
  GameAborted,
  type GameWorld,
} from '../src/behaviors/games/hide-and-seek.js'
import { createSession, resolveGame, resolveRole } from '../src/behaviors/games/index.js'
import { hideAndSeekSchema } from '../src/config/schema.js'
import { hasLineOfSight, type RaycastWorld } from '../src/minecraft/visibility.js'
import type { GameRole } from '../src/domain/games.js'
import type { Vec3Like } from '../src/domain/types.js'

const config = hideAndSeekSchema.parse({})

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

interface FakeOptions {
  ownerPosition?: Vec3Like | null
  /** Quais pontos o jogador enxerga. Padrão: nenhum (tudo dá para esconder). */
  ownerCanSee?: (p: Vec3Like) => boolean
  ownerFacing?: (p: Vec3Like) => boolean
  botCanSeeOwner?: () => boolean
  isReachable?: (p: Vec3Like) => boolean
  /** Cobertura sólida em volta do ponto. Padrão: coberto em toda parte. */
  coverAt?: (p: Vec3Like) => number
  /** Chão da coluna. Padrão: terreno plano na altura pedida. */
  groundAt?: (p: Vec3Like) => Vec3Like | null
  /** `false` faz o `goto` resolver sem ter chegado. */
  arrives?: boolean
  /** Quanto o relógio anda a cada `sleep`/`goto`. */
  gotoDurationMs?: number
}

/**
 * Mundo falso com relógio falso: a rodada inteira roda em milissegundos de
 * teste, sem servidor e sem espera de verdade.
 */
class FakeWorld implements GameWorld {
  clock = 0
  said: string[] = []
  raw: string[] = []
  visited: Vec3Like[] = []
  stops = 0
  botPos: Vec3Like = { x: 0, y: 64, z: 0 }
  ownerPos: Vec3Like | null
  /** Trocado no meio do teste para simular o jogador se aproximando. */
  onTick: ((world: FakeWorld) => void) | null = null

  constructor(private readonly options: FakeOptions = {}) {
    this.ownerPos =
      options.ownerPosition === undefined ? { x: 0, y: 64, z: 0 } : options.ownerPosition
  }

  ownerPosition(): Vec3Like | null {
    return this.ownerPos
  }
  botPosition(): Vec3Like {
    return this.botPos
  }
  ownerYaw(): number {
    return 0
  }
  ownerCanSee(p: Vec3Like): boolean {
    return this.options.ownerCanSee?.(p) ?? false
  }
  ownerFacing(p: Vec3Like): boolean {
    return this.options.ownerFacing?.(p) ?? false
  }
  coverAt(p: Vec3Like): number {
    return this.options.coverAt?.(p) ?? 4
  }
  groundAt(p: Vec3Like): Vec3Like | null {
    return this.options.groundAt ? this.options.groundAt(p) : { ...p }
  }
  botCanSeeOwner(): boolean {
    return this.options.botCanSeeOwner?.() ?? false
  }
  isReachable(p: Vec3Like): boolean {
    return this.options.isReachable?.(p) ?? true
  }
  async goto(position: Vec3Like): Promise<boolean> {
    this.visited.push({ ...position })
    this.clock += this.options.gotoDurationMs ?? 100
    const arrives = this.options.arrives ?? true
    if (arrives) this.botPos = { ...position }
    this.onTick?.(this)
    return arrives
  }
  stopMoving(): void {
    this.stops++
  }
  say(entryId: string): void {
    this.said.push(entryId)
  }
  sayRaw(text: string): void {
    this.raw.push(text)
  }
  async sleep(ms: number): Promise<void> {
    this.clock += ms
    this.onTick?.(this)
  }
  now(): number {
    return this.clock
  }
}

function session(
  world: GameWorld,
  role: GameRole,
  over: Partial<typeof config> = {},
  signal: AbortSignal | null = null,
) {
  return new HideAndSeekSession({
    world,
    config: { ...config, ...over },
    role,
    signal,
    random: seeded(99),
  })
}

// ─────────────────────────── PAPEL: O BOT SE ESCONDE ───────────────────────

describe('esconde-esconde: o bot se esconde', () => {
  it('só fala "pode procurar" depois de chegar ao esconderijo', async () => {
    const world = new FakeWorld()
    // Encerra a rodada assim que ele se esconde.
    world.onTick = (w) => {
      if (w.said.includes('jogo_pode_procurar')) w.ownerPos = { ...w.botPos }
    }

    const result = await session(world, 'bot_esconde').run()

    const avisou = world.said.indexOf('jogo_pode_procurar')
    expect(avisou).toBeGreaterThanOrEqual(0)
    // Ele já tinha caminhado quando avisou.
    expect(world.visited.length).toBeGreaterThan(0)
    expect(result.outcome).toBe('perdeu')
  })

  it('escolhe um lugar que o jogador não enxerga', async () => {
    // O jogador enxerga tudo do lado +x.
    const world = new FakeWorld({ ownerCanSee: (p) => p.x > 0 })
    world.onTick = (w) => {
      if (w.said.includes('jogo_pode_procurar')) w.ownerPos = { ...w.botPos }
    }

    await session(world, 'bot_esconde').run()

    const esconderijo = world.visited[0]!
    expect(esconderijo.x).toBeLessThanOrEqual(0)
  })

  it('respeita a faixa de distância configurada', async () => {
    const world = new FakeWorld()
    world.onTick = (w) => {
      if (w.said.includes('jogo_pode_procurar')) w.ownerPos = { ...w.botPos }
    }

    await session(world, 'bot_esconde', { hideMinDistance: 12, hideMaxDistance: 18 }).run()

    const spot = world.visited[0]!
    const dist = Math.hypot(spot.x, spot.z)
    expect(dist).toBeGreaterThanOrEqual(12)
    expect(dist).toBeLessThanOrEqual(18)
  })

  it('declara derrota quando o jogador encosta', async () => {
    const world = new FakeWorld()
    world.onTick = (w) => {
      // O jogador chega junto assim que o bot avisa.
      if (w.said.includes('jogo_pode_procurar'))
        w.ownerPos = { x: w.botPos.x + 1, y: 64, z: w.botPos.z }
    }

    const result = await session(world, 'bot_esconde').run()

    expect(result.outcome).toBe('perdeu')
    expect(world.said).toContain('jogo_fui_achado')
  })

  it('não declara derrota com o jogador ainda longe', async () => {
    const world = new FakeWorld()
    world.onTick = (w) => {
      // Jogador se aproxima, mas para fora da distância de toque.
      if (w.said.includes('jogo_pode_procurar')) {
        w.ownerPos = { x: w.botPos.x + 6, y: 64, z: w.botPos.z }
      }
    }

    const result = await session(world, 'bot_esconde', { roundTimeoutMs: 3_000 }).run()

    expect(result.outcome).toBe('tempo_esgotado')
    expect(world.said).not.toContain('jogo_fui_achado')
    expect(world.said).toContain('jogo_me_entrego')
  })

  it('fica parado enquanto escondido', async () => {
    const world = new FakeWorld()
    const result = await session(world, 'bot_esconde', { roundTimeoutMs: 2_000 }).run()

    expect(result.outcome).toBe('tempo_esgotado')
    // Uma caminhada só: a de ir para o esconderijo.
    expect(world.visited).toHaveLength(1)
  })

  // ── Regressão: relatado em jogo real, 2026-08-16 ────────────────────────
  // O bot ficava parado no campo aberto, só de costas para o jogador. Causa:
  // `ownerCanSee` usava alcance menor que `hideMaxDistance`, então todo ponto
  // além do alcance voltava "não visível" por aritmética, sem parede nenhuma.
  it('não aceita descampado como esconderijo, por mais longe que seja', async () => {
    const world = new FakeWorld({
      // Mundo aberto: o jogador enxerga tudo, a qualquer distância.
      ownerCanSee: () => true,
      coverAt: () => 0,
    })

    const result = await session(world, 'bot_esconde', { hideSearchMs: 3_000 }).run()

    expect(result.outcome).toBe('cancelado')
    expect(world.said).toContain('jogo_sem_esconderijo')
    expect(world.said).not.toContain('jogo_pode_procurar')
  })

  it('exige cobertura de verdade, não só estar fora da linha de visão', async () => {
    // Nada é visível (como num vale), mas só um ponto tem o que tapar.
    const abrigo = { x: -14, z: 0 }
    const world = new FakeWorld({
      ownerCanSee: () => false,
      coverAt: (p) => (Math.hypot(p.x - abrigo.x, p.z - abrigo.z) < 6 ? 4 : 0),
    })
    world.onTick = (w) => {
      if (w.said.includes('jogo_pode_procurar')) w.ownerPos = { ...w.botPos }
    }

    await session(world, 'bot_esconde', { hideSearchMs: 20_000 }).run()

    const escolhido = world.visited.at(-1)!
    expect(world.coverAt(escolhido)).toBeGreaterThanOrEqual(2)
  })

  it('anda procurando enquanto não acha cobertura', async () => {
    let tentativas = 0
    const world = new FakeWorld({
      ownerCanSee: () => false,
      // Só passa a existir cobertura depois de algumas voltas.
      coverAt: () => (tentativas > 2 ? 4 : 0),
    })
    world.onTick = (w) => {
      if (w.said.includes('jogo_pode_procurar')) w.ownerPos = { ...w.botPos }
    }
    const original = world.goto.bind(world)
    world.goto = async (p) => {
      tentativas++
      return original(p)
    }

    await session(world, 'bot_esconde', { hideSearchMs: 20_000 }).run()

    // Mais de uma caminhada: ele foi olhar outro lugar em vez de parar no 1º.
    expect(tentativas).toBeGreaterThan(1)
    expect(world.said).toContain('jogo_pode_procurar')
  })

  it('respeita o tempo de busca configurado', async () => {
    // Sem cobertura em lugar nenhum: ele procura até o prazo e então desiste.
    const world = new FakeWorld({ ownerCanSee: () => false, coverAt: () => 0 })
    let desistiuEm = 0
    world.onTick = (w) => {
      if (!desistiuEm && w.said.includes('jogo_sem_esconderijo')) desistiuEm = w.clock
    }

    await session(world, 'bot_esconde', { hideSearchMs: 5_000 }).run()

    // Procurou o tempo pedido e parou — não anda para sempre.
    expect(world.clock).toBeGreaterThanOrEqual(5_000)
    expect(world.clock).toBeLessThan(15_000)
  })

  // ── Regressão: segundo relato em jogo, 2026-08-16 ───────────────────────
  // Continuava aparecendo no campo de visão. Causa: a reserva do fim da busca
  // aceitava cobertura ZERO — campo aberto que só estava fora da linha de visão
  // naquele instante. O jogador virava a cabeça e o bot estava lá.
  it('nunca aceita cobertura zero, nem como último recurso', async () => {
    const world = new FakeWorld({ ownerCanSee: () => false, coverAt: () => 0 })

    const result = await session(world, 'bot_esconde', { hideSearchMs: 2_000 }).run()

    expect(result.outcome).toBe('cancelado')
    expect(world.said).toContain('jogo_sem_esconderijo')
    expect(world.said).not.toContain('jogo_pode_procurar')
  })

  it('cobertura fraca serve de reserva, cobertura nenhuma não', async () => {
    // Um único ponto com cobertura 1: pouco, mas é atrás de alguma coisa.
    const abrigo = { x: 0, z: -16 }
    const world = new FakeWorld({
      ownerCanSee: () => false,
      coverAt: (p) => (Math.hypot(p.x - abrigo.x, p.z - abrigo.z) < 7 ? 1 : 0),
    })
    world.onTick = (w) => {
      if (w.said.includes('jogo_pode_procurar')) w.ownerPos = { ...w.botPos }
    }

    const result = await session(world, 'bot_esconde', { hideSearchMs: 5_000 }).run()

    expect(world.said).toContain('jogo_pode_procurar')
    expect(world.coverAt(world.visited.at(-1)!)).toBeGreaterThanOrEqual(1)
    expect(result.outcome).toBe('perdeu')
  })

  // Candidato herdava a altura do jogador: num morro isso media dentro da
  // terra (cobertura 8, invisível) e o bot ia parar no topo, à vista.
  it('mede o candidato no chão de verdade, não na altura do jogador', async () => {
    const medidos: Vec3Like[] = []
    const world = new FakeWorld({
      ownerCanSee: () => false,
      // O terreno está 5 blocos acima do jogador em todo lugar.
      groundAt: (p) => ({ x: p.x, y: p.y + 5, z: p.z }),
      coverAt: (p) => {
        medidos.push(p)
        return 4
      },
    })
    world.onTick = (w) => {
      if (w.said.includes('jogo_pode_procurar')) w.ownerPos = { ...w.botPos }
    }

    await session(world, 'bot_esconde').run()

    // Toda medição aconteceu na altura resolvida, não na do jogador.
    expect(medidos.length).toBeGreaterThan(0)
    for (const p of medidos) expect(p.y).toBe(69)
    expect(world.visited[0]!.y).toBe(69)
  })

  it('descarta candidato sem chão conhecido', async () => {
    const world = new FakeWorld({ ownerCanSee: () => false, groundAt: () => null })

    const result = await session(world, 'bot_esconde', { hideSearchMs: 2_000 }).run()

    expect(result.outcome).toBe('cancelado')
    expect(world.said).toContain('jogo_sem_esconderijo')
  })

  it('recusa se parar num lugar descoberto, mesmo fora da linha de visão', async () => {
    // Escolhe um ponto bom, mas o pathfinder o larga no descampado.
    let chegou = false
    const world = new FakeWorld({
      ownerCanSee: () => false,
      coverAt: () => (chegou ? 0 : 4),
    })
    const original = world.goto.bind(world)
    world.goto = async (p) => {
      const r = await original(p)
      chegou = true
      return r
    }

    const result = await session(world, 'bot_esconde').run()

    expect(result.outcome).toBe('cancelado')
    expect(world.said).toContain('jogo_sem_esconderijo')
    expect(world.said).not.toContain('jogo_pode_procurar')
  })

  it('recusa com fala honesta quando não há esconderijo', async () => {
    // Lugar apertado: o jogador enxerga tudo.
    const world = new FakeWorld({ ownerCanSee: () => true })

    const result = await session(world, 'bot_esconde', { hideSearchMs: 3_000 }).run()

    expect(result.outcome).toBe('cancelado')
    expect(world.said).toContain('jogo_sem_esconderijo')
    expect(world.said).not.toContain('jogo_pode_procurar')
    // Ele procurou antes de desistir: andar por aí é parte de procurar.
    expect(world.visited.length).toBeGreaterThan(0)
  })

  it('recusa quando o pathfinder não alcança lugar nenhum', async () => {
    const world = new FakeWorld({ isReachable: () => false })

    const result = await session(world, 'bot_esconde').run()

    expect(result.outcome).toBe('cancelado')
    expect(world.said).toContain('jogo_sem_esconderijo')
  })

  it('se entrega quando o jogador desiste', async () => {
    const world = new FakeWorld()
    const s = session(world, 'bot_esconde', { roundTimeoutMs: 60_000 })
    world.onTick = (w) => {
      if (w.said.includes('jogo_pode_procurar')) s.requestReveal()
    }

    const result = await s.run()

    expect(result.outcome).toBe('ganhou')
    expect(world.said).toContain('jogo_me_entrego')
  })

  it('termina a rodada quando o jogador some do mundo', async () => {
    const world = new FakeWorld()
    world.onTick = (w) => {
      if (w.said.includes('jogo_pode_procurar')) w.ownerPos = null
    }

    const result = await session(world, 'bot_esconde', { roundTimeoutMs: 60_000 }).run()

    expect(result.outcome).toBe('cancelado')
  })

  it('não começa a rodada sem o jogador no mundo', async () => {
    const world = new FakeWorld({ ownerPosition: null })

    const result = await session(world, 'bot_esconde').run()

    expect(result.outcome).toBe('cancelado')
    expect(world.said).toContain('jogo_sem_esconderijo')
  })
})

// ──────────────────────────── PAPEL: O BOT PROCURA ─────────────────────────

describe('esconde-esconde: o bot procura', () => {
  const far = { ownerPosition: { x: 40, y: 64, z: 0 } }

  it('conta de 1 a 20 no chat, um número por mensagem', async () => {
    const world = new FakeWorld({ ...far, botCanSeeOwner: () => true })
    await session(world, 'bot_procura').run()

    expect(world.raw).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1)))
    expect(world.said).toContain('jogo_contando_fim')
  })

  it('honra um countTo diferente', async () => {
    const world = new FakeWorld({ ...far, botCanSeeOwner: () => true })
    await session(world, 'bot_procura', { countTo: 3 }).run()

    expect(world.raw).toEqual(['1', '2', '3'])
  })

  it('respeita o intervalo entre os números', async () => {
    const world = new FakeWorld({ ...far, botCanSeeOwner: () => true })
    await session(world, 'bot_procura', { countTo: 4, countIntervalMs: 1_000 }).run()

    // 4 números × 1 s de espera.
    expect(world.clock).toBeGreaterThanOrEqual(4_000)
  })

  it('com o padrão, a contagem leva 20 segundos', async () => {
    const world = new FakeWorld({ ...far, botCanSeeOwner: () => true })
    let acabouEm = 0
    world.onTick = (w) => {
      if (!acabouEm && w.said.includes('jogo_contando_fim')) acabouEm = w.clock
    }

    await session(world, 'bot_procura').run()

    // Tempo suficiente para a criança se esconder de verdade.
    expect(acabouEm).toBeGreaterThanOrEqual(20_000)
    expect(acabouEm).toBeLessThan(24_000)
  })

  it('erra exatamente duas vezes de propósito antes de procurar de verdade', async () => {
    const world = new FakeWorld({ ...far, botCanSeeOwner: () => true })
    await session(world, 'bot_procura').run()

    const erradas = world.said.filter((s) => s === 'jogo_busca_errada')
    expect(erradas).toHaveLength(2)
    // As duas primeiras caminhadas são as buscas falsas.
    expect(world.visited.length).toBeGreaterThanOrEqual(3)
  })

  it('nenhuma busca falsa chega perto do jogador', async () => {
    const world = new FakeWorld({ ...far, botCanSeeOwner: () => true })
    await session(world, 'bot_procura').run()

    const owner = far.ownerPosition
    for (const spot of world.visited.slice(0, 2)) {
      const dist = Math.hypot(spot.x - owner.x, spot.z - owner.z)
      expect(dist).toBeGreaterThanOrEqual(config.fakeSearchMinDistanceFromOwner)
    }
  })

  it('é deliberadamente cego enquanto finge: não acha durante as buscas falsas', async () => {
    // Enxerga o jogador o tempo todo, desde o primeiro instante.
    const world = new FakeWorld({ ...far, botCanSeeOwner: () => true })
    await session(world, 'bot_procura').run()

    const achou = world.said.indexOf('jogo_achei')
    const segundaErrada = world.said.lastIndexOf('jogo_busca_errada')
    expect(achou).toBeGreaterThan(segundaErrada)
  })

  it('honra fakeSearches configurado', async () => {
    const world = new FakeWorld({ ...far, botCanSeeOwner: () => true })
    await session(world, 'bot_procura', { fakeSearches: 4 }).run()

    expect(world.said.filter((s) => s === 'jogo_busca_errada')).toHaveLength(4)
  })

  it('vai até o jogador antes de falar que achou', async () => {
    const world = new FakeWorld({ ...far, botCanSeeOwner: () => true })
    const result = await session(world, 'bot_procura').run()

    expect(result.outcome).toBe('ganhou')
    const ultimo = world.visited.at(-1)!
    expect(ultimo.x).toBeCloseTo(far.ownerPosition.x, 5)
    expect(ultimo.z).toBeCloseTo(far.ownerPosition.z, 5)
    expect(world.said.at(-1)).toBe('jogo_achei')
  })

  it('não acha quem está atrás de parede — desiste com fala amigável', async () => {
    // Nunca ganha linha de visão, por mais perto que chegue.
    const world = new FakeWorld({ ...far, botCanSeeOwner: () => false })

    const result = await session(world, 'bot_procura', { roundTimeoutMs: 20_000 }).run()

    expect(result.outcome).toBe('tempo_esgotado')
    expect(world.said).toContain('jogo_nao_achei')
    expect(world.said).not.toContain('jogo_achei')
  })

  it('só declara vitória depois de ganhar a visão', async () => {
    let visible = false
    const world = new FakeWorld({ ...far, botCanSeeOwner: () => visible })
    world.onTick = (w) => {
      // A visão só abre depois das duas buscas falsas e de uma caminhada.
      if (w.said.filter((s) => s === 'jogo_busca_errada').length === 2) visible = true
    }

    const result = await session(world, 'bot_procura', { roundTimeoutMs: 60_000 }).run()

    expect(result.outcome).toBe('ganhou')
    expect(world.said).toContain('jogo_achei')
  })

  it('termina se o jogador some antes da busca real', async () => {
    const world = new FakeWorld({ ...far })
    world.onTick = (w) => {
      if (w.said.includes('jogo_contando_fim')) w.ownerPos = null
    }

    const result = await session(world, 'bot_procura', { roundTimeoutMs: 60_000 }).run()
    expect(result.outcome).toBe('cancelado')
  })

  it('com zero buscas falsas ainda exige visão para achar', async () => {
    const world = new FakeWorld({ ...far, botCanSeeOwner: () => false })
    const result = await session(world, 'bot_procura', {
      fakeSearches: 0,
      roundTimeoutMs: 15_000,
    }).run()

    expect(world.said).not.toContain('jogo_busca_errada')
    expect(result.outcome).toBe('tempo_esgotado')
  })
})

// ──────────────────────────────── CANCELAMENTO ─────────────────────────────

describe('esconde-esconde: cancelamento', () => {
  it('cancela durante a contagem e para de contar', async () => {
    const controller = new AbortController()
    const world = new FakeWorld({ ownerPosition: { x: 40, y: 64, z: 0 } })
    world.onTick = (w) => {
      if (w.raw.length === 4) controller.abort()
    }

    const result = await session(world, 'bot_procura', {}, controller.signal).run()

    expect(result.outcome).toBe('cancelado')
    expect(world.raw).toHaveLength(4)
  })

  it('cancela enquanto escondido', async () => {
    const controller = new AbortController()
    const world = new FakeWorld()
    world.onTick = (w) => {
      if (w.said.includes('jogo_pode_procurar')) controller.abort()
    }

    const result = await session(
      world,
      'bot_esconde',
      { roundTimeoutMs: 60_000 },
      controller.signal,
    ).run()

    expect(result.outcome).toBe('cancelado')
    expect(world.said).not.toContain('jogo_fui_achado')
  })

  it('para de se mover ao terminar, em qualquer desfecho', async () => {
    const world = new FakeWorld({ ownerCanSee: () => true })
    await session(world, 'bot_esconde').run()
    expect(world.stops).toBeGreaterThan(0)
  })

  it('sinal já abortado antes de começar termina na hora', async () => {
    const controller = new AbortController()
    controller.abort()
    const world = new FakeWorld({ ownerPosition: { x: 40, y: 64, z: 0 } })

    const result = await session(world, 'bot_procura', {}, controller.signal).run()
    expect(result.outcome).toBe('cancelado')
  })

  it('erro que não é cancelamento sobe, em vez de virar rodada cancelada', async () => {
    const world = new FakeWorld()
    world.goto = async () => {
      throw new Error('pathfinder explodiu')
    }

    await expect(session(world, 'bot_esconde').run()).rejects.toThrow('pathfinder explodiu')
  })

  it('GameAborted é o tipo do cancelamento', () => {
    expect(new GameAborted('x')).toBeInstanceOf(Error)
    expect(new GameAborted('x').name).toBe('GameAborted')
  })
})

// ───────────── INTEGRAÇÃO: SESSÃO + VISIBILIDADE DE VERDADE ────────────────

/**
 * Aqui a sessão roda contra o `hasLineOfSight` REAL, sobre um mundo com uma
 * parede de verdade — e não contra um `botCanSeeOwner` de mentira.
 *
 * Vale o custo porque visibilidade, escolha de ponto e sessão foram escritas
 * separadas: é este teste que prova que os três contratos se encaixam.
 */
describe('integração: a parede realmente esconde', () => {
  /** Mundo com uma parede sólida no plano x = `at`. */
  function wallAtX(at: number): RaycastWorld {
    return {
      raycast(origin, direction, maxDistance) {
        if (direction.x === 0) return null
        const t = (at - origin.x) / direction.x
        if (t < 0 || t > maxDistance) return null
        return { blocked: true }
      },
    }
  }

  class WalledWorld extends FakeWorld {
    // Parede em x = 10: o jogador fica em x = 0, o bot procura do lado de lá.
    private readonly wall = wallAtX(10)

    override ownerCanSee(p: Vec3Like): boolean {
      const owner = this.ownerPosition()
      if (!owner) return false
      return hasLineOfSight(this.wall, owner, p, { maxDistance: config.seeDistance })
    }

    override botCanSeeOwner(): boolean {
      const owner = this.ownerPosition()
      if (!owner) return false
      return hasLineOfSight(this.wall, this.botPosition(), owner, {
        maxDistance: config.seeDistance,
      })
    }
  }

  it('o esconderijo escolhido é invisível pelo raycast de verdade', async () => {
    const world = new WalledWorld()
    const ondeOJogadorEstava = { ...world.ownerPos! }
    world.onTick = (w) => {
      if (w.said.includes('jogo_pode_procurar')) w.ownerPos = { ...w.botPos }
    }

    await session(world, 'bot_esconde').run()

    // Conferido com a posição que o jogador tinha NA HORA DA ESCOLHA: depois
    // disso o teste move o jogador até o bot para encerrar a rodada.
    const spot = world.visited[0]!
    world.ownerPos = ondeOJogadorEstava
    expect(world.ownerCanSee(spot)).toBe(false)
  })

  it('a parede realmente bloqueia, e a ausência dela realmente libera', async () => {
    const world = new WalledWorld()
    world.ownerPos = { x: 0, y: 64, z: 0 }

    // Bot do outro lado da parede (x = 10): não enxerga.
    world.botPos = { x: 15, y: 64, z: 0 }
    expect(world.botCanSeeOwner()).toBe(false)

    // Mesmo lado, mesma distância: enxerga.
    world.botPos = { x: -15, y: 64, z: 0 }
    expect(world.botCanSeeOwner()).toBe(true)
  })

  it('procurando, ele só declara vitória depois de contornar a parede', async () => {
    const world = new WalledWorld()
    world.botPos = { x: 18, y: 64, z: 0 }
    world.ownerPos = { x: 0, y: 64, z: 0 }
    // No instante inicial a parede está no meio: ele NÃO pode achar já.
    expect(world.botCanSeeOwner()).toBe(false)

    const result = await session(world, 'bot_procura', { roundTimeoutMs: 60_000 }).run()

    // Andando, ele passa para o lado de cá e aí sim enxerga — é o que a
    // brincadeira deve fazer.
    expect(result.outcome).toBe('ganhou')
    const achou = world.said.indexOf('jogo_achei')
    const segundaErrada = world.said.lastIndexOf('jogo_busca_errada')
    // E mesmo assim, só depois das duas buscas erradas.
    expect(achou).toBeGreaterThan(segundaErrada)
  })

  it('jogador lacrado nunca é achado, por mais que o bot ande', async () => {
    // Caixa fechada: o raycast sempre bate, e o pathfinder não entra. A segunda
    // parte importa — sem ela o bot "andaria através" da parede e chegaria a
    // ocupar o mesmo ponto do jogador, onde qualquer linha de visão é trivial.
    // No jogo de verdade é o `canDig: false` que garante isso.
    const sealed: RaycastWorld = { raycast: () => ({ blocked: true }) }
    const world = new WalledWorld()
    world.ownerPos = { x: 0, y: 64, z: 0 }
    world.botPos = { x: 25, y: 64, z: 0 }
    world.botCanSeeOwner = () =>
      hasLineOfSight(sealed, world.botPosition(), world.ownerPos!, { maxDistance: 20 })
    // A caixa tem 3 blocos de raio: o bot encosta nela e para.
    const teleport = world.goto.bind(world)
    world.goto = async (position) => {
      const dist = Math.hypot(position.x, position.z)
      if (dist >= 3) return teleport(position)
      world.visited.push({ ...position })
      world.clock += 100
      return false
    }

    const result = await session(world, 'bot_procura', { roundTimeoutMs: 20_000 }).run()

    expect(result.outcome).toBe('tempo_esgotado')
    expect(world.said).toContain('jogo_nao_achei')
    expect(world.said).not.toContain('jogo_achei')
  })
})

// ───────────────────────────── REGISTRO DE JOGOS ───────────────────────────

describe('registro de jogos', () => {
  const deps = {
    world: new FakeWorld(),
    hideAndSeek: config,
    signal: null,
  }

  it('reconhece o esconde-esconde', () => {
    expect(resolveGame('esconde_esconde')).toBe('esconde_esconde')
    expect(createSession({ game: 'esconde_esconde' }, deps)).not.toBeNull()
  })

  it('recusa jogo desconhecido sem criar sessão', () => {
    expect(resolveGame('xadrez')).toBeNull()
    expect(createSession({ game: 'xadrez' }, deps)).toBeNull()
    expect(createSession({ game: 'poquer' }, deps)).toBeNull()
  })

  it('o papel padrão é o bot se esconder', () => {
    expect(resolveRole()).toBe('bot_esconde')
    expect(resolveRole('bot_procura')).toBe('bot_procura')
  })

  it('a sessão criada nasce com fase de fim até rodar', () => {
    const s = createSession({ game: 'esconde_esconde' }, deps)
    expect(s?.currentPhase).toBe('fim')
  })
})
