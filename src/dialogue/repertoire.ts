import type { DialogueConfig, PersonaConfig } from '../config/schema.js'
import type { WorldSnapshot } from '../domain/types.js'
import { prepare } from './normalize.js'
import { findBestMatch } from './matcher.js'
import { resolvePlaceholders } from './placeholders.js'
import { VariationSelector, matchesWhen, type SelectionContext } from './selector.js'
import type { RawCatalog, RawEntry } from './schema.js'

export interface RepertoireResult {
  entryId: string
  text: string
  confidence: number
}

export interface RepertoireDeps {
  catalog: RawCatalog
  dialogue: DialogueConfig
  persona: PersonaConfig
  owner: string
  random?: () => number
  now?: () => number
}

/**
 * Nível 2 da cascata: respostas locais, instantâneas e sem rede.
 *
 * `respond` devolve `null` quando não tem confiança suficiente — é o sinal
 * para a mensagem descer para o provider de IA.
 */
export class Repertoire {
  private readonly byId = new Map<string, RawEntry>()
  private readonly selector: VariationSelector
  private readonly now: () => number
  private lastSpontaneousAt = 0

  constructor(private readonly deps: RepertoireDeps) {
    for (const entry of deps.catalog.entries) this.byId.set(entry.id, entry)
    this.selector = new VariationSelector(deps.random)
    this.now = deps.now ?? (() => Date.now())
  }

  private context(snapshot?: WorldSnapshot | null, extra?: SelectionContext): SelectionContext {
    return { snapshot: snapshot ?? null, ...extra }
  }

  private render(entry: RawEntry, ctx: SelectionContext): string | null {
    const picked = this.selector.select(entry.id, entry.responses, ctx)
    if (picked === null) return null
    return resolvePlaceholders(picked, {
      owner: this.deps.owner,
      botName: this.deps.persona.name,
      originStory: this.deps.persona.originStory,
      snapshot: ctx.snapshot,
    })
  }

  /** Responde uma mensagem de chat, ou `null` para passar adiante. */
  respond(
    text: string,
    snapshot?: WorldSnapshot | null,
    extra?: SelectionContext,
  ): RepertoireResult | null {
    if (!this.deps.dialogue.enabled) return null

    const normalized = prepare(text, this.deps.persona.name)
    if (!normalized) return null

    const match = findBestMatch(normalized, this.deps.catalog.entries)
    if (match === null) return null
    if (match.confidence < this.deps.dialogue.minConfidence) return null

    const ctx = this.context(snapshot, extra)
    const rendered = this.render(match.entry, ctx)
    // Sem variante compatível com o contexto, o repertório declina e a
    // mensagem segue para a IA.
    if (rendered === null) return null

    return { entryId: match.entry.id, text: rendered, confidence: match.confidence }
  }

  /**
   * Fala de uma entrada específica, ignorando o casamento de padrões.
   * Usada pelo fallback (`nao_entendi`), pela fala de espera e pelos avisos
   * de combate — que precisam ser instantâneos e nunca passam pela IA.
   */
  say(
    entryId: string,
    snapshot?: WorldSnapshot | null,
    extra?: SelectionContext,
  ): RepertoireResult | null {
    const entry = this.byId.get(entryId)
    if (!entry) return null
    const ctx = this.context(snapshot, extra)
    const rendered = this.render(entry, ctx)
    if (rendered === null) return null
    return { entryId, text: rendered, confidence: 1 }
  }

  /**
   * Fala espontânea disparada por evento do jogo, respeitando o cooldown
   * global — senão o bot vira spam de chat.
   */
  spontaneous(
    entryId: string,
    snapshot?: WorldSnapshot | null,
    extra?: SelectionContext,
  ): RepertoireResult | null {
    if (!this.deps.dialogue.spontaneous) return null

    const now = this.now()
    if (now - this.lastSpontaneousAt < this.deps.dialogue.spontaneousCooldownMs) return null

    const entry = this.byId.get(entryId)
    if (!entry || entry.trigger !== 'spontaneous') return null

    const ctx = this.context(snapshot, extra)
    // A cláusula `when` da própria entrada também precisa valer.
    if (entry.when && !matchesWhen(entry.when, ctx)) return null

    const rendered = this.render(entry, ctx)
    if (rendered === null) return null

    this.lastSpontaneousAt = now
    return { entryId, text: rendered, confidence: 1 }
  }

  has(entryId: string): boolean {
    return this.byId.has(entryId)
  }
}
