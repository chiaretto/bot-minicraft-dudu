import type { ReplyWithAction } from '../domain/intent.js'
import type { ConversationTurn, WorldSnapshot } from '../domain/types.js'

export type ProviderName = 'ollama' | 'gemini' | 'none'

export interface ConversationContext {
  /** Mensagem do jogador. */
  message: string
  owner: string
  botName: string
  originStory: string
  personaDescription: string
  snapshot: WorldSnapshot | null
  /** Janela curta — o ÚNICO histórico que sai daqui para o provider. */
  history: readonly ConversationTurn[]
}

/**
 * Interface única de inferência.
 *
 * Nenhum código fora de `src/ai/providers/` pode referenciar Ollama ou Gemini.
 * É o que mantém a troca de provider sendo uma linha de config.
 * Ver: llm_provider_delta.md → "Interface única de provider".
 */
export interface LlmProvider {
  readonly name: ProviderName
  /**
   * Uma chamada por mensagem: dela saem a fala **e** a ação.
   *
   * Não existe método separado de interpretação. O que havia nunca era
   * alcançado, e por isso a IA respondia sem o bot agir.
   * Ver: llm_provider_delta.md → "Interface única de provider".
   */
  converse(ctx: ConversationContext, signal?: AbortSignal): Promise<ReplyWithAction>
  warmUp(): Promise<void>
}

export class ProviderError extends Error {
  override name = 'ProviderError'
  constructor(
    message: string,
    readonly provider: ProviderName,
    readonly hint?: string,
  ) {
    super(message)
  }

  /** Mensagem pronta para o log, com o comando de correção quando existir. */
  toActionableMessage(): string {
    return this.hint ? `${this.message}\n  ${this.hint}` : this.message
  }
}
