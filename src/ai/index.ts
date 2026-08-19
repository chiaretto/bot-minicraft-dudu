import type { LlmConfig } from '../config/schema.js'
import type { Secrets } from '../config/schema.js'
import type { ReplyWithAction } from '../domain/intent.js'
import type { ConversationContext, LlmProvider, ProviderName } from './provider.js'
import { ProviderError } from './provider.js'
import { ResilientProvider, BusyError, CircuitOpenError, RateLimitError } from './resilient.js'
import { OllamaProvider } from './providers/ollama.js'
import { GeminiProvider } from './providers/gemini.js'
import { NoneProvider } from './providers/none.js'

export * from './provider.js'
export * from './resilient.js'
export {
  buildConversePrompt,
  identityFacts,
  ACTION_DESCRIPTIONS,
  ACTIONABLE_INTENTS,
} from './prompt.js'

export interface AiDeps {
  llm: LlmConfig
  secrets: Secrets
  now?: () => number
  onCircuitChange?: (provider: ProviderName, open: boolean) => void
}

function buildRaw(name: ProviderName, llm: LlmConfig, secrets: Secrets): LlmProvider {
  switch (name) {
    case 'ollama':
      return new OllamaProvider({
        baseUrl: llm.ollama.baseUrl,
        model: llm.ollama.model,
        keepAlive: llm.ollama.keepAlive,
      })
    case 'gemini':
      return new GeminiProvider({
        // A ausência da chave já foi barrada na validação de config.
        apiKey: secrets.geminiApiKey ?? '',
        model: llm.gemini.model,
      })
    case 'none':
      return new NoneProvider()
  }
}

function timeoutFor(name: ProviderName, llm: LlmConfig): number {
  if (name === 'ollama') return llm.ollama.timeoutMs
  if (name === 'gemini') return llm.gemini.timeoutMs
  return 1000
}

export function wrapWithResilience(
  provider: LlmProvider,
  llm: LlmConfig,
  deps: Pick<AiDeps, 'now' | 'onCircuitChange'> = {},
): ResilientProvider {
  return new ResilientProvider(provider, {
    timeoutMs: timeoutFor(provider.name, llm),
    circuitBreakerThreshold: llm.circuitBreakerThreshold,
    circuitBreakerResetMs: llm.circuitBreakerResetMs,
    maxCallsPerMinute: llm.maxCallsPerMinute,
    queueBehavior: llm.queueBehavior,
    ...(deps.now ? { now: deps.now } : {}),
    onStateChange: (open) => deps.onCircuitChange?.(provider.name, open),
  })
}

export interface AiResult<T> {
  value: T
  provider: ProviderName
  latencyMs: number
}

/**
 * Nível 3 da cascata, com fallback opcional entre providers.
 *
 * `converse` NUNCA lança por falha de IA: devolve `null` para o roteador cair
 * no repertório. A camada de cima não precisa saber por que a IA falhou, só
 * que falhou.
 *
 * Uma mensagem custa UMA chamada: dela saem a fala e a ação.
 */
export class AiLayer {
  readonly primary: ResilientProvider
  readonly fallback: ResilientProvider | null
  private readonly now: () => number

  constructor(private readonly deps: AiDeps) {
    this.now = deps.now ?? (() => Date.now())
    this.primary = wrapWithResilience(
      buildRaw(deps.llm.provider, deps.llm, deps.secrets),
      deps.llm,
      deps,
    )
    this.fallback =
      deps.llm.fallbackProvider !== null
        ? wrapWithResilience(
            buildRaw(deps.llm.fallbackProvider, deps.llm, deps.secrets),
            deps.llm,
            deps,
          )
        : null
  }

  get enabled(): boolean {
    return this.deps.llm.provider !== 'none'
  }

  get busy(): boolean {
    return this.primary.busy
  }

  /**
   * `true` quando o primário é local e o reserva é de nuvem — nesse arranjo,
   * a mensagem do jogador PASSA A SAIR da máquina quando o local falha.
   */
  get leaksToCloudOnFallback(): boolean {
    return this.deps.llm.provider === 'ollama' && this.deps.llm.fallbackProvider === 'gemini'
  }

  private async attempt<T>(
    fn: (p: ResilientProvider) => Promise<T>,
    onFallback?: (err: unknown) => void,
  ): Promise<AiResult<T> | null> {
    const started = this.now()
    try {
      const value = await fn(this.primary)
      return { value, provider: this.primary.name, latencyMs: this.now() - started }
    } catch (err) {
      if (err instanceof BusyError) return null
      if (this.fallback === null) return null

      onFallback?.(err)
      try {
        const value = await fn(this.fallback)
        return { value, provider: this.fallback.name, latencyMs: this.now() - started }
      } catch {
        return null
      }
    }
  }

  async converse(
    ctx: ConversationContext,
    onFallback?: (err: unknown) => void,
  ): Promise<AiResult<ReplyWithAction> | null> {
    if (!this.enabled) return null
    const result = await this.attempt((p) => p.converse(ctx), onFallback)
    if (result === null) return null
    // Fala vazia com ação é resposta legítima: o bot age sem falar nada.
    if (result.value.reply.trim() === '' && result.value.action === null) return null
    return result
  }

  /**
   * Aquece o modelo. Falha aqui NUNCA impede o bot de iniciar: ele apenas
   * opera pelos níveis 1 e 2 até a IA voltar.
   */
  async warmUp(): Promise<ProviderError | null> {
    if (!this.enabled || !this.deps.llm.warmUpOnStart) return null
    try {
      await this.primary.warmUp()
      return null
    } catch (err) {
      return err instanceof ProviderError ? err : new ProviderError(String(err), this.primary.name)
    }
  }
}

export { BusyError, CircuitOpenError, RateLimitError }
