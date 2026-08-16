import { describe, it, expect } from 'vitest'
import {
  sampleCandidates,
  pickHidingSpot,
  rankHidingSpots,
  pickScoutPoint,
  pickFakeSearchSpots,
  horizontalDistance,
  type Candidate,
} from '../src/behaviors/games/spots.js'
import type { Vec3Like } from '../src/domain/types.js'

const owner: Vec3Like = { x: 0, y: 64, z: 0 }

/** Gerador determinístico, para o teste não depender de sorte. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function candidate(x: number, z: number): Candidate {
  const position = { x, y: 64, z }
  return { position, distanceToOwner: horizontalDistance(position, owner) }
}

describe('amostragem de candidatos', () => {
  const options = { minDistance: 10, maxDistance: 30, samples: 24 }

  it('gera a quantidade pedida', () => {
    expect(sampleCandidates(owner, options, seeded(1))).toHaveLength(24)
  })

  it('respeita a faixa de distância', () => {
    for (const c of sampleCandidates(owner, options, seeded(7))) {
      expect(c.distanceToOwner).toBeGreaterThanOrEqual(10)
      expect(c.distanceToOwner).toBeLessThanOrEqual(30)
      expect(horizontalDistance(c.position, owner)).toBeCloseTo(c.distanceToOwner, 5)
    }
  })

  it('espalha os candidatos em volta, não de um lado só', () => {
    const points = sampleCandidates(owner, options, seeded(3))
    const quadrants = new Set(points.map((c) => `${c.position.x > 0}:${c.position.z > 0}`))
    expect(quadrants.size).toBe(4)
  })

  it('mantém a altura do jogador', () => {
    for (const c of sampleCandidates(owner, options, seeded(2))) {
      expect(c.position.y).toBe(owner.y)
    }
  })

  it('sem amostras, devolve lista vazia', () => {
    expect(sampleCandidates(owner, { ...options, samples: 0 }, seeded(1))).toEqual([])
  })
})

describe('escolha de esconderijo', () => {
  const base = { minDistance: 10, maxDistance: 30 }

  it('nunca escolhe ponto que o jogador enxerga', () => {
    const candidates = [candidate(12, 0), candidate(0, 15), candidate(-20, 0)]
    // Só o do x negativo está escondido.
    const spot = pickHidingSpot(candidates, {
      ...base,
      isVisibleToOwner: (p) => p.x >= 0,
    })
    expect(spot).toEqual({ x: -20, y: 64, z: 0 })
  })

  it('devolve null quando não há lugar escondido', () => {
    const candidates = [candidate(12, 0), candidate(0, 15)]
    const spot = pickHidingSpot(candidates, { ...base, isVisibleToOwner: () => true })
    expect(spot).toBeNull()
  })

  it('devolve null sem candidato nenhum', () => {
    expect(pickHidingSpot([], { ...base, isVisibleToOwner: () => false })).toBeNull()
  })

  it('descarta o que está fora da faixa de distância', () => {
    const candidates = [candidate(3, 0), candidate(80, 0)]
    expect(pickHidingSpot(candidates, { ...base, isVisibleToOwner: () => false })).toBeNull()
  })

  it('descarta o que o pathfinder não alcança', () => {
    const candidates = [candidate(-12, 0), candidate(-20, 0)]
    const spot = pickHidingSpot(candidates, {
      ...base,
      isVisibleToOwner: () => false,
      isReachable: (p) => p.x === -12,
    })
    expect(spot).toEqual({ x: -12, y: 64, z: 0 })
  })

  it('prefere o que está fora do cone de visão do jogador', () => {
    const candidates = [candidate(25, 0), candidate(-12, 0)]
    const spot = pickHidingSpot(candidates, {
      ...base,
      isVisibleToOwner: () => false,
      // O jogador olha para +x: o de x positivo está no cone.
      isInOwnerFov: (p) => p.x > 0,
    })
    // Escolhe o de trás, mesmo sendo o mais perto dos dois.
    expect(spot).toEqual({ x: -12, y: 64, z: 0 })
  })

  it('com tudo no cone de visão, ainda escolhe algo escondido', () => {
    const candidates = [candidate(12, 0), candidate(25, 0)]
    const spot = pickHidingSpot(candidates, {
      ...base,
      isVisibleToOwner: () => false,
      isInOwnerFov: () => true,
    })
    // O mais longe entre os elegíveis: mais tempo de brincadeira.
    expect(spot).toEqual({ x: 25, y: 64, z: 0 })
  })

  it('a invisibilidade manda mais que o cone de visão', () => {
    const candidates = [candidate(-12, 0), candidate(25, 0)]
    const spot = pickHidingSpot(candidates, {
      ...base,
      // O de trás é justamente o que o jogador enxerga (espelho de água, vão).
      isVisibleToOwner: (p) => p.x < 0,
      isInOwnerFov: (p) => p.x > 0,
    })
    expect(spot).toEqual({ x: 25, y: 64, z: 0 })
  })
})

describe('ranking de esconderijos', () => {
  const base = { minDistance: 10, maxDistance: 30 }

  it('cobertura ganha de distância', () => {
    // Foi ordenar por distância que mandava o bot para o meio do descampado.
    const candidates = [candidate(28, 0), candidate(-12, 0)]
    const spot = pickHidingSpot(candidates, {
      ...base,
      isVisibleToOwner: () => false,
      coverAt: (p) => (p.x < 0 ? 5 : 0),
    })
    expect(spot).toEqual({ x: -12, y: 64, z: 0 })
  })

  it('descarta o que fica abaixo da cobertura mínima', () => {
    const candidates = [candidate(12, 0), candidate(-20, 0)]
    expect(
      pickHidingSpot(candidates, {
        ...base,
        isVisibleToOwner: () => false,
        coverAt: () => 1,
        minCover: 2,
      }),
    ).toBeNull()
  })

  it('ordena por cobertura, depois por estar atrás, depois por distância', () => {
    const ranked = rankHidingSpots(
      [candidate(11, 0), candidate(29, 0), candidate(-15, 0), candidate(-25, 0)],
      {
        ...base,
        isVisibleToOwner: () => false,
        isInOwnerFov: (p) => p.x > 0,
        coverAt: (p) => (Math.abs(p.x) > 20 ? 4 : 1),
      },
    )
    // Melhor: cobertura alta E atrás. Depois cobertura alta na frente.
    expect(ranked[0]!.position).toEqual({ x: -25, y: 64, z: 0 })
    expect(ranked[1]!.position).toEqual({ x: 29, y: 64, z: 0 })
    expect(ranked.map((r) => r.cover)).toEqual([4, 4, 1, 1])
  })

  it('visibilidade continua sendo eliminatória, cobertura não salva', () => {
    const candidates = [candidate(-12, 0)]
    expect(
      pickHidingSpot(candidates, {
        ...base,
        isVisibleToOwner: () => true,
        coverAt: () => 8,
      }),
    ).toBeNull()
  })
})

describe('ponto de reconhecimento', () => {
  const options = { minDistance: 10, maxDistance: 30 }
  const owner: Vec3Like = { x: 0, y: 64, z: 0 }

  it('fica dentro da faixa de distância do jogador', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const p = pickScoutPoint(owner, { x: 12, y: 64, z: 0 }, options, seeded(seed))
      const d = horizontalDistance(p, owner)
      expect(d, `seed ${seed}`).toBeGreaterThanOrEqual(10)
      expect(d, `seed ${seed}`).toBeLessThanOrEqual(30)
    }
  })

  it('gira em volta em vez de voltar para onde já estava', () => {
    const bot = { x: 20, y: 64, z: 0 }
    for (let seed = 1; seed <= 25; seed++) {
      const p = pickScoutPoint(owner, bot, options, seeded(seed))
      // Um giro de pelo menos ~54°: o próximo ponto não é uma repetição do atual.
      expect(horizontalDistance(p, bot), `seed ${seed}`).toBeGreaterThan(8)
    }
  })
})

describe('buscas falsas', () => {
  const bot: Vec3Like = { x: 5, y: 64, z: 5 }
  const options = { count: 2, minDistanceFromOwner: 8, maxDistanceFromOwner: 20 }

  it('gera exatamente a quantidade configurada', () => {
    for (let seed = 1; seed <= 25; seed++) {
      expect(pickFakeSearchSpots(owner, bot, options, seeded(seed)), `seed ${seed}`).toHaveLength(2)
    }
  })

  it('nenhuma busca falsa cai perto do jogador', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const spot of pickFakeSearchSpots(owner, bot, options, seeded(seed))) {
        expect(horizontalDistance(spot, owner), `seed ${seed}`).toBeGreaterThanOrEqual(8)
      }
    }
  })

  it('respeita o teto de distância — o teatro não vira expedição', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const spot of pickFakeSearchSpots(owner, bot, options, seeded(seed))) {
        expect(horizontalDistance(spot, owner), `seed ${seed}`).toBeLessThanOrEqual(20)
      }
    }
  })

  it('não repete o mesmo lugar duas vezes', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const [first, second] = pickFakeSearchSpots(owner, bot, options, seeded(seed))
      expect(horizontalDistance(first!, second!), `seed ${seed}`).toBeGreaterThanOrEqual(4)
    }
  })

  it('honra uma contagem maior', () => {
    const spots = pickFakeSearchSpots(owner, bot, { ...options, count: 4 }, seeded(11))
    expect(spots).toHaveLength(4)
  })

  it('zero buscas falsas devolve lista vazia', () => {
    expect(pickFakeSearchSpots(owner, bot, { ...options, count: 0 }, seeded(1))).toEqual([])
  })

  it('é determinístico com o mesmo sorteio', () => {
    const a = pickFakeSearchSpots(owner, bot, options, seeded(42))
    const b = pickFakeSearchSpots(owner, bot, options, seeded(42))
    expect(a).toEqual(b)
  })

  it('varia entre rodadas diferentes', () => {
    const a = pickFakeSearchSpots(owner, bot, options, seeded(1))
    const b = pickFakeSearchSpots(owner, bot, options, seeded(2))
    expect(a).not.toEqual(b)
  })
})
