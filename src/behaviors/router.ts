import type { Intent } from '../domain/intent.js'
import type { ConversationTurn, TurnSource, WorldSnapshot } from '../domain/types.js'
import type { Repertoire } from '../dialogue/repertoire.js'
import type { AiLayer } from '../ai/index.js'
import type { ConversationContext } from '../ai/provider.js'
import { parseCommand } from './commands.js'
import type { LearnedMatch } from '../dialogue/learned.js'
import type { PersonaConfig } from '../config/schema.js'

/** Entrada do repertório que dá a fala do replay de comando aprendido. */
const LEARNED_ENTRY = 'comando_aprendido'

/**
 * O que o roteador precisa do histórico de comandos aprendidos.
 *
 * Interface estreita de propósito, como o `GameWorld` das brincadeiras: o
 * roteador não sabe de arquivo, de teto de entradas nem de escrita atômica.
 */
export interface LearnedLookup {
  find(text: string): LearnedMatch | null
}

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
  /**
   * Frase do histórico que casou, quando a resposta veio do nível 1.5.
   * É por ela que `app/` conta o uso e desaprende no `para`.
   */
  learnedPhrase?: string
}

export interface RouterDeps {
  repertoire: Repertoire
  /** `null` desliga o nível 1.5 e devolve a cascata de três níveis. */
  learned?: LearnedLookup | null
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
 * Cascata de resolução: comando → comando aprendido → repertório → IA.
 *
 * Cada nível só passa adiante o que não conseguiu resolver. A IA é o último
 * recurso, nunca o primeiro — é o que mantém o bot utilizável (e barato) com
 * o provider fora do ar.
 *
 * O nível 1.5 (aprendidos) vem antes do repertório porque produz AÇÃO, e ação
 * tem precedência sobre conversa — o mesmo motivo que põe o parser de regex na
 * frente de tudo. E vem DEPOIS do parser porque o que um humano escreveu vale
 * mais que o que o bot deduziu.
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

    // ── Nível 1.5: comando aprendido da IA ───────────────────────────────
    const learned = this.deps.learned?.find(text) ?? null
    if (learned) {
      // A fala sai do repertório, não do arquivo: a fala guardada pode estar
      // presa ao momento do aprendizado e sairia fora de hora.
      const spoken = this.deps.repertoire.say(LEARNED_ENTRY, snapshot)
      return {
        reply: spoken?.text ?? null,
        intent: null,
        action: learned.command.intent,
        source: 'learned',
        learnedPhrase: learned.command.phrase,
        ...(spoken ? { entryId: spoken.entryId } : {}),
        ...(learned.command.provider ? { provider: learned.command.provider } : {}),
      }
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
