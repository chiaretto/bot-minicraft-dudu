import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ConversationTurn } from '../domain/types.js'

/**
 * Serializa uma troca em UMA linha. `JSON.stringify` já escapa quebras de
 * linha, então a resposta do bot com `\n` não parte o arquivo em duas linhas.
 */
export function serializeTurn(turn: ConversationTurn): string {
  return JSON.stringify(turn) + '\n'
}

export function appendTurn(path: string, turn: ConversationTurn): void {
  mkdirSync(dirname(path), { recursive: true })
  // Sem buffer próprio: cada troca vai para o SO na hora. Um crash perde no
  // máximo a troca em andamento.
  appendFileSync(path, serializeTurn(turn), 'utf8')
}

export interface ReadResult {
  turns: ConversationTurn[]
  corruptedLines: number
}

/**
 * Lê um arquivo de histórico tolerando linha corrompida.
 * Um crash no meio de uma escrita deixa a última linha truncada; ela é pulada
 * e o resto do dia continua utilizável.
 */
export function readTurns(path: string): ReadResult {
  if (!existsSync(path)) return { turns: [], corruptedLines: 0 }

  const turns: ConversationTurn[] = []
  let corruptedLines = 0

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as ConversationTurn
      if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string') {
        turns.push(parsed)
      } else {
        corruptedLines++
      }
    } catch {
      corruptedLines++
    }
  }

  return { turns, corruptedLines }
}
