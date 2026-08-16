import { z } from 'zod'
import { GAME_ROLES } from './games.js'

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
      },
    },
  },
  required: ['type'],
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
