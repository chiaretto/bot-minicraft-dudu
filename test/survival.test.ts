import { describe, it, expect } from 'vitest'
import {
  FOOD_ITEMS,
  chooseFood,
  isCalm,
  shouldEat,
  shouldPlaceTorch,
} from '../src/domain/survival.js'
import { behaviorSchema } from '../src/config/schema.js'

const behavior = behaviorSchema.parse({})

/**
 * Instintos de sobrevivência: comer com fome e acender tocha no escuro.
 * Determinísticos e sem IA, como a defesa.
 * Ver: player_defense_delta.md → "Instintos de sobrevivência".
 */
describe('catálogo de comida', () => {
  it('é fechado, e não inclui item raro nem coisa crua', () => {
    expect(FOOD_ITEMS).toContain('bread')
    expect(FOOD_ITEMS).toContain('cooked_beef')
    // Maçã dourada é item que a criança guarda; carne crua tira vida.
    expect(FOOD_ITEMS).not.toContain('golden_apple')
    expect(FOOD_ITEMS).not.toContain('enchanted_golden_apple')
    expect(FOOD_ITEMS).not.toContain('beef')
    expect(FOOD_ITEMS).not.toContain('rotten_flesh')
  })

  it('escolhe a primeira comida do catálogo que estiver na mochila', () => {
    expect(chooseFood([{ name: 'cooked_beef', count: 2 }])).toBe('cooked_beef')
    expect(chooseFood([{ name: 'bread', count: 1 }, { name: 'apple', count: 3 }])).toBe('bread')
  })

  it('mochila sem comida não rende nada', () => {
    expect(chooseFood([])).toBeNull()
    expect(chooseFood([{ name: 'oak_log', count: 64 }])).toBeNull()
    // Item com pilha zerada não conta.
    expect(chooseFood([{ name: 'bread', count: 0 }])).toBeNull()
  })
})

describe('quando ele pode parar para se cuidar', () => {
  it('parado, seguindo ou de guarda, pode', () => {
    expect(isCalm('IDLE')).toBe(true)
    expect(isCalm('FOLLOW')).toBe(true)
    expect(isCalm('STAY')).toBe(true)
  })

  /**
   * A guarda que importa: quem está fugindo de creeper não para para comer
   * pão, e quem está no meio de uma brincadeira não some para acender tocha.
   */
  it('brigando, brincando ou machucado, não', () => {
    expect(isCalm('DEFEND')).toBe(false)
    expect(isCalm('GAME')).toBe(false)
    expect(isCalm('EMERGENCY')).toBe(false)
  })
})

describe('comer com fome', () => {
  const base = { hasFood: true, state: 'FOLLOW' as const, threshold: behavior.eatBelowFood }

  it('come quando a fome chega no limiar', () => {
    expect(shouldEat({ ...base, food: 14 })).toBe(true)
    expect(shouldEat({ ...base, food: 6 })).toBe(true)
  })

  it('não come de barriga cheia', () => {
    // Comer cheio é desperdiçar comida que a criança pode precisar depois.
    expect(shouldEat({ ...base, food: 20 })).toBe(false)
    expect(shouldEat({ ...base, food: 15 })).toBe(false)
  })

  it('sem comida não come', () => {
    expect(shouldEat({ ...base, food: 2, hasFood: false })).toBe(false)
  })

  it('no meio de uma briga, aguenta a fome', () => {
    expect(shouldEat({ ...base, food: 2, state: 'DEFEND' })).toBe(false)
    expect(shouldEat({ ...base, food: 2, state: 'GAME' })).toBe(false)
  })
})

describe('acender tocha no escuro', () => {
  const base = {
    light: 3,
    hasTorch: true,
    state: 'FOLLOW' as const,
    threshold: behavior.torchBelowLight,
    msSinceLast: 60_000,
    minIntervalMs: behavior.torchMinIntervalMs,
    distanceFromLast: 20,
    minDistance: behavior.torchMinDistance,
  }

  it('acende quando está escuro', () => {
    expect(shouldPlaceTorch(base)).toBe(true)
  })

  it('não acende na claridade', () => {
    expect(shouldPlaceTorch({ ...base, light: 15 })).toBe(false)
    expect(shouldPlaceTorch({ ...base, light: 8 })).toBe(false)
  })

  it('sem tocha na mochila, não acende', () => {
    expect(shouldPlaceTorch({ ...base, hasTorch: false })).toBe(false)
  })

  /**
   * As duas guardas contra a mesma coisa: o bot virar fábrica de tocha. Escuro
   * basta para acender UMA; tempo e distância impedem a segunda no mesmo lugar.
   */
  it('não acende duas seguidas no mesmo lugar', () => {
    expect(shouldPlaceTorch({ ...base, msSinceLast: 1_000 })).toBe(false)
    expect(shouldPlaceTorch({ ...base, distanceFromLast: 1 })).toBe(false)
  })

  it('longe da última e depois do tempo, acende de novo', () => {
    expect(shouldPlaceTorch({ ...base, msSinceLast: 30_000, distanceFromLast: 12 })).toBe(true)
  })

  it('brigando, o escuro espera', () => {
    expect(shouldPlaceTorch({ ...base, state: 'DEFEND' })).toBe(false)
  })
})

describe('configuração dos instintos', () => {
  it('vem ligada, com limiares que fazem sentido para o jogo', () => {
    expect(behavior.autoEat).toBe(true)
    expect(behavior.autoTorch).toBe(true)
    // Monstro nasce com luz 0; 7 dá margem antes disso.
    expect(behavior.torchBelowLight).toBeLessThan(15)
    expect(behavior.eatBelowFood).toBeLessThan(20)
  })

  it('dá para desligar os dois sem mexer em código', () => {
    const desligado = behaviorSchema.parse({ autoEat: false, autoTorch: false })
    expect(desligado.autoEat).toBe(false)
    expect(desligado.autoTorch).toBe(false)
  })
})
