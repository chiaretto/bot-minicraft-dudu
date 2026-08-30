import { describe, it, expect } from 'vitest'
import {
  isBedName,
  sleepRefusal,
  BED_SEARCH_RADIUS,
  SLEEP_REFUSAL_LINES,
} from '../src/domain/sleeping.js'
import { parseCommand } from '../src/behaviors/commands.js'

/**
 * Dormir na cama. O valor real é pular a noite — a parte do jogo que mais
 * assusta uma criança de 7 anos.
 * Ver: player_commands_delta.md → "Dormir na cama".
 */
describe('cama', () => {
  it('reconhece as 16 cores sem listar nenhuma', () => {
    expect(isBedName('white_bed')).toBe(true)
    expect(isBedName('red_bed')).toBe(true)
    expect(isBedName('light_blue_bed')).toBe(true)
  })

  it('o que não é cama não é cama', () => {
    expect(isBedName('bedrock')).toBe(false)
    expect(isBedName('stone')).toBe(false)
    expect(isBedName('bed_rock')).toBe(false)
  })
})

describe('quando dá para dormir', () => {
  it('de noite, com cama perto', () => {
    expect(sleepRefusal({ timeOfDay: 'noite', bedDistance: 5 })).toBeNull()
  })

  /**
   * Recusar cedo é melhor do que atravessar o mundo até a cama para levar um
   * "não" do servidor.
   */
  it('de dia não dá, e o motivo é dito antes de andar', () => {
    expect(sleepRefusal({ timeOfDay: 'dia', bedDistance: 2 })).toBe('de_dia')
    expect(sleepRefusal({ timeOfDay: 'tarde', bedDistance: 2 })).toBe('de_dia')
  })

  it('sem cama nenhuma por perto', () => {
    expect(sleepRefusal({ timeOfDay: 'noite', bedDistance: null })).toBe('sem_cama')
  })

  it('cama longe demais é viagem, não é "vamos dormir"', () => {
    expect(sleepRefusal({ timeOfDay: 'noite', bedDistance: BED_SEARCH_RADIUS + 1 })).toBe('longe')
  })

  it('toda recusa tem fala — nenhuma termina em silêncio', () => {
    for (const motivo of ['de_dia', 'sem_cama', 'longe'] as const) {
      expect(SLEEP_REFUSAL_LINES[motivo].length, motivo).toBeGreaterThan(0)
      // Regra número um: nada de palavra técnica no chat.
      expect(SLEEP_REFUSAL_LINES[motivo].toLowerCase()).not.toContain('erro')
    }
  })
})

describe('como a criança pede', () => {
  it('as ordens viram comando', () => {
    for (const text of [
      'vamos dormir',
      'dorme',
      'vai dormir',
      'deita na cama',
      'deita ai',
      'hora de dormir',
    ]) {
      expect(parseCommand(text, 'Dudu')?.intent.type, text).toBe('SLEEP')
    }
  })

  /**
   * "boa noite" é despedida na boca de uma criança, não ordem. Mandar o bot
   * para a cama porque ela se despediu seria obedecer a coisa errada.
   */
  it('"boa noite" e "vou dormir" NÃO mandam o bot dormir', () => {
    expect(parseCommand('boa noite', 'Dudu')).toBeNull()
    expect(parseCommand('vou dormir', 'Dudu')).toBeNull()
  })

  it('pergunta sobre dormir continua sendo conversa', () => {
    expect(parseCommand('voce sabe dormir', 'Dudu')).toBeNull()
    expect(parseCommand('voce dorme', 'Dudu')).toBeNull()
  })
})
