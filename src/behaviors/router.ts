import type { Intent } from '../domain/intent.js'
import type { ConversationTurn, TurnSource, WorldSnapshot } from '../domain/types.js'
import type { Repertoire } from '../dialogue/repertoire.js'
import type { AiLayer } from '../ai/index.js'
import type { ConversationContext } from '../ai/provider.js'
import { parseCommand } from './commands.js'
import type { PersonaConfig } from '../config/schema.js'

export interface RouteResult {
  /** O que o bot vai falar no chat, se for falar algo. */
  reply: string | null
  /** Intenção a executar, quando a mensagem era um comando. */
  intent: Intent | null
  /**
   * Ação proposta pela IA junto com a fala, já validada.
   * Ver: ai_companion_delta.md → "Resposta da IA carrega a ação".
   */
  action: Intent | null
  source: TurnSource
  entryId?: string
  provider?: string
  latencyMs?: number
}

export interface RouterDeps {
  repertoire: Repertoire
  ai: AiLayer
  persona: PersonaConfig
  owner: string
  /** Emite a fala de espera quando a IA demora. */
  onFiller: (text: string) => void
  fillerAfterMs: number
  history: () => readonly ConversationTurn[]
  schedule?: (fn: () => void, ms: number) => { cancel: () => void }
}

function defaultSchedule(fn: () => void, ms: number): { cancel: () => void } {
  const timer = setTimeout(fn, ms)
  return { cancel: () => clearTimeout(timer) }
}

/**
 * Cascata de resolução: comando → repertório → IA.
 *
 * Cada nível só passa adiante o que não conseguiu resolver. A IA é o último
 * recurso, nunca o primeiro — é o que mantém o bot utilizável (e barato) com
 * o provider fora do ar.
 * Ver: local_dialogue_delta.md → "Cascata de resolução de mensagens".
 */
export class MessageRouter {
  private readonly schedule: (fn: () => void, ms: number) => { cancel: () => void }

  constructor(private readonly deps: RouterDeps) {
    this.schedule = deps.schedule ?? defaultSchedule
  }

  private context(message: string, snapshot: WorldSnapshot | null): ConversationContext {
    return {
      message,
      owner: this.deps.owner,
      botName: this.deps.persona.name,
      originStory: this.deps.persona.originStory,
      personaDescription: this.deps.persona.description,
      snapshot,
      history: this.deps.history(),
    }
  }

  async route(text: string, snapshot: WorldSnapshot | null): Promise<RouteResult> {
    // ── Nível 1: comando determinístico ──────────────────────────────────
    const command = parseCommand(text, this.deps.persona.name)
    if (command) {
      return { reply: null, intent: command.intent, action: null, source: 'command' }
    }

    // ── Nível 2: repertório local ────────────────────────────────────────
    const local = this.deps.repertoire.respond(text, snapshot)
    if (local) {
      return {
        reply: local.text,
        intent: null,
        action: null,
        source: 'repertoire',
        entryId: local.entryId,
      }
    }

    // ── Nível 3: IA ──────────────────────────────────────────────────────
    if (!this.deps.ai.enabled) {
      return this.fallbackReply(snapshot)
    }

    const ctx = this.context(text, snapshot)

    // Fala de espera: o modelo local na mesma máquina do jogo é lento, e sem
    // isso o bot parece travado.
    const filler = this.schedule(() => {
      const waiting = this.deps.repertoire.say('espera', snapshot)
      if (waiting) this.deps.onFiller(waiting.text)
    }, this.deps.fillerAfterMs)

    try {
      const result = await this.deps.ai.converse(ctx)
      if (result === null) return this.fallbackReply(snapshot)
      return {
        reply: result.value.reply,
        intent: null,
        action: result.value.action,
        source: 'llm',
        provider: result.provider,
        latencyMs: result.latencyMs,
      }
    } finally {
      filler.cancel()
    }
  }

  /** Última linha de defesa: nem comando, nem repertório, nem IA resolveram. */
  private fallbackReply(snapshot: WorldSnapshot | null): RouteResult {
    const entry = this.deps.repertoire.say('nao_entendi', snapshot)
    return {
      reply: entry?.text ?? null,
      intent: null,
      action: null,
      source: 'repertoire',
      ...(entry ? { entryId: entry.entryId } : {}),
    }
  }
}
