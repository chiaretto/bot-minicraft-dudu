import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import { Writable } from 'node:stream'

/**
 * Destino de log em arquivo, um por dia.
 *
 * O log da aplicação ia só para o `stdout`. Quando o bot sobe pelo aplicativo
 * de desktop, esse stdout aparece em "Coisas de adulto" — mas some quando a
 * janela fecha, e quem diz "não funcionou" no dia seguinte não tem o que
 * mostrar.
 *
 * O dia é decidido **a cada escrita**, não na abertura: uma sessão que começa
 * às 23h50 e vai até de madrugada precisa trocar de arquivo sozinha, como já
 * faz o histórico de conversa.
 * Ver: startup_console_delta.md → "Log da aplicação em arquivo".
 */

/** `AAAA-MM-DD` no fuso local — o mesmo formato do histórico de conversa. */
export function localDateKey(date: Date): string {
  const ano = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export function logFilePath(dir: string, date: Date): string {
  return join(dir, `${localDateKey(date)}.log`)
}

export interface DailyFileOptions {
  dir: string
  now?: () => Date
  /** Chamado quando a escrita falha. Log em arquivo nunca derruba o bot. */
  onError?: (err: Error) => void
}

/**
 * Stream que escreve no arquivo do dia, trocando de arquivo à meia-noite.
 *
 * Falha de escrita é engolida de propósito: disco cheio, pasta sem permissão ou
 * arquivo travado por outro processo não podem derrubar um bot que está no meio
 * de uma brincadeira. No pior caso, o log daquele momento se perde — o stdout
 * continua lá.
 */
export class DailyFileStream extends Writable {
  private current: { key: string; stream: WriteStream } | null = null
  private readonly now: () => Date

  constructor(private readonly options: DailyFileOptions) {
    super({ decodeStrings: false })
    this.now = options.now ?? (() => new Date())
  }

  override _write(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      this.streamForToday().write(chunk)
    } catch (err) {
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
    // Sempre `null`: um erro devolvido aqui derrubaria o pino junto.
    callback(null)
  }

  override _final(callback: (error?: Error | null) => void): void {
    const aberto = this.current
    this.current = null
    if (!aberto) return callback(null)
    // Esperar o `end` de verdade: sem isso, quem fecha o stream pode ler o
    // arquivo antes de o conteúdo chegar ao disco.
    aberto.stream.end(() => callback(null))
  }

  private streamForToday(): WriteStream {
    const key = localDateKey(this.now())
    if (this.current?.key === key) return this.current.stream

    this.current?.stream.end()
    mkdirSync(this.options.dir, { recursive: true })

    const stream = createWriteStream(logFilePath(this.options.dir, this.now()), { flags: 'a' })
    // O erro do stream tem que ser tratado: `error` sem ouvinte derruba o Node.
    stream.on('error', (err) => this.options.onError?.(err))

    this.current = { key, stream }
    return stream
  }
}
