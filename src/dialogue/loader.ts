import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { catalogSchema, MIN_VARIATIONS_WARN, type RawCatalog, type RawEntry } from './schema.js'
import { extractPlaceholders, isKnownPlaceholder } from './placeholders.js'
import { responseText } from './selector.js'

export class RepertoireError extends Error {
  override name = 'RepertoireError'
}

export interface LoadReport {
  catalog: RawCatalog
  entryCount: number
  responseCount: number
  warnings: string[]
}

const HERE = dirname(fileURLToPath(import.meta.url))

/** Catálogo embarcado, usado quando o arquivo de dados ainda não existe. */
export function defaultCatalogPath(): string {
  return resolve(HERE, 'default-repertoire.yaml')
}

/**
 * Copia o catálogo padrão para o caminho configurado, se ele não existir.
 * Ver: local_dialogue_delta.md → "Catálogo ausente".
 */
export function ensureCatalogFile(path: string): boolean {
  if (existsSync(path)) return false
  mkdirSync(dirname(path), { recursive: true })
  copyFileSync(defaultCatalogPath(), path)
  return true
}

function validatePlaceholders(entries: readonly RawEntry[]): void {
  const problems: string[] = []
  for (const entry of entries) {
    for (const response of entry.responses) {
      for (const name of extractPlaceholders(responseText(response))) {
        if (!isKnownPlaceholder(name)) {
          problems.push(`  - entrada '${entry.id}': placeholder inválido {${name}}`)
        }
      }
    }
  }
  if (problems.length > 0) {
    throw new RepertoireError(`placeholders desconhecidos no repertório:\n${problems.join('\n')}`)
  }
}

function checkDuplicateIds(entries: readonly RawEntry[]): void {
  const seen = new Set<string>()
  const dupes: string[] = []
  for (const entry of entries) {
    if (seen.has(entry.id)) dupes.push(entry.id)
    seen.add(entry.id)
  }
  if (dupes.length > 0) {
    throw new RepertoireError(`ids repetidos no repertório: ${dupes.join(', ')}`)
  }
}

export function parseCatalog(raw: unknown, source = '(memória)'): LoadReport {
  const result = catalogSchema.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => {
        const path = issue.path.join('.')
        // Aponta o id da entrada defeituosa, não só o índice do array.
        const idx = issue.path[1]
        const entryId =
          typeof idx === 'number' && Array.isArray((raw as RawCatalog)?.entries)
            ? ((raw as RawCatalog).entries[idx]?.id ?? `#${idx}`)
            : null
        const where = entryId ? `entrada '${entryId}' (${path})` : path || '(raiz)'
        return `  - ${where}: ${issue.message}`
      })
      .join('\n')
    throw new RepertoireError(`repertório inválido em ${source}:\n${detail}`)
  }

  const catalog = result.data
  checkDuplicateIds(catalog.entries)
  validatePlaceholders(catalog.entries)

  const warnings: string[] = []
  for (const entry of catalog.entries) {
    if (entry.responses.length < MIN_VARIATIONS_WARN) {
      warnings.push(
        `entrada '${entry.id}' tem só ${entry.responses.length} variações ` +
          `(recomendado ${MIN_VARIATIONS_WARN}); o bot vai soar repetitivo`,
      )
    }
  }

  return {
    catalog,
    entryCount: catalog.entries.length,
    responseCount: catalog.entries.reduce((sum, e) => sum + e.responses.length, 0),
    warnings,
  }
}

export function loadCatalog(path: string): LoadReport {
  ensureCatalogFile(path)

  let raw: unknown
  try {
    raw = parseYaml(readFileSync(path, 'utf8'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new RepertoireError(`erro de sintaxe em ${path}:\n  ${message}`)
  }

  return parseCatalog(raw, path)
}
