export interface BackoffOptions {
  initialDelayMs: number
  maxDelayMs: number
  maxAttempts: number
}

/**
 * Backoff exponencial com teto. Puro de propósito: a política de reconexão é
 * testável sem subir servidor nenhum.
 */
export class Backoff {
  private attempt = 0

  constructor(private readonly options: BackoffOptions) {}

  get attempts(): number {
    return this.attempt
  }

  get exhausted(): boolean {
    return this.attempt >= this.options.maxAttempts
  }

  /** Próximo atraso em ms, ou `null` quando o teto de tentativas estourou. */
  next(): number | null {
    if (this.exhausted) return null
    const delay = Math.min(this.options.initialDelayMs * 2 ** this.attempt, this.options.maxDelayMs)
    this.attempt++
    return delay
  }

  reset(): void {
    this.attempt = 0
  }
}

/**
 * Expulsão é decisão deliberada do servidor — reconectar seria insistir onde
 * não se é bem-vindo.
 * Ver: minecraft_connection_delta.md → "Bot expulso do servidor".
 */
export type DisconnectReason = 'end' | 'kicked' | 'error'

export function shouldReconnect(reason: DisconnectReason, enabled: boolean): boolean {
  if (!enabled) return false
  return reason !== 'kicked'
}
