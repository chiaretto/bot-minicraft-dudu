import { describe, it, expect } from 'vitest'
import {
  isDoor,
  isGate,
  isTrapdoor,
  isOpenable,
  needsRedstone,
  isHandOpenable,
  friendlyDoorName,
  isPrimaryPart,
  openableNow,
  explainNoDoor,
  type DoorInfo,
} from '../src/domain/doors.js'
import {
  openNearestDoor,
  hasBlockingDoor,
  DoorRefused,
  DoorAborted,
  type DoorWorld,
} from '../src/behaviors/actions/doors.js'
import { parseCommand } from '../src/behaviors/commands.js'
import type { Vec3Like } from '../src/domain/types.js'

const porta = (over: Partial<DoorInfo> = {}): DoorInfo => ({
  position: { x: 5, y: 64, z: 0 },
  name: 'oak_door',
  open: false,
  half: 'lower',
  ...over,
})

describe('o que é porta', () => {
  it('reconhece porta, portão e alçapão', () => {
    expect(isDoor('oak_door')).toBe(true)
    expect(isGate('spruce_fence_gate')).toBe(true)
    expect(isTrapdoor('birch_trapdoor')).toBe(true)
  })

  it('não confunde com o resto do mundo', () => {
    for (const nome of ['stone', 'oak_log', 'chest', 'oak_planks']) {
      expect(isOpenable(nome), nome).toBe(false)
    }
  })

  it('portão não é porta e alçapão não é portão', () => {
    expect(isDoor('oak_fence_gate')).toBe(false)
    expect(isGate('oak_trapdoor')).toBe(false)
    expect(isDoor('oak_trapdoor')).toBe(false)
  })
})

/**
 * Porta de ferro só abre com redstone. Prometer que abre e ficar clicando sem
 * nada acontecer pareceria o bot quebrado.
 */
describe('o que abre na mão', () => {
  it('madeira abre', () => {
    for (const nome of ['oak_door', 'spruce_fence_gate', 'birch_trapdoor']) {
      expect(isHandOpenable(nome), nome).toBe(true)
    }
  })

  it('ferro NÃO abre', () => {
    expect(needsRedstone('iron_door')).toBe(true)
    expect(needsRedstone('iron_trapdoor')).toBe(true)
    expect(isHandOpenable('iron_door')).toBe(false)
    expect(isHandOpenable('iron_trapdoor')).toBe(false)
  })

  it('bloco que não abre nunca é "abrível na mão"', () => {
    expect(isHandOpenable('stone')).toBe(false)
  })
})

describe('como ele chama no chat', () => {
  it('usa palavra de criança, nunca o nome técnico', () => {
    expect(friendlyDoorName('oak_door')).toBe('porta')
    expect(friendlyDoorName('spruce_fence_gate')).toBe('portão')
    expect(friendlyDoorName('birch_trapdoor')).toBe('alçapão')
  })
})

/**
 * Uma porta ocupa dois blocos e as duas metades aparecem na busca. Tratar as
 * duas como portas diferentes faria o bot abrir e fechar a mesma na sequência.
 */
describe('as duas metades da porta', () => {
  it('só a de baixo conta', () => {
    expect(isPrimaryPart(porta({ half: 'lower' }))).toBe(true)
    expect(isPrimaryPart(porta({ half: 'upper' }))).toBe(false)
  })

  it('portão e alçapão não têm metade e contam sempre', () => {
    expect(isPrimaryPart(porta({ name: 'oak_fence_gate', half: undefined }))).toBe(true)
  })

  it('a metade de cima nunca vira candidata', () => {
    const candidatas = openableNow([porta({ half: 'lower' }), porta({ half: 'upper' })])
    expect(candidatas).toHaveLength(1)
    expect(candidatas[0]!.half).toBe('lower')
  })
})

describe('quais dá para abrir agora', () => {
  it('só as fechadas', () => {
    expect(openableNow([porta({ open: true })])).toHaveLength(0)
    expect(openableNow([porta({ open: false })])).toHaveLength(1)
  })

  it('ferro fica de fora', () => {
    expect(openableNow([porta({ name: 'iron_door' })])).toHaveLength(0)
  })
})

describe('o motivo certo quando não dá', () => {
  it('não tem porta nenhuma', () => {
    expect(explainNoDoor([])).toBe('nenhuma')
  })

  it('a porta já está aberta', () => {
    expect(explainNoDoor([porta({ open: true })])).toBe('ja_aberta')
  })

  it('só tem porta de ferro', () => {
    expect(explainNoDoor([porta({ name: 'iron_door', open: false })])).toBe('so_ferro')
  })
})

/** Mundo falso: uma porta de carvalho fechada a 5 blocos. */
class FakeWorld implements DoorWorld {
  walks: Vec3Like[] = []
  activations: Vec3Like[] = []
  failActivate = false

  constructor(private doors: DoorInfo[] = [porta()]) {}

  botPosition(): Vec3Like {
    return { x: 0, y: 64, z: 0 }
  }
  nearbyDoors(): DoorInfo[] {
    return this.doors
  }
  async walkNear(pos: Vec3Like): Promise<void> {
    this.walks.push(pos)
  }
  async activate(pos: Vec3Like): Promise<void> {
    this.activations.push(pos)
    if (this.failActivate) return
    const alvo = this.doors.find(
      (d) => d.position.x === pos.x && d.position.y === pos.y && d.position.z === pos.z,
    )
    if (alvo) alvo.open = true
  }
  doorAt(pos: Vec3Like): DoorInfo | null {
    return (
      this.doors.find(
        (d) => d.position.x === pos.x && d.position.y === pos.y && d.position.z === pos.z,
      ) ?? null
    )
  }
}

const deps = (world: DoorWorld, over: Partial<Parameters<typeof openNearestDoor>[0]> = {}) => ({
  world,
  signal: null,
  searchRadius: 6,
  ...over,
})

describe('abrir a porta', () => {
  it('anda até ela e abre', async () => {
    const world = new FakeWorld()
    const outcome = await openNearestDoor(deps(world))

    expect(outcome.ok).toBe(true)
    expect(world.walks).toHaveLength(1)
    expect(world.activations).toHaveLength(1)
    expect(outcome.message).toMatch(/abri a porta/i)
  })

  it('fala portão quando é portão', async () => {
    const world = new FakeWorld([porta({ name: 'oak_fence_gate', half: undefined })])
    const outcome = await openNearestDoor(deps(world))
    expect(outcome.message).toMatch(/portão/i)
  })

  it('clica na metade de baixo, nunca na de cima', async () => {
    const world = new FakeWorld([
      porta({ half: 'upper', position: { x: 5, y: 65, z: 0 } }),
      porta({ half: 'lower', position: { x: 5, y: 64, z: 0 } }),
    ])
    await openNearestDoor(deps(world))
    expect(world.activations[0]!.y).toBe(64)
  })

  /** Anunciar "abri!" com a porta fechada é o bot mentindo. */
  it('confere o resultado em vez de confiar no clique', async () => {
    const world = new FakeWorld()
    world.failActivate = true

    const outcome = await openNearestDoor(deps(world))

    expect(outcome.ok).toBe(false)
    expect(outcome.message).toMatch(/não abriu/i)
    expect(outcome.opened).toBeNull()
  })
})

describe('quando não dá para abrir', () => {
  it('sem porta por perto, diz isso', async () => {
    const world = new FakeWorld([])
    await expect(openNearestDoor(deps(world))).rejects.toThrow(/não tô vendo porta/i)
  })

  it('porta já aberta não é reaberta — senão ele fecharia', async () => {
    const world = new FakeWorld([porta({ open: true })])
    await expect(openNearestDoor(deps(world))).rejects.toThrow(/já tá aberta/i)
    expect(world.activations).toHaveLength(0)
  })

  it('porta de ferro: explica que precisa de botão', async () => {
    const world = new FakeWorld([porta({ name: 'iron_door' })])
    await expect(openNearestDoor(deps(world))).rejects.toBeInstanceOf(DoorRefused)
    await expect(openNearestDoor(deps(world))).rejects.toThrow(/ferro.*bot(ã|a)o|alavanca/i)
    expect(world.activations).toHaveLength(0)
  })
})

describe('cancelamento', () => {
  it('sinal já abortado não clica em nada', async () => {
    const world = new FakeWorld()
    const controller = new AbortController()
    controller.abort()

    await expect(
      openNearestDoor(deps(world, { signal: controller.signal })),
    ).rejects.toBeInstanceOf(DoorAborted)
    expect(world.activations).toHaveLength(0)
  })

  it('abortar durante a caminhada não abre a porta', async () => {
    const world = new FakeWorld()
    const controller = new AbortController()
    world.walkNear = async () => {
      controller.abort()
    }

    await expect(
      openNearestDoor(deps(world, { signal: controller.signal })),
    ).rejects.toBeInstanceOf(DoorAborted)
    expect(world.activations).toHaveLength(0)
  })
})

describe('porta atrapalhando o caminho', () => {
  it('detecta porta fechada por perto', () => {
    expect(hasBlockingDoor(new FakeWorld(), 4)).toBe(true)
  })

  it('porta aberta não atrapalha ninguém', () => {
    expect(hasBlockingDoor(new FakeWorld([porta({ open: true })]), 4)).toBe(false)
  })

  it('porta de ferro não conta: ele não conseguiria abrir mesmo', () => {
    expect(hasBlockingDoor(new FakeWorld([porta({ name: 'iron_door' })]), 4)).toBe(false)
  })
})

describe('pedir para abrir, sem IA nenhuma', () => {
  it('reconhece os jeitos de pedir', () => {
    for (const text of [
      'abre a porta',
      'dudu, abra a porta',
      'abre o portao',
      'pode abrir a porta',
      'abre ai',
    ]) {
      expect(parseCommand(text, 'Dudu')?.intent.type, text).toBe('OPEN_DOOR')
    }
  })

  it('tolera caixa e pontuação', () => {
    expect(parseCommand('DUDU, ABRE A PORTA!!!', 'Dudu')?.intent.type).toBe('OPEN_DOOR')
  })

  it('não rouba os outros comandos', () => {
    expect(parseCommand('vem', 'Dudu')?.intent.type).toBe('FOLLOW')
    expect(parseCommand('para', 'Dudu')?.intent.type).toBe('STOP')
  })
})
