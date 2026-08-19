import { describe, it, expect } from 'vitest'
import {
  STRUCTURE_NAMES,
  isStructureName,
  planStructure,
  blocksNeeded,
  type BlueprintBlock,
} from '../src/domain/blueprints.js'
import {
  MATERIAL_GROUPS,
  resolveBlockCandidates,
  isMaterialGroup,
  friendlyName,
  canHarvestWith,
} from '../src/domain/materials.js'

const key = (b: BlueprintBlock) => `${b.x},${b.y},${b.z}`

describe('catálogo de construções', () => {
  it('é fechado', () => {
    expect(isStructureName('casa')).toBe(true)
    expect(isStructureName('torre')).toBe(true)
    expect(isStructureName('castelo')).toBe(false)
    expect(isStructureName('')).toBe(false)
  })

  it('toda estrutura do catálogo tem planta', () => {
    for (const name of STRUCTURE_NAMES) {
      expect(planStructure(name).blocks.length, name).toBeGreaterThan(0)
    }
  })

  it('nenhuma obra é grande demais para uma criança assistir', () => {
    for (const name of STRUCTURE_NAMES) {
      expect(blocksNeeded(planStructure(name)), name).toBeLessThanOrEqual(80)
    }
  })

  it('não repete posição', () => {
    for (const name of STRUCTURE_NAMES) {
      const blocks = planStructure(name).blocks
      expect(new Set(blocks.map(key)).size, name).toBe(blocks.length)
    }
  })
})

/**
 * O invariante que sustenta a obra inteira.
 *
 * No Minecraft só dá para colocar bloco encostado em algo que já existe. Se a
 * ordem estiver errada, o telhado fica sem apoio e a casa termina pela metade
 * — com a criança olhando.
 */
describe('ordem de colocação: todo bloco tem apoio na vez dele', () => {
  for (const name of STRUCTURE_NAMES) {
    it(`${name}: nenhum bloco fica no ar`, () => {
      const blocks = planStructure(name).blocks
      const posto = new Set<string>()

      blocks.forEach((b, i) => {
        const apoios = [
          // Chão: a primeira fileira se apoia no terreno.
          b.y === 0,
          // Bloco imediatamente abaixo, já colocado.
          posto.has(key({ x: b.x, y: b.y - 1, z: b.z })),
          // Vizinho lateral já colocado.
          posto.has(key({ x: b.x - 1, y: b.y, z: b.z })),
          posto.has(key({ x: b.x + 1, y: b.y, z: b.z })),
          posto.has(key({ x: b.x, y: b.y, z: b.z - 1 })),
          posto.has(key({ x: b.x, y: b.y, z: b.z + 1 })),
        ]
        expect(apoios.some(Boolean), `${name} bloco ${i} em ${key(b)} ficou sem apoio`).toBe(true)
        posto.add(key(b))
      })
    })

    it(`${name}: constrói de baixo para cima`, () => {
      const ys = planStructure(name).blocks.map((b) => b.y)
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i]!, `${name} desceu uma camada no meio da obra`).toBeGreaterThanOrEqual(
          ys[i - 1]!,
        )
      }
    })
  }
})

describe('casa: a criança consegue entrar e ver para fora', () => {
  const casa = planStructure('casa')
  const has = (x: number, y: number, z: number) =>
    casa.blocks.some((b) => b.x === x && b.y === y && b.z === z)

  it('tem porta na frente, da altura toda da parede', () => {
    // Porta no meio da parede z = 0.
    expect(has(2, 0, 0)).toBe(false)
    expect(has(2, 1, 0)).toBe(false)
  })

  it('a porta é o único vão da parede da frente no nível do chão', () => {
    for (const x of [0, 1, 3, 4]) {
      expect(has(x, 0, 0), `parede da frente furada em x=${x}`).toBe(true)
    }
  })

  it('tem janela nas outras três paredes', () => {
    expect(has(2, 1, 4)).toBe(false)
    expect(has(0, 1, 2)).toBe(false)
    expect(has(4, 1, 2)).toBe(false)
  })

  it('tem telhado fechado por cima', () => {
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 5; z++) {
        expect(has(x, 2, z), `buraco no telhado em ${x},${z}`).toBe(true)
      }
    }
  })

  it('é oca por dentro — dá para entrar', () => {
    expect(has(2, 0, 2)).toBe(false)
    expect(has(2, 1, 2)).toBe(false)
  })

  it('ocupa o espaço declarado', () => {
    expect(casa.footprint).toEqual({ width: 5, depth: 5, height: 3 })
  })
})

describe('torre', () => {
  const torre = planStructure('torre')
  const has = (x: number, y: number, z: number) =>
    torre.blocks.some((b) => b.x === x && b.y === y && b.z === z)

  it('é mais alta que a casa', () => {
    expect(torre.footprint.height).toBeGreaterThan(planStructure('casa').footprint.height)
  })

  it('tem porta e topo fechado', () => {
    expect(has(1, 0, 0)).toBe(false)
    for (let x = 0; x < 3; x++) {
      for (let z = 0; z < 3; z++) {
        expect(has(x, 4, z), `buraco no topo em ${x},${z}`).toBe(true)
      }
    }
  })
})

describe('materiais como a criança fala', () => {
  it('pedido por grupo procura o grupo inteiro', () => {
    expect(resolveBlockCandidates('madeira')).toEqual(MATERIAL_GROUPS['madeira'])
    expect(resolveBlockCandidates('pedra')).toEqual(MATERIAL_GROUPS['pedra'])
  })

  /**
   * Numa floresta de bétula não existe carvalho: procurar só `oak_log`
   * devolveria "não achei" num lugar cheio de árvore.
   */
  it('pedido por um bloco específico aceita os irmãos, mas prefere o pedido', () => {
    const candidatos = resolveBlockCandidates('birch_log')
    expect(candidatos[0]).toBe('birch_log')
    expect(candidatos).toContain('oak_log')
    expect(candidatos.length).toBe(MATERIAL_GROUPS['madeira']!.length)
  })

  it('bloco fora de qualquer grupo procura ele mesmo', () => {
    expect(resolveBlockCandidates('diamond_ore')).toEqual(['diamond_ore'])
  })

  it('reconhece nome de grupo', () => {
    expect(isMaterialGroup('madeira')).toBe(true)
    expect(isMaterialGroup('oak_log')).toBe(false)
  })

  it('fala o nome que a criança entende, nunca o técnico', () => {
    expect(friendlyName('birch_log')).toBe('madeira')
    expect(friendlyName('cobblestone')).toBe('pedra')
    expect(friendlyName('diamond_ore')).toBe('diamond_ore')
  })
})

/**
 * A regra que faltava em 2026-08-19: cavar não é o mesmo que conseguir.
 * Pedra quebrada sem picareta some, e o bot volta de mãos vazias.
 */
describe('consigo levar este bloco?', () => {
  const PICARETA_MADEIRA = 878
  const PICARETA_PEDRA = 883
  const toolsDaPedra = { [PICARETA_MADEIRA]: true, [PICARETA_PEDRA]: true }

  it('bloco sem ferramenta exigida cai na mão', () => {
    expect(canHarvestWith(undefined, [])).toBe(true)
    expect(canHarvestWith(null, [])).toBe(true)
  })

  it('pedra sem picareta NÃO rende nada', () => {
    expect(canHarvestWith(toolsDaPedra, [])).toBe(false)
  })

  it('pedra com picareta rende', () => {
    expect(canHarvestWith(toolsDaPedra, [PICARETA_MADEIRA])).toBe(true)
  })

  it('ferramenta errada não serve', () => {
    const enxada = 999
    expect(canHarvestWith(toolsDaPedra, [enxada])).toBe(false)
  })

  it('basta ter uma das ferramentas aceitas', () => {
    expect(canHarvestWith(toolsDaPedra, [123, PICARETA_PEDRA, 456])).toBe(true)
  })
})
