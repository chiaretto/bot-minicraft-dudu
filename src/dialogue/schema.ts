import { z } from 'zod'

/** Placeholders válidos numa resposta. Qualquer outro derruba o startup. */
export const KNOWN_PLACEHOLDERS = [
  'owner',
  'botName',
  'originStory',
  'health',
  'ownerHealth',
  'coords',
  'timeOfDay',
  'inventorySummary',
] as const

export type PlaceholderName = (typeof KNOWN_PLACEHOLDERS)[number]

export const whenSchema = z.object({
  state: z.enum(['IDLE', 'FOLLOW', 'STAY', 'ACTION', 'DEFEND', 'EMERGENCY']).optional(),
  timeOfDay: z.enum(['dia', 'tarde', 'noite']).optional(),
  healthBelow: z.number().positive().optional(),
  ownerHealthBelow: z.number().positive().optional(),
  targetIsPlayer: z.boolean().optional(),
})

export type WhenClause = z.infer<typeof whenSchema>

/** Uma resposta é string simples ou objeto com condição de contexto. */
export const responseSchema = z.union([
  z.string().min(1),
  z.object({ text: z.string().min(1), when: whenSchema.optional() }),
])

export type RawResponse = z.infer<typeof responseSchema>

export const entrySchema = z.object({
  id: z.string().min(1),
  /** Padrões de gatilho, já em forma normalizada (sem acento, minúsculas). */
  patterns: z.array(z.string().min(1)).default([]),
  /** Desempate quando duas entradas casam: maior vence. */
  specificity: z.number().int().nonnegative().default(1),
  /**
   * `chat` responde a mensagem do jogador (padrão).
   * `spontaneous` é disparada por evento do jogo.
   * `fallback` só é usada quando nem a IA resolveu.
   */
  trigger: z.enum(['chat', 'spontaneous', 'fallback']).default('chat'),
  when: whenSchema.optional(),
  responses: z.array(responseSchema).min(1, 'entrada precisa de ao menos 1 resposta'),
})

export type RawEntry = z.infer<typeof entrySchema>

export const catalogSchema = z.object({
  version: z.number().int().positive().default(1),
  entries: z.array(entrySchema).min(1),
})

export type RawCatalog = z.infer<typeof catalogSchema>

/** Abaixo disso o bot fica repetitivo — vira aviso, não erro. */
export const MIN_VARIATIONS_WARN = 4
