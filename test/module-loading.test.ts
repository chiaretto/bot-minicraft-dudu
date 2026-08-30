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

/**
 * Prazo por teste, generoso de propósito.
 *
 * Cada `it` daqui SOBE UM PROCESSO NODE e importa `mineflayer` de verdade —
 * ~0,5 s sozinho, e mais que isso com a suíte inteira rodando em paralelo. Com
 * o prazo padrão de 5 s do vitest, um deles falhava sozinho mais ou menos uma
 * vez a cada três rodadas completas, sem nada de errado no código.
 */
const PRAZO_SPAWN_MS = 30_000

describe.skipIf(!DIST_READY)('carregamento em ESM nativo (sobre o dist/)', () => {
  beforeAll(() => {
    if (!DIST_READY) console.warn('dist/ ausente — rode `npm run build` antes')
  })

  it('mineflayer-pathfinder expõe goals via import default', () => {
    const result = importInRealNode('mineflayer-pathfinder')
    expect(result.error).toBe('')
    expect(result.ok).toBe(true)
  }, PRAZO_SPAWN_MS)

  it('dist/minecraft/client.js carrega', () => {
    const result = importInRealNode('./dist/minecraft/client.js')
    // Se o interop quebrar, a mensagem é "does not provide an export named".
    expect(result.error).not.toMatch(/does not provide an export named/)
    expect(result.ok).toBe(true)
  }, PRAZO_SPAWN_MS)

  it('dist/behaviors/actions/index.js carrega', () => {
    const result = importInRealNode('./dist/behaviors/actions/index.js')
    expect(result.error).not.toMatch(/does not provide an export named/)
    expect(result.ok).toBe(true)
  }, PRAZO_SPAWN_MS)

  it('dist/app/bot.js carrega — o composition root inteiro', () => {
    const result = importInRealNode('./dist/app/bot.js')
    expect(result.error).not.toMatch(/does not provide an export named/)
    expect(result.ok).toBe(true)
  }, PRAZO_SPAWN_MS)

  // `vec3` também é CommonJS: `import { Vec3 } from 'vec3'` é a mesma armadilha
  // do `goals` do pathfinder. Funciona porque o pacote faz `v.Vec3 = Vec3`, que
  // o cjs-module-lexer detecta — mas isso só o Node de verdade comprova.
  it('vec3 expõe Vec3 como named export', () => {
    const result = importInRealNode('vec3')
    expect(result.error).toBe('')
    expect(result.ok).toBe(true)
  }, PRAZO_SPAWN_MS)

  it('dist/minecraft/visibility.js carrega com o Vec3 de verdade', () => {
    const result = importInRealNode('./dist/minecraft/visibility.js')
    expect(result.error).not.toMatch(/does not provide an export named/)
    expect(result.ok).toBe(true)
  }, PRAZO_SPAWN_MS)

  it('dist/behaviors/games/index.js carrega', () => {
    const result = importInRealNode('./dist/behaviors/games/index.js')
    expect(result.error).not.toMatch(/does not provide an export named/)
    expect(result.ok).toBe(true)
  }, PRAZO_SPAWN_MS)

  it('os providers de IA carregam suas bibliotecas', () => {
    for (const mod of ['./dist/ai/providers/ollama.js', './dist/ai/providers/gemini.js']) {
      const result = importInRealNode(mod)
      expect(result.error, mod).toBe('')
    }
  }, PRAZO_SPAWN_MS)
})

describe('superfície dos módulos (transpilado)', () => {
  it('client expõe as classes esperadas', async () => {
    const mod = await import('../src/minecraft/client.js')
    expect(typeof mod.MinecraftClient).toBe('function')
    expect(typeof mod.VersionMismatchError).toBe('function')
  }, PRAZO_SPAWN_MS)

  it('actions expõe o despachante de intenções', async () => {
    const mod = await import('../src/behaviors/actions/index.js')
    expect(typeof mod.runIntent).toBe('function')
    expect(typeof mod.equipBestWeapon).toBe('function')
  }, PRAZO_SPAWN_MS)

  it('games expõe o registro e a sessão', async () => {
    const mod = await import('../src/behaviors/games/index.js')
    expect(typeof mod.createSession).toBe('function')
    expect(typeof mod.resolveGame).toBe('function')
    expect(typeof mod.HideAndSeekSession).toBe('function')
  }, PRAZO_SPAWN_MS)

  it('o adaptador de raycast produz um Vec3 usável de verdade', async () => {
    const { raycastWorldFrom } = await import('../src/minecraft/visibility.js')
    let origin: unknown = null
    const world = raycastWorldFrom({
      world: {
        raycast: (from) => {
          origin = from
          return null
        },
      },
    })
    world?.raycast({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 1 }, 5)
    // O iterador do prismarine chama `.minus()`: sem Vec3 de verdade, a consulta
    // lançaria e o bot nunca acharia ninguém.
    const vec = origin as { minus: (other: unknown) => { x: number } }
    expect(typeof vec.minus).toBe('function')
    expect(vec.minus({ x: 1, y: 0, z: 0 }).x).toBe(0)
  }, PRAZO_SPAWN_MS)

  it('instanciar os providers não faz rede', async () => {
    const { OllamaProvider } = await import('../src/ai/providers/ollama.js')
    const { GeminiProvider } = await import('../src/ai/providers/gemini.js')

    const ollama = new OllamaProvider({
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:4b',
      keepAlive: '30m',
    })
    const gemini = new GeminiProvider({
      apiKey: 'chave-de-teste',
      model: 'gemini-flash-lite-latest',
    })

    expect(ollama.name).toBe('ollama')
    expect(gemini.name).toBe('gemini')
  }, PRAZO_SPAWN_MS)
})
