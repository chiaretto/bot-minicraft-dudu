import { describe, it, expect } from 'vitest'
import { TagSession } from '../src/behaviors/games/tag.js'
import { GameAborted, type GameWorld } from '../src/behaviors/games/world.js'
import { createSession, resolveGame, resolveRole } from '../src/behaviors/games/index.js'
import { hideAndSeekSchema, tagSchema } from '../src/config/schema.js'
import type { GameRole } from '../src/domain/games.js'
import type { Vec3Like } from '../src/domain/types.js'

const config = tagSchema.parse({})

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function horizontal(a: Vec3Like, b: Vec3Like): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

interface FakeOptions {
  ownerPosition?: Vec3Like | null
  botPosition?: Vec3Like
  /** `false` faz o `goto` resolver sem ter chegado. */
  arrives?: boolean
  gotoDurationMs?: number
  groundAt?: (p: Vec3Like) => Vec3Like | null
  isReachable?: (p: Vec3Like) => boolean
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
  chases: number[] = []
  sprintChanges: boolean[] = []
  sprinting = false
  stops = 0
  botPos: Vec3Like
  ownerPos: Vec3Like | null
  /** Trocado no meio do teste para simular quem corre atrás de quem. */
  onTick: ((world: FakeWorld) => void) | null = null

  constructor(private readonly options: FakeOptions = {}) {
    this.ownerPos =
      options.ownerPosition === undefined ? { x: 0, y: 64, z: 0 } : options.ownerPosition
    this.botPos = options.botPosition ?? { x: 3, y: 64, z: 0 }
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
  ownerCanSee(): boolean {
    return true
  }
  ownerFacing(): boolean {
    return true
  }
  coverAt(): number {
    return 0
  }
  groundAt(p: Vec3Like): Vec3Like | null {
    return this.options.groundAt ? this.options.groundAt(p) : { ...p }
  }
  botCanSeeOwner(): boolean {
    return true
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
  chaseOwner(distance: number): void {
    this.chases.push(distance)
  }
  setSprinting(on: boolean): void {
    this.sprinting = on
    this.sprintChanges.push(on)
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
  return new TagSession({
    world,
    config: { ...config, ...over },
    role,
    signal,
    random: seeded(99),
  })
}

// ─────────────────────────────── PAPEL: PEGAR ──────────────────────────────

describe('pega-pega: o bot pega', () => {
  /** Jogador longe e parado: dá para o bot correr sem pegar na hora. */
  const longe = { ownerPosition: { x: 40, y: 64, z: 0 }, botPosition: { x: 0, y: 64, z: 0 } }

  it('conta até 5 no chat, um número por mensagem', async () => {
    const world = new FakeWorld(longe)
    await session(world, 'bot_pega', { chaseTimeoutMs: 3_000 }).run()

    expect(world.raw).toEqual(['1', '2', '3', '4', '5'])
    expect(world.said).toContain('pega_aceito_pego')
    expect(world.said).toContain('pega_vou_pegar')
  })

  it('a contagem leva 5 segundos e ele fica parado nela', async () => {
    const world = new FakeWorld(longe)
    let saiuEm = 0
    world.onTick = (w) => {
      if (!saiuEm && w.said.includes('pega_vou_pegar')) saiuEm = w.clock
    }

    await session(world, 'bot_pega', { chaseTimeoutMs: 3_000 }).run()

    expect(saiuEm).toBeGreaterThanOrEqual(5_000)
    expect(saiuEm).toBeLessThan(6_000)
    // Nenhuma perseguição começou antes do fim da contagem: a vantagem de saída
    // da criança é a brincadeira inteira.
    expect(world.chases).not.toHaveLength(0)
  })

  it('honra um countTo diferente', async () => {
    const world = new FakeWorld(longe)
    await session(world, 'bot_pega', { countTo: 2, chaseTimeoutMs: 2_000 }).run()

    expect(world.raw).toEqual(['1', '2'])
  })

  it('persegue com objetivo dinâmico, sem esperar chegar num ponto parado', async () => {
    const world = new FakeWorld(longe)
    await session(world, 'bot_pega', { chaseTimeoutMs: 5_000 }).run()

    expect(world.chases.length).toBeGreaterThan(0)
    expect(world.chases[0]).toBe(config.chaseFollowDistance)
    // Perseguir não é caminhar até um ponto: nenhum `goto` na perseguição.
    expect(world.visited).toHaveLength(0)
  })

  it('corre de verdade enquanto persegue', async () => {
    const world = new FakeWorld(longe)
    await session(world, 'bot_pega', { chaseTimeoutMs: 2_000 }).run()

    expect(world.sprintChanges[0]).toBe(true)
  })

  it('encostar no jogador é vitória', async () => {
    const world = new FakeWorld(longe)
    world.onTick = (w) => {
      // O jogador cansa e volta para perto do bot.
      if (w.said.includes('pega_vou_pegar')) w.ownerPos = { x: w.botPos.x + 1, y: 64, z: 0 }
    }

    const result = await session(world, 'bot_pega').run()

    expect(result.outcome).toBe('ganhou')
    expect(world.said).toContain('pega_te_peguei')
  })

  it('cansa em 60 s e perde, sem discutir', async () => {
    const world = new FakeWorld(longe)
    const result = await session(world, 'bot_pega').run()

    expect(result.outcome).toBe('perdeu')
    expect(world.said).toContain('pega_cansei_pegando')
    expect(world.said).not.toContain('pega_te_peguei')
    // Cansou de verdade: correu os 60 s prometidos.
    expect(world.clock).toBeGreaterThanOrEqual(65_000)
  })

  it('cansado, ele para de correr — não fica correndo à toa', async () => {
    const world = new FakeWorld(longe)
    await session(world, 'bot_pega').run()

    expect(world.sprinting).toBe(false)
    expect(world.stops).toBeGreaterThan(0)
  })

  it('honra um tempo de perseguição diferente', async () => {
    const world = new FakeWorld(longe)
    await session(world, 'bot_pega', { chaseTimeoutMs: 10_000 }).run()

    // 5 s de contagem + 10 s correndo.
    expect(world.clock).toBeGreaterThanOrEqual(15_000)
    expect(world.clock).toBeLessThan(20_000)
  })

  it('jogador que desiste é alcançado e pego', async () => {
    const world = new FakeWorld(longe)
    const s = session(world, 'bot_pega')
    world.onTick = (w) => {
      if (w.said.includes('pega_vou_pegar')) s.requestReveal()
    }

    const result = await s.run()

    expect(result.outcome).toBe('ganhou')
    expect(world.said).toContain('pega_te_peguei')
    // Foi até ele antes de cantar vitória.
    expect(world.visited.length).toBeGreaterThan(0)
  })

  it('termina se o jogador sai do mundo no meio da corrida', async () => {
    const world = new FakeWorld(longe)
    world.onTick = (w) => {
      if (w.said.includes('pega_vou_pegar')) w.ownerPos = null
    }

    const result = await session(world, 'bot_pega').run()

    expect(result.outcome).toBe('cancelado')
    expect(world.said).not.toContain('pega_te_peguei')
  })

  it('não começa a rodada sem o jogador no mundo', async () => {
    const world = new FakeWorld({ ownerPosition: null })

    const result = await session(world, 'bot_pega').run()

    expect(result.outcome).toBe('cancelado')
    expect(world.raw).toHaveLength(0)
  })
})

// ─────────────────────────────── PAPEL: FUGIR ──────────────────────────────

describe('pega-pega: o bot foge', () => {
  it('sai correndo na hora, sem contar', async () => {
    const world = new FakeWorld()
    await session(world, 'bot_foge', { fleeTimeoutMs: 3_000 }).run()

    expect(world.raw).toHaveLength(0)
    expect(world.said).toContain('pega_aceito_fujo')
    expect(world.visited.length).toBeGreaterThan(0)
  })

  it('foge sem sprint, senão criança nenhuma alcança', async () => {
    const world = new FakeWorld()
    await session(world, 'bot_foge', { fleeTimeoutMs: 2_000 }).run()

    expect(world.sprintChanges[0]).toBe(false)
  })

  it('cada destino se afasta de quem está pegando', async () => {
    const world = new FakeWorld()
    const owner = { ...world.ownerPos! }
    await session(world, 'bot_foge', { fleeTimeoutMs: 5_000 }).run()

    // Cada ponto escolhido cabe no teto e não corre para os braços do jogador.
    for (const destino of world.visited) {
      expect(horizontal(destino, owner)).toBeLessThanOrEqual(config.fleeMaxDistanceFromOwner)
      expect(horizontal(destino, owner)).toBeGreaterThan(config.touchDistance)
    }
    expect(world.visited.length).toBeGreaterThan(1)
  })

  it('ser tocado é derrota, e ele para na hora', async () => {
    const world = new FakeWorld()
    world.onTick = (w) => {
      // O jogador alcança o bot logo no começo.
      if (w.visited.length >= 1) w.ownerPos = { x: w.botPos.x, y: 64, z: w.botPos.z }
    }

    const result = await session(world, 'bot_foge').run()

    expect(result.outcome).toBe('perdeu')
    expect(world.said).toContain('pega_fui_pego')
    expect(world.said).not.toContain('pega_cansei_fugindo')
    expect(world.sprinting).toBe(false)
  })

  it('cansa em 60 s, para de propósito e se deixa pegar', async () => {
    const world = new FakeWorld()
    const result = await session(world, 'bot_foge').run()

    expect(result.outcome).toBe('perdeu')
    expect(world.said).toContain('pega_cansei_fugindo')
    expect(world.clock).toBeGreaterThanOrEqual(60_000)
  })

  it('entregue, ele não volta a fugir', async () => {
    const world = new FakeWorld()
    let caminhadasAteEntregar = 0
    world.onTick = (w) => {
      if (!caminhadasAteEntregar && w.said.includes('pega_cansei_fugindo')) {
        caminhadasAteEntregar = w.visited.length
      }
    }

    await session(world, 'bot_foge').run()

    expect(caminhadasAteEntregar).toBeGreaterThan(0)
    expect(world.visited).toHaveLength(caminhadasAteEntregar)
  })

  it('entregue, ser tocado ainda encerra com fala', async () => {
    const world = new FakeWorld()
    world.onTick = (w) => {
      if (w.said.includes('pega_cansei_fugindo')) w.ownerPos = { ...w.botPos }
    }

    const result = await session(world, 'bot_foge').run()

    expect(result.outcome).toBe('perdeu')
    expect(world.said).toContain('pega_fui_pego')
  })

  it('ninguém veio buscar: a rodada acaba mesmo assim', async () => {
    const world = new FakeWorld()
    const result = await session(world, 'bot_foge', { surrenderTimeoutMs: 5_000 }).run()

    expect(result.outcome).toBe('perdeu')
    expect(world.said).toContain('pega_cansei_fugindo')
    // Não fica pendurado esperando para sempre.
    expect(world.clock).toBeLessThan(config.roundTimeoutMs)
  })

  it('jogador que desiste de pegar encerra a rodada', async () => {
    const world = new FakeWorld()
    const s = session(world, 'bot_foge')
    world.onTick = (w) => {
      if (w.visited.length >= 2) s.requestReveal()
    }

    const result = await s.run()

    expect(result.outcome).toBe('perdeu')
    expect(world.said).toContain('pega_me_entrego')
  })

  it('encurralado não trava a rodada', async () => {
    // Nenhum destino de fuga existe: todo candidato é inalcançável.
    const world = new FakeWorld({ isReachable: () => false })

    const result = await session(world, 'bot_foge', { fleeTimeoutMs: 3_000 }).run()

    expect(world.visited).toHaveLength(0)
    expect(result.outcome).toBe('perdeu')
    expect(world.said).toContain('pega_cansei_fugindo')
  })

  it('termina se o jogador sai do mundo', async () => {
    const world = new FakeWorld()
    world.onTick = (w) => {
      if (w.visited.length >= 1) w.ownerPos = null
    }

    const result = await session(world, 'bot_foge').run()

    expect(result.outcome).toBe('cancelado')
  })

  it('não começa a rodada sem o jogador no mundo', async () => {
    const world = new FakeWorld({ ownerPosition: null })

    const result = await session(world, 'bot_foge').run()

    expect(result.outcome).toBe('cancelado')
    expect(world.said).not.toContain('pega_aceito_fujo')
  })
})

// ──────────────────────────────── CANCELAMENTO ─────────────────────────────

describe('pega-pega: cancelamento', () => {
  it('cancela durante a contagem e para de contar', async () => {
    const controller = new AbortController()
    const world = new FakeWorld({ ownerPosition: { x: 40, y: 64, z: 0 } })
    world.onTick = (w) => {
      if (w.raw.length === 2) controller.abort()
    }

    const result = await session(world, 'bot_pega', {}, controller.signal).run()

    expect(result.outcome).toBe('cancelado')
    expect(world.raw).toHaveLength(2)
  })

  it('cancela no meio da perseguição e para de correr', async () => {
    const controller = new AbortController()
    const world = new FakeWorld({ ownerPosition: { x: 40, y: 64, z: 0 } })
    world.onTick = (w) => {
      if (w.chases.length >= 1) controller.abort()
    }

    const result = await session(world, 'bot_pega', {}, controller.signal).run()

    expect(result.outcome).toBe('cancelado')
    expect(world.sprinting).toBe(false)
    expect(world.stops).toBeGreaterThan(0)
    expect(world.said).not.toContain('pega_cansei_pegando')
  })

  it('cancela no meio da fuga e para de correr', async () => {
    const controller = new AbortController()
    const world = new FakeWorld()
    world.onTick = (w) => {
      if (w.visited.length >= 1) controller.abort()
    }

    const result = await session(world, 'bot_foge', {}, controller.signal).run()

    expect(result.outcome).toBe('cancelado')
    expect(world.sprinting).toBe(false)
    expect(world.said).not.toContain('pega_cansei_fugindo')
  })

  it('sinal já abortado antes de começar termina na hora', async () => {
    const controller = new AbortController()
    controller.abort()
    const world = new FakeWorld({ ownerPosition: { x: 40, y: 64, z: 0 } })

    const result = await session(world, 'bot_pega', {}, controller.signal).run()

    expect(result.outcome).toBe('cancelado')
    expect(world.raw).toHaveLength(0)
  })

  it('erro que não é cancelamento sobe, em vez de virar rodada cancelada', async () => {
    const world = new FakeWorld()
    world.goto = async () => {
      throw new Error('pathfinder explodiu')
    }

    await expect(session(world, 'bot_foge').run()).rejects.toThrow('pathfinder explodiu')
  })

  it('a rede de segurança do tempo total é desfecho próprio', async () => {
    const world = new FakeWorld({ ownerPosition: { x: 40, y: 64, z: 0 } })
    // Rodada mais curta que a perseguição: quem dispara primeiro é a rede.
    const result = await session(world, 'bot_pega', { roundTimeoutMs: 20_000 }).run()

    expect(result.outcome).toBe('tempo_esgotado')
    expect(world.said).not.toContain('pega_cansei_pegando')
    expect(world.said).toContain('jogo_cancelado')
  })

  it('GameAborted é o tipo do cancelamento', () => {
    expect(new GameAborted('x')).toBeInstanceOf(Error)
    expect(new GameAborted('x').name).toBe('GameAborted')
  })
})

// ───────────────────────────── REGISTRO DE JOGOS ───────────────────────────

describe('registro: pega-pega', () => {
  const deps = {
    world: new FakeWorld(),
    hideAndSeek: hideAndSeekSchema.parse({}),
    tag: config,
    signal: null,
  }

  it('reconhece o pega-pega', () => {
    expect(resolveGame('pega_pega')).toBe('pega_pega')
    expect(createSession({ game: 'pega_pega' }, deps)).not.toBeNull()
  })

  it('o papel padrão é o bot pegar', () => {
    expect(resolveRole('pega_pega')).toBe('bot_pega')
    expect(resolveRole('pega_pega', 'bot_foge')).toBe('bot_foge')
  })

  it('papel de outro jogo não vira rodada', () => {
    expect(resolveRole('pega_pega', 'bot_esconde')).toBeNull()
    expect(resolveRole('esconde_esconde', 'bot_pega')).toBeNull()
    expect(createSession({ game: 'pega_pega', role: 'bot_esconde' }, deps)).toBeNull()
    expect(createSession({ game: 'esconde_esconde', role: 'bot_foge' }, deps)).toBeNull()
  })

  it('a sessão criada nasce com fase de fim até rodar', () => {
    expect(createSession({ game: 'pega_pega' }, deps)?.currentPhase).toBe('fim')
  })
})
