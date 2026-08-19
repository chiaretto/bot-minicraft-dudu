import { describe, it, expect } from 'vitest'
import {
  actionFrom,
  validateReplyWithAction,
  parseReplyWithActionFromText,
  REPLY_WITH_ACTION_JSON_SCHEMA,
  INTENT_JSON_SCHEMA,
  INTENT_TYPES,
} from '../src/domain/intent.js'
import { ACTION_DESCRIPTIONS, ACTIONABLE_INTENTS } from '../src/ai/prompt.js'

/**
 * A resposta da IA traz a ação junto.
 *
 * O defeito de origem: a IA respondia bonito e o bot não fazia nada, porque o
 * caminho de interpretação era inalcançável.
 * Ver: ai_companion_delta.md → "Resposta da IA carrega a ação".
 */

describe('ação proposta pela IA', () => {
  it('aceita ação do catálogo', () => {
    const action = actionFrom({ type: 'COLLECT_BLOCK', params: { block: 'oak_log', count: 4 } })
    expect(action?.type).toBe('COLLECT_BLOCK')
  })

  it('ação fora do catálogo é descartada', () => {
    expect(actionFrom({ type: 'BUILD_HOUSE', params: {} })).toBeNull()
    expect(actionFrom({ type: 'ATTACK_PLAYER', params: { alvo: 'Fulano' } })).toBeNull()
  })

  it('ação com parâmetro inválido é descartada', () => {
    // `count` acima do teto do schema.
    expect(
      actionFrom({ type: 'COLLECT_BLOCK', params: { block: 'oak_log', count: 999 } }),
    ).toBeNull()
    // `block` vazio.
    expect(actionFrom({ type: 'COLLECT_BLOCK', params: { block: '', count: 1 } })).toBeNull()
  })

  it('CHAT e UNKNOWN não são ação', () => {
    expect(actionFrom({ type: 'CHAT', params: { text: 'oi' } })).toBeNull()
    expect(actionFrom({ type: 'UNKNOWN', params: {} })).toBeNull()
  })

  it('ausência de ação é o caso normal', () => {
    expect(actionFrom(null)).toBeNull()
    expect(actionFrom(undefined)).toBeNull()
    expect(actionFrom('pega madeira')).toBeNull()
  })
})

describe('resposta completa da IA', () => {
  it('fala e ação chegam juntas', () => {
    const r = validateReplyWithAction({
      reply: 'Já vou pegar!',
      action: { type: 'COLLECT_BLOCK', params: { block: 'oak_log', count: 4 } },
    })
    expect(r.reply).toBe('Já vou pegar!')
    expect(r.action?.type).toBe('COLLECT_BLOCK')
  })

  it('conversa pura vem sem ação', () => {
    const r = validateReplyWithAction({ reply: 'Adoro! Brilha muito!', action: null })
    expect(r.reply).toBe('Adoro! Brilha muito!')
    expect(r.action).toBeNull()
  })

  /**
   * A criança precisa ouvir a resposta mesmo quando o pedido não vira ação.
   * Derrubar a fala junto com a ação inválida deixaria o bot mudo.
   */
  it('ação inválida não derruba a fala', () => {
    const r = validateReplyWithAction({
      reply: 'Essa eu não sei fazer ainda, desculpa!',
      action: { type: 'BUILD_HOUSE', params: {} },
    })
    expect(r.reply).toBe('Essa eu não sei fazer ainda, desculpa!')
    expect(r.action).toBeNull()
  })

  it('entrada quebrada vira fala vazia sem ação', () => {
    expect(validateReplyWithAction(null)).toEqual({ reply: '', action: null })
    expect(validateReplyWithAction('texto solto')).toEqual({ reply: '', action: null })
    expect(validateReplyWithAction({ action: null })).toEqual({ reply: '', action: null })
  })
})

describe('parse do que o provider devolveu', () => {
  it('lê o JSON esperado', () => {
    const r = parseReplyWithActionFromText(
      '{"reply":"Tô indo!","action":{"type":"FOLLOW","params":{}}}',
    )
    expect(r.reply).toBe('Tô indo!')
    expect(r.action?.type).toBe('FOLLOW')
  })

  it('tolera cerca de markdown', () => {
    const r = parseReplyWithActionFromText('```json\n{"reply":"Oi!","action":null}\n```')
    expect(r.reply).toBe('Oi!')
    expect(r.action).toBeNull()
  })

  /**
   * Modelo local que ignorou o formato ainda respondeu alguma coisa à criança.
   * Perder a ação é aceitável; ficar mudo não é.
   */
  it('texto que não é JSON vira fala pura, sem ação', () => {
    const r = parseReplyWithActionFromText('Oi Miguel, tudo bem?')
    expect(r.reply).toBe('Oi Miguel, tudo bem?')
    expect(r.action).toBeNull()
  })

  it('JSON truncado não quebra', () => {
    const r = parseReplyWithActionFromText('{"reply":"Já vou pega')
    expect(r.action).toBeNull()
    expect(() => parseReplyWithActionFromText('')).not.toThrow()
  })
})

describe('schema entregue ao provider', () => {
  it('pede fala e ação', () => {
    expect(REPLY_WITH_ACTION_JSON_SCHEMA.properties.reply.type).toBe('string')
    expect(REPLY_WITH_ACTION_JSON_SCHEMA.required).toContain('reply')
  })

  /** Intenção nova não pode exigir mexer em dois schemas. */
  it('reaproveita o schema de intenção em vez de repetir a lista', () => {
    expect(REPLY_WITH_ACTION_JSON_SCHEMA.properties.action).toBe(INTENT_JSON_SCHEMA)
  })
})

describe('catálogo de ações no prompt', () => {
  it('toda ação executável tem descrição', () => {
    for (const type of ACTIONABLE_INTENTS) {
      expect(ACTION_DESCRIPTIONS[type], type).toBeTruthy()
    }
  })

  it('CHAT e UNKNOWN ficam de fora — não são ação', () => {
    expect(ACTIONABLE_INTENTS).not.toContain('CHAT')
    expect(ACTIONABLE_INTENTS).not.toContain('UNKNOWN')
    expect(ACTIONABLE_INTENTS).toHaveLength(INTENT_TYPES.length - 2)
  })
})
