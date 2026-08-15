import type { Intent } from '../../domain/intent.js'
import { UNKNOWN_INTENT } from '../../domain/intent.js'
import type { ConversationContext, LlmProvider, ProviderName } from '../provider.js'
import { ProviderError } from '../provider.js'

/**
 * Provider nulo: desativa o nível 3 da cascata.
 *
 * Com ele o bot roda só com comandos e repertório — sem Ollama, sem chave,
 * sem internet. Ver: llm_provider_delta.md → "Bot totalmente sem IA".
 */
export class NoneProvider implements LlmProvider {
  readonly name: ProviderName = 'none'

  async converse(_ctx: ConversationContext): Promise<string> {
    throw new ProviderError('IA desativada (llm.provider: "none")', 'none')
  }

  async interpret(_text: string, _ctx: ConversationContext): Promise<Intent> {
    return UNKNOWN_INTENT
  }

  async warmUp(): Promise<void> {}
}
