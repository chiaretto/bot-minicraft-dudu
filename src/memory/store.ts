import { readdirSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { MemoryConfig } from '../config/schema.js'
import type { ConversationTurn } from '../domain/types.js'
import { appendTurn, readTurns } from './jsonl.js'

/** `YYYY-MM-DD` na data LOCAL — a virada do arquivo segue o fuso do jogador. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const FILE_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/

export interface MemoryStoreDeps {
  config: MemoryConfig
  sessionId: string
  /** Injetável para teste: a rotação de meia-noite não pode depender do relógio real. */
  now?: () => Date
  onWriteError?: (err: Error) => void
  onWarning?: (message: string) => void
}

/**
 * Histórico de conversa em dois níveis:
 *   - RAM: janela curta, único material enviado ao provider de IA;
 *   - disco: um JSONL append-only por dia.
 *
 * Ver: conversation_memory_delta.md
 */
export class MemoryStore {
  private window: ConversationTurn[] = []
  private readonly now: () => Date
  private currentDay: string | null = null

  constructor(private readonly deps: MemoryStoreDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  fileForDate(date: Date): string {
    return join(this.deps.config.dir, `${localDateKey(date)}.jsonl`)
  }

  private currentFile(): string {
    const date = this.now()
    const key = localDateKey(date)
    if (this.currentDay !== null && this.currentDay !== key) {
      // Virada de meia-noite com o processo rodando: nada a fechar porque a
      // escrita é append por chamada, mas o dia corrente muda.
      this.currentDay = key
    } else if (this.currentDay === null) {
      this.currentDay = key
    }
    return join(this.deps.config.dir, `${key}.jsonl`)
  }

  /** Grava a troca e atualiza a janela curta. Falha de disco não derruba o bot. */
  record(
    turn: Omit<ConversationTurn, 'ts' | 'sessionId'> & Partial<Pick<ConversationTurn, 'ts'>>,
  ): ConversationTurn {
    const full: ConversationTurn = {
      ...turn,
      ts: turn.ts ?? this.now().toISOString(),
      sessionId: this.deps.sessionId,
    }

    this.pushWindow(full)

    try {
      appendTurn(this.currentFile(), full)
    } catch (err) {
      this.deps.onWriteError?.(err instanceof Error ? err : new Error(String(err)))
    }

    return full
  }

  private pushWindow(turn: ConversationTurn): void {
    this.window.push(turn)
    const max = this.deps.config.shortTermWindow
    if (this.window.length > max) {
      this.window = this.window.slice(-max)
    }
  }

  /** Janela curta — o ÚNICO material que vai para o provider de IA. */
  shortTerm(): readonly ConversationTurn[] {
    return this.window
  }

  /**
   * Relê o arquivo de hoje e reconstrói a janela.
   * Dias anteriores permanecem em disco e NÃO entram no contexto.
   */
  resume(): { loaded: number; corruptedLines: number } {
    if (!this.deps.config.resumeToday) return { loaded: 0, corruptedLines: 0 }

    const { turns, corruptedLines } = readTurns(this.currentFile())
    if (corruptedLines > 0) {
      this.deps.onWarning?.(
        `${corruptedLines} linha(s) corrompida(s) ignorada(s) no histórico de hoje`,
      )
    }
    this.window = turns.slice(-this.deps.config.shortTermWindow)
    return { loaded: this.window.length, corruptedLines }
  }

  /** Aplica a política de retenção. `retentionDays: null` = guardar para sempre. */
  applyRetention(): string[] {
    const days = this.deps.config.retentionDays
    if (days === null) return []
    if (!existsSync(this.deps.config.dir)) return []

    const cutoff = new Date(this.now().getTime() - days * 24 * 60 * 60 * 1000)
    const cutoffKey = localDateKey(cutoff)
    const removed: string[] = []

    for (const name of readdirSync(this.deps.config.dir)) {
      const match = FILE_RE.exec(name)
      if (!match) continue
      const key = match[1] as string
      // Comparação lexicográfica funciona para YYYY-MM-DD.
      if (key < cutoffKey) {
        rmSync(join(this.deps.config.dir, name))
        removed.push(name)
      }
    }

    return removed
  }

  /** Cria o diretório de dados. Chamado uma vez na inicialização. */
  init(): void {
    mkdirSync(this.deps.config.dir, { recursive: true })
  }
}
