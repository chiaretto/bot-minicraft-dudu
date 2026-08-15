import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MemoryStore, localDateKey } from '../src/memory/store.js'
import { serializeTurn, readTurns } from '../src/memory/jsonl.js'
import { memorySchema } from '../src/config/schema.js'
import type { ConversationTurn } from '../src/domain/types.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dudu-mem-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function makeStore(
  over: Partial<Parameters<typeof MemoryStore.prototype.constructor>[0]> = {},
  now?: () => Date,
) {
  const config = memorySchema.parse({ dir: join(dir, 'conversations') })
  return new MemoryStore({ config, sessionId: 's1', now, ...(over as object) })
}

const turn = (text: string, over: Partial<ConversationTurn> = {}) => ({
  speaker: 'Miguel',
  text,
  source: 'repertoire' as const,
  botState: 'IDLE' as const,
  ...over,
})

describe('chave de data local', () => {
  it('formata YYYY-MM-DD', () => {
    expect(localDateKey(new Date(2026, 7, 15, 13, 0, 0))).toBe('2026-08-15')
  })

  it('usa a data local, não UTC', () => {
    // 23:30 local em 15/08 continua sendo 15/08 mesmo que em UTC já seja 16.
    expect(localDateKey(new Date(2026, 7, 15, 23, 30))).toBe('2026-08-15')
  })
})

describe('um arquivo por dia', () => {
  it('cria o arquivo do dia na primeira troca', () => {
    const store = makeStore({}, () => new Date(2026, 7, 15, 10, 0))
    store.record(turn('oi'))
    expect(existsSync(join(dir, 'conversations', '2026-08-15.jsonl'))).toBe(true)
  })

  it('acrescenta ao mesmo arquivo no mesmo dia', () => {
    const store = makeStore({}, () => new Date(2026, 7, 15, 10, 0))
    store.record(turn('um'))
    store.record(turn('dois'))
    const lines = readFileSync(join(dir, 'conversations', '2026-08-15.jsonl'), 'utf8')
      .trim()
      .split('\n')
    expect(lines).toHaveLength(2)
  })

  it('vira para o arquivo do dia seguinte à meia-noite', () => {
    let now = new Date(2026, 7, 15, 23, 59)
    const store = makeStore({}, () => now)
    store.record(turn('antes'))
    now = new Date(2026, 7, 16, 0, 1)
    store.record(turn('depois'))

    expect(readFileSync(join(dir, 'conversations', '2026-08-15.jsonl'), 'utf8')).toContain('antes')
    expect(readFileSync(join(dir, 'conversations', '2026-08-16.jsonl'), 'utf8')).toContain('depois')
    // O arquivo anterior não perdeu nada.
    expect(readFileSync(join(dir, 'conversations', '2026-08-15.jsonl'), 'utf8')).not.toContain(
      'depois',
    )
  })

  it('segunda sessão no mesmo dia faz append, não sobrescreve', () => {
    const now = () => new Date(2026, 7, 15, 10, 0)
    makeStore({ sessionId: 'manha' }, now).record(turn('de manhã'))
    makeStore({ sessionId: 'tarde' }, now).record(turn('de tarde'))

    const content = readFileSync(join(dir, 'conversations', '2026-08-15.jsonl'), 'utf8')
    expect(content).toContain('de manhã')
    expect(content).toContain('de tarde')
  })
})

describe('formato do registro', () => {
  it('grava os campos obrigatórios', () => {
    const store = makeStore({}, () => new Date(2026, 7, 15, 10, 0))
    const recorded = store.record(turn('oi', { entryId: 'saudacao' }))

    expect(recorded.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(recorded.speaker).toBe('Miguel')
    expect(recorded.source).toBe('repertoire')
    expect(recorded.botState).toBe('IDLE')
    expect(recorded.sessionId).toBe('s1')
    expect(recorded.entryId).toBe('saudacao')
  })

  it('registra o provider quando a resposta veio da IA', () => {
    const store = makeStore({}, () => new Date(2026, 7, 15, 10, 0))
    const recorded = store.record(
      turn('resposta', { speaker: 'Dudu', source: 'llm', provider: 'ollama', latencyMs: 900 }),
    )
    expect(recorded.source).toBe('llm')
    expect(recorded.provider).toBe('ollama')
  })

  it('escapa quebra de linha: um objeto JSON por linha', () => {
    const store = makeStore({}, () => new Date(2026, 7, 15, 10, 0))
    store.record(turn('linha um\nlinha dois'))
    const raw = readFileSync(join(dir, 'conversations', '2026-08-15.jsonl'), 'utf8')
    expect(raw.trim().split('\n')).toHaveLength(1)
    expect(JSON.parse(raw.trim()).text).toBe('linha um\nlinha dois')
  })

  it('serializeTurn termina com newline', () => {
    expect(serializeTurn({ ...turn('x'), ts: 't', sessionId: 's' })).toMatch(/\n$/)
  })
})

describe('tolerância a corrupção', () => {
  it('pula linha truncada e carrega o resto', () => {
    const path = join(dir, 'conversations', '2026-08-15.jsonl')
    mkdirSync(join(dir, 'conversations'), { recursive: true })
    writeFileSync(
      path,
      serializeTurn({ ...turn('boa'), ts: 't1', sessionId: 's' }) +
        '{"text": "truncad\n' +
        serializeTurn({ ...turn('outra boa'), ts: 't2', sessionId: 's' }),
    )

    const result = readTurns(path)
    expect(result.turns).toHaveLength(2)
    expect(result.corruptedLines).toBe(1)
  })

  it('arquivo inexistente devolve vazio', () => {
    expect(readTurns(join(dir, 'nao-existe.jsonl')).turns).toEqual([])
  })
})

describe('janela curta em RAM', () => {
  it('descarta a mais antiga ao encher, mas o arquivo mantém tudo', () => {
    const config = memorySchema.parse({ dir: join(dir, 'conversations'), shortTermWindow: 3 })
    const store = new MemoryStore({ config, sessionId: 's', now: () => new Date(2026, 7, 15) })

    for (let i = 1; i <= 5; i++) store.record(turn(`msg ${i}`))

    expect(store.shortTerm()).toHaveLength(3)
    expect(store.shortTerm()[0]!.text).toBe('msg 3')

    const lines = readFileSync(join(dir, 'conversations', '2026-08-15.jsonl'), 'utf8')
      .trim()
      .split('\n')
    expect(lines).toHaveLength(5)
  })
})

describe('retomada do contexto do dia', () => {
  it('reconstrói a janela a partir do arquivo de hoje', () => {
    const now = () => new Date(2026, 7, 15, 10, 0)
    const first = makeStore({}, now)
    first.record(turn('meu nome favorito de cachorro é Bolinha'))

    const restarted = makeStore({}, now)
    expect(restarted.shortTerm()).toHaveLength(0)
    const result = restarted.resume()
    expect(result.loaded).toBe(1)
    expect(restarted.shortTerm()[0]!.text).toContain('Bolinha')
  })

  it('não carrega dias anteriores', () => {
    makeStore({}, () => new Date(2026, 7, 14, 10, 0)).record(turn('conversa de ontem'))

    const today = makeStore({}, () => new Date(2026, 7, 15, 10, 0))
    today.resume()
    expect(today.shortTerm()).toHaveLength(0)
    // O arquivo de ontem continua intacto em disco.
    expect(existsSync(join(dir, 'conversations', '2026-08-14.jsonl'))).toBe(true)
  })

  it('resumeToday desligado começa com janela vazia', () => {
    const now = () => new Date(2026, 7, 15, 10, 0)
    makeStore({}, now).record(turn('antes'))

    const config = memorySchema.parse({ dir: join(dir, 'conversations'), resumeToday: false })
    const store = new MemoryStore({ config, sessionId: 's', now })
    expect(store.resume().loaded).toBe(0)
    expect(store.shortTerm()).toHaveLength(0)
  })
})

describe('durabilidade', () => {
  it('falha de escrita é reportada mas não derruba o bot', () => {
    const errors: Error[] = []
    // Um ARQUIVO ocupando o lugar onde o diretório deveria estar: mkdir falha
    // com ENOTDIR na hora, sem depender de permissão do sistema.
    const blocker = join(dir, 'bloqueado')
    writeFileSync(blocker, 'sou um arquivo, não um diretório')

    const config = memorySchema.parse({ dir: join(blocker, 'conversations') })
    const store = new MemoryStore({
      config,
      sessionId: 's',
      now: () => new Date(2026, 7, 15),
      onWriteError: (e) => errors.push(e),
    })

    expect(() => store.record(turn('oi'))).not.toThrow()
    expect(errors).toHaveLength(1)
    // A janela em RAM continua funcionando mesmo sem disco.
    expect(store.shortTerm()).toHaveLength(1)
  })
})

describe('retenção', () => {
  it('apaga arquivos mais velhos que retentionDays', () => {
    const now = () => new Date(2026, 7, 15, 10, 0)
    const convDir = join(dir, 'conversations')
    mkdirSync(convDir, { recursive: true })
    writeFileSync(join(convDir, '2026-01-01.jsonl'), '')
    writeFileSync(join(convDir, '2026-08-14.jsonl'), '')
    writeFileSync(join(convDir, 'nao-e-historico.txt'), '')

    const config = memorySchema.parse({ dir: convDir, retentionDays: 30 })
    const removed = new MemoryStore({ config, sessionId: 's', now }).applyRetention()

    expect(removed).toContain('2026-01-01.jsonl')
    expect(existsSync(join(convDir, '2026-08-14.jsonl'))).toBe(true)
    expect(existsSync(join(convDir, 'nao-e-historico.txt'))).toBe(true)
  })

  it('retentionDays null não apaga nada', () => {
    const convDir = join(dir, 'conversations')
    mkdirSync(convDir, { recursive: true })
    writeFileSync(join(convDir, '2020-01-01.jsonl'), '')

    const config = memorySchema.parse({ dir: convDir, retentionDays: null })
    const removed = new MemoryStore({
      config,
      sessionId: 's',
      now: () => new Date(2026, 7, 15),
    }).applyRetention()

    expect(removed).toEqual([])
    expect(existsSync(join(convDir, '2020-01-01.jsonl'))).toBe(true)
  })
})
