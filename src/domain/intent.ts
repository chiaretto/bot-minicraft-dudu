import { z } from 'zod'
import { GAME_ROLES } from './games.js'
import { STRUCTURE_NAMES } from './blueprints.js'

/**
 * Catálogo FECHADO de intenções. A IA só pode propor o que está aqui.
 * Qualquer coisa fora da lista vira UNKNOWN e nenhuma ação de mundo acontece.
 * Ver: ai_companion_delta.md → "IA devolve intenção fora do catálogo".
 */
export const INTENT_TYPES = [
  'FOLLOW',
  'STAY',
  'STOP',
  'COLLECT_BLOCK',
  'BUILD',
  'GOTO_COORDS',
  'DROP_ITEM_TO_OWNER',
  'LOOK_AT_OWNER',
  'EQUIP_ITEM',
  'DEFENSE_ON',
  'DEFENSE_OFF',
  'PLAY_GAME',
  'ASK_WHICH_GAME',
  'CHAT',
  'UNKNOWN',
] as const

export type IntentType = (typeof INTENT_TYPES)[number]

export const intentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('FOLLOW'), params: z.object({}).default({}) }),
  z.object({ type: z.literal('STAY'), params: z.object({}).default({}) }),
  z.object({ type: z.literal('STOP'), params: z.object({}).default({}) }),
  z.object({
    type: z.literal('COLLECT_BLOCK'),
    params: z.object({
      block: z.string().min(1),
      count: z.number().int().positive().max(64).default(1),
    }),
  }),
  // Construção simples. `structure` é o catálogo fechado de plantas; o material
  // é opcional — sem ele o bot constrói com o que tiver na mochila.
  z.object({
    type: z.literal('BUILD'),
    params: z.object({
      structure: z.enum(STRUCTURE_NAMES),
      material: z.string().min(1).optional(),
    }),
  }),
  z.object({
    type: z.literal('GOTO_COORDS'),
    params: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  }),
  z.object({
    type: z.literal('DROP_ITEM_TO_OWNER'),
    params: z.object({
      item: z.string().min(1),
      count: z.number().int().positive().max(64).optional(),
    }),
  }),
  z.object({ type: z.literal('LOOK_AT_OWNER'), params: z.object({}).default({}) }),
  z.object({ type: z.literal('EQUIP_ITEM'), params: z.object({ item: z.string().min(1) }) }),
  z.object({ type: z.literal('DEFENSE_ON'), params: z.object({}).default({}) }),
  z.object({ type: z.literal('DEFENSE_OFF'), params: z.object({}).default({}) }),
  // `game` é string livre no schema, mas o registro de jogos recusa o que não
  // conhece: um jogo novo não pode exigir mudança no contrato da IA.
  z.object({
    type: z.literal('PLAY_GAME'),
    params: z.object({
      game: z.string().min(1),
      role: z.enum(GAME_ROLES).optional(),
    }),
  }),
  // Convite sem nome de jogo. Com duas brincadeiras no registro, escolher pela
  // criança seria decidir por ela; o bot pergunta qual das duas ela quer.
  z.object({ type: z.literal('ASK_WHICH_GAME'), params: z.object({}).default({}) }),
  z.object({
    type: z.literal('CHAT'),
    params: z.object({ text: z.string() }).default({ text: '' }),
  }),
  z.object({ type: z.literal('UNKNOWN'), params: z.object({}).default({}) }),
])

export type Intent = z.infer<typeof intentSchema>

export const UNKNOWN_INTENT: Intent = { type: 'UNKNOWN', params: {} }

/**
 * JSON Schema entregue ao provider para forçar saída estruturada.
 * Tanto o Ollama (`format`) quanto o Gemini (`responseSchema`) aceitam este shape.
 */
export const INTENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: [...INTENT_TYPES] },
    params: {
      type: 'object',
      properties: {
        block: { type: 'string' },
        count: { type: 'number' },
        item: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' },
        text: { type: 'string' },
        game: { type: 'string' },
        role: { type: 'string', enum: [...GAME_ROLES] },
        structure: { type: 'string', enum: [...STRUCTURE_NAMES] },
        material: { type: 'string' },
      },
    },
  },
  required: ['type'],
} as const

/**
 * O que a IA devolve por mensagem: o que falar e, quando for pedido, o que
 * fazer. `action` nula é o caso normal — a maior parte do que a criança fala é
 * conversa, não pedido.
 * Ver: ai_companion_delta.md → "Resposta da IA carrega a ação".
 */
export interface ReplyWithAction {
  reply: string
  action: Intent | null
}

/**
 * JSON Schema da resposta completa, entregue ao provider.
 *
 * Envolve `INTENT_JSON_SCHEMA` em vez de repetir a lista de tipos: acrescentar
 * uma intenção nova não pode exigir mexer em dois lugares.
 */
export const REPLY_WITH_ACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    action: INTENT_JSON_SCHEMA,
  },
  required: ['reply'],
} as const

/**
 * Ponto único de validação: nada vindo da IA vira ação sem passar por aqui.
 * Nunca lança — entrada inválida vira UNKNOWN.
 */
export function validateIntent(raw: unknown): Intent {
  if (raw === null || typeof raw !== 'object') return UNKNOWN_INTENT
  const candidate = raw as Record<string, unknown>
  if (candidate.params === undefined) candidate.params = {}
  const result = intentSchema.safeParse(candidate)
  return result.success ? result.data : UNKNOWN_INTENT
}

/** Faz parse de texto que deveria ser JSON. Tolera cercas de markdown. */
export function parseIntentFromText(text: string): Intent {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    return validateIntent(JSON.parse(cleaned))
  } catch {
    return UNKNOWN_INTENT
  }
}

/**
 * Ação que a IA propôs, ou `null` quando não há nada a fazer.
 *
 * `CHAT` e `UNKNOWN` são intenções válidas do catálogo, mas não são ação: a
 * primeira quer dizer "isto era só conversa" e a segunda "não entendi o
 * pedido". Nenhuma das duas pode virar efeito no mundo.
 */
export function actionFrom(raw: unknown): Intent | null {
  if (raw === null || raw === undefined) return null
  const intent = validateIntent(raw)
  return intent.type === 'CHAT' || intent.type === 'UNKNOWN' ? null : intent
}

/**
 * Valida a resposta completa da IA.
 *
 * Nunca lança e nunca devolve fala nula: uma resposta quebrada vira fala vazia
 * sem ação, e quem chama decide o que dizer no lugar. Uma ação inválida é
 * descartada **sem** derrubar a fala — a criança ouve a resposta mesmo quando
 * o pedido não vira ação.
 */
export function validateReplyWithAction(raw: unknown): ReplyWithAction {
  if (raw === null || typeof raw !== 'object') return { reply: '', action: null }
  const candidate = raw as Record<string, unknown>
  return {
    reply: typeof candidate.reply === 'string' ? candidate.reply : '',
    action: actionFrom(candidate.action),
  }
}

/**
 * Faz parse do texto do provider como resposta completa.
 *
 * Texto que não é JSON não é descartado: vira fala pura, sem ação. Um modelo
 * local que ignorou o formato ainda respondeu alguma coisa à criança, e calar
 * seria pior do que ficar sem a ação.
 */
export function parseReplyWithActionFromText(text: string): ReplyWithAction {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  try {
    return validateReplyWithAction(JSON.parse(cleaned))
  } catch {
    return { reply: text.trim(), action: null }
  }
}
