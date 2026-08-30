import type { ReplyWithAction } from '../domain/intent.js'
import type { ConversationContext, LlmProvider, ProviderName } from './provider.js'

export class CircuitOpenError extends Error {
  override name = 'CircuitOpenError'
}
export class RateLimitError extends Error {
  override name = 'RateLimitError'
}
export class TimeoutError extends Error {
  override name = 'TimeoutError'
}
export class BusyError extends Error {
  override name = 'BusyError'
}

export interface ResilienceOptions {
  timeoutMs: number
  circuitBreakerThreshold: number
  circuitBreakerResetMs: number
  maxCallsPerMinute: number
  queueBehavior: 'queue' | 'repertoire'
  now?: () => number
  onStateChange?: (open: boolean) => void
}

/**
 * Timeout + circuit breaker + rate limit + serialização, aplicados sobre
 * QUALQUER provider.
 *
 * Escrito uma vez de propósito: duplicar isso em cada provider é como as duas
 * implementações acabam divergindo em comportamento de falha.
 * Ver: llm_provider_delta.md → "Resiliência compartilhada entre providers".
 */
export class ResilientProvider implements LlmProvider {
  readonly name: ProviderName

  private consecutiveFailures = 0
  private openedAt: number | null = null
  private callTimestamps: number[] = []
  private inFlight = false
  private readonly now: () => number

  constructor(
    private readonly inner: LlmProvider,
    private readonly options: ResilienceOptions,
  ) {
    this.name = inner.name
    this.now = options.now ?? (() => Date.now())
  }

  get isCircuitOpen(): boolean {
    if (this.openedAt === null) return false
    if (this.now() - this.openedAt >= this.options.circuitBreakerResetMs) {
      // Meia-volta: expira o circuito e deixa a próxima chamada tentar.
      this.openedAt = null
      this.consecutiveFailures = 0
      this.options.onStateChange?.(false)
      return false
    }
    return true
  }

  get busy(): boolean {
    return this.inFlight
  }

  private checkRateLimit(): void {
    const cutoff = this.now() - 60_000
    this.callTimestamps = this.callTimestamps.filter((t) => t > cutoff)
    if (this.callTimestamps.length >= this.options.maxCallsPerMinute) {
      throw new RateLimitError('limite de chamadas por minuto atingido')
    }
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0
    this.openedAt = null
  }

  private recordFailure(): void {
    this.consecutiveFailures++
    if (
      this.consecutiveFailures >= this.options.circuitBreakerThreshold &&
      this.openedAt === null
    ) {
      this.openedAt = this.now()
      this.options.onStateChange?.(true)
    }
  }

  private async guard<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.isCircuitOpen) throw new CircuitOpenError('circuito aberto após falhas seguidas')

    // Nunca duas inferências ao mesmo tempo: na mesma máquina do Minecraft,
    // duas gerações concorrentes engasgam o jogo.
    if (this.inFlight) throw new BusyError('já existe uma inferência em andamento')

    this.checkRateLimit()

    const controller = new AbortController()
    this.inFlight = true
    this.callTimestamps.push(this.now())

    // O prazo é imposto AQUI, correndo contra a promise interna. Delegar o
    // corte ao provider só funcionaria se ele honrasse o AbortSignal — e um
    // modelo local lento é justamente o caso em que ele não honra.
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(
          new TimeoutError(`provider ${this.name} não respondeu em ${this.options.timeoutMs}ms`),
        )
      }, this.options.timeoutMs)
    })

    try {
      const result = await Promise.race([fn(controller.signal), deadline])
      this.recordSuccess()
      return result
    } catch (err) {
      this.recordFailure()
      if (err instanceof TimeoutError) throw err
      if (controller.signal.aborted) {
        throw new TimeoutError(`provider ${this.name} não respondeu em ${this.options.timeoutMs}ms`)
      }
      throw err
    } finally {
      clearTimeout(timer)
      this.inFlight = false
    }
  }

  async converse(ctx: ConversationContext): Promise<ReplyWithAction> {
    return this.guard((signal) => this.inner.converse(ctx, signal))
  }

  async warmUp(identity?: ConversationContext): Promise<void> {
    return this.inner.warmUp(identity)
  }

  /** Repassa o encerramento ao provider de baixo, quando ele tem o que soltar. */
  stop(): void {
    this.inner.stop?.()
  }
}
