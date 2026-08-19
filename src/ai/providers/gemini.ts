import { GoogleGenAI } from '@google/genai'
import type { ReplyWithAction } from '../../domain/intent.js'
import { REPLY_WITH_ACTION_JSON_SCHEMA, parseReplyWithActionFromText } from '../../domain/intent.js'
import type { ConversationContext, LlmProvider, ProviderName } from '../provider.js'
import { ProviderError } from '../provider.js'
import { buildConversePrompt, historyMessages } from '../prompt.js'
import { cleanReply } from './ollama.js'

export interface GeminiOptions {
  apiKey: string
  model: string
}

/** Único arquivo do projeto que conhece o Gemini. */
export class GeminiProvider implements LlmProvider {
  readonly name: ProviderName = 'gemini'
  private readonly client: GoogleGenAI

  constructor(private readonly options: GeminiOptions) {
    this.client = new GoogleGenAI({ apiKey: options.apiKey })
  }

  private wrap(err: unknown): ProviderError {
    const raw = err instanceof Error ? err.message : String(err)
    // A chave nunca pode vazar pela mensagem de erro da biblioteca.
    const message = raw.split(this.options.apiKey).join('[REDACTED]')

    if (/quota|rate limit|429/i.test(message)) {
      return new ProviderError('cota do Gemini esgotada', 'gemini', 'verifique o plano da API key')
    }
    if (/api key|401|403|permission/i.test(message)) {
      return new ProviderError(
        'chave do Gemini inválida',
        'gemini',
        'confira GEMINI_API_KEY no .env',
      )
    }
    return new ProviderError(`falha no Gemini: ${message}`, 'gemini')
  }

  async converse(ctx: ConversationContext, signal?: AbortSignal): Promise<ReplyWithAction> {
    try {
      const history = historyMessages(ctx).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

      const response = await this.client.models.generateContent({
        model: this.options.model,
        contents: [...history, { role: 'user', parts: [{ text: ctx.message }] }],
        config: {
          systemInstruction: buildConversePrompt(ctx),
          temperature: 0.8,
          maxOutputTokens: 320,
          // Fala e ação na mesma resposta — mesmo contrato do Ollama.
          responseMimeType: 'application/json',
          responseSchema: REPLY_WITH_ACTION_JSON_SCHEMA as unknown as Record<string, unknown>,
        },
      })
      signal?.throwIfAborted()
      const parsed = parseReplyWithActionFromText(response.text ?? '')
      return { reply: cleanReply(parsed.reply), action: parsed.action }
    } catch (err) {
      throw this.wrap(err)
    }
  }

  /** Provider de nuvem não tem modelo para carregar; nada a fazer. */
  async warmUp(): Promise<void> {}
}
