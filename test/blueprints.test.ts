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

/**
 * As quatro plantas de 2026-08-30. A forma de cada uma é o que a criança vê;
 * os invariantes de ordem e tamanho já rodam para o catálogo inteiro acima.
 */
describe('piscina: bacia sem tampa', () => {
  const piscina = planStructure('piscina')
  const has = (x: number, y: number, z: number) =>
    piscina.blocks.some((b) => b.x === x && b.y === y && b.z === z)

  it('tem fundo fechado', () => {
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 5; z++) {
        expect(has(x, 0, z), `buraco no fundo em ${x},${z}`).toBe(true)
      }
    }
  })

  it('tem borda de um bloco em toda a volta', () => {
    expect(has(0, 1, 0)).toBe(true)
    expect(has(4, 1, 4)).toBe(true)
    expect(has(2, 1, 0)).toBe(true)
  })

  it('é oca no meio — é onde a água vai', () => {
    expect(has(2, 1, 2)).toBe(false)
  })

  it('NÃO tem tampa: piscina fechada não é piscina', () => {
    expect(piscina.blocks.some((b) => b.y > 1)).toBe(false)
  })

  it('avisa que a água é por conta do jogador', () => {
    expect(piscina.finishedLine.toLowerCase()).toContain('água')
    expect(piscina.finishedLine.toLowerCase()).toContain('balde')
  })
})

describe('ponte: dá pra atravessar sem cair', () => {
  const ponte = planStructure('ponte')
  const has = (x: number, y: number, z: number) =>
    ponte.blocks.some((b) => b.x === x && b.y === y && b.z === z)

  it('tem tabuleiro inteiro, do começo ao fim', () => {
    for (let z = 0; z < 9; z++) {
      for (let x = 0; x < 3; x++) {
        expect(has(x, 0, z), `buraco no tabuleiro em ${x},${z}`).toBe(true)
      }
    }
  })

  it('tem guarda-corpo dos dois lados, e caminho livre no meio', () => {
    for (let z = 0; z < 9; z++) {
      expect(has(0, 1, z), `sem guarda-corpo em z=${z}`).toBe(true)
      expect(has(2, 1, z), `sem guarda-corpo em z=${z}`).toBe(true)
      expect(has(1, 1, z), `caminho tapado em z=${z}`).toBe(false)
    }
  })

  /**
   * O que faz a ponte crescer sobre um vão: cada bloco do tabuleiro encosta no
   * anterior. Sem isso, `findReference` não acha apoio nenhum sobre o abismo.
   */
  it('o tabuleiro avança na ordem do comprimento', () => {
    const deck = ponte.blocks.filter((b) => b.y === 0)
    for (let i = 1; i < deck.length; i++) {
      expect(deck[i]!.z, 'o tabuleiro voltou para trás').toBeGreaterThanOrEqual(deck[i - 1]!.z)
    }
  })
})

describe('escada: sobe de verdade', () => {
  const escada = planStructure('escada')
  const has = (x: number, y: number, z: number) =>
    escada.blocks.some((b) => b.x === x && b.y === y && b.z === z)

  it('cada degrau é um bloco mais alto que o anterior', () => {
    for (let i = 0; i < 5; i++) {
      expect(has(i, i, 0), `falta o topo do degrau ${i}`).toBe(true)
      expect(has(i, i + 1, 0), `degrau ${i} passou da conta`).toBe(false)
    }
  })

  it('degrau é maciço até o chão — nada flutuando', () => {
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y <= x; y++) {
        expect(has(x, y, 0), `buraco embaixo do degrau ${x} em y=${y}`).toBe(true)
      }
    }
  })

  it('tem dois de largura, pra criança não cair da beirada', () => {
    expect(has(0, 0, 1)).toBe(true)
    expect(has(4, 4, 1)).toBe(true)
    expect(escada.footprint.depth).toBe(2)
  })
})

describe('cerca: curral que segura bicho', () => {
  const cerca = planStructure('cerca')
  const has = (x: number, y: number, z: number) =>
    cerca.blocks.some((b) => b.x === x && b.y === y && b.z === z)

  it('tem dois de altura: bicho de Minecraft pula um', () => {
    expect(has(0, 0, 0)).toBe(true)
    expect(has(0, 1, 0)).toBe(true)
    expect(cerca.footprint.height).toBe(2)
  })

  it('tem portão de altura inteira pra criança entrar', () => {
    expect(has(3, 0, 0)).toBe(false)
    expect(has(3, 1, 0)).toBe(false)
  })

  it('o resto da parede da frente é fechado', () => {
    for (const x of [0, 1, 2, 4, 5, 6]) {
      expect(has(x, 0, 0), `cerca furada em x=${x}`).toBe(true)
    }
  })

  it('é vazia por dentro — é onde os bichos ficam', () => {
    expect(has(3, 0, 3)).toBe(false)
  })

  it('não tem telhado: curral é a céu aberto', () => {
    expect(cerca.blocks.some((b) => b.y > 1)).toBe(false)
  })
})

/**
 * A fala do fim de obra é da PLANTA, não uma frase só para todas. "Entra pra
 * ver" está certo numa casa e errado numa escada, numa ponte e numa piscina.
 */
describe('cada obra fala da obra que é', () => {
  it('toda estrutura tem as duas falas', () => {
    for (const name of STRUCTURE_NAMES) {
      const plan = planStructure(name)
      expect(plan.finishedLine.length, name).toBeGreaterThan(0)
      expect(plan.partialLine.length, name).toBeGreaterThan(0)
    }
  })

  it('ninguém é convidado a entrar onde não se entra', () => {
    for (const name of ['piscina', 'ponte', 'escada'] as const) {
      expect(planStructure(name).finishedLine.toLowerCase(), name).not.toContain('entra')
    }
  })

  it('a fala de obra parcial é honesta sobre o que não dá pra usar', () => {
    expect(planStructure('ponte').partialLine.toLowerCase()).toContain('não chega')
    expect(planStructure('cerca').partialLine.toLowerCase()).toContain('fugir')
  })

  it('nenhuma fala de fim é longa demais para o chat', () => {
    for (const name of STRUCTURE_NAMES) {
      expect(planStructure(name).finishedLine.length, name).toBeLessThanOrEqual(70)
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
