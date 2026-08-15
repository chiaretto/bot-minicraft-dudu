/** Limite prático do chat do Minecraft, com folga para o prefixo do servidor. */
export const MAX_CHAT_LENGTH = 240

/**
 * Quebra uma mensagem longa em partes que cabem no chat, sem cortar palavra.
 * Ver: minecraft_connection_delta.md → "Mensagem maior que o limite do chat".
 */
export function splitMessage(text: string, maxLength = MAX_CHAT_LENGTH): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= maxLength) return [clean]

  const parts: string[] = []
  let current = ''

  for (const word of clean.split(' ')) {
    if (word.length > maxLength) {
      // Palavra maior que o limite inteiro: parte no braço.
      if (current) {
        parts.push(current)
        current = ''
      }
      for (let i = 0; i < word.length; i += maxLength) {
        parts.push(word.slice(i, i + maxLength))
      }
      continue
    }
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxLength) {
      parts.push(current)
      current = word
    } else {
      current = candidate
    }
  }

  if (current) parts.push(current)
  return parts
}

export interface ChatSenderDeps {
  send: (text: string) => void
  /** Intervalo mínimo entre mensagens, para não levar kick por flood. */
  minIntervalMs?: number
  now?: () => number
  schedule?: (fn: () => void, ms: number) => void
}

/**
 * Fila de chat com throttle. Nenhuma mensagem é perdida: as que chegam em
 * rajada saem espaçadas.
 */
export class ChatSender {
  private queue: string[] = []
  private draining = false
  /** `-Infinity` = nunca enviei; a primeira mensagem nunca espera. */
  private lastSentAt = Number.NEGATIVE_INFINITY
  private readonly minIntervalMs: number
  private readonly now: () => number
  private readonly schedule: (fn: () => void, ms: number) => void

  constructor(private readonly deps: ChatSenderDeps) {
    this.minIntervalMs = deps.minIntervalMs ?? 900
    this.now = deps.now ?? (() => Date.now())
    this.schedule = deps.schedule ?? ((fn, ms) => void setTimeout(fn, ms))
  }

  say(text: string): void {
    for (const part of splitMessage(text)) this.queue.push(part)
    this.drain()
  }

  get pending(): number {
    return this.queue.length
  }

  private drain(): void {
    if (this.draining) return
    if (this.queue.length === 0) return

    const elapsed = this.now() - this.lastSentAt
    if (elapsed < this.minIntervalMs) {
      this.draining = true
      this.schedule(() => {
        this.draining = false
        this.drain()
      }, this.minIntervalMs - elapsed)
      return
    }

    const next = this.queue.shift()
    if (next === undefined) return
    this.lastSentAt = this.now()
    this.deps.send(next)

    if (this.queue.length > 0) this.drain()
  }
}
