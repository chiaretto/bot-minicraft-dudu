import { Ollama } from 'ollama'
import type { ReplyWithAction } from '../../domain/intent.js'
import { REPLY_WITH_ACTION_JSON_SCHEMA, parseReplyWithActionFromText } from '../../domain/intent.js'
import type { ConversationContext, LlmProvider, ProviderName } from '../provider.js'
import { ProviderError } from '../provider.js'
import { buildConversePrompt, historyMessages } from '../prompt.js'

export interface OllamaOptions {
  baseUrl: string
  model: string
  keepAlive: string
}

/** Único arquivo do projeto que conhece o Ollama. */
export class OllamaProvider implements LlmProvider {
  readonly name: ProviderName = 'ollama'
  private readonly client: Ollama

  constructor(private readonly options: OllamaOptions) {
    this.client = new Ollama({ host: options.baseUrl })
  }

  /** Traduz erro de rede/404 em mensagem com o comando de correção. */
  private wrap(err: unknown): ProviderError {
    const message = err instanceof Error ? err.message : String(err)

    if (/ECONNREFUSED|fetch failed|ENOTFOUND|ETIMEDOUT/i.test(message)) {
      return new ProviderError(
        `Ollama inacessível em ${this.options.baseUrl}`,
        'ollama',
        "rode 'ollama serve' (ou ajuste llm.ollama.baseUrl)",
      )
    }
    if (/not found|no such model|pull the model/i.test(message)) {
      return new ProviderError(
        `modelo '${this.options.model}' não encontrado`,
        'ollama',
        `rode 'ollama pull ${this.options.model}'`,
      )
    }
    return new ProviderError(`falha no Ollama: ${message}`, 'ollama')
  }

  async converse(ctx: ConversationContext, signal?: AbortSignal): Promise<ReplyWithAction> {
    try {
      const response = await this.client.chat({
        model: this.options.model,
        keep_alive: this.options.keepAlive,
        // Saída estruturada forçada por JSON Schema — mesmo contrato do Gemini.
        // É o que faz a fala e a ação virem da mesma chamada.
        format: REPLY_WITH_ACTION_JSON_SCHEMA as unknown as object,
        messages: [
          { role: 'system', content: buildConversePrompt(ctx) },
          ...historyMessages(ctx),
          { role: 'user', content: ctx.message },
        ],
        stream: false,
        // Teto maior que o da fala pura: o JSON em volta também ocupa tokens, e
        // cortar no meio perderia a ação junto com o resto do objeto.
        options: { temperature: 0.8, num_predict: 160 },
      })
      signal?.throwIfAborted()
      const parsed = parseReplyWithActionFromText(response.message.content)
      return { reply: cleanReply(parsed.reply), action: parsed.action }
    } catch (err) {
      throw this.wrap(err)
    }
  }

  /** Carrega o modelo na memória para a primeira conversa não pagar a recarga. */
  async warmUp(): Promise<void> {
    try {
      await this.client.chat({
        model: this.options.model,
        keep_alive: this.options.keepAlive,
        messages: [{ role: 'user', content: 'oi' }],
        stream: false,
        options: { num_predict: 1 },
      })
    } catch (err) {
      throw this.wrap(err)
    }
  }
}

/**
 * Tira o que não cabe no chat do jogo: blocos de raciocínio de modelos
 * "thinking", markdown e ação entre asteriscos.
 */
export function cleanReply(text: string): string {
  const clean = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\*[^*]*\*/g, '')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return trimToLastSentence(clean)
}

/**
 * Corta no fim da última frase completa.
 *
 * O teto de `num_predict` interrompe a geração no meio da palavra, e "o mundo
 * começ" chegando no chat de uma criança é pior que uma resposta mais curta.
 * Sem nenhuma frase fechada, devolve o texto como veio — melhor algo do que
 * nada.
 */
export function trimToLastSentence(text: string): string {
  if (!text) return text
  if (/[.!?…]$/.test(text)) return text

  const lastEnd = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'))
  if (lastEnd <= 0) return text
  return text.slice(0, lastEnd + 1)
}
