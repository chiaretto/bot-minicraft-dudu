import type { RawResponse, WhenClause } from './schema.js'
import type { WorldSnapshot } from '../domain/types.js'

export interface SelectionContext {
  snapshot?: WorldSnapshot | null
  targetIsPlayer?: boolean
}

export function responseText(response: RawResponse): string {
  return typeof response === 'string' ? response : response.text
}

export function responseWhen(response: RawResponse): WhenClause | undefined {
  return typeof response === 'string' ? undefined : response.when
}

/** Uma cláusula `when` sem contexto de mundo só passa se não exigir mundo. */
export function matchesWhen(when: WhenClause | undefined, ctx: SelectionContext): boolean {
  if (!when) return true
  const snap = ctx.snapshot

  if (when.state !== undefined) {
    if (!snap || snap.state !== when.state) return false
  }
  if (when.timeOfDay !== undefined) {
    if (!snap || snap.timeOfDay !== when.timeOfDay) return false
  }
  if (when.healthBelow !== undefined) {
    if (!snap || snap.health >= when.healthBelow) return false
  }
  if (when.ownerHealthBelow !== undefined) {
    if (!snap || snap.ownerHealth == null || snap.ownerHealth >= when.ownerHealthBelow) return false
  }
  if (when.targetIsPlayer !== undefined) {
    if ((ctx.targetIsPlayer ?? false) !== when.targetIsPlayer) return false
  }
  return true
}

/**
 * Escolhe uma variação de resposta, nunca repetindo a última usada
 * daquela entrada.
 *
 * Por que isso importa: sem variação o bot vira URA de call center e a ilusão
 * de amigo morre na terceira saudação idêntica.
 * Ver: local_dialogue_delta.md → "Variação de respostas".
 */
export class VariationSelector {
  private lastUsed = new Map<string, string>()

  constructor(private readonly random: () => number = Math.random) {}

  select(entryId: string, responses: readonly RawResponse[], ctx: SelectionContext): string | null {
    const eligible = responses.filter((r) => matchesWhen(responseWhen(r), ctx)).map(responseText)
    if (eligible.length === 0) return null
    if (eligible.length === 1) {
      const only = eligible[0] as string
      this.lastUsed.set(entryId, only)
      return only
    }

    const previous = this.lastUsed.get(entryId)
    const fresh = eligible.filter((text) => text !== previous)
    // `fresh` só fica vazio se todas as elegíveis forem iguais à anterior.
    const pool = fresh.length > 0 ? fresh : eligible

    const picked = pool[Math.floor(this.random() * pool.length) % pool.length] as string
    this.lastUsed.set(entryId, picked)
    return picked
  }

  /** Exposto para teste; não usado em produção. */
  reset(): void {
    this.lastUsed.clear()
  }
}
