/**
 * Onde está a cópia do repositório que o aplicativo executa.
 *
 * O bot NÃO é embutido no instalador de propósito: `data/conversations/`,
 * `data/repertoire.yaml` e o `/upgrade-repertoire` dependem de `data/` estar na
 * pasta do projeto. Um bot embutido escrevendo em `AppData` quebraria a análise
 * de log do dia seguinte.
 *
 * O preço disso é ter que achar a pasta. Em desenvolvimento ela está logo acima
 * do `launcher/`; instalado, o adulto aponta uma vez e a escolha fica guardada.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Uma pasta só vale como raiz do bot se tiver por onde subi-lo. */
export function looksLikeBotRepo(dir: string): boolean {
  return existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'src', 'app', 'main.ts'))
}

export interface ResolveOptions {
  /** `DUDU_HOME` tem a última palavra: serve para depurar sem mexer em nada. */
  env?: NodeJS.ProcessEnv
  /** O que o adulto escolheu numa execução anterior. */
  saved?: string | null
  /** Caminho gravado no empacotamento (`duduHome` no `package.json`). */
  baked?: string | null
  /** Pasta do aplicativo, de onde se deduz a raiz em desenvolvimento. */
  appDir: string
  exists?: (dir: string) => boolean
}

/**
 * Devolve a raiz do repositório, ou `null` quando nenhuma das pistas serve.
 *
 * Ordem: variável de ambiente, escolha do adulto, caminho gravado no
 * empacotamento, pasta acima do `launcher/`.
 *
 * A escolha do adulto vem antes do caminho gravado de propósito: o instalador
 * é feito para o computador da casa e leva o caminho daquele momento; se o
 * repositório mudar de lugar, quem apontou a pasta nova tem razão.
 */
export function resolveRepoRoot(options: ResolveOptions): string | null {
  const {
    env = process.env,
    saved = null,
    baked = null,
    appDir,
    exists = looksLikeBotRepo,
  } = options

  const candidates = [env['DUDU_HOME'], saved, baked, resolve(appDir, '..')].filter(
    (dir): dir is string => typeof dir === 'string' && dir.length > 0,
  )

  for (const dir of candidates) {
    const abs = resolve(dir)
    if (exists(abs)) return abs
  }
  return null
}

// ── Persistência da escolha ──────────────────────────────────────────────────

interface Settings {
  repoRoot?: string
}

/** Lê o caminho guardado. Arquivo ausente ou corrompido vale por "nenhum". */
export function readSavedRoot(settingsFile: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(settingsFile, 'utf8'))
    const root = (parsed as Settings | null)?.repoRoot
    return typeof root === 'string' && root.length > 0 ? root : null
  } catch {
    return null
  }
}

export function saveRoot(settingsFile: string, repoRoot: string): void {
  writeFileSync(settingsFile, JSON.stringify({ repoRoot } satisfies Settings, null, 2), 'utf8')
}
