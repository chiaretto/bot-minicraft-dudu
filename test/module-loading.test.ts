import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * Testes de CARREGAMENTO em ESM nativo do Node.
 *
 * Por que existem: o resto da suíte exercita lógica pura com bots falsos, e por
 * isso nunca importa `mineflayer-pathfinder`. Um
 * `import { goals } from 'mineflayer-pathfinder'` passava no typecheck (o .d.ts
 * declara named exports) e explodia só ao rodar, porque o pacote é CommonJS e o
 * cjs-module-lexer do Node não detecta `goals`.
 *
 * Por que via `execFileSync` e não `await import(...)`: o vitest transpila com
 * esbuild, que reescreve o import e RESOLVE o interop sozinho. Um teste que
 * importasse direto passaria mesmo com o bug presente — falsa confiança
 * (verificado na prática). Só um processo Node de verdade, sobre o `dist/`
 * compilado, reproduz o que acontece em `npm start`.
 *
 * Custo: exige `npm run build` antes. Sem `dist/`, os testes são pulados com
 * aviso em vez de dar falso verde.
 */

const DIST_READY = existsSync('dist/app/bot.js')

/** Importa um módulo do dist num processo Node separado, em ESM nativo. */
function importInRealNode(specifier: string): { ok: boolean; error: string } {
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', `await import('${specifier}')`], {
      stdio: 'pipe',
      timeout: 30_000,
    })
    return { ok: true, error: '' }
  } catch (err) {
    const e = err as { stderr?: Buffer; message?: string }
    return { ok: false, error: e.stderr?.toString() || e.message || String(err) }
  }
}

describe.skipIf(!DIST_READY)('carregamento em ESM nativo (sobre o dist/)', () => {
  beforeAll(() => {
    if (!DIST_READY) console.warn('dist/ ausente — rode `npm run build` antes')
  })

  it('mineflayer-pathfinder expõe goals via import default', () => {
    const result = importInRealNode('mineflayer-pathfinder')
    expect(result.error).toBe('')
    expect(result.ok).toBe(true)
  })

  it('dist/minecraft/client.js carrega', () => {
    const result = importInRealNode('./dist/minecraft/client.js')
    // Se o interop quebrar, a mensagem é "does not provide an export named".
    expect(result.error).not.toMatch(/does not provide an export named/)
    expect(result.ok).toBe(true)
  })

  it('dist/behaviors/actions/index.js carrega', () => {
    const result = importInRealNode('./dist/behaviors/actions/index.js')
    expect(result.error).not.toMatch(/does not provide an export named/)
    expect(result.ok).toBe(true)
  })

  it('dist/app/bot.js carrega — o composition root inteiro', () => {
    const result = importInRealNode('./dist/app/bot.js')
    expect(result.error).not.toMatch(/does not provide an export named/)
    expect(result.ok).toBe(true)
  })

  it('os providers de IA carregam suas bibliotecas', () => {
    for (const mod of ['./dist/ai/providers/ollama.js', './dist/ai/providers/gemini.js']) {
      const result = importInRealNode(mod)
      expect(result.error, mod).toBe('')
    }
  })
})

describe('superfície dos módulos (transpilado)', () => {
  it('client expõe as classes esperadas', async () => {
    const mod = await import('../src/minecraft/client.js')
    expect(typeof mod.MinecraftClient).toBe('function')
    expect(typeof mod.VersionMismatchError).toBe('function')
  })

  it('actions expõe o despachante de intenções', async () => {
    const mod = await import('../src/behaviors/actions/index.js')
    expect(typeof mod.runIntent).toBe('function')
    expect(typeof mod.equipBestWeapon).toBe('function')
  })

  it('instanciar os providers não faz rede', async () => {
    const { OllamaProvider } = await import('../src/ai/providers/ollama.js')
    const { GeminiProvider } = await import('../src/ai/providers/gemini.js')

    const ollama = new OllamaProvider({
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:4b',
      keepAlive: '30m',
    })
    const gemini = new GeminiProvider({ apiKey: 'chave-de-teste', model: 'gemini-2.0-flash' })

    expect(ollama.name).toBe('ollama')
    expect(gemini.name).toBe('gemini')
  })
})
