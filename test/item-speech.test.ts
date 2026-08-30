import { describe, it, expect } from 'vitest'
import { dropItemToOwner, equipItem, ActionRefused } from '../src/behaviors/actions/index.js'
import { behaviorSchema } from '../src/config/schema.js'

/**
 * As falas de item, que diziam o nome técnico em inglês.
 *
 * O defeito: `"Toma aí o cooked_beef!"` para uma criança de 7 anos.
 * `friendlyName()` existia desde a coleta e nunca foi chamado aqui.
 * Ver: player_commands_delta.md → "Entregar item na mão do jogador".
 */

/** Bot falso mínimo: só o que estas duas ações tocam. */
function fakeBot(itens: { name: string; count: number }[]) {
  const equipados: string[] = []
  return {
    equipados,
    bot: {
      inventory: { items: () => itens.map((i) => ({ ...i, type: 1 })) },
      players: {},
      equip: async (item: { name: string }) => {
        equipados.push(item.name)
      },
    } as never,
  }
}

const deps = (bot: never) => ({
  bot,
  behavior: behaviorSchema.parse({}),
  ownerName: 'Miguel',
  signal: null,
})

describe('equipar fala português', () => {
  it('a confirmação usa o nome que a criança entende', async () => {
    const { bot } = fakeBot([{ name: 'iron_sword', count: 1 }])
    const outcome = await equipItem(deps(bot), 'iron_sword')

    expect(outcome.message).toContain('espada de ferro')
    expect(outcome.message).not.toContain('iron_sword')
  })

  it('a recusa também', async () => {
    const { bot } = fakeBot([])
    await expect(equipItem(deps(bot), 'torch')).rejects.toThrow(ActionRefused)
    await expect(equipItem(deps(bot), 'torch')).rejects.toThrow(/tocha/)
  })
})

describe('entregar fala português', () => {
  it('a recusa por não ter o item usa o nome traduzido', async () => {
    const { bot } = fakeBot([])
    await expect(dropItemToOwner(deps(bot), 'cooked_beef')).rejects.toThrow(/carne assada/)
  })

  it('item fora do catálogo aparece como está, em vez de sumir', async () => {
    const { bot } = fakeBot([])
    await expect(dropItemToOwner(deps(bot), 'elytra')).rejects.toThrow(/elytra/)
  })
})

/**
 * A varredura de origem: id do jogo tem underscore, palavra em português não.
 * Se alguém escrever uma fala nova com o id cru, isto pega.
 */
describe('nenhuma fala de item mostra id do jogo', () => {
  it('nem na confirmação, nem na recusa', async () => {
    const { bot } = fakeBot([{ name: 'cooked_beef', count: 3 }])
    const outcome = await equipItem(deps(bot), 'cooked_beef')
    expect(outcome.message).not.toMatch(/[a-z]_[a-z]/)
  })
})
