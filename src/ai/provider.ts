import type { ReplyWithAction } from '../domain/intent.js'
import type { ConversationTurn, WorldSnapshot } from '../domain/types.js'

export type ProviderName = 'ollama' | 'gemini' | 'claude' | 'none'

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
 * Nenhum código fora de `src/ai/providers/` pode referenciar Ollama, Gemini ou
 * o Agent SDK do Claude Code.
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
  /**
   * Prepara o provider antes da primeira fala.
   *
   * `identity` traz persona e nome — o suficiente para montar a parte estática
   * do prompt sem o bot estar no mundo. Só o provider Claude Code usa: a sessão
   * dele fixa o system prompt na criação, então aquecer sem identidade
   * significaria descartar o que foi aquecido.
   */
  warmUp(identity?: ConversationContext): Promise<void>
  /**
   * Solta o que o provider segura, no encerramento do bot.
   *
   * Opcional porque quase nenhum provider tem o que soltar: Ollama e Gemini são
   * sem estado, cada chamada é independente. Existe para o Claude Code, que
   * mantém um subprocesso vivo — sem isto ele fica órfão quando o bot fecha.
   */
  stop?(): void
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
