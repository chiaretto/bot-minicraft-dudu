import { describe, it, expect, vi } from 'vitest'
import {
  buildStructure,
  chooseAnchor,
  chooseMaterial,
  BuildRefused,
  BuildAborted,
  type BuildWorld,
} from '../src/behaviors/actions/build.js'
import { planStructure } from '../src/domain/blueprints.js'
import type { Vec3Like } from '../src/domain/types.js'

const ALLOWLIST = ['oak_log', 'birch_log', 'cobblestone', 'stone', 'dirt']

const key = (p: Vec3Like) => `${p.x},${p.y},${p.z}`

/**
 * Mundo falso: chão sólido em y = 63 e nada acima. O bot fica em 0,64,0.
 * Zero rede, zero servidor — a regra da obra é testável sozinha.
 */
class FakeWorld implements BuildWorld {
  readonly placed: Vec3Like[] = []
  readonly solid = new Set<string>()
  walks = 0
  equips: string[] = []
  failNext = 0

  constructor(
    private inventory: Record<string, number> = { oak_log: 200 },
    private owner: Vec3Like | null = { x: -10, y: 64, z: -10 },
  ) {
    // Chão infinito em y = 63.
  }

  botPosition(): Vec3Like {
    return { x: 0, y: 64, z: 0 }
  }
  ownerPosition(): Vec3Like | null {
    return this.owner
  }
  isSolid(pos: Vec3Like): boolean {
    if (pos.y <= 63) return true
    return this.solid.has(key(pos))
  }
  inventoryCounts(): Record<string, number> {
    return this.inventory
  }
  async equipBlock(name: string): Promise<void> {
    this.equips.push(name)
  }
  async walkNear(): Promise<void> {
    this.walks++
  }
  async placeBlock(reference: Vec3Like, face: Vec3Like): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--
      throw new Error('não alcancei')
    }
    const target = { x: reference.x + face.x, y: reference.y + face.y, z: reference.z + face.z }
    this.solid.add(key(target))
    this.placed.push(target)
    const material = this.equips[this.equips.length - 1]!
    this.inventory[material] = (this.inventory[material] ?? 0) - 1
  }
}

const deps = (world: BuildWorld, over: Partial<Parameters<typeof buildStructure>[0]> = {}) => ({
  world,
  signal: null,
  maxBlocks: 200,
  allowlist: ALLOWLIST,
  ...over,
})

describe('onde a obra nasce', () => {
  it('nasce ao lado do bot, não em cima dele', () => {
    const anchor = chooseAnchor({ x: 0, y: 64, z: 0 }, null, { width: 5, depth: 5 })
    expect(anchor).toEqual({ x: 2, y: 64, z: 2 })
  })

  /** Enterrar a criança dentro de uma parede é o pior jeito de errar isto. */
  it('sai de perto quando o jogador está onde a casa ia nascer', () => {
    const dentro = { x: 3, y: 64, z: 3 }
    const anchor = chooseAnchor({ x: 0, y: 64, z: 0 }, dentro, { width: 5, depth: 5 })
    expect(anchor.x).toBeGreaterThan(3 + 5 - 5)
    expect(anchor.x).toBe(9)
  })

  it('arredonda posição fracionada para bloco', () => {
    const anchor = chooseAnchor({ x: 10.7, y: 64.9, z: -3.2 }, null, { width: 5, depth: 5 })
    expect(anchor).toEqual({ x: 12, y: 64, z: -2 })
  })
})

describe('escolha do material', () => {
  it('sem pedido, usa o que tem mais na mochila', () => {
    expect(chooseMaterial({ oak_log: 10, cobblestone: 90 }, ALLOWLIST)).toBe('cobblestone')
  })

  it('nunca usa bloco fora da allowlist', () => {
    expect(chooseMaterial({ tnt: 500 }, ALLOWLIST)).toBeNull()
    expect(chooseMaterial({ tnt: 500 }, ALLOWLIST, 'tnt')).toBeNull()
  })

  it('pedido explícito é respeitado', () => {
    expect(chooseMaterial({ oak_log: 5, cobblestone: 90 }, ALLOWLIST, 'pedra')).toBe('cobblestone')
  })

  it('mochila vazia não escolhe nada', () => {
    expect(chooseMaterial({}, ALLOWLIST)).toBeNull()
  })
})

describe('construir de verdade', () => {
  it('levanta a casa inteira', async () => {
    const world = new FakeWorld()
    const casa = planStructure('casa')

    const outcome = await buildStructure(deps(world), 'casa')

    expect(outcome.ok).toBe(true)
    expect(outcome.placed).toBe(casa.blocks.length)
    expect(outcome.total).toBe(casa.blocks.length)
    expect(outcome.message).toMatch(/casa/i)
  })

  it('levanta a torre inteira', async () => {
    const world = new FakeWorld()
    const outcome = await buildStructure(deps(world), 'torre')
    expect(outcome.placed).toBe(planStructure('torre').blocks.length)
  })

  /** A planta é relativa; o que vai para o mundo tem de sair da âncora. */
  it('põe cada bloco no lugar previsto pela planta', async () => {
    const world = new FakeWorld()
    await buildStructure(deps(world), 'casa')

    const anchor = chooseAnchor(world.botPosition(), world.ownerPosition(), {
      width: 5,
      depth: 5,
    })
    const esperado = new Set(
      planStructure('casa').blocks.map((b) =>
        key({ x: anchor.x + b.x, y: anchor.y + b.y, z: anchor.z + b.z }),
      ),
    )
    expect(new Set(world.placed.map(key))).toEqual(esperado)
  })

  it('usa o material escolhido em todo bloco', async () => {
    const world = new FakeWorld({ cobblestone: 200 })
    await buildStructure(deps(world), 'casa')
    expect(new Set(world.equips)).toEqual(new Set(['cobblestone']))
  })

  it('gasta material da mochila', async () => {
    const world = new FakeWorld({ oak_log: 200 })
    const outcome = await buildStructure(deps(world), 'casa')
    expect(world.inventoryCounts()['oak_log']).toBe(200 - outcome.placed)
  })
})

describe('a obra não estraga o que já existe', () => {
  it('pula posição já ocupada em vez de derrubar', async () => {
    const world = new FakeWorld()
    const anchor = { x: 2, y: 64, z: 2 }
    // Uma pedra do jogador bem no meio de onde vai a parede.
    world.solid.add(key({ x: anchor.x, y: anchor.y, z: anchor.z }))

    const outcome = await buildStructure(deps(world), 'casa')

    expect(outcome.ok).toBe(true)
    // O bloco existente conta como pronto, mas não foi colocado por ele.
    expect(world.placed.map(key)).not.toContain(key(anchor))
    expect(outcome.placed).toBe(outcome.total)
  })
})

describe('quando falta material', () => {
  it('recusa com honestidade, dizendo quanto falta', async () => {
    const world = new FakeWorld({ oak_log: 5 })
    await expect(buildStructure(deps(world), 'casa')).rejects.toBeInstanceOf(BuildRefused)
    await expect(buildStructure(deps(world), 'casa')).rejects.toThrow(/faltam \d+ de madeira/)
  })

  it('busca o que falta quando sabe buscar', async () => {
    const world = new FakeWorld({ oak_log: 5 })
    const gather = vi.fn(async (block: string, count: number) => {
      world.inventoryCounts()[block] = (world.inventoryCounts()[block] ?? 0) + count
      return count
    })

    const outcome = await buildStructure(deps(world, { gather }), 'casa')

    expect(gather).toHaveBeenCalledOnce()
    expect(outcome.ok).toBe(true)
    expect(outcome.placed).toBe(outcome.total)
  })

  it('busca e ainda assim falta: recusa em vez de começar pela metade', async () => {
    const world = new FakeWorld({ oak_log: 5 })
    const gather = vi.fn(async () => 0)
    await expect(buildStructure(deps(world, { gather }), 'casa')).rejects.toBeInstanceOf(
      BuildRefused,
    )
  })

  it('mochila vazia sem saber buscar: recusa antes de andar', async () => {
    const world = new FakeWorld({})
    await expect(buildStructure(deps(world), 'casa')).rejects.toThrow(/não tenho bloco/)
    expect(world.walks).toBe(0)
  })
})

describe('recusas', () => {
  it('estrutura fora do catálogo', async () => {
    const world = new FakeWorld()
    await expect(buildStructure(deps(world), 'castelo')).rejects.toBeInstanceOf(BuildRefused)
    expect(world.placed).toHaveLength(0)
  })

  it('obra maior que o teto de segurança', async () => {
    const world = new FakeWorld()
    await expect(buildStructure(deps(world, { maxBlocks: 10 }), 'casa')).rejects.toThrow(
      /grande demais/,
    )
    expect(world.placed).toHaveLength(0)
  })

  it('material pedido fora da allowlist', async () => {
    const world = new FakeWorld({ tnt: 500 })
    await expect(buildStructure(deps(world), 'casa', 'tnt')).rejects.toThrow(/não posso construir/)
  })
})

describe('cancelamento', () => {
  it('`dudu, para` interrompe a obra no meio', async () => {
    const world = new FakeWorld()
    const controller = new AbortController()

    // Aborta depois de alguns blocos.
    const original = world.placeBlock.bind(world)
    world.placeBlock = async (ref, face) => {
      await original(ref, face)
      if (world.placed.length >= 5) controller.abort()
    }

    await expect(
      buildStructure(deps(world, { signal: controller.signal }), 'casa'),
    ).rejects.toBeInstanceOf(BuildAborted)
    expect(world.placed.length).toBeLessThan(planStructure('casa').blocks.length)
  })

  it('sinal já abortado não coloca nada', async () => {
    const world = new FakeWorld()
    const controller = new AbortController()
    controller.abort()

    await expect(
      buildStructure(deps(world, { signal: controller.signal }), 'casa'),
    ).rejects.toBeInstanceOf(BuildAborted)
    expect(world.placed).toHaveLength(0)
  })
})

describe('falha de colocação não derruba a obra', () => {
  it('bloco que falhou volta na passada seguinte', async () => {
    const world = new FakeWorld()
    world.failNext = 3

    const outcome = await buildStructure(deps(world), 'casa')

    expect(outcome.ok).toBe(true)
    expect(outcome.placed).toBe(outcome.total)
  })

  it('quando nada mais entra, termina falando em vez de travar', async () => {
    const world = new FakeWorld()
    world.placeBlock = async () => {
      throw new Error('nunca dá')
    }

    const outcome = await buildStructure(deps(world), 'casa')

    expect(outcome.ok).toBe(false)
    expect(outcome.placed).toBe(0)
    expect(outcome.message).toMatch(/desculpa/i)
  })
})

describe('progresso', () => {
  it('avisa o andamento para quem quiser contar no chat', async () => {
    const world = new FakeWorld()
    const onProgress = vi.fn()
    const outcome = await buildStructure(deps(world, { onProgress }), 'casa')
    expect(onProgress).toHaveBeenCalledTimes(outcome.placed)
  })
})

/**
 * O defeito relatado em jogo (2026-08-19), log linha 101.
 *
 * "Construa uma casa" respondia "não tenho bloco nenhum pra construir" mesmo
 * com `buildAutoGather` ligado: a escolha do material acontecia ANTES da busca
 * e, com a mochila vazia, devolvia null e recusava sem tentar.
 */
describe('mochila vazia com busca ligada (o bug de 2026-08-19)', () => {
  it('vai buscar em vez de recusar de cara', async () => {
    const world = new FakeWorld({})
    const gather = vi.fn(async (block: string, count: number) => {
      world.inventoryCounts()[block] = (world.inventoryCounts()[block] ?? 0) + count
      return count
    })

    const outcome = await buildStructure(deps(world, { gather }), 'casa')

    expect(gather, 'nem tentou buscar material').toHaveBeenCalled()
    expect(outcome.ok).toBe(true)
    expect(outcome.placed).toBe(outcome.total)
  })

  it('busca o primeiro material da allowlist quando não tem nada', async () => {
    const world = new FakeWorld({})
    const gather = vi.fn(async (block: string, count: number) => {
      world.inventoryCounts()[block] = (world.inventoryCounts()[block] ?? 0) + count
      return count
    })

    await buildStructure(deps(world, { gather, allowlist: ['cobblestone', 'dirt'] }), 'casa')

    expect(gather.mock.calls[0]![0]).toBe('cobblestone')
  })

  /** Sem saber buscar, a recusa continua sendo a resposta certa. */
  it('sem busca, mochila vazia continua recusando', async () => {
    const world = new FakeWorld({})
    await expect(buildStructure(deps(world), 'casa')).rejects.toThrow(/não tenho bloco/)
  })

  it('material pedido pelo jogador não é trocado por outro', async () => {
    const world = new FakeWorld({})
    const gather = vi.fn(async () => 0)
    await expect(buildStructure(deps(world, { gather }), 'casa', 'tnt')).rejects.toThrow(
      /não posso construir/,
    )
  })
})
