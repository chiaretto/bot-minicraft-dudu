/**
 * Relatório de lacunas do repertório, a partir do histórico de conversa.
 *
 * Roda em qualquer máquina com o repo instalado (`npm install`), sem subir o
 * bot e sem depender de shell: é o Node quem lê os arquivos.
 *
 *   npm run repertoire:gaps                      relatório do histórico todo
 *   npm run repertoire:gaps -- --days 7          só os últimos 7 dias de log
 *   npm run repertoire:gaps -- --kind miss       só o que caiu em nao_entendi
 *   npm run repertoire:gaps -- --json            saída para outro programa
 *   npm run repertoire:check -- "me segue" "oi"  onde cada frase cai hoje
 *
 * Ver CLAUDE.md -> "Rotina diária: analisar o log e ampliar o repertório".
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { parseCatalog, defaultCatalogPath, RepertoireError } from '../src/dialogue/loader.js'
import { MIN_VARIATIONS_WARN, type RawEntry } from '../src/dialogue/schema.js'
import {
  classifyExchanges,
  groupGaps,
  rankLearned,
  resolveLocally,
  PROMOTE_AFTER_HITS,
  type Exchange,
  type GapGroup,
  type LearnedRanking,
  type LoggedTurn,
} from '../src/tools/gaps.js'
import type { LearnedCommand } from '../src/dialogue/learned.js'

const DEFAULTS = {
  botName: 'Dudu',
  catalogPath: 'data/repertoire.yaml',
  memoryDir: 'data/conversations',
  minConfidence: 0.7,
  learnedPath: 'data/learned-commands.json',
}

interface Options {
  since: string | null
  until: string | null
  kind: 'miss' | 'ai' | 'all'
  limit: number
  json: boolean
  includeResolved: boolean
  check: string[]
  configPath: string
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    since: null,
    until: null,
    kind: 'all',
    limit: 40,
    json: false,
    includeResolved: false,
    check: [],
    configPath: 'config.yaml',
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === undefined) continue
    const value = argv[i + 1]

    switch (arg) {
      case '--since':
        options.since = value ?? null
        i++
        break
      case '--until':
        options.until = value ?? null
        i++
        break
      case '--days': {
        // Janela relativa ao log, não ao relógio: a máquina que analisa pode
        // não ser a que jogou, e o fuso do arquivo é o do jogador.
        const days = Number(value)
        if (!Number.isFinite(days) || days <= 0)
          fail(`--days precisa de um número: recebi "${value}"`)
        options.since = `relative:${days}`
        i++
        break
      }
      case '--kind':
        if (value !== 'miss' && value !== 'ai' && value !== 'all') {
          fail(`--kind aceita miss, ai ou all: recebi "${value}"`)
        }
        options.kind = value
        i++
        break
      case '--limit': {
        const limit = Number(value)
        if (!Number.isFinite(limit) || limit <= 0)
          fail(`--limit precisa de um número: recebi "${value}"`)
        options.limit = limit
        i++
        break
      }
      case '--config':
        options.configPath = value ?? options.configPath
        i++
        break
      case '--json':
        options.json = true
        break
      case '--include-resolved':
        options.includeResolved = true
        break
      case '--check':
        // Todo o resto da linha é frase para testar.
        options.check.push(...argv.slice(i + 1).filter((a) => a.length > 0))
        i = argv.length
        break
      case '--help':
      case '-h':
        console.log(HELP)
        process.exit(0)
      default:
        fail(`argumento desconhecido: ${arg}`)
    }
  }

  return options
}

const HELP = `Uso: npm run repertoire:gaps -- [opções]
       npm run repertoire:check -- "frase" ["outra frase"]

  --days N        só os N arquivos de log mais recentes
  --since DATA    a partir de AAAA-MM-DD (inclusive)
  --until DATA    até AAAA-MM-DD (inclusive)
  --kind K        miss (nao_entendi) | ai (só a IA resolveu) | all
  --limit N       quantos grupos mostrar por seção (padrão 40)
  --json          saída em JSON
  --include-resolved  mostra também o que comando/repertório já resolvem hoje
  --config P      outro config.yaml (padrão: config.yaml)
  --check ...     testa em qual nível da cascata cada frase cai`

function fail(message: string): never {
  console.error(`erro: ${message}`)
  process.exit(1)
}

interface LooseConfig {
  botName: string
  catalogPath: string
  memoryDir: string
  minConfidence: number
  learnedPath: string
}

/**
 * Lê o `config.yaml` sem validar o arquivo inteiro.
 *
 * O schema real exige `server.version`, e a análise não precisa de servidor
 * nenhum: numa máquina que só tem o repo clonado o config pode nem existir.
 */
function readConfigLoose(path: string): LooseConfig {
  if (!existsSync(path)) return { ...DEFAULTS }

  let raw: unknown
  try {
    raw = parseYaml(readFileSync(path, 'utf8'))
  } catch {
    console.error(`aviso: ${path} não é YAML válido; usando os padrões`)
    return { ...DEFAULTS }
  }

  const root = (raw ?? {}) as Record<string, Record<string, unknown> | undefined>
  const persona = root.persona ?? {}
  const dialogue = root.dialogue ?? {}
  const memory = root.memory ?? {}
  const learned = root.learned ?? {}

  return {
    botName: typeof persona.name === 'string' ? persona.name : DEFAULTS.botName,
    catalogPath:
      typeof dialogue.catalogPath === 'string' ? dialogue.catalogPath : DEFAULTS.catalogPath,
    memoryDir: typeof memory.dir === 'string' ? memory.dir : DEFAULTS.memoryDir,
    minConfidence:
      typeof dialogue.minConfidence === 'number' ? dialogue.minConfidence : DEFAULTS.minConfidence,
    learnedPath: typeof learned.path === 'string' ? learned.path : DEFAULTS.learnedPath,
  }
}

/**
 * Comandos que a IA já ensinou, se o arquivo existir.
 *
 * Tolerante como o store do bot: isto é cache, e relatório nenhum vale derrubar
 * por causa de um JSON quebrado.
 */
function readLearned(path: string): LearnedCommand[] {
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { commands?: unknown }
    return Array.isArray(parsed.commands) ? (parsed.commands as LearnedCommand[]) : []
  } catch {
    console.error(`aviso: ${path} não é JSON válido; ignorando os comandos aprendidos`)
    return []
  }
}

function printLearned(learned: readonly LearnedRanking[], options: Options): void {
  console.log(`
=== COMANDOS APRENDIDOS DA IA (${learned.length}) ===`)
  if (learned.length === 0) {
    console.log('  nenhum ainda. Eles nascem quando a IA resolve um pedido e a ação dá certo.')
    return
  }

  for (const command of learned.slice(0, options.limit)) {
    const times = command.hits === 1 ? '1 uso' : `${command.hits} usos`
    console.log(`
  [${times}]  "${command.phrase}"  ->  ${command.intent}`)
    console.log(`    ensinado por: ${command.provider}`)
    for (const example of command.examples.slice(0, 3)) {
      console.log(`    jogador: ${truncate(example)}`)
    }
    if (command.promote) {
      console.log(
        `    CANDIDATO A VIRAR REGEX (${PROMOTE_AFTER_HITS}+ usos): ` +
          'promova em behaviors/commands.ts e a entrada sai do cache sozinha',
      )
    }
  }

  if (learned.length > options.limit) {
    console.log(`
  ... e mais ${learned.length - options.limit} (use --limit).`)
  }
}

interface Catalog {
  source: string
  entries: RawEntry[]
  responseCount: number
  warnings: string[]
}

/**
 * Repertório em uso, com a semente versionada como reserva.
 *
 * `data/repertoire.yaml` é o que o bot lê, mas não está no git: numa máquina
 * onde o bot nunca rodou só existe `src/dialogue/default-repertoire.yaml`.
 */
function readCatalog(catalogPath: string): Catalog {
  const path = existsSync(catalogPath) ? catalogPath : defaultCatalogPath()
  const report = parseCatalog(parseYaml(readFileSync(path, 'utf8')), path)
  return {
    source: path,
    entries: report.catalog.entries,
    responseCount: report.responseCount,
    warnings: report.warnings,
  }
}

const FILE_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/

function logFiles(dir: string, options: Options): string[] {
  if (!existsSync(dir)) return []

  let days = readdirSync(dir)
    .map((name) => FILE_RE.exec(name)?.[1])
    .filter((day): day is string => Boolean(day))
    .sort()

  const relative = options.since?.startsWith('relative:') ? Number(options.since.slice(9)) : null
  if (relative !== null) {
    days = days.slice(-relative)
  } else if (options.since) {
    days = days.filter((day) => day >= options.since!)
  }
  if (options.until) days = days.filter((day) => day <= options.until!)

  return days.map((day) => join(dir, `${day}.jsonl`))
}

interface ReadLog {
  turns: LoggedTurn[]
  corrupted: number
  days: string[]
}

function readLog(files: readonly string[]): ReadLog {
  const turns: LoggedTurn[] = []
  const days: string[] = []
  let corrupted = 0

  for (const file of files) {
    const day = FILE_RE.exec(file.split(/[\\/]/).pop() ?? '')?.[1] ?? 'sem-data'
    days.push(day)
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const parsed = JSON.parse(trimmed) as LoggedTurn
        if (parsed && typeof parsed.text === 'string' && typeof parsed.speaker === 'string') {
          turns.push({ ...parsed, day })
        } else {
          corrupted++
        }
      } catch {
        // Linha truncada por crash no meio da escrita: pula e segue.
        corrupted++
      }
    }
  }

  return { turns, corrupted, days }
}

function truncate(text: string, max = 110): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function printGroups(title: string, groups: readonly GapGroup[], options: Options): void {
  console.log(`\n=== ${title} (${groups.length} grupos) ===`)
  if (groups.length === 0) {
    console.log('  nada aqui.')
    return
  }

  for (const group of groups.slice(0, options.limit)) {
    const times = group.count === 1 ? '1 vez' : `${group.count} vezes`
    console.log(`\n  [${times}, dias: ${group.days.join(', ')}]  "${group.normalized}"`)
    for (const variant of group.variants.slice(0, 4)) {
      console.log(`    jogador: ${truncate(variant)}`)
    }
    for (const reply of group.replies.slice(0, 3)) {
      console.log(`    IA respondeu: ${truncate(reply)}`)
    }
    if (group.resolvedNow.level === 'repertorio') {
      console.log(`    JÁ RESOLVE HOJE: repertório -> ${group.resolvedNow.detail} — nada a fazer`)
    } else if (group.resolvedNow.level === 'comando') {
      console.log(`    JÁ RESOLVE HOJE: comando ${group.resolvedNow.detail} — nada a fazer`)
    } else if (group.closest.length > 0) {
      const near = group.closest
        .map((c) => `${c.entryId} ~${(c.score * 100).toFixed(0)}% ("${c.pattern}")`)
        .join(' | ')
      console.log(`    parecido com: ${near}`)
    } else {
      console.log('    parecido com: nada — assunto novo')
    }
  }

  if (groups.length > options.limit) {
    console.log(`\n  ... e mais ${groups.length - options.limit} grupos (use --limit).`)
  }
}

function runCheck(options: Options, config: LooseConfig, catalog: Catalog): void {
  const groupOptions = {
    botName: config.botName,
    entries: catalog.entries,
    minConfidence: config.minConfidence,
  }
  const results = options.check.map((text) => ({
    text,
    ...resolveLocally(text, groupOptions),
  }))

  if (options.json) {
    console.log(JSON.stringify({ catalog: catalog.source, results }, null, 2))
    return
  }

  console.log(`repertório: ${catalog.source} (${catalog.entries.length} entradas)`)
  console.log(`bot: ${config.botName}   minConfidence: ${config.minConfidence}\n`)
  for (const result of results) {
    const level =
      result.level === 'comando'
        ? `COMANDO   ${result.detail}`
        : result.level === 'repertorio'
          ? `REPERTÓRIO ${result.detail}`
          : `IA        (nenhum padrão casou; normalizado: "${result.detail}")`
    console.log(`  "${result.text}"\n    -> ${level}`)
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const config = readConfigLoose(options.configPath)

  let catalog: Catalog
  try {
    catalog = readCatalog(config.catalogPath)
  } catch (err) {
    if (err instanceof RepertoireError) fail(`repertório não carrega:\n${err.message}`)
    throw err
  }

  if (options.check.length > 0) {
    runCheck(options, config, catalog)
    return
  }

  const files = logFiles(config.memoryDir, options)
  if (files.length === 0) {
    console.log(
      `Nenhum log em ${resolve(config.memoryDir)}.\n` +
        'Sem histórico não há o que analisar: jogue uma sessão com o bot antes.',
    )
    return
  }

  const { turns, corrupted, days } = readLog(files)
  const exchanges: Exchange[] = classifyExchanges(turns)
  const groups = groupGaps(exchanges, {
    botName: config.botName,
    entries: catalog.entries,
    minConfidence: config.minConfidence,
  })

  const open = options.includeResolved ? groups : groups.filter((g) => g.resolvedNow.level === 'ia')
  const alreadyClosed = groups.length - open.length
  const learned = rankLearned(readLearned(config.learnedPath))
  const misses = options.kind === 'ai' ? [] : open.filter((g) => g.kind === 'miss')
  const aiHandled = options.kind === 'miss' ? [] : open.filter((g) => g.kind === 'ai')
  const playerTurns = exchanges.length
  const covered = exchanges.filter((e) => e.kind === 'local').length

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          catalog: catalog.source,
          botName: config.botName,
          days,
          playerTurns,
          covered,
          corrupted,
          warnings: catalog.warnings,
          alreadyClosed,
          misses,
          aiHandled,
          learned,
        },
        null,
        2,
      ),
    )
    return
  }

  const pct = playerTurns === 0 ? 0 : Math.round((covered / playerTurns) * 100)
  console.log(`repertório: ${catalog.source}`)
  console.log(`  ${catalog.entries.length} entradas, ${catalog.responseCount} respostas`)
  console.log(`log: ${days.length} dia(s) — ${days[0]} a ${days[days.length - 1]}`)
  console.log(`  ${playerTurns} falas do jogador, ${covered} resolvidas local (${pct}%)`)
  console.log(`  ${learned.length} comando(s) aprendido(s) da IA em ${config.learnedPath}`)
  if (corrupted > 0) console.log(`  ${corrupted} linha(s) corrompida(s), ignoradas`)
  if (alreadyClosed > 0) {
    console.log(
      `  ${alreadyClosed} grupo(s) de falha já fechados desde então ` +
        '(escondidos; use --include-resolved)',
    )
  }

  if (options.kind !== 'ai') printGroups('NÃO ENTENDI (miss)', misses, options)
  if (options.kind !== 'miss') printGroups('RESOLVIDO SÓ PELA IA (ai)', aiHandled, options)
  printLearned(learned, options)

  if (catalog.warnings.length > 0) {
    console.log(`\n=== avisos do repertório (menos de ${MIN_VARIATIONS_WARN} variações) ===`)
    for (const warning of catalog.warnings) console.log(`  - ${warning}`)
  }
}

main()
