import { describe, it, expect } from 'vitest'
import { ITEM_NAMES, friendlyItemName, isKnownItem } from '../src/domain/item-names.js'
import { FOOD_ITEMS } from '../src/domain/survival.js'
import { behaviorSchema } from '../src/config/schema.js'
import { isBedName } from '../src/domain/sleeping.js'

const behavior = behaviorSchema.parse({})

/**
 * Nome dos itens em português.
 *
 * O bot dizia "Toma aí o cooked_beef!" para uma criança de 7 anos.
 * Ver: player_commands_delta.md → "Catálogo de nomes de item em português".
 */
describe('tradução', () => {
  it('traduz o que a criança vai ouvir', () => {
    expect(friendlyItemName('cooked_beef')).toBe('carne assada')
    expect(friendlyItemName('torch')).toBe('tocha')
    expect(friendlyItemName('iron_sword')).toBe('espada de ferro')
    expect(friendlyItemName('oak_log')).toBe('madeira')
  })

  /**
   * Esconder faria a conta da mochila mentir, e a fala virar um buraco. O id
   * aparece, e a falta vira item novo no catálogo.
   */
  it('item desconhecido aparece com o id, nunca some', () => {
    expect(friendlyItemName('elytra')).toBe('elytra')
    expect(friendlyItemName('coisa_inventada')).toBe('coisa_inventada')
    expect(friendlyItemName('')).toBe('')
  })

  it('sabe dizer o que conhece', () => {
    expect(isKnownItem('bread')).toBe(true)
    expect(isKnownItem('elytra')).toBe(false)
  })
})

describe('cobertura do catálogo', () => {
  /** Se ele come, ele fala sobre isso — e não pode falar em inglês. */
  it('toda comida do cardápio tem nome em português', () => {
    for (const item of FOOD_ITEMS) {
      expect(isKnownItem(item), item).toBe(true)
      expect(friendlyItemName(item), item).not.toBe(item)
    }
  })

  it('todo bloco de obra tem nome', () => {
    for (const bloco of behavior.buildAllowlist) {
      expect(isKnownItem(bloco), bloco).toBe(true)
    }
  })

  it('todo bloco de coleta tem nome', () => {
    for (const bloco of behavior.collectAllowlist) {
      expect(isKnownItem(bloco), bloco).toBe(true)
    }
  })

  /** `SLEEP` procura cama de qualquer cor: as 16 precisam de nome. */
  it('toda cama tem nome, e é só "cama"', () => {
    const camas = Object.keys(ITEM_NAMES).filter(isBedName)
    expect(camas.length).toBe(16)
    for (const cama of camas) expect(friendlyItemName(cama), cama).toBe('cama')
  })

  it('a tocha do instinto tem nome', () => {
    expect(isKnownItem('torch')).toBe(true)
  })
})

/**
 * A varredura que trava o defeito de origem: id do jogo tem underscore, palavra
 * em português não. Nome traduzido com `_` é tradução esquecida.
 */
describe('nenhum nome traduzido parece id de jogo', () => {
  it('nada de underscore no que a criança lê', () => {
    for (const [id, nome] of Object.entries(ITEM_NAMES)) {
      expect(nome, `${id} não foi traduzido`).not.toContain('_')
    }
  })

  it('e nada em branco', () => {
    for (const [id, nome] of Object.entries(ITEM_NAMES)) {
      expect(nome.trim().length, id).toBeGreaterThan(0)
    }
  })
})
