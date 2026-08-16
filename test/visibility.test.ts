import { describe, it, expect } from 'vitest'
import {
  hasLineOfSight,
  isInFieldOfView,
  directionTo,
  atEyeLevel,
  raycastWorldFrom,
  coverAround,
  isSolid,
  resolveGround,
  blockSourceFrom,
  EYE_HEIGHT,
  DEFAULT_FOV_HALF_ANGLE,
  type RaycastWorld,
} from '../src/minecraft/visibility.js'
import type { Vec3Like } from '../src/domain/types.js'

/** Mundo vazio: nada bloqueia nada. */
const openWorld: RaycastWorld = { raycast: () => null }

/** Mundo sólido: tudo bloqueia. */
const wallWorld: RaycastWorld = { raycast: () => ({ position: { x: 0, y: 64, z: 0 } }) }

/** Mundo com uma parede no plano x = `at`. */
function worldWithWallAtX(at: number): RaycastWorld {
  return {
    raycast(origin, direction, maxDistance) {
      // Distância até o plano, ao longo do raio.
      if (direction.x === 0) return null
      const t = (at - origin.x) / direction.x
      if (t < 0 || t > maxDistance) return null
      return { position: { x: at, y: origin.y, z: origin.z } }
    },
  }
}

const from: Vec3Like = { x: 0, y: 64, z: 0 }

describe('visibilidade: geometria', () => {
  it('põe os olhos acima dos pés', () => {
    expect(atEyeLevel({ x: 1, y: 64, z: 2 })).toEqual({ x: 1, y: 64 + EYE_HEIGHT, z: 2 })
  })

  it('devolve vetor unitário', () => {
    const dir = directionTo({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 5 })
    expect(dir).toEqual({ x: 0, y: 0, z: 1 })
  })

  it('não tem direção entre pontos coincidentes', () => {
    expect(directionTo({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toBeNull()
  })
})

describe('linha de visão', () => {
  it('enxerga com o caminho livre', () => {
    expect(hasLineOfSight(openWorld, from, { x: 10, y: 64, z: 0 }, { maxDistance: 20 })).toBe(true)
  })

  it('não enxerga com bloco no caminho', () => {
    expect(hasLineOfSight(wallWorld, from, { x: 10, y: 64, z: 0 }, { maxDistance: 20 })).toBe(false)
  })

  it('não enxerga além do alcance, mesmo com caminho livre', () => {
    expect(hasLineOfSight(openWorld, from, { x: 50, y: 64, z: 0 }, { maxDistance: 20 })).toBe(false)
  })

  it('enxerga exatamente no limite do alcance', () => {
    expect(hasLineOfSight(openWorld, from, { x: 20, y: 64, z: 0 }, { maxDistance: 20 })).toBe(true)
  })

  it('a parede entre os dois esconde, e atrás do observador não', () => {
    const world = worldWithWallAtX(5)
    // Alvo depois da parede: escondido.
    expect(hasLineOfSight(world, from, { x: 10, y: 64, z: 0 }, { maxDistance: 20 })).toBe(false)
    // Alvo antes da parede: visível.
    expect(hasLineOfSight(world, from, { x: 3, y: 64, z: 0 }, { maxDistance: 20 })).toBe(true)
    // Alvo no sentido oposto: a parede não está no caminho.
    expect(hasLineOfSight(world, from, { x: -10, y: 64, z: 0 }, { maxDistance: 20 })).toBe(true)
  })

  it('pontos coincidentes se enxergam sem consultar o mundo', () => {
    let consulted = false
    const spy: RaycastWorld = {
      raycast: () => {
        consulted = true
        return null
      },
    }
    expect(hasLineOfSight(spy, from, { ...from }, { maxDistance: 20 })).toBe(true)
    expect(consulted).toBe(false)
  })

  // Falha fechada: o erro seguro é o bot demorar mais para achar, nunca
  // declarar que achou sem ter visto.
  it('sem mundo, não enxerga', () => {
    expect(hasLineOfSight(null, from, { x: 5, y: 64, z: 0 }, { maxDistance: 20 })).toBe(false)
    expect(hasLineOfSight(undefined, from, { x: 5, y: 64, z: 0 }, { maxDistance: 20 })).toBe(false)
  })

  it('raycast que lança vira "não enxerga", não exceção', () => {
    const broken: RaycastWorld = {
      raycast: () => {
        throw new Error('chunk não carregado')
      },
    }
    expect(hasLineOfSight(broken, from, { x: 5, y: 64, z: 0 }, { maxDistance: 20 })).toBe(false)
  })

  it('mede a distância na altura dos olhos, nas duas pontas', () => {
    // Sem a altura dos olhos, um alvo 1.62 acima entraria por outro caminho.
    const spans: number[] = []
    const spy: RaycastWorld = {
      raycast: (_o, _d, maxDistance) => {
        spans.push(maxDistance)
        return null
      },
    }
    hasLineOfSight(spy, from, { x: 3, y: 64, z: 0 }, { maxDistance: 20 })
    // Ambos os olhos sobem igual: a distância horizontal se mantém.
    expect(spans[0]).toBeCloseTo(3 - 0.5, 5)
  })
})

describe('campo de visão', () => {
  // yaw 0 no Minecraft aponta para +z.
  it('enxerga o que está à frente', () => {
    expect(isInFieldOfView(from, 0, { x: 0, y: 64, z: 10 }, DEFAULT_FOV_HALF_ANGLE)).toBe(true)
  })

  it('não enxerga o que está atrás', () => {
    expect(isInFieldOfView(from, 0, { x: 0, y: 64, z: -10 }, DEFAULT_FOV_HALF_ANGLE)).toBe(false)
  })

  it('acompanha a virada do jogador', () => {
    const behind = { x: 0, y: 64, z: -10 }
    expect(isInFieldOfView(from, 0, behind, DEFAULT_FOV_HALF_ANGLE)).toBe(false)
    // Meia volta: o que estava atrás passa a estar na frente.
    expect(isInFieldOfView(from, Math.PI, behind, DEFAULT_FOV_HALF_ANGLE)).toBe(true)
  })

  it('trata o limite do cone sem NaN', () => {
    // Exatamente 70° à direita, com o meio-cone de 70°.
    const angle = DEFAULT_FOV_HALF_ANGLE
    const target = { x: -Math.sin(angle) * 10, y: 64, z: Math.cos(angle) * 10 }
    expect(isInFieldOfView(from, 0, target, angle)).toBe(true)
  })

  it('quem está no mesmo ponto está sempre à vista', () => {
    expect(isInFieldOfView(from, 0, { ...from }, DEFAULT_FOV_HALF_ANGLE)).toBe(true)
  })
})

describe('cobertura sólida', () => {
  const solido = { boundingBox: 'block', name: 'stone' }
  const vazio = { boundingBox: 'empty', name: 'air' }

  it('conta zero em campo aberto', () => {
    expect(coverAround({ blockAt: () => vazio }, from)).toBe(0)
  })

  it('conta as oito direções quando está tudo fechado', () => {
    expect(coverAround({ blockAt: () => solido }, from)).toBe(8)
  })

  it('folhagem e placa não escondem ninguém', () => {
    // Caixa vazia é o mesmo critério que o pathfinder usa para obstáculo.
    expect(
      coverAround({ blockAt: () => ({ boundingBox: 'empty', name: 'oak_leaves' }) }, from),
    ).toBe(0)
  })

  it('parede de um lado só conta as direções daquele lado', () => {
    // Parede em x maior: cobre leste, nordeste e sudeste.
    const source = { blockAt: (p: Vec3Like) => (p.x > from.x ? solido : vazio) }
    expect(coverAround(source, from)).toBe(3)
  })

  it('degrau de um bloco não conta: o bot tem dois de altura', () => {
    const source = { blockAt: (p: Vec3Like) => (p.y <= from.y ? solido : vazio) }
    expect(coverAround(source, from)).toBe(0)
  })

  it('sem mundo, não há cobertura', () => {
    expect(coverAround(null, from)).toBe(0)
    expect(coverAround(undefined, from)).toBe(0)
  })

  it('chunk que lança não derruba a rodada', () => {
    const source = {
      blockAt: () => {
        throw new Error('chunk não carregado')
      },
    }
    expect(coverAround(source, from)).toBe(0)
  })

  it('bloco ausente conta como sem cobertura', () => {
    expect(coverAround({ blockAt: () => null }, from)).toBe(0)
  })

  it('isSolid distingue caixa de bloco de caixa vazia', () => {
    expect(isSolid(solido)).toBe(true)
    expect(isSolid(vazio)).toBe(false)
    expect(isSolid(null)).toBe(false)
  })
})

describe('resolução de chão', () => {
  const solido = { boundingBox: 'block', name: 'stone' }
  const vazio = { boundingBox: 'empty', name: 'air' }

  /** Terreno maciço até `topo`, ar acima. */
  function terreno(topo: number) {
    return { blockAt: (p: Vec3Like) => (p.y <= topo ? solido : vazio) }
  }

  it('põe os pés em cima da superfície', () => {
    // Terreno até y=64: dá para ficar de pé em 65.
    expect(resolveGround(terreno(64), { x: 3, y: 64, z: 7 })).toEqual({ x: 3, y: 65, z: 7 })
  })

  it('acha o chão de um morro acima do jogador', () => {
    // É este o caso que quebrava: candidato herdava a altura do jogador (64) e
    // era medido dentro da terra do morro.
    expect(resolveGround(terreno(70), { x: 0, y: 64, z: 0 })?.y).toBe(71)
  })

  it('acha o chão de um buraco abaixo do jogador', () => {
    expect(resolveGround(terreno(58), { x: 0, y: 64, z: 0 })?.y).toBe(59)
  })

  it('exige dois blocos de ar: o bot não cabe numa fresta', () => {
    // Sólido em toda parte menos numa única camada de ar.
    const source = {
      blockAt: (p: Vec3Like) => (p.y === 65 ? vazio : solido),
    }
    expect(resolveGround(source, { x: 0, y: 64, z: 0 })).toBeNull()
  })

  it('devolve null quando não há chão no alcance', () => {
    expect(resolveGround({ blockAt: () => vazio }, { x: 0, y: 64, z: 0 })).toBeNull()
  })

  it('preserva x e z exatos do candidato', () => {
    const g = resolveGround(terreno(64), { x: 3.7, y: 64, z: -8.2 })
    expect(g?.x).toBe(3.7)
    expect(g?.z).toBe(-8.2)
  })

  it('sem mundo, não há chão', () => {
    expect(resolveGround(null, { x: 0, y: 64, z: 0 })).toBeNull()
  })

  it('chunk que lança não derruba a rodada', () => {
    const source = {
      blockAt: () => {
        throw new Error('chunk não carregado')
      },
    }
    expect(resolveGround(source, { x: 0, y: 64, z: 0 })).toBeNull()
  })
})

describe('adaptador de consulta de bloco', () => {
  it('devolve null sem bot', () => {
    expect(blockSourceFrom(null)).toBeNull()
  })

  it('converte para Vec3 antes de consultar', () => {
    // O `getBlock` do prismarine chama `pos.floored()`: objeto solto lançaria.
    let received: unknown = null
    const source = blockSourceFrom({
      blockAt: (p) => {
        received = p
        return null
      },
    })
    source?.blockAt({ x: 1.7, y: 64, z: -3.2 })
    const vec = received as { floored: () => { x: number } }
    expect(typeof vec.floored).toBe('function')
    expect(vec.floored().x).toBe(1)
  })
})

describe('adaptador do mundo do mineflayer', () => {
  it('devolve null sem mundo disponível', () => {
    expect(raycastWorldFrom(null)).toBeNull()
    expect(raycastWorldFrom({})).toBeNull()
  })

  it('converte para Vec3 antes de consultar', () => {
    // O iterador do raycast chama `.minus()` na origem: objeto solto lançaria.
    let received: unknown = null
    const world = raycastWorldFrom({
      world: {
        raycast: (origin) => {
          received = origin
          return null
        },
      },
    })
    world?.raycast({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 1 }, 10)
    expect(received).not.toBeNull()
    expect(typeof (received as { minus?: unknown }).minus).toBe('function')
  })
})
