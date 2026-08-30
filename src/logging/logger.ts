import { pino, multistream, type Logger } from 'pino'
import { DailyFileStream } from './file-stream.js'

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

export interface LoggerOptions {
  level?: string
  /**
   * Pasta do log em arquivo. `null` desliga e o log vai só para o `stdout`,
   * como era antes.
   */
  fileDir?: string | null
}

/**
 * Cria o logger da aplicação.
 *
 * Quando há pasta de arquivo, o log sai nos **dois** lugares: `stdout`, que é
 * o que o aplicativo de desktop mostra em "Coisas de adulto", e um arquivo por
 * dia, que é o que sobra depois que a janela fecha.
 *
 * O `redact` continua valendo para os dois destinos — segredo que não pode
 * aparecer no terminal também não pode ficar gravado em disco.
 * Ver: startup_console_delta.md → "Log da aplicação em arquivo".
 */
export function createLogger(options: LoggerOptions | string = {}): Logger {
  // Assinatura antiga (`createLogger('debug')`) continua valendo.
  const opts: LoggerOptions = typeof options === 'string' ? { level: options } : options
  const level = opts.level ?? 'info'
  const config = { level, redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }

  if (!opts.fileDir) {
    return pino({
      ...config,
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino/file', options: { destination: 1 } },
    })
  }

  const arquivo = new DailyFileStream({
    dir: opts.fileDir,
    // Falha de log nunca derruba o bot, e nunca vira erro de log: avisar sobre
    // o log pelo próprio log seria laço.
    onError: () => {},
  })

  return pino(config, multistream([{ stream: process.stdout }, { stream: arquivo }]))
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
