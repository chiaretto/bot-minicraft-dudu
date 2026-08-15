import { z } from 'zod'

/**
 * Campos que são segredo e por isso NUNCA podem aparecer em config.yaml.
 * O loader recusa iniciar se encontrar qualquer um deles no arquivo.
 * Ver: configuration_delta.md → "Segredos apenas por variável de ambiente".
 */
export const FORBIDDEN_YAML_KEYS = ['geminiApiKey', 'apiKey', 'password', 'senha'] as const

export const serverSchema = z.object({
  host: z.string().min(1).default('localhost'),
  port: z.number().int().positive().default(25565),
  /** Versão do protocolo. Validada contra o servidor real no startup. */
  version: z.string().min(1),
  /** `offline` dispensa conta Mojang/Microsoft — típico de servidor local. */
  auth: z.enum(['offline', 'microsoft']).default('offline'),
  username: z.string().min(1).default('Dudu'),
  reconnect: z
    .object({
      enabled: z.boolean().default(true),
      initialDelayMs: z.number().int().positive().default(1000),
      maxDelayMs: z.number().int().positive().default(60_000),
      maxAttempts: z.number().int().positive().default(10),
    })
    .default({}),
})

export const personaSchema = z.object({
  name: z.string().min(1).default('Dudu'),
  description: z.string().default('Você é um amigo prestativo e animado no Minecraft.'),
  /**
   * Frase de origem. Alimenta o repertório (`{originStory}`) E o system prompt
   * da IA — as duas fontes precisam contar a mesma história.
   */
  originStory: z.string().default('Seu pai me criou pra jogar com você!'),
})

export const dialogueSchema = z.object({
  enabled: z.boolean().default(true),
  minConfidence: z.number().min(0).max(1).default(0.7),
  catalogPath: z.string().default('data/repertoire.yaml'),
  spontaneous: z.boolean().default(true),
  spontaneousCooldownMs: z.number().int().nonnegative().default(60_000),
})

export const memorySchema = z.object({
  dir: z.string().default('data/conversations'),
  shortTermWindow: z.number().int().positive().default(10),
  /** `null` = guardar para sempre. */
  retentionDays: z.number().int().positive().nullable().default(null),
  resumeToday: z.boolean().default(true),
})

export const defenseSchema = z.object({
  enabled: z.boolean().default(true),
  protectRadius: z.number().positive().default(16),
  criticalHealth: z.number().positive().default(6),
  engagementTimeoutMs: z.number().int().positive().default(30_000),
  maxSimultaneousTargets: z.number().int().positive().default(3),
  /** Distância mínima da qual o bot trata um creeper como "perto do dono". */
  creeperSafeDistance: z.number().positive().default(10),
})

export const ollamaSchema = z.object({
  baseUrl: z.string().url().default('http://localhost:11434'),
  model: z.string().min(1).default('qwen3:4b'),
  timeoutMs: z.number().int().positive().default(12_000),
  keepAlive: z.string().default('30m'),
})

export const geminiSchema = z.object({
  model: z.string().min(1).default('gemini-2.0-flash'),
  timeoutMs: z.number().int().positive().default(5_000),
})

export const llmSchema = z.object({
  provider: z.enum(['ollama', 'gemini', 'none']).default('ollama'),
  fallbackProvider: z.enum(['ollama', 'gemini']).nullable().default(null),
  ollama: ollamaSchema.default({}),
  gemini: geminiSchema.default({}),
  warmUpOnStart: z.boolean().default(true),
  /** Após esse tempo sem resposta, o bot fala algo de espera no chat. */
  fillerAfterMs: z.number().int().positive().default(2_000),
  /** O que fazer com uma segunda mensagem enquanto já há inferência em voo. */
  queueBehavior: z.enum(['queue', 'repertoire']).default('repertoire'),
  maxCallsPerMinute: z.number().int().positive().default(10),
  circuitBreakerThreshold: z.number().int().positive().default(3),
  circuitBreakerResetMs: z.number().int().positive().default(60_000),
})

export const behaviorSchema = z.object({
  followDistance: z.number().positive().default(3),
  stayTolerance: z.number().positive().default(2),
  actionTimeoutMs: z.number().int().positive().default(60_000),
  noProgressMs: z.number().int().positive().default(10_000),
  collectAllowlist: z
    .array(z.string())
    .default([
      'oak_log',
      'birch_log',
      'spruce_log',
      'jungle_log',
      'acacia_log',
      'dark_oak_log',
      'dirt',
      'sand',
      'gravel',
      'cobblestone',
      'stone',
    ]),
})

export const configSchema = z.object({
  ownerPlayer: z
    .string({ required_error: 'ownerPlayer é obrigatório' })
    .min(1, 'ownerPlayer é obrigatório'),
  server: serverSchema,
  persona: personaSchema.default({}),
  dialogue: dialogueSchema.default({}),
  memory: memorySchema.default({}),
  defense: defenseSchema.default({}),
  llm: llmSchema.default({}),
  behavior: behaviorSchema.default({}),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
})

export type Config = z.infer<typeof configSchema>
export type LlmConfig = z.infer<typeof llmSchema>
export type DefenseConfig = z.infer<typeof defenseSchema>
export type DialogueConfig = z.infer<typeof dialogueSchema>
export type MemoryConfig = z.infer<typeof memorySchema>
export type BehaviorConfig = z.infer<typeof behaviorSchema>
export type PersonaConfig = z.infer<typeof personaSchema>

/** Segredos, que vêm só do ambiente e nunca do YAML. */
export interface Secrets {
  geminiApiKey?: string
  minecraftPassword?: string
}
