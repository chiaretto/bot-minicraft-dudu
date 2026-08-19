import { describe, it, expect } from 'vitest'
import { parseCommand } from '../src/behaviors/commands.js'
import { Repertoire } from '../src/dialogue/repertoire.js'
import { loadCatalog, defaultCatalogPath } from '../src/dialogue/loader.js'
import { dialogueSchema, personaSchema, behaviorSchema } from '../src/config/schema.js'
import { STRUCTURE_NAMES } from '../src/domain/blueprints.js'
import { MATERIAL_GROUPS } from '../src/domain/materials.js'

/**
 * Pegar bloco e construir chegando de verdade ao jogador.
 *
 * Os dois já tinham (ou ganharam) código; o que faltava era o caminho até ele.
 * Ver: player_commands_delta.md → "Pegar bloco de verdade" e "Construir coisa
 * simples".
 */

const BOT = 'Dudu'
const catalog = loadCatalog(defaultCatalogPath()).catalog

const repertoire = new Repertoire({
  catalog,
  dialogue: dialogueSchema.parse({}),
  persona: personaSchema.parse({}),
  owner: 'Miguel',
})

describe('pedir bloco vira ação, sem IA nenhuma', () => {
  it('madeira', () => {
    for (const text of ['pega madeira', 'dudu, pega umas madeiras', 'pega madeira pra mim']) {
      const parsed = parseCommand(text, BOT)
      expect(parsed?.intent.type, text).toBe('COLLECT_BLOCK')
      expect(parsed?.intent.type === 'COLLECT_BLOCK' && parsed.intent.params.block, text).toBe(
        'madeira',
      )
    }
  })

  it('pedra, terra e areia', () => {
    for (const [text, block] of [
      ['pega pedra', 'pedra'],
      ['dudu, pega terra', 'terra'],
      ['pega areia', 'areia'],
    ] as const) {
      const parsed = parseCommand(text, BOT)
      expect(parsed?.intent.type === 'COLLECT_BLOCK' && parsed.intent.params.block, text).toBe(
        block,
      )
    }
  })

  it('pede uma quantidade que rende sem virar espera longa', () => {
    const parsed = parseCommand('pega madeira', BOT)
    const count = parsed?.intent.type === 'COLLECT_BLOCK' ? parsed.intent.params.count : 0
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(16)
  })

  /** Todo grupo que o comando usa precisa existir no domínio. */
  it('todo grupo pedido pelos comandos existe', () => {
    for (const text of ['pega madeira', 'pega pedra', 'pega terra', 'pega areia']) {
      const parsed = parseCommand(text, BOT)
      const block = parsed?.intent.type === 'COLLECT_BLOCK' ? parsed.intent.params.block : ''
      expect(Object.keys(MATERIAL_GROUPS), text).toContain(block)
    }
  })
})

describe('pedir construção vira obra, sem IA nenhuma', () => {
  it('casa', () => {
    for (const text of [
      'constroi uma casa',
      'dudu, faz uma casa',
      'faz uma casinha',
      'quero uma casa',
      'me faz uma casa',
    ]) {
      const parsed = parseCommand(text, BOT)
      expect(parsed?.intent.type, text).toBe('BUILD')
      expect(parsed?.intent.type === 'BUILD' && parsed.intent.params.structure, text).toBe('casa')
    }
  })

  it('torre', () => {
    for (const text of ['faz uma torre', 'constroi uma torre', 'quero uma torre']) {
      const parsed = parseCommand(text, BOT)
      expect(parsed?.intent.type === 'BUILD' && parsed.intent.params.structure, text).toBe('torre')
    }
  })

  it('tolera caixa, acento e pontuação, como a criança digita', () => {
    expect(parseCommand('DUDU, FAZ UMA CASA!!!', BOT)?.intent.type).toBe('BUILD')
    expect(parseCommand('Constrói uma casa', BOT)?.intent.type).toBe('BUILD')
  })

  it('toda estrutura do catálogo tem como ser pedida', () => {
    const pedidos = ['faz uma casa', 'faz uma torre']
      .map((t) => parseCommand(t, BOT))
      .map((p) => (p?.intent.type === 'BUILD' ? p.intent.params.structure : null))
    for (const name of STRUCTURE_NAMES) {
      expect(pedidos, `ninguém consegue pedir ${name}`).toContain(name)
    }
  })
})

/**
 * A armadilha da rodada: o comando roda no nível 1, mas o repertório responde
 * no nível 2 — e ele dizia "isso eu não sei fazer" para as MESMAS frases. Como
 * o nível 1 vem antes, a frase exata funciona; o perigo é a variação vizinha
 * cair no nível 2 e o bot negar uma capacidade que tem.
 */
describe('o repertório não nega mais o que o bot sabe fazer', () => {
  const negaCapacidade = (texto: string) => {
    const r = repertoire.respond(texto, null)
    return r ? /não sei|nao sei|não consigo|nao consigo|ainda não aprendi/i.test(r.text) : false
  }

  it('construir não é mais recusado', () => {
    for (const text of ['constroi uma casa', 'faz uma casa', 'faz uma casinha']) {
      expect(negaCapacidade(text), `${text} ainda cai numa recusa`).toBe(false)
    }
  })

  it('pegar madeira e pedra não é mais recusado', () => {
    for (const text of ['pega madeira', 'pega pedra']) {
      expect(negaCapacidade(text), `${text} ainda cai numa recusa`).toBe(false)
    }
  })

  /** O que ele REALMENTE não faz continua sendo recusado, com honestidade. */
  it('o que ele não sabe continua sendo negado', () => {
    for (const text of ['faz uma pocao', 'crafta', 'constroi um castelo']) {
      const r = repertoire.respond(text, null)
      expect(r, text).not.toBeNull()
      expect(r!.entryId, text).toBe('recusa_escopo')
    }
  })

  it('minério continua sendo negado, e ensina o que funciona', () => {
    const r = repertoire.respond('pega diamante', null)
    expect(r?.entryId).toBe('pedido_coleta')
  })

  it('quando perguntam o que ele sabe, construir e pegar aparecem', () => {
    const entry = catalog.entries.find((e) => e.id === 'capacidades')!
    const todas = entry.responses.join(' ').toLowerCase()
    expect(todas).toMatch(/casa|construir|constru/)
    expect(todas).toMatch(/pega|pegar/)
  })
})

describe('configuração da obra', () => {
  it('o teto de segurança cabe as duas estruturas', () => {
    const behavior = behaviorSchema.parse({})
    expect(behavior.buildMaxBlocks).toBeGreaterThanOrEqual(60)
  })

  it('só constrói com bloco da allowlist de obra', () => {
    const behavior = behaviorSchema.parse({})
    expect(behavior.buildAllowlist).toContain('oak_log')
    expect(behavior.buildAllowlist).not.toContain('tnt')
    expect(behavior.buildAllowlist).not.toContain('diamond_block')
  })

  it('busca material sozinho por padrão', () => {
    expect(behaviorSchema.parse({}).buildAutoGather).toBe(true)
  })
})
