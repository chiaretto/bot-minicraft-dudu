import { query, type Options, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { ReplyWithAction } from '../../domain/intent.js'
import {
  REPLY_WITH_ACTION_JSON_SCHEMA,
  parseReplyWithActionFromText,
  validateReplyWithAction,
} from '../../domain/intent.js'
import type { ConversationContext, LlmProvider, ProviderName } from '../provider.js'
import { ProviderError } from '../provider.js'
import { staticPrompt, worldBlock } from '../prompt.js'
import { cleanReply } from './ollama.js'

export interface ClaudeOptions {
  model: string
  sessionMaxAgeMs: number
  sessionMaxTurns: number
}

/**
 * Único arquivo do projeto que conhece o Agent SDK do Claude Code.
 *
 * ## Por que o Agent SDK, sendo ele o caminho mais lento
 *
 * O Agent SDK é o Claude Code empacotado como biblioteca: loop de agente,
 * ferramentas de arquivo e bash, subagentes. Para responder "oi" no chat do
 * Minecraft **nada disso serve**. A rota rápida seria a Messages API — e ela
 * está fora porque só aceita chave de API cobrada por token. A credencial aqui é
 * a da **assinatura** (`claude setup-token`), e o único caminho que a aceita é
 * este.
 *
 * Aceito isso, o trabalho vira **tirar do caminho tudo que o harness carrega e o
 * bot não usa** — é o que `sessionOptions()` faz, item por item.
 *
 * ## O gargalo é o processo, não o modelo
 *
 * O SDK sobe um subprocesso. Medido na fase 0 desta mudança:
 *
 * ```
 * subida do processo   ~4900 ms   ← pago UMA vez, no warmUp()
 * fala com sessão viva ~1400 ms
 * ```
 *
 * Pagar a subida a cada fala dominaria qualquer ganho de escolher Haiku. Por
 * isso este é o primeiro provider do projeto **com estado**: uma sessão viva,
 * subida no `warmUp()` e reaproveitada entre falas.
 * Ver: llm_provider_delta.md → "Sessão viva".
 */
export class ClaudeProvider implements LlmProvider {
  readonly name: ProviderName = 'claude'

  private session: Session | null = null

  constructor(private readonly options: ClaudeOptions) {}

  async converse(ctx: ConversationContext, signal?: AbortSignal): Promise<ReplyWithAction> {
    // Uma tentativa de recuperação: sessão pode ter morrido entre uma fala e
    // outra sem ninguém avisar. Duas tentativas seriam o dobro da espera da
    // criança para um problema que a segunda dificilmente resolve.
    try {
      return await this.ask(ctx, signal)
    } catch (err) {
      if (signal?.aborted) throw this.wrap(err)
      this.discard()
      try {
        return await this.ask(ctx, signal)
      } catch (retryErr) {
        throw this.wrap(retryErr)
      }
    }
  }

  /**
   * Paga a subida do subprocesso longe da criança.
   *
   * Duas coisas descobertas medindo, e as duas moldaram este método:
   *
   * 1. **`query()` é preguiçoso.** Criar a sessão não sobe processo nenhum — o
   *    spawn só acontece na primeira mensagem. Uma sessão criada e deixada
   *    quieta não aquece nada, e a criança continuava pagando os ~10 s. Por isso
   *    a fala de mentira abaixo: é ela que força a subida.
   * 2. **A sessão aquecida precisa ser a de verdade.** O system prompt é fixado
   *    na criação, então uma sessão aquecida com prompt genérico e depois
   *    descartada joga o aquecimento fora — a sessão real nasceria fria. É por
   *    isso que este método recebe a identidade do bot: com ela dá para montar o
   *    prompt estático definitivo e guardar a sessão para a primeira fala.
   *
   * Sem identidade não há o que aquecer, e o método não faz nada — a sessão
   * nasce na primeira fala, como nasceria de qualquer forma.
   */
  async warmUp(identity?: ConversationContext): Promise<void> {
    if (!identity || this.session) return
    const session = Session.open(this.sessionOptions(identity))
    try {
      await session.ask('oi')
      this.session = session
    } catch (err) {
      session.close()
      throw this.wrap(err)
    }
  }

  /** Encerra a sessão. Sem isto sobra subprocesso órfão ao fechar o bot. */
  stop(): void {
    this.discard()
  }

  private async ask(ctx: ConversationContext, signal?: AbortSignal): Promise<ReplyWithAction> {
    const session = await this.liveSession(ctx)
    const raw = await session.ask(promptFor(ctx), signal)
    signal?.throwIfAborted()

    // A resposta estruturada é o caminho normal. O texto é a rede: um JSON que
    // não veio não pode virar erro no chat da criança — vira fala sem ação.
    const parsed =
      raw.structured !== undefined && raw.structured !== null
        ? validateReplyWithAction(raw.structured)
        : parseReplyWithActionFromText(raw.text)

    return { reply: cleanReply(parsed.reply), action: parsed.action }
  }

  /**
   * Devolve uma sessão utilizável, reciclando a atual quando ela envelheceu.
   *
   * Sessão viva acumula contexto: numa tarde longa de brincadeira isso cresce
   * sem fim. O histórico curto do projeto continua sendo a fonte da verdade da
   * conversa, então reciclar não perde nada que importe.
   */
  private async liveSession(ctx: ConversationContext): Promise<Session> {
    if (this.session && this.session.isStale(this.options)) this.discard()
    if (!this.session) this.session = this.openSession(ctx)
    return this.session
  }

  private openSession(ctx: ConversationContext): Session {
    return Session.open(this.sessionOptions(ctx))
  }

  private discard(): void {
    this.session?.close()
    this.session = null
  }

  /**
   * O regime de escopo mínimo.
   *
   * Cada linha aqui corta latência ou token, e **todas são obrigatórias**:
   * esquecer uma devolve o harness inteiro, e o sintoma é a lentidão que este
   * provider existe para evitar.
   * Ver: llm_provider_delta.md → "Escopo mínimo do harness".
   */
  private sessionOptions(ctx: ConversationContext): Options {
    return {
      model: this.options.model,

      // O prompt é o do bot, com a persona e a regra número um — não o preset de
      // agente de código do Claude Code, que são milhares de tokens inúteis aqui.
      //
      // Só a parte ESTÁTICA: o system prompt é fixado na criação da sessão, e o
      // estado do mundo muda a cada fala. O mundo vai na mensagem, em
      // `promptFor()`. Antes disso o bot passava a sessão inteira com o mundo do
      // momento em que ela nasceu.
      systemPrompt: staticPrompt(ctx),

      // Zera Read/Write/Edit/Bash/Glob/Grep/WebSearch/WebFetch.
      // NÃO confundir com `allowedTools`, que é lista de auto-aprovação: ela já
      // é vazia por padrão e mesmo assim deixa a ferramenta no contexto.
      // Isto aqui não é performance, é arquitetura: a IA deste projeto NUNCA
      // executa efeito direto — ela devolve intenção que passa por validação.
      tools: [],

      // Sem isto o SDK lê `~/.claude/settings.json`, `.claude/settings.json` e o
      // `CLAUDE.md` do projeto. O `CLAUDE.md` deste repositório é grande, e
      // entraria como prompt em TODA fala da criança.
      settingSources: [],
      mcpServers: {},

      // Raciocínio é latência, e a tarefa é uma frase curta para uma criança.
      thinking: { type: 'disabled' },

      // Trava defensiva: sem ferramenta não existe loop de agente a limitar.
      //
      // DOIS, não um: o SDK conta a fala do jogador E a resposta do bot como
      // turnos separados, então `1` estoura em `error_max_turns` — o que
      // derrubava o aquecimento e, de vez em quando, uma fala no meio da
      // conversa (custando a subida de uma sessão nova).
      maxTurns: 2,

      // Mesmo contrato dos outros providers: fala e ação numa resposta só.
      outputFormat: {
        type: 'json_schema',
        schema: NULLABLE_ACTION_SCHEMA,
      },

      // O stderr do subprocesso não pode poluir o terminal de quem subiu o bot.
      stderr: () => {},
    } as Options
  }

  private wrap(err: unknown): ProviderError {
    const message = redact(err instanceof Error ? err.message : String(err))

    if (/quota|rate limit|usage limit|429/i.test(message)) {
      return new ProviderError(
        'cota do Claude esgotada',
        'claude',
        'a cota é a da sua assinatura, compartilhada com o Claude Code do dia a dia',
      )
    }
    if (/auth|401|403|login|credential|token/i.test(message)) {
      return new ProviderError(
        'credencial do Claude inválida',
        'claude',
        'rode: claude setup-token (ou confira CLAUDE_CODE_OAUTH_TOKEN no .env)',
      )
    }
    return new ProviderError(`falha no Claude: ${message}`, 'claude')
  }
}

/**
 * O schema do projeto, com `action` explicitamente anulável.
 *
 * O compartilhado declara `action` como objeto com `type` obrigatório. Isso
 * **contradiz o prompt**, que manda responder `"action": null` quando não há
 * ação. Ollama e Gemini toleram a contradição omitindo o campo; a saída
 * estruturada daqui é estrita e não consegue emitir `null` — então o modelo
 * escolhe uma ação válida qualquer só para preencher o campo.
 *
 * Foi assim que "ataca aquele bicho" passou a devolver `STOP`: pedido sem ação
 * disponível, campo que não aceita vazio, e o `STOP` cancelaria justamente o que
 * a criança tinha mandado fazer.
 */
const NULLABLE_ACTION_SCHEMA: Record<string, unknown> = {
  ...REPLY_WITH_ACTION_JSON_SCHEMA,
  properties: {
    ...REPLY_WITH_ACTION_JSON_SCHEMA.properties,
    action: { ...REPLY_WITH_ACTION_JSON_SCHEMA.properties.action, type: ['object', 'null'] },
  },
}

/**
 * Esconde qualquer coisa com cara de credencial.
 *
 * A mensagem de erro do SDK pode carregar o token; ela vai para o log, e log de
 * bot fica aberto na tela. Mesmo cuidado que o `GeminiProvider` tem com a chave.
 */
function redact(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[REDACTED]')
}

/** A fala e o histórico curto viram uma mensagem só para a sessão. */
function promptFor(ctx: ConversationContext): string {
  const history = ctx.history
    .filter((turn) => turn.text.trim().length > 0)
    .map((turn) => `${turn.speaker}: ${turn.text}`)

  // O mundo vai em TODA fala: o system prompt da sessão é fixado na criação e
  // envelheceria junto com ela — o bot ficaria respondendo sobre a noite que já
  // virou dia. O histórico vai junto para a sessão reciclada não soar amnésica.
  const partes = [worldBlock(ctx)]
  if (history.length > 0) partes.push(`## Conversa até agora\n${history.join('\n')}`)
  partes.push(`${ctx.owner}: ${ctx.message}`)
  return partes.join('\n\n')
}

interface RawAnswer {
  text: string
  structured: unknown
}

/**
 * Uma sessão viva do Agent SDK.
 *
 * O SDK mantém a sessão enquanto o `AsyncIterable` de entrada não terminar — é
 * por isso que a fila abaixo nunca fecha sozinha. Fechar o iterador é o que
 * derruba o subprocesso, e é o que `close()` faz.
 */
class Session {
  private turns = 0
  private readonly bornAt = Date.now()
  private closed = false

  private constructor(
    private readonly stream: Query,
    private readonly input: InputQueue,
  ) {}

  static open(options: Options): Session {
    const input = new InputQueue()
    const stream = query({ prompt: input.iterable(), options })
    return new Session(stream, input)
  }

  isStale(limits: { sessionMaxAgeMs: number; sessionMaxTurns: number }): boolean {
    return (
      this.closed ||
      this.turns >= limits.sessionMaxTurns ||
      Date.now() - this.bornAt >= limits.sessionMaxAgeMs
    )
  }

  /** Manda uma fala e espera o `result` daquele turno. */
  async ask(text: string, signal?: AbortSignal): Promise<RawAnswer> {
    if (this.closed) throw new Error('sessão encerrada')
    this.turns++
    this.input.push(text)

    for (;;) {
      const next = await this.stream.next()
      if (next.done) {
        this.closed = true
        throw new Error('a sessão terminou sem responder')
      }
      signal?.throwIfAborted()

      const msg = next.value as { type?: string; subtype?: string } & Record<string, unknown>
      if (msg.type !== 'result') continue

      if (msg.subtype !== 'success' || msg.is_error === true) {
        throw new Error(String(msg.subtype ?? 'erro desconhecido'))
      }
      return {
        text: typeof msg.result === 'string' ? msg.result : '',
        structured: msg.structured_output,
      }
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.input.end()
    // O SDK encerra o subprocesso quando o gerador é descartado.
    void this.stream.return?.(undefined)
  }
}

/**
 * Fila que vira `AsyncIterable`: é o que mantém a sessão de pé.
 *
 * Um `AsyncIterable` que termina encerra a sessão, então este só termina quando
 * alguém chama `end()` — no encerramento do bot ou numa reciclagem.
 */
class InputQueue {
  private readonly pending: SDKUserMessage[] = []
  private readonly waiting: Array<(msg: IteratorResult<SDKUserMessage>) => void> = []
  private ended = false

  push(text: string): void {
    const msg = {
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      session_id: '',
    } as unknown as SDKUserMessage

    const waiter = this.waiting.shift()
    if (waiter) waiter({ value: msg, done: false })
    else this.pending.push(msg)
  }

  end(): void {
    this.ended = true
    let waiter = this.waiting.shift()
    while (waiter) {
      waiter({ value: undefined as never, done: true })
      waiter = this.waiting.shift()
    }
  }

  async *iterable(): AsyncGenerator<SDKUserMessage> {
    for (;;) {
      if (this.ended) return
      const next = this.pending.shift()
      if (next) {
        yield next
        continue
      }
      const awaited = await new Promise<IteratorResult<SDKUserMessage>>((resolve) =>
        this.waiting.push(resolve),
      )
      if (awaited.done) return
      yield awaited.value
    }
  }
}
