/**
 * Análise do histórico de conversa para alimentar o repertório.
 *
 * O objetivo é o inverso do runtime: em vez de responder o jogador, olhar para
 * trás e descobrir o que o repertório NÃO cobriu — as frases que caíram em
 * `nao_entendi` (miss) e as que só a IA resolveu (ai). Cada grupo é candidato a
 * entrada nova ou a padrão a mais numa entrada existente.
 *
 * Só funções puras: quem lê disco é `scripts/repertoire-gaps.ts`.
 * Ver CLAUDE.md -> "Rotina diária: analisar o log e ampliar o repertório".
 */
import { prepare } from '../dialogue/normalize.js'
import { findBestMatch } from '../dialogue/matcher.js'
import type { RawEntry } from '../dialogue/schema.js'
import { parseCommand } from '../behaviors/commands.js'

/** Uma linha do JSONL, reduzida ao que a análise precisa. */
export interface LoggedTurn {
  speaker: string
  text: string
  source?: string
  entryId?: string
  ts?: string
  /** Dia do arquivo de origem (`AAAA-MM-DD`); o `ts` é UTC e pode divergir. */
  day?: string
}

/** `miss` caiu em `nao_entendi`; `ai` só a IA resolveu; `local` já era coberto. */
export type ExchangeKind = 'miss' | 'ai' | 'local'

export interface Exchange {
  playerText: string
  /** A fala do bot que decidiu o caso — a da IA, no caso `ai`. */
  botReply: string | null
  kind: ExchangeKind
  day: string
}

/**
 * Quem, no log, é o bot.
 *
 * Deduzido do próprio arquivo em vez de vir da config: o nome do bot muda de
 * máquina para máquina e log antigo pode ter outro. Só o bot fala com
 * `repertoire`, `llm` ou `spontaneous`; a fala do jogador entra com `command`.
 */
export function botSpeakers(turns: readonly LoggedTurn[]): Set<string> {
  const bots = new Set<string>()
  for (const turn of turns) {
    if (turn.source === 'repertoire' || turn.source === 'llm' || turn.source === 'spontaneous') {
      bots.add(turn.speaker)
    }
  }
  return bots
}

function dayOf(turn: LoggedTurn): string {
  return turn.day ?? turn.ts?.slice(0, 10) ?? 'sem-data'
}

/**
 * Casa cada fala do jogador com a resposta que o bot deu depois dela.
 *
 * A janela vai até a próxima fala do jogador: uma fala espontânea ("anoiteceu")
 * pode cair no meio e não conta como resposta.
 */
export function classifyExchanges(
  turns: readonly LoggedTurn[],
  bots: Set<string> = botSpeakers(turns),
): Exchange[] {
  const exchanges: Exchange[] = []

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]
    if (!turn || bots.has(turn.speaker)) continue
    if (!turn.text.trim()) continue

    let kind: ExchangeKind = 'local'
    let reply: string | null = null

    for (let j = i + 1; j < turns.length; j++) {
      const next = turns[j]
      if (!next) break
      if (!bots.has(next.speaker)) break // próxima fala do jogador fecha a janela
      if (next.source === 'spontaneous') continue

      if (next.entryId === 'nao_entendi') {
        kind = 'miss'
        reply = next.text
        break
      }
      if (next.source === 'llm') {
        kind = 'ai'
        reply = next.text
        break
      }
      if (reply === null) reply = next.text
    }

    exchanges.push({ playerText: turn.text, botReply: reply, kind, day: dayOf(turn) })
  }

  return exchanges
}

export interface EntryScore {
  entryId: string
  pattern: string
  /** Fração das palavras do padrão presentes no texto: 0 a 1. */
  score: number
}

/**
 * Entradas mais parecidas com o texto, mesmo sem casar de fato.
 *
 * Serve à decisão do passo 3 da rotina: assunto novo pede entrada nova,
 * variação de assunto existente pede só um padrão a mais na entrada que já
 * existe. Sem isso o repertório cresce em entradas quase duplicadas.
 */
export function closestEntries(
  preparedText: string,
  entries: readonly RawEntry[],
  limit = 2,
): EntryScore[] {
  const words = new Set(preparedText.split(' ').filter(Boolean))
  if (words.size === 0) return []

  const scored: EntryScore[] = []
  for (const entry of entries) {
    if (entry.trigger === 'spontaneous' || entry.trigger === 'fallback') continue
    let best: EntryScore | null = null
    for (const pattern of entry.patterns) {
      const patternWords = prepare(pattern, '').split(' ').filter(Boolean)
      if (patternWords.length === 0) continue
      const hits = patternWords.filter((w) => words.has(w)).length
      const score = hits / patternWords.length
      if (score === 0) continue
      if (best === null || score > best.score) {
        best = { entryId: entry.id, pattern, score }
      }
    }
    if (best) scored.push(best)
  }

  return scored
    .sort((a, b) => b.score - a.score || a.entryId.localeCompare(b.entryId))
    .slice(0, limit)
}

export interface GapGroup {
  kind: 'miss' | 'ai'
  /** Chave do agrupamento: texto normalizado como o bot normaliza. */
  normalized: string
  count: number
  /** Como o jogador realmente escreveu, mais frequente primeiro. */
  variants: string[]
  /** Respostas que a IA deu — matéria-prima para escrever as variações. */
  replies: string[]
  days: string[]
  /**
   * Onde a frase cai HOJE. Nível diferente de `ia` significa gap já fechado
   * depois daquele dia de log — inclui comando, não só repertório: "me siga"
   * virou comando em `behaviors/commands.ts` e não precisa de entrada nenhuma.
   */
  resolvedNow: LocalResolution
  closest: EntryScore[]
}

export interface GroupOptions {
  botName: string
  entries: readonly RawEntry[]
  minConfidence: number
}

/**
 * Agrupa as falhas por frase normalizada.
 *
 * O agrupamento é por texto, não por assunto: juntar "o que voce sabe fazer" com
 * "quais suas habilidades" é julgamento de conteúdo e fica com quem escreve o
 * repertório. O relatório entrega a contagem — o que repete é o que vale
 * internalizar primeiro.
 */
export function groupGaps(exchanges: readonly Exchange[], options: GroupOptions): GapGroup[] {
  interface Bucket extends GapGroup {
    variantCounts: Map<string, number>
  }
  const buckets = new Map<string, Bucket>()

  for (const exchange of exchanges) {
    if (exchange.kind === 'local') continue
    const normalized = prepare(exchange.playerText, options.botName)
    if (!normalized) continue

    const key = `${exchange.kind} ${normalized}`
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        kind: exchange.kind,
        normalized,
        count: 0,
        variants: [],
        replies: [],
        days: [],
        resolvedNow: resolveLocally(exchange.playerText, options),
        closest: closestEntries(normalized, options.entries),
        variantCounts: new Map(),
      }
      buckets.set(key, bucket)
    }

    bucket.count++
    const seen = bucket.variantCounts.get(exchange.playerText) ?? 0
    bucket.variantCounts.set(exchange.playerText, seen + 1)
    if (!bucket.days.includes(exchange.day)) bucket.days.push(exchange.day)
    if (
      exchange.kind === 'ai' &&
      exchange.botReply &&
      !bucket.replies.includes(exchange.botReply)
    ) {
      bucket.replies.push(exchange.botReply)
    }
  }

  return [...buckets.values()]
    .map(({ variantCounts, ...group }) => ({
      ...group,
      variants: [...variantCounts.entries()].sort((a, b) => b[1] - a[1]).map(([text]) => text),
    }))
    .sort((a, b) => b.count - a.count || a.normalized.localeCompare(b.normalized))
}

export type LocalResolution =
  | { level: 'comando'; detail: string }
  | { level: 'repertorio'; detail: string; entryId: string; confidence: number }
  | { level: 'ia'; detail: string }

/**
 * Onde uma frase cai na cascata, sem subir o bot.
 *
 * É a validação do passo 7 da rotina: depois de editar o repertório, conferir
 * que a frase do log passou a casar com a entrada certa — e não com outra.
 */
export function resolveLocally(text: string, options: GroupOptions): LocalResolution {
  const command = parseCommand(text, options.botName)
  if (command) return { level: 'comando', detail: command.intent.type }

  const normalized = prepare(text, options.botName)
  const match = findBestMatch(normalized, options.entries)
  if (match && match.confidence >= options.minConfidence) {
    return {
      level: 'repertorio',
      entryId: match.entry.id,
      confidence: match.confidence,
      detail: `${match.entry.id} (confiança ${match.confidence.toFixed(2)}, padrão "${match.pattern}")`,
    }
  }

  return { level: 'ia', detail: normalized || '(vazio depois de normalizar)' }
}
