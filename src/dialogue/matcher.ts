import { normalize } from './normalize.js'
import type { RawEntry } from './schema.js'

export interface MatchResult {
  entry: RawEntry
  confidence: number
  pattern: string
}

/**
 * Confiança do casamento de UM padrão contra o texto já normalizado.
 *
 * A escala é deliberadamente grosseira — três faixas, não um score contínuo:
 *   1.00  texto idêntico ao padrão
 *   0.85  o padrão é uma frase inteira dentro do texto (limites de palavra)
 *   0.75  todas as palavras do padrão aparecem, em qualquer ordem
 *   0.00  não casou
 *
 * Com `minConfidence` em 0.7 (padrão), as três faixas passam e o que não casou
 * vai para a IA. Quem quiser um repertório mais conservador sobe o limiar para
 * 0.8 e passa a aceitar só frase inteira.
 */
export function scorePattern(normalizedText: string, pattern: string): number {
  const p = normalize(pattern)
  if (!p) return 0
  if (normalizedText === p) return 1

  const words = p.split(' ')
  if (words.length > 1) {
    const phrase = new RegExp(`(^|\\s)${escapeForWordBoundary(p)}(\\s|$)`, 'u')
    if (phrase.test(normalizedText)) return 0.85
  } else {
    const single = new RegExp(`(^|\\s)${escapeForWordBoundary(p)}(\\s|$)`, 'u')
    if (single.test(normalizedText)) return 0.85
  }

  const textWords = new Set(normalizedText.split(' '))
  if (words.length > 1 && words.every((w) => textWords.has(w))) return 0.75

  return 0
}

function escapeForWordBoundary(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Melhor entrada para o texto dado.
 *
 * Desempate: primeiro confiança, depois `specificity`. É o que faz
 * "quem te criou" cair em `origem` e não em `identidade`, já que as duas
 * casam mas `origem` é mais específica.
 * Ver: local_dialogue_delta.md → "Entrada mais específica vence".
 */
export function findBestMatch(
  normalizedText: string,
  entries: readonly RawEntry[],
): MatchResult | null {
  let best: MatchResult | null = null

  for (const entry of entries) {
    if (entry.trigger !== 'chat') continue
    for (const pattern of entry.patterns) {
      const confidence = scorePattern(normalizedText, pattern)
      if (confidence === 0) continue

      if (
        best === null ||
        confidence > best.confidence ||
        (confidence === best.confidence && entry.specificity > best.entry.specificity)
      ) {
        best = { entry, confidence, pattern }
      }
    }
  }

  return best
}
