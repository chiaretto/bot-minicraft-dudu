import { describe, it, expect, vi } from 'vitest'
import {
  needsEscape,
  pillarHeight,
  diggableNeighbors,
  reachedOwnerLevel,
  JUMP_HEIGHT,
  type EscapeConfig,
} from '../src/domain/escape.js'
import {
  escapeHole,
  EscapeRefused,
  EscapeAborted,
  type EscapeWorld,
} from '../src/behaviors/actions/escape.js'
import type { Vec3Like } from '../src/domain/types.js'
import { parseCommand } from '../src/behaviors/commands.js'
import { behaviorSchema } from '../src/config/schema.js'

const CONFIG: EscapeConfig = { minDrop: 3, maxHeight: 20 }
const ALLOWLIST = ['dirt', 'cobblestone', 'stone', 'oak_log']

const key = (p: Vec3Like) => `${p.x},${p.y},${p.z}`

describe('quando vale a pena fazer escada', () => {
  it('dono bem acima: precisa subir', () => {
    expect(needsEscape({ x: 0, y: 40, z: 0 }, { x: 0, y: 64, z: 0 }, CONFIG)).toBe(true)
  })

  it('dono no mesmo nível: não é buraco', () => {
    expect(needsEscape({ x: 0, y: 64, z: 0 }, { x: 5, y: 64, z: 5 }, CONFIG)).toBe(false)
  })

  it('desnível pequeno resolve pulando, sem gastar bloco', () => {
    expect(needsEscape({ x: 0, y: 62, z: 0 }, { x: 0, y: 64, z: 0 }, CONFIG)).toBe(false)
  })

  /** Subir sem dono à vista deixaria o bot numa torre no meio do nada. */
  it('sem dono à vista, não sobe', () => {
    expect(needsEscape({ x: 0, y: 10, z: 0 }, null, CONFIG)).toBe(false)
  })

  it('dono abaixo do bot nunca é buraco', () => {
    expect(needsEscape({ x: 0, y: 64, z: 0 }, { x: 0, y: 20, z: 0 }, CONFIG)).toBe(false)
  })
})

describe('quantos degraus', () => {
  it('sobe o suficiente para o pulo resolver o resto', () => {
    const altura = pillarHeight({ x: 0, y: 50, z: 0 }, { x: 0, y: 64, z: 0 }, CONFIG)
    expect(altura).toBe(64 - 50 - JUMP_HEIGHT)
  })

  it('respeita o teto — nada de torre até o céu', () => {
    const altura = pillarHeight({ x: 0, y: 0, z: 0 }, { x: 0, y: 300, z: 0 }, CONFIG)
    expect(altura).toBe(CONFIG.maxHeight)
  })

  it('sem buraco, zero degraus', () => {
    expect(pillarHeight({ x: 0, y: 64, z: 0 }, { x: 0, y: 64, z: 0 }, CONFIG)).toBe(0)
    expect(pillarHeight({ x: 0, y: 64, z: 0 }, null, CONFIG)).toBe(0)
  })

  it('altura fracionada arredonda para cima — faltar um degrau não serve', () => {
    expect(pillarHeight({ x: 0, y: 50.4, z: 0 }, { x: 0, y: 64.9, z: 0 }, CONFIG)).toBe(14)
  })
})

describe('já chegou?', () => {
  it('no nível do dono, para de subir', () => {
    expect(reachedOwnerLevel({ x: 0, y: 63, z: 0 }, { x: 0, y: 64, z: 0 })).toBe(true)
    expect(reachedOwnerLevel({ x: 0, y: 60, z: 0 }, { x: 0, y: 64, z: 0 })).toBe(false)
  })

  it('dono sumiu: não faz sentido continuar subindo', () => {
    expect(reachedOwnerLevel({ x: 0, y: 10, z: 0 }, null)).toBe(true)
  })
})

describe('de onde tirar material', () => {
  const paredeEmVolta = (pos: Vec3Like) => pos.x !== 0 || pos.z !== 0

  it('cava as paredes dos lados, na altura dos pés e da cabeça', () => {
    const alvos = diggableNeighbors(paredeEmVolta, { x: 0, y: 50, z: 0 })
    expect(alvos).toHaveLength(8)
    expect(alvos.every((p) => p.y === 50 || p.y === 51)).toBe(true)
  })

  /** Cavar o chão aprofunda o buraco — que é o problema que estamos resolvendo. */
  it('NUNCA cava embaixo dos pés', () => {
    const alvos = diggableNeighbors(() => true, { x: 0, y: 50, z: 0 })
    expect(alvos.some((p) => p.y < 50)).toBe(false)
  })

  it('em espaço aberto não há o que cavar', () => {
    expect(diggableNeighbors(() => false, { x: 0, y: 50, z: 0 })).toHaveLength(0)
  })
})

/**
 * Mundo falso: um poço estreito de paredes de terra, com o dono na superfície.
 */
class FakeWorld implements EscapeWorld {
  y: number
  readonly pillars: Vec3Like[] = []
  readonly dug: Vec3Like[] = []
  equips: string[] = []
  failPillar = 0

  constructor(
    private inventory: Record<string, number> = { dirt: 64 },
    private owner: Vec3Like | null = { x: 0, y: 64, z: 0 },
    startY = 44,
    private paredes = true,
    /** Parede que ele NÃO consegue colher — pedra sem picareta. */
    private paredeDura = false,
  ) {
    this.y = startY
  }

  botPosition(): Vec3Like {
    return { x: 0, y: this.y, z: 0 }
  }
  ownerPosition(): Vec3Like | null {
    return this.owner
  }
  isSolid(pos: Vec3Like): boolean {
    if (pos.y < this.y) return true
    return this.paredes && (pos.x !== 0 || pos.z !== 0)
  }
  blockNameAt(pos: Vec3Like): string | null {
    if (!this.isSolid(pos)) return null
    return this.paredeDura ? 'stone' : 'dirt'
  }
  canHarvest(pos: Vec3Like): boolean {
    return this.isSolid(pos) && !this.paredeDura
  }
  inventoryCounts(): Record<string, number> {
    return this.inventory
  }
  async equipBlock(name: string): Promise<void> {
    this.equips.push(name)
  }
  async digBlock(pos: Vec3Like): Promise<void> {
    this.dug.push(pos)
    // Só rende item o que ele consegue colher.
    if (!this.paredeDura) this.inventory['dirt'] = (this.inventory['dirt'] ?? 0) + 1
  }
  async pillarUp(): Promise<void> {
    if (this.failPillar > 0) {
      this.failPillar--
      throw new Error('não deu pra colocar')
    }
    this.pillars.push(this.botPosition())
    this.y++
    const material = this.equips[this.equips.length - 1]!
    this.inventory[material] = (this.inventory[material] ?? 0) - 1
  }
}

const deps = (world: EscapeWorld, over: Partial<Parameters<typeof escapeHole>[0]> = {}) => ({
  world,
  signal: null,
  config: CONFIG,
  allowlist: ALLOWLIST,
  maxDigs: 12,
  ...over,
})

describe('sair do buraco', () => {
  it('sobe até o nível do dono e avisa que está indo', async () => {
    const world = new FakeWorld()
    const outcome = await escapeHole(deps(world))

    expect(outcome.ok).toBe(true)
    expect(world.y).toBeGreaterThanOrEqual(63)
    expect(outcome.message).toMatch(/saí do buraco/i)
  })

  it('gasta um bloco por degrau', async () => {
    const world = new FakeWorld({ dirt: 64 })
    const outcome = await escapeHole(deps(world))
    expect(world.inventoryCounts()['dirt']).toBe(64 - outcome.climbed)
  })

  it('para de subir assim que alcança o dono, sem gastar demais', async () => {
    const world = new FakeWorld({ dirt: 64 }, { x: 0, y: 50, z: 0 }, 44)
    const outcome = await escapeHole(deps(world))
    expect(outcome.climbed).toBeLessThanOrEqual(50 - 44)
  })

  it('não sobe quando não está em buraco nenhum', async () => {
    const world = new FakeWorld({ dirt: 64 }, { x: 0, y: 64, z: 0 }, 64)
    await expect(escapeHole(deps(world))).rejects.toBeInstanceOf(EscapeRefused)
    expect(world.pillars).toHaveLength(0)
  })

  it('sem dono à vista, não vira torre no meio do nada', async () => {
    const world = new FakeWorld({ dirt: 64 }, null, 20)
    await expect(escapeHole(deps(world))).rejects.toBeInstanceOf(EscapeRefused)
    expect(world.pillars).toHaveLength(0)
  })

  it('respeita o teto de altura', async () => {
    const world = new FakeWorld({ dirt: 200 }, { x: 0, y: 300, z: 0 }, 0)
    const outcome = await escapeHole(deps(world, { config: { minDrop: 3, maxHeight: 5 } }))
    expect(outcome.climbed).toBeLessThanOrEqual(5)
  })
})

describe('quando falta bloco', () => {
  it('cava a parede para arranjar degrau', async () => {
    const world = new FakeWorld({})
    const outcome = await escapeHole(deps(world))

    expect(world.dug.length).toBeGreaterThan(0)
    expect(outcome.ok).toBe(true)
  })

  /** Cavar o chão aprofundaria o buraco. */
  it('o que ele cava está sempre do lado, nunca embaixo', async () => {
    const world = new FakeWorld({})
    await escapeHole(deps(world))
    const inicio = 44
    expect(world.dug.every((p) => p.y >= inicio)).toBe(true)
  })

  it('sem bloco e sem parede para cavar: pede ajuda em vez de travar', async () => {
    const world = new FakeWorld({}, { x: 0, y: 64, z: 0 }, 44, false)
    await expect(escapeHole(deps(world))).rejects.toThrow(/não tenho bloco/)
  })

  it('só cava o que está na allowlist', async () => {
    const world = new FakeWorld({})
    await expect(escapeHole(deps(world, { allowlist: ['bedrock'] }))).rejects.toBeInstanceOf(
      EscapeRefused,
    )
    expect(world.dug).toHaveLength(0)
  })

  it('não vira escavação sem fim', async () => {
    const world = new FakeWorld({})
    world.digBlock = async () => {
      /* cava mas não recolhe nada */
    }
    await expect(escapeHole(deps(world, { maxDigs: 3 }))).rejects.toBeInstanceOf(EscapeRefused)
  })
})

describe('cancelamento', () => {
  it('`dudu, para` interrompe a subida', async () => {
    const world = new FakeWorld()
    const controller = new AbortController()
    const original = world.pillarUp.bind(world)
    world.pillarUp = async () => {
      await original()
      if (world.pillars.length >= 3) controller.abort()
    }

    await expect(escapeHole(deps(world, { signal: controller.signal }))).rejects.toBeInstanceOf(
      EscapeAborted,
    )
    expect(world.pillars.length).toBeLessThan(20)
  })

  it('sinal já abortado não coloca nada', async () => {
    const world = new FakeWorld()
    const controller = new AbortController()
    controller.abort()
    await expect(escapeHole(deps(world, { signal: controller.signal }))).rejects.toBeInstanceOf(
      EscapeAborted,
    )
    expect(world.pillars).toHaveLength(0)
  })
})

describe('quando dá errado no meio', () => {
  it('falha ao colocar encerra falando, sem travar', async () => {
    const world = new FakeWorld()
    world.pillarUp = async () => {
      throw new Error('nunca dá')
    }
    const outcome = await escapeHole(deps(world))
    expect(outcome.ok).toBe(false)
    expect(outcome.climbed).toBe(0)
    expect(outcome.message).toMatch(/me ajuda/i)
  })

  it('subida parcial é reportada com honestidade', async () => {
    const world = new FakeWorld({ dirt: 3 })
    const outcome = await escapeHole(deps(world, { maxDigs: 0 }))
    expect(outcome.ok).toBe(true)
    expect(outcome.climbed).toBe(3)
    expect(outcome.message).toMatch(/ainda tô fundo/i)
  })

  it('avisa o progresso para quem quiser contar no chat', async () => {
    const world = new FakeWorld()
    const onProgress = vi.fn()
    const outcome = await escapeHole(deps(world, { onProgress }))
    expect(onProgress).toHaveBeenCalledTimes(outcome.climbed)
  })
})

describe('posições empilhadas', () => {
  it('cada degrau sai um bloco acima do anterior', async () => {
    const world = new FakeWorld()
    await escapeHole(deps(world))
    for (let i = 1; i < world.pillars.length; i++) {
      expect(world.pillars[i]!.y).toBe(world.pillars[i - 1]!.y + 1)
    }
    expect(new Set(world.pillars.map(key)).size).toBe(world.pillars.length)
  })
})

describe('pedir para sair do buraco, sem IA nenhuma', () => {
  it('reconhece os jeitos de pedir', () => {
    for (const text of [
      'sai do buraco',
      'dudu, sobe',
      'sobe aqui',
      'faz uma escadinha',
      'ta preso ai',
    ]) {
      expect(parseCommand(text, 'Dudu')?.intent.type, text).toBe('ESCAPE_HOLE')
    }
  })

  it('tolera caixa e pontuação', () => {
    expect(parseCommand('DUDU, SAI DO BURACO!!!', 'Dudu')?.intent.type).toBe('ESCAPE_HOLE')
  })

  /** "vem" continua sendo chamado, não pedido de subida. */
  it('não rouba os comandos de seguir', () => {
    expect(parseCommand('vem', 'Dudu')?.intent.type).toBe('FOLLOW')
    expect(parseCommand('me segue', 'Dudu')?.intent.type).toBe('FOLLOW')
  })
})

describe('configuração da subida', () => {
  it('tem padrões que fazem sentido', () => {
    const behavior = behaviorSchema.parse({})
    expect(behavior.escapeMinDrop).toBeGreaterThanOrEqual(2)
    expect(behavior.escapeMaxHeight).toBeGreaterThan(behavior.escapeMinDrop)
    expect(behavior.escapeStuckMs).toBeGreaterThanOrEqual(1000)
  })

  /**
   * Ele só pode usar de degrau o que também pode cavar: a interseção das duas
   * allowlists é o que impede cavar a casa do jogador para subir.
   */
  it('a interseção das allowlists não é vazia', () => {
    const behavior = behaviorSchema.parse({})
    const permitidos = behavior.buildAllowlist.filter((n) => behavior.collectAllowlist.includes(n))
    expect(permitidos.length).toBeGreaterThan(0)
  })
})

/**
 * O defeito relatado em jogo (2026-08-19).
 *
 * O log mostrou: "Peguei 52 de pedra pra você!" e, minutos depois, dentro do
 * buraco, "não tenho bloco pra fazer degrau" — seis vezes seguidas. Os 52
 * blocos nunca existiram: pedra quebrada sem picareta some, e a coleta contava
 * blocos QUEBRADOS em vez de itens obtidos.
 */
describe('parede que ele não consegue colher (o bug de 2026-08-19)', () => {
  it('não fica cavando pedra à toa quando não tem picareta', async () => {
    const world = new FakeWorld({}, { x: 0, y: 64, z: 0 }, 44, true, true)
    await expect(escapeHole(deps(world))).rejects.toBeInstanceOf(EscapeRefused)
    expect(world.dug, 'cavou pedra que não conseguiria levar').toHaveLength(0)
  })

  it('pede picareta, não blocos — são pedidos diferentes', async () => {
    const world = new FakeWorld({}, { x: 0, y: 64, z: 0 }, 44, true, true)
    await expect(escapeHole(deps(world))).rejects.toThrow(/picareta/i)
  })

  it('parede mole continua rendendo degrau normalmente', async () => {
    const world = new FakeWorld({}, { x: 0, y: 64, z: 0 }, 44, true, false)
    const outcome = await escapeHole(deps(world))
    expect(world.dug.length).toBeGreaterThan(0)
    expect(outcome.ok).toBe(true)
  })

  it('sem parede nenhuma, a fala é a de "me joga uns blocos"', async () => {
    const world = new FakeWorld({}, { x: 0, y: 64, z: 0 }, 44, false)
    await expect(escapeHole(deps(world))).rejects.toThrow(/me joga uns/i)
  })
})
