import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { resolveRepoRoot, readSavedRoot, saveRoot, looksLikeBotRepo } from '../src/repo-path'

const REPO_A = resolve('C:/repos/dudu')
const REPO_B = resolve('C:/outro/dudu')
const BAKED = resolve('C:/build/dudu')
const APP = resolve('C:/repos/dudu/launcher')

/** Considera reais só as pastas listadas. */
const so = (...reais: string[]) => (dir: string) => reais.includes(resolve(dir))

describe('achar a pasta do bot', () => {
  it('DUDU_HOME tem a última palavra', () => {
    const root = resolveRepoRoot({
      env: { DUDU_HOME: REPO_B } as NodeJS.ProcessEnv,
      saved: REPO_A,
      baked: BAKED,
      appDir: APP,
      exists: so(REPO_A, REPO_B, BAKED),
    })
    expect(root).toBe(REPO_B)
  })

  it('a escolha do adulto vence o caminho gravado no empacotamento', () => {
    // O instalador leva o caminho de quando foi feito; quem moveu o repositório
    // e apontou a pasta nova tem razão.
    const root = resolveRepoRoot({
      env: {} as NodeJS.ProcessEnv,
      saved: REPO_B,
      baked: BAKED,
      appDir: APP,
      exists: so(REPO_B, BAKED),
    })
    expect(root).toBe(REPO_B)
  })

  it('sem escolha do adulto, usa o caminho gravado', () => {
    const root = resolveRepoRoot({
      env: {} as NodeJS.ProcessEnv,
      saved: null,
      baked: BAKED,
      appDir: APP,
      exists: so(BAKED),
    })
    expect(root).toBe(BAKED)
  })

  it('em desenvolvimento, deduz a pasta acima do launcher', () => {
    const root = resolveRepoRoot({
      env: {} as NodeJS.ProcessEnv,
      appDir: APP,
      exists: so(REPO_A),
    })
    expect(root).toBe(REPO_A)
  })

  it('pula candidato que não existe mais', () => {
    // Repositório apagado depois de instalado: cai no seguinte da fila.
    const root = resolveRepoRoot({
      env: { DUDU_HOME: 'C:/sumiu' } as NodeJS.ProcessEnv,
      saved: null,
      baked: BAKED,
      appDir: APP,
      exists: so(BAKED),
    })
    expect(root).toBe(BAKED)
  })

  it('devolve null quando nenhuma pista serve', () => {
    const root = resolveRepoRoot({
      env: {} as NodeJS.ProcessEnv,
      saved: REPO_B,
      baked: BAKED,
      appDir: APP,
      exists: () => false,
    })
    expect(root).toBeNull()
  })
})

describe('o que conta como pasta do bot', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dudu-repo-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('exige package.json e o ponto de entrada do bot', () => {
    expect(looksLikeBotRepo(dir)).toBe(false)

    writeFileSync(join(dir, 'package.json'), '{}', 'utf8')
    expect(looksLikeBotRepo(dir)).toBe(false)

    mkdirSync(join(dir, 'src', 'app'), { recursive: true })
    writeFileSync(join(dir, 'src', 'app', 'main.ts'), '', 'utf8')
    expect(looksLikeBotRepo(dir)).toBe(true)
  })
})

describe('escolha guardada', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dudu-settings-'))
    file = join(dir, 'launcher.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('guarda e lê de volta', () => {
    saveRoot(file, REPO_A)
    expect(readSavedRoot(file)).toBe(REPO_A)
  })

  it('arquivo ausente vale por nenhum', () => {
    expect(readSavedRoot(join(dir, 'nao-existe.json'))).toBeNull()
  })

  it('arquivo corrompido não derruba o aplicativo', () => {
    writeFileSync(file, '{isso nao e json', 'utf8')
    expect(() => readSavedRoot(file)).not.toThrow()
    expect(readSavedRoot(file)).toBeNull()
  })
})
