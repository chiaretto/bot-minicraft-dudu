import { describe, it, expect } from 'vitest'
import {
  hasLineOfSight,
  isInFieldOfView,
  directionTo,
  atEyeLevel,
  raycastWorldFrom,
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
