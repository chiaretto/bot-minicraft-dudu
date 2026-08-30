import { describe, it, expect } from 'vitest'
import {
  DIG_SHAPES,
  dangerNear,
  facingFromYaw,
  isDigShape,
  isUnderBot,
  planDig,
  NEVER_DIG,
} from '../src/domain/digging.js'
import { parseCommand } from '../src/behaviors/commands.js'
import type { Vec3Like } from '../src/domain/types.js'

const BOT = { x: 10, y: 64, z: 10 }
const NORTE = { dx: 0 as const, dz: -1 as const }
const key = (p: Vec3Like) => `${p.x},${p.y},${p.z}`

/**
 * Cavar buraco e túnel.
 *
 * A regra que atravessa o módulo: o bot NUNCA cava embaixo dos próprios pés.
 * Ver: player_commands_delta.md → "Cavar buraco e túnel".
 */
describe('catálogo de escavação', () => {
  it('é fechado', () => {
    expect(isDigShape('buraco')).toBe(true)
    expect(isDigShape('tunel')).toBe(true)
    expect(isDigShape('mina')).toBe(false)
    expect(isDigShape('')).toBe(false)
  })

  it('toda forma do catálogo tem planta', () => {
    for (const shape of DIG_SHAPES) {
      expect(planDig(shape, BOT, NORTE).length, shape).toBeGreaterThan(0)
    }
  })
})

describe('direção: sempre um dos quatro lados', () => {
  it('arredonda o yaw para o cardeal mais perto', () => {
    expect(facingFromYaw(0)).toEqual({ dx: 0, dz: 1 })
    expect(facingFromYaw(Math.PI / 2)).toEqual({ dx: -1, dz: 0 })
    expect(facingFromYaw(Math.PI)).toEqual({ dx: 0, dz: -1 })
    expect(facingFromYaw(-Math.PI / 2)).toEqual({ dx: 1, dz: 0 })
  })

  it('yaw torto vira o lado mais próximo, nunca diagonal', () => {
    // Buraco em diagonal fica torto e a criança não entende o que ele fez.
    const f = facingFromYaw(0.3)
    expect(Math.abs(f.dx) + Math.abs(f.dz)).toBe(1)
  })

  it('volta inteira dá na mesma direção', () => {
    expect(facingFromYaw(Math.PI * 2)).toEqual(facingFromYaw(0))
    expect(facingFromYaw(-Math.PI * 4)).toEqual(facingFromYaw(0))
  })
})

/**
 * A guarda mais importante do módulo. Cavar para baixo derruba o bot no buraco
 * que ele acabou de abrir — e sair de lá é outro comando.
 */
describe('ele nunca cava embaixo dos próprios pés', () => {
  it('a coluna do bot é intocável, do apoio à cabeça', () => {
    expect(isUnderBot({ x: 10, y: 63, z: 10 }, BOT)).toBe(true)
    expect(isUnderBot({ x: 10, y: 64, z: 10 }, BOT)).toBe(true)
    expect(isUnderBot({ x: 10, y: 65, z: 10 }, BOT)).toBe(true)
  })

  it('o que está ao lado ou longe pode ser cavado', () => {
    expect(isUnderBot({ x: 11, y: 64, z: 10 }, BOT)).toBe(false)
    expect(isUnderBot({ x: 10, y: 60, z: 10 }, BOT)).toBe(false)
  })

  it('nenhuma planta inclui a coluna do bot', () => {
    for (const shape of DIG_SHAPES) {
      for (const dir of [
        { dx: 0 as const, dz: 1 as const },
        { dx: 0 as const, dz: -1 as const },
        { dx: 1 as const, dz: 0 as const },
        { dx: -1 as const, dz: 0 as const },
      ]) {
        for (const pos of planDig(shape, BOT, dir)) {
          expect(isUnderBot(pos, BOT), `${shape} cavou embaixo do bot`).toBe(false)
        }
      }
    }
  })
})

describe('buraco: poço à frente', () => {
  const blocos = planDig('buraco', BOT, NORTE)

  it('tem 2x2 e dois de fundo', () => {
    expect(blocos.length).toBe(8)
    expect(new Set(blocos.map((b) => b.y)).size).toBe(2)
  })

  it('começa à frente do bot, com folga do corpo', () => {
    for (const b of blocos) {
      expect(b.z, 'buraco perto demais do bot').toBeLessThanOrEqual(BOT.z - 2)
    }
  })

  it('cava de cima para baixo', () => {
    // O bloco de baixo é inalcançável enquanto o de cima está no lugar.
    for (let i = 1; i < blocos.length; i++) {
      expect(blocos[i]!.y).toBeLessThanOrEqual(blocos[i - 1]!.y)
    }
  })

  it('não repete posição', () => {
    expect(new Set(blocos.map(key)).size).toBe(blocos.length)
  })
})

describe('túnel: passagem de gente', () => {
  const blocos = planDig('tunel', BOT, NORTE)

  it('tem dois de altura, para o bot passar de pé', () => {
    expect(new Set(blocos.map((b) => b.y)).size).toBe(2)
    expect(blocos.length).toBe(8)
  })

  it('avança na direção que ele encara', () => {
    const zs = blocos.map((b) => b.z)
    expect(Math.min(...zs)).toBeLessThan(Math.max(...zs))
    for (const b of blocos) expect(b.x).toBe(BOT.x)
  })

  it('abre pé e cabeça no mesmo passo antes de andar', () => {
    // Cabeça primeiro, pé depois: assim o bot nunca fica com meio corpo preso.
    expect(blocos[0]!.y).toBeGreaterThan(blocos[1]!.y)
    expect(blocos[0]!.z).toBe(blocos[1]!.z)
  })

  it('não repete posição', () => {
    expect(new Set(blocos.map(key)).size).toBe(blocos.length)
  })
})

describe('o que nunca é cavado', () => {
  it('bedrock, obsidiana e as coisas da criança', () => {
    expect(NEVER_DIG.has('bedrock')).toBe(true)
    expect(NEVER_DIG.has('obsidian')).toBe(true)
    expect(NEVER_DIG.has('chest')).toBe(true)
    expect(NEVER_DIG.has('spawner')).toBe(true)
  })

  it('terra e pedra podem', () => {
    expect(NEVER_DIG.has('dirt')).toBe(false)
    expect(NEVER_DIG.has('stone')).toBe(false)
  })
})

describe('perigo do lado', () => {
  it('lava e água barram a escavação antes do primeiro golpe', () => {
    expect(dangerNear(['dirt', 'lava'])).toBe('lava')
    expect(dangerNear(['stone', 'flowing_water'])).toBe('água')
    expect(dangerNear(['dirt', 'stone', null])).toBeNull()
  })

  it('descobrir no meio seria pior', () => {
    // A recusa é ANTES de cavar: um buraco meio aberto ao lado de lava é o
    // pior dos dois mundos.
    expect(dangerNear(['lava_cauldron'])).toBe('lava')
  })
})

describe('como a criança pede', () => {
  it('buraco', () => {
    for (const text of ['cava um buraco', 'faz um buraco', 'cava aqui', 'cava', 'cava pra baixo']) {
      const parsed = parseCommand(text, 'Dudu')
      expect(parsed?.intent.type === 'DIG' && parsed.intent.params.shape, text).toBe('buraco')
    }
  })

  it('túnel', () => {
    for (const text of ['cava um tunel', 'faz um tunel', 'cave um tunel']) {
      const parsed = parseCommand(text, 'Dudu')
      expect(parsed?.intent.type === 'DIG' && parsed.intent.params.shape, text).toBe('tunel')
    }
  })

  it('pôr bloco', () => {
    for (const text of ['poe um bloco aqui', 'coloca um bloco', 'bota um bloco no chao']) {
      expect(parseCommand(text, 'Dudu')?.intent.type, text).toBe('PLACE_BLOCK')
    }
  })
})
