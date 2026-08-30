import { describe, it, expect } from 'vitest'
import { TEMPERATURES, TEMPERATURE_ENTRY, temperature } from '../src/domain/hot-cold.js'
import { GAME_NAMES, ROLES_BY_GAME, isGameName, isRoleValidForGame } from '../src/domain/games.js'
import { parseCommand } from '../src/behaviors/commands.js'
import { hotColdSchema } from '../src/config/schema.js'
import { loadCatalog, defaultCatalogPath } from '../src/dialogue/loader.js'

const config = hotColdSchema.parse({})

/**
 * Quente e frio: o terceiro jogo.
 * Ver: bot_games_delta.md → "Quente e frio".
 */
describe('temperatura', () => {
  const base = { foundRadius: config.foundRadius }

  it('encostou no ponto: achou, e isso ganha de tudo', () => {
    expect(temperature({ ...base, distance: 1, previous: 40 })).toBe('achou')
    expect(temperature({ ...base, distance: config.foundRadius, previous: 2 })).toBe('achou')
  })

  /**
   * "Pelando" é sobre distância ABSOLUTA: perto é perto mesmo que a criança
   * tenha acabado de dar um passo para trás.
   */
  it('pertinho é "pelando", mesmo tendo se afastado um passo', () => {
    expect(temperature({ ...base, distance: 6, previous: 4 })).toBe('pelando')
  })

  it('aproximou: quente', () => {
    expect(temperature({ ...base, distance: 12, previous: 20 })).toBe('quente')
  })

  it('afastou: frio', () => {
    expect(temperature({ ...base, distance: 20, previous: 12 })).toBe('frio')
  })

  it('afastou muito: gelado', () => {
    expect(temperature({ ...base, distance: 40, previous: 30 })).toBe('gelado')
  })

  /**
   * A criança para de andar para pensar. Um "frio" nessa hora seria mentira:
   * ela não se afastou, só ficou parada.
   */
  it('parada no lugar: morno, e ele pede para ela andar', () => {
    expect(temperature({ ...base, distance: 15, previous: 15 })).toBe('morno')
    expect(temperature({ ...base, distance: 15, previous: 15.9 })).toBe('morno')
  })

  it('no primeiro passo não há movimento para comparar', () => {
    expect(temperature({ ...base, distance: 15, previous: null })).toBe('frio')
    expect(temperature({ ...base, distance: 40, previous: null })).toBe('gelado')
    // Mas achar continua ganhando de tudo, inclusive do primeiro passo.
    expect(temperature({ ...base, distance: 1, previous: null })).toBe('achou')
  })

  it('toda temperatura tem uma entrada de fala', () => {
    for (const t of TEMPERATURES) {
      expect(TEMPERATURE_ENTRY[t], t).toBeTruthy()
    }
  })
})

describe('o jogo no registro', () => {
  it('entrou no catálogo fechado', () => {
    expect(isGameName('quente_frio')).toBe(true)
    expect(GAME_NAMES).toContain('quente_frio')
  })

  /**
   * Um papel só: quem esconde é sempre o bot. Perguntar seria fazer uma
   * pergunta de uma resposta só.
   */
  it('tem um papel só, e ele é válido', () => {
    expect(ROLES_BY_GAME['quente_frio']).toEqual(['bot_esconde_ponto'])
    expect(isRoleValidForGame('quente_frio', 'bot_esconde_ponto')).toBe(true)
  })

  it('papel de outro jogo não vale aqui', () => {
    expect(isRoleValidForGame('quente_frio', 'bot_pega')).toBe(false)
    expect(isRoleValidForGame('esconde_esconde', 'bot_esconde_ponto')).toBe(false)
  })
})

describe('como a criança pede', () => {
  it('os jeitos de chamar o jogo', () => {
    for (const text of [
      'quente e frio',
      'quente ou frio',
      'vamos brincar de quente e frio',
      'bora quente e frio',
      'esconde um tesouro',
    ]) {
      const parsed = parseCommand(text, 'Dudu')
      expect(parsed?.intent.type === 'PLAY_GAME' && parsed.intent.params.game, text).toBe(
        'quente_frio',
      )
    }
  })

  it('o convite não manda papel — o jogo só tem um', () => {
    const parsed = parseCommand('quente e frio', 'Dudu')
    expect(parsed?.intent.type === 'PLAY_GAME' && parsed.intent.params.role).toBeUndefined()
  })
})

describe('configuração', () => {
  it('tem padrões que cabem numa brincadeira, não numa caminhada', () => {
    expect(config.hideMaxDistance).toBeLessThanOrEqual(40)
    expect(config.foundRadius).toBeGreaterThan(0)
    expect(config.tickMs).toBeGreaterThanOrEqual(1_000)
  })

  it('a repetição da mesma palavra é espaçada', () => {
    // Repetir "frio" a cada passo encheria o chat e a criança pararia de ler.
    expect(config.repeatEvery).toBeGreaterThan(1)
  })
})

describe('as falas do jogo', () => {
  it('toda temperatura tem entrada no repertório, com 4+ variações', () => {
    const { catalog } = loadCatalog(defaultCatalogPath())
    const ids = [...Object.values(TEMPERATURE_ENTRY), 'qf_comecou', 'qf_revela', 'qf_sem_lugar']
    for (const id of ids) {
      const entry = catalog.entries.find((e) => e.id === id)
      expect(entry, id).toBeDefined()
      expect(entry!.responses.length, id).toBeGreaterThanOrEqual(4)
    }
  })

  /** O ponto é do bot e nunca é dito antes do fim. */
  it('nenhuma fala do jogo entrega onde é', () => {
    const { catalog } = loadCatalog(defaultCatalogPath())
    for (const id of Object.values(TEMPERATURE_ENTRY)) {
      const entry = catalog.entries.find((e) => e.id === id)!
      for (const r of entry.responses) {
        const texto = typeof r === 'string' ? r : r.text
        expect(texto, id).not.toMatch(/\d+,\s*\d+/)
      }
    }
  })
})
