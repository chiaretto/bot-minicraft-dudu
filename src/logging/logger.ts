import { pino, type Logger } from 'pino'

/**
 * Caminhos redigidos no log. Nenhum segredo pode vazar para stdout nem para
 * mensagem de erro. Ver: configuration_delta.md → "Segredos".
 */
export const REDACT_PATHS = [
  'geminiApiKey',
  'apiKey',
  'password',
  'senha',
  'secrets.geminiApiKey',
  'secrets.minecraftPassword',
  'minecraftPassword',
  '*.geminiApiKey',
  '*.apiKey',
  '*.password',
  '*.minecraftPassword',
  'GEMINI_API_KEY',
  'MINECRAFT_PASSWORD',
]

export function createLogger(level = 'info'): Logger {
  return pino({
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    transport:
      process.env.NODE_ENV === 'production'
        ? undefined
        : { target: 'pino/file', options: { destination: 1 } },
  })
}

/**
 * Remove qualquer ocorrência literal de um segredo de uma string.
 * Rede de segurança para o caso de um segredo entrar no corpo de uma mensagem
 * de erro de biblioteca de terceiro, onde o redact por caminho não alcança.
 */
export function scrubSecrets(text: string, secrets: readonly (string | undefined)[]): string {
  let out = text
  for (const secret of secrets) {
    if (secret && secret.length >= 8) {
      out = out.split(secret).join('[REDACTED]')
    }
  }
  return out
}

export type { Logger }
