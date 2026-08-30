/** Limite prático do chat do Minecraft, com folga para o prefixo do servidor. */
export const MAX_CHAT_LENGTH = 240

// ─────────────────────────── ENTRADA: o que é fala ──────────────────────────

/**
 * Chave de tradução do retorno de comando do jogo.
 *
 * O vanilla manda o resultado de `/tp`, `/gamemode`, `/clear` e companhia como
 * `chat.type.admin`, no formato `[Fulano: corpo]`. O mineflayer casa isso com o
 * padrão de chat antigo e emite `chat` com o dono no lugar do remetente e o
 * corpo — **com o `]` sobrando** — no lugar da fala.
 */
export const ADMIN_TRANSLATE = 'chat.type.admin'

/**
 * A mensagem é eco do sistema, e não fala de jogador?
 *
 * Dois sinais, nesta ordem:
 *
 * 1. **A chave de tradução**, que é o que o protocolo realmente diz. O
 *    mineflayer entrega ela como terceiro argumento do evento `chat`, porque o
 *    padrão que gera o evento é do tipo antigo (`deprecated`) e repassa o
 *    `translate` da mensagem original.
 * 2. **Colchete desemparelhado no fim**, como rede de segurança para servidor
 *    que não entregue a chave. `Teleported Odraude to Miguel]` termina em `]`
 *    sem `[` correspondente — assinatura de um `[Fulano: corpo]` mal partido.
 *
 * A recusa é conservadora de propósito: o sinal 2 só vale com o `]` no fim, o
 * que conversa de criança não produz. Falso positivo custa uma mensagem
 * ignorada; falso negativo custa uma chamada de IA, uma fala fora de hora e um
 * comando decorado errado.
 * Ver: minecraft_connection_delta.md → "Retorno de comando do jogo não é fala".
 */
export function isSystemEcho(text: string, translate?: string | null): boolean {
  if (translate === ADMIN_TRANSLATE) return true

  const trimmed = text.trim()
  if (!trimmed.endsWith(']')) return false

  const opens = (trimmed.match(/\[/g) ?? []).length
  const closes = (trimmed.match(/\]/g) ?? []).length
  return closes > opens
}

// ─────────────────────────── SAÍDA: o que o bot fala ────────────────────────

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
