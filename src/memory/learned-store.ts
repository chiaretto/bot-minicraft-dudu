import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { LearnedConfig } from '../config/schema.js'
import { actionFrom, isLearnable, type Intent } from '../domain/intent.js'
import {
  findLearned,
  isEchoCommand,
  learnBlockReason,
  learnedPhrase,
  mergeReply,
  type LearnedCommand,
  type LearnedMatch,
} from '../dialogue/learned.js'

/** Versão do arquivo. Formato incompatível no futuro é motivo de recomeçar. */
const FILE_VERSION = 1

/** Quantos jeitos de escrever a mesma frase guardar, para a rotina diária. */
const MAX_EXAMPLES = 4

interface LearnedFile {
  version: number
  commands: unknown[]
}

export interface LoadLearnedReport {
  loaded: number
  /** Descartadas por já existirem no parser de regex. */
  shadowed: number
  /** Descartadas por serem recado do jogo, e não fala de gente. */
  noise: number
  /** Descartadas por não serem pedido: pergunta ou pedido com condição. */
  notRequest: number
  /** Descartadas por idade (`forgetAfterDays`). */
  expired: number
  /** Descartadas por não passarem na validação de intenção. */
  invalid: number
  /** Mensagem de erro quando o arquivo não pôde ser lido. */
  error: string | null
}

export interface LearnedStoreDeps {
  config: LearnedConfig
  botName: string
  /**
   * Frase que o parser de regex já resolve.
   *
   * É por aqui que a promoção para código limpa o cache sozinha: quando a
   * rotina diária transforma uma frase aprendida em padrão de
   * `behaviors/commands.ts`, a entrada desaparece no próximo carregamento.
   */
  isShadowed?: (phrase: string) => boolean
  now?: () => Date
  onWarning?: (message: string) => void
  onWriteError?: (err: Error) => void
}

/**
 * Histórico de comandos aprendidos em disco.
 *
 * Regra que atravessa a classe: **isto é cache, não fonte da verdade**. Arquivo
 * ausente, ilegível ou corrompido nunca impede o bot de funcionar — no pior
 * caso ele começa sem saber nada e volta a perguntar para a IA.
 * Ver: learned_commands_delta.md → "Persistência tolerante a falha".
 */
export class LearnedStore {
  private commands: LearnedCommand[] = []
  private readonly now: () => Date

  constructor(private readonly deps: LearnedStoreDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  get size(): number {
    return this.commands.length
  }

  all(): readonly LearnedCommand[] {
    return this.commands
  }

  /**
   * Lê o arquivo. Nunca lança: devolve o relatório do que entrou e do que caiu.
   */
  load(): LoadLearnedReport {
    const report: LoadLearnedReport = {
      loaded: 0,
      shadowed: 0,
      noise: 0,
      notRequest: 0,
      expired: 0,
      invalid: 0,
      error: null,
    }
    this.commands = []

    const path = this.deps.config.path
    // Ausente é o caso NORMAL da primeira execução, não erro.
    if (!existsSync(path)) return report

    let parsed: LearnedFile
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8')) as LearnedFile
    } catch (err) {
      report.error = err instanceof Error ? err.message : String(err)
      this.deps.onWarning?.(
        `histórico de comandos aprendidos ilegível (${path}): ${report.error}. ` +
          'Começando sem nenhum comando aprendido.',
      )
      return report
    }

    if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.commands)) {
      report.error = 'formato inesperado'
      this.deps.onWarning?.(
        `histórico de comandos aprendidos com formato inesperado (${path}). ` +
          'Começando sem nenhum comando aprendido.',
      )
      return report
    }

    const cutoff = this.expiryCutoff()

    for (const raw of parsed.commands) {
      const command = this.reviveCommand(raw)
      if (command === null) {
        report.invalid++
        continue
      }
      if (this.deps.isShadowed?.(command.phrase)) {
        report.shadowed++
        continue
      }
      // As duas guardas seguintes valem para TRÁS: entrada decorada antes de a
      // regra existir sai na carga, como já acontecia com a sombra do parser.
      // É o que evita editar `learned-commands.json` à mão — ele é cache.
      if (isEchoCommand(command)) {
        report.noise++
        continue
      }
      if (learnBlockReason(command.phrase, this.deps.botName) !== null) {
        report.notRequest++
        continue
      }
      if (cutoff !== null && command.lastUsedAt < cutoff) {
        report.expired++
        continue
      }
      this.commands.push(command)
    }

    report.loaded = this.commands.length
    // Uma entrada a menos que o arquivo tinha significa arquivo a reescrever.
    if (report.shadowed + report.noise + report.notRequest + report.expired + report.invalid > 0) {
      this.persist()
    }

    return report
  }

  /**
   * Comando aprendido para a mensagem, ou `null` para a mensagem seguir na
   * cascata.
   *
   * A intenção é **revalidada** aqui: entrada com parâmetro que o catálogo
   * fechado recusa é descartada em vez de virar efeito no mundo.
   */
  find(text: string): LearnedMatch | null {
    const normalized = learnedPhrase(text, this.deps.botName)
    const match = findLearned(normalized, this.commands, this.deps.config.minConfidence)
    if (match === null) return null

    const revalidated = actionFrom(match.command.intent)
    if (revalidated === null || !isLearnable(revalidated)) {
      this.forget(match.command.phrase)
      this.deps.onWarning?.(
        `comando aprendido descartado por não validar mais: "${match.command.phrase}"`,
      )
      return null
    }

    return { command: { ...match.command, intent: revalidated }, confidence: match.confidence }
  }

  /**
   * Guarda o que a IA ensinou, ou atualiza o que já estava guardado.
   *
   * Devolve `false` quando a intenção não é aprendível — o chamador não precisa
   * conhecer o catálogo fechado.
   */
  record(input: { text: string; intent: Intent; reply?: string; provider?: string }): boolean {
    if (!isLearnable(input.intent)) return false

    const phrase = learnedPhrase(input.text, this.deps.botName)
    if (!phrase) return false

    const stamp = this.now().toISOString()
    const max = this.deps.config.maxRepliesPerEntry
    const existing = this.commands.find((c) => c.phrase === phrase)

    if (existing) {
      existing.intent = input.intent
      existing.lastUsedAt = stamp
      if (input.reply) existing.replies = mergeReply(existing.replies, input.reply, max)
      if (input.provider) existing.provider = input.provider
      if (!existing.examples.includes(input.text)) {
        existing.examples = [...existing.examples, input.text].slice(-MAX_EXAMPLES)
      }
    } else {
      this.commands.push({
        phrase,
        intent: input.intent,
        replies: input.reply ? mergeReply([], input.reply, max) : [],
        provider: input.provider ?? 'desconhecido',
        examples: [input.text],
        learnedAt: stamp,
        lastUsedAt: stamp,
        hits: 0,
      })
      this.evict()
    }

    this.persist()
    return true
  }

  /** Registra um acerto: conta o uso e adia o descarte por desuso. */
  touch(phrase: string): void {
    const command = this.commands.find((c) => c.phrase === phrase)
    if (!command) return
    command.hits++
    command.lastUsedAt = this.now().toISOString()
    this.persist()
  }

  /** Esquece uma entrada. `true` quando havia o que esquecer. */
  forget(phrase: string): boolean {
    const before = this.commands.length
    this.commands = this.commands.filter((c) => c.phrase !== phrase)
    if (this.commands.length === before) return false
    this.persist()
    return true
  }

  private expiryCutoff(): string | null {
    const days = this.deps.config.forgetAfterDays
    if (days === null) return null
    return new Date(this.now().getTime() - days * 86_400_000).toISOString()
  }

  /** Teto de entradas: a usada há mais tempo sai primeiro. */
  private evict(): void {
    const max = this.deps.config.maxEntries
    if (this.commands.length <= max) return

    this.commands.sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt))
    this.commands = this.commands.slice(this.commands.length - max)
  }

  private reviveCommand(raw: unknown): LearnedCommand | null {
    if (raw === null || typeof raw !== 'object') return null
    const candidate = raw as Record<string, unknown>

    if (typeof candidate.phrase !== 'string' || !candidate.phrase) return null

    const intent = actionFrom(candidate.intent)
    if (intent === null || !isLearnable(intent)) return null

    const stamp = this.now().toISOString()
    return {
      phrase: candidate.phrase,
      intent,
      replies: Array.isArray(candidate.replies)
        ? candidate.replies.filter((r): r is string => typeof r === 'string')
        : [],
      provider: typeof candidate.provider === 'string' ? candidate.provider : 'desconhecido',
      examples: Array.isArray(candidate.examples)
        ? candidate.examples.filter((e): e is string => typeof e === 'string')
        : [],
      learnedAt: typeof candidate.learnedAt === 'string' ? candidate.learnedAt : stamp,
      lastUsedAt: typeof candidate.lastUsedAt === 'string' ? candidate.lastUsedAt : stamp,
      hits: typeof candidate.hits === 'number' && candidate.hits >= 0 ? candidate.hits : 0,
    }
  }

  /**
   * Escreve o arquivo inteiro, de forma atômica.
   *
   * Temporário no MESMO diretório e `rename` por cima: um crash no meio deixa o
   * arquivo anterior íntegro, em vez de meio JSON. Sem debounce de propósito —
   * a escrita acontece no máximo uma vez por mensagem do jogador, e cache que
   * some no `kill -9` não serve para nada.
   */
  private persist(): void {
    const path = this.deps.config.path
    const temp = `${path}.tmp`
    const payload: LearnedFile = { version: FILE_VERSION, commands: this.commands }

    try {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
      renameSync(temp, path)
    } catch (err) {
      this.deps.onWriteError?.(err instanceof Error ? err : new Error(String(err)))
      // Um temporário órfão não pode virar lixo permanente no `data/`.
      try {
        if (existsSync(temp)) unlinkSync(temp)
      } catch {
        // Falhou limpar: não há mais nada a fazer, e isto é só cache.
      }
    }
  }
}
