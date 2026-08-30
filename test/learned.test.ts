import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  findLearned,
  isCorrection,
  isEchoCommand,
  isQuestion,
  learnBlockReason,
  learnedPhrase,
  mergeReply,
  shouldLearn,
  shouldUnlearn,
  type LearnedCommand,
} from '../src/dialogue/learned.js'
import { LearnedStore } from '../src/memory/learned-store.js'
import { isLearnable, LEARNABLE_INTENTS, type Intent } from '../src/domain/intent.js'
import { learnedSchema } from '../src/config/schema.js'

const BOT = 'Dudu'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dudu-learned-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const COLLECT: Intent = { type: 'COLLECT_BLOCK', params: { block: 'madeira', count: 8 } }
const BUILD: Intent = { type: 'BUILD', params: { structure: 'casa' } }

function command(over: Partial<LearnedCommand> & { phrase: string }): LearnedCommand {
  return {
    intent: COLLECT,
    replies: [],
    provider: 'gemini',
    examples: [],
    learnedAt: '2026-08-20T10:00:00.000Z',
    lastUsedAt: '2026-08-20T10:00:00.000Z',
    hits: 0,
    ...over,
  }
}

function makeStore(
  over: Partial<Parameters<typeof LearnedStore.prototype.constructor>[0]> = {},
  configOver: Record<string, unknown> = {},
) {
  const config = learnedSchema.parse({ path: join(dir, 'learned.json'), ...configOver })
  return new LearnedStore({ config, botName: BOT, ...(over as object) })
}

// ─────────────────────────── catálogo aprendível ───────────────────────────

describe('isLearnable', () => {
  it('aceita intenção cujos parâmetros são vocabulário', () => {
    expect(isLearnable(COLLECT)).toBe(true)
    expect(isLearnable(BUILD)).toBe(true)
    expect(isLearnable({ type: 'FOLLOW', params: {} })).toBe(true)
  })

  it('recusa GOTO_COORDS: a coordenada é do momento, não do pedido', () => {
    expect(isLearnable({ type: 'GOTO_COORDS', params: { x: 104, y: 64, z: -233 } })).toBe(false)
  })

  it('recusa intenção fora do catálogo', () => {
    expect(isLearnable({ type: 'CHAT', params: { text: 'oi' } })).toBe(false)
    expect(isLearnable({ type: 'UNKNOWN', params: {} })).toBe(false)
  })

  it('recusa parâmetro com posição de mundo mesmo em tipo aprendível', () => {
    // Rede de segurança para intenção nova que entre no catálogo por engano.
    const forged = { type: 'FOLLOW', params: { x: 1, y: 2, z: 3 } } as unknown as Intent
    expect(isLearnable(forged)).toBe(false)
  })

  it('GOTO_COORDS não está no catálogo, nem por descuido', () => {
    expect(LEARNABLE_INTENTS as readonly string[]).not.toContain('GOTO_COORDS')
  })
})

// ──────────────────────────── casamento de frase ───────────────────────────

describe('findLearned', () => {
  const commands = [command({ phrase: 'pega umas madeirinhas' })]

  it('casa texto idêntico', () => {
    expect(findLearned('pega umas madeirinhas', commands, 0.85)?.confidence).toBe(1)
  })

  it('casa frase inteira contida em outra', () => {
    const match = findLearned('pega umas madeirinhas pra mim', commands, 0.85)
    expect(match?.command.phrase).toBe('pega umas madeirinhas')
  })

  it('NÃO casa por saco de palavras: mesma palavra, outro pedido', () => {
    const pega = [command({ phrase: 'pega madeira' })]
    // Todas as palavras da frase aparecem, mas não como frase: 0.75.
    expect(findLearned('pega pedra e madeira', pega, 0.85)).toBeNull()
    // Com o limiar do repertório (0.7) casaria — é justamente o que evitamos.
    expect(findLearned('pega pedra e madeira', pega, 0.7)).not.toBeNull()
  })

  it('NÃO casa frase negada, mesmo contendo a frase inteira', () => {
    const pega = [command({ phrase: 'pega madeira' })]
    // Limiar nenhum salva daqui: a frase guardada está contida, com limites de
    // palavra. Quem recusa é a guarda de negação.
    expect(findLearned('nao pega madeira', pega, 0.85)).toBeNull()
    expect(findLearned('nunca pega madeira', pega, 0.85)).toBeNull()
  })

  it('negação que faz parte do pedido não impede o casamento', () => {
    const nao = [command({ phrase: 'nao mexe no meu bau' })]
    expect(findLearned('nao mexe no meu bau', nao, 0.85)).not.toBeNull()
  })

  it('empate vai para o mais usado', () => {
    const dois = [
      command({ phrase: 'pega madeira', hits: 1 }),
      command({ phrase: 'pega madeira', hits: 9, intent: BUILD }),
    ]
    expect(findLearned('pega madeira', dois, 0.85)?.command.hits).toBe(9)
  })

  it('texto vazio não casa nada', () => {
    expect(findLearned('', commands, 0.85)).toBeNull()
  })
})

describe('learnedPhrase', () => {
  it('normaliza como a cascata: caixa, acento, pontuação e vocativo', () => {
    expect(learnedPhrase('DUDU, PEGA UMAS MADEIRINHAS!!!', BOT)).toBe('pega umas madeirinhas')
  })
})

describe('mergeReply', () => {
  it('não repete fala já guardada e mantém a mais recente no fim', () => {
    expect(mergeReply(['a', 'b'], 'a', 4)).toEqual(['b', 'a'])
  })

  it('respeita o teto, descartando a mais antiga', () => {
    expect(mergeReply(['a', 'b', 'c', 'd'], 'e', 4)).toEqual(['b', 'c', 'd', 'e'])
  })

  it('teto zero não guarda nada', () => {
    expect(mergeReply(['a'], 'b', 0)).toEqual([])
  })

  it('fala vazia não entra', () => {
    expect(mergeReply(['a'], '   ', 4)).toEqual(['a'])
  })
})

// ──────────────────────────────── o store ──────────────────────────────────

describe('LearnedStore: carga', () => {
  it('arquivo ausente é o caso normal da primeira execução', () => {
    const warnings: string[] = []
    const store = makeStore({ onWarning: (m: string) => warnings.push(m) })
    const report = store.load()
    expect(report).toMatchObject({ loaded: 0, error: null })
    expect(warnings).toEqual([])
  })

  it('arquivo corrompido começa vazio e avisa', () => {
    writeFileSync(join(dir, 'learned.json'), '{ isso não é json', 'utf8')
    const warnings: string[] = []
    const store = makeStore({ onWarning: (m: string) => warnings.push(m) })
    const report = store.load()
    expect(report.loaded).toBe(0)
    expect(report.error).not.toBeNull()
    expect(warnings.join()).toContain('ilegível')
  })

  it('formato inesperado começa vazio e avisa', () => {
    writeFileSync(join(dir, 'learned.json'), '{"version":1}', 'utf8')
    const store = makeStore()
    expect(store.load().error).toBe('formato inesperado')
  })

  // As quatro entradas ruins que estavam no `data/learned-commands.json` real
  // em 2026-08-29. Duas nasceram do retorno de comando do jogo tratado como
  // fala; duas do aprendizado não olhar o que a frase É.
  it('limpa na carga o que foi decorado antes das guardas existirem', () => {
    writeFileSync(
      join(dir, 'learned.json'),
      JSON.stringify({
        version: 1,
        commands: [
          {
            phrase: 'teleported odraude to fresherrobin90',
            intent: { type: 'LOOK_AT_OWNER', params: {} },
            examples: ['Teleported Odraude to FresherRobin90]'],
          },
          {
            phrase: 'removed 3 item s from player fresherrobin90',
            intent: { type: 'LOOK_AT_OWNER', params: {} },
            examples: ['Removed 3 item(s) from player FresherRobin90]'],
          },
          {
            phrase: 'qual sua llm',
            intent: { type: 'FOLLOW', params: {} },
            examples: ['qual sua llm ?'],
            hits: 1,
          },
          {
            phrase: 'construa uma casa quando eu falar ja',
            intent: { type: 'STAY', params: {} },
            examples: ['construa uma casa quando eu falar ja'],
          },
          { phrase: 'pega umas madeirinhas', intent: COLLECT, examples: ['pega umas madeirinhas'] },
        ],
      }),
      'utf8',
    )

    const report = makeStore().load()
    expect(report.noise).toBe(2)
    expect(report.notRequest).toBe(2)
    expect(report.loaded).toBe(1)
    // E o arquivo é reescrito: não voltam na carga seguinte.
    expect(makeStore().load().loaded).toBe(1)
  })

  it('entrada boa sobrevive à limpeza com o contador de uso intacto', () => {
    const store = makeStore()
    store.record({ text: 'pega umas madeirinhas', intent: COLLECT })
    store.touch('pega umas madeirinhas')
    store.touch('pega umas madeirinhas')

    const reloaded = makeStore()
    const report = reloaded.load()
    expect(report.loaded).toBe(1)
    expect(report.noise + report.notRequest).toBe(0)
    expect(reloaded.all()[0]?.hits).toBe(2)
  })

  it('descarta entrada que o parser de regex já resolve', () => {
    const store = makeStore()
    store.record({ text: 'venha aqui', intent: { type: 'FOLLOW', params: {} } })
    store.record({ text: 'pega umas madeirinhas', intent: COLLECT })

    const reloaded = makeStore({ isShadowed: (phrase: string) => phrase === 'venha aqui' })
    const report = reloaded.load()
    expect(report.shadowed).toBe(1)
    expect(report.loaded).toBe(1)
    // E o arquivo é reescrito sem ela: não volta a aparecer na carga seguinte.
    expect(makeStore().load().loaded).toBe(1)
  })

  it('descarta entrada inválida sem derrubar o resto', () => {
    writeFileSync(
      join(dir, 'learned.json'),
      JSON.stringify({
        version: 1,
        commands: [
          { phrase: 'ir ali', intent: { type: 'GOTO_COORDS', params: { x: 1, y: 2, z: 3 } } },
          { phrase: 'sem intencao' },
          { phrase: 'pega madeira', intent: COLLECT },
        ],
      }),
      'utf8',
    )
    const report = makeStore().load()
    expect(report.invalid).toBe(2)
    expect(report.loaded).toBe(1)
  })

  it('esquece por idade só com forgetAfterDays configurado', () => {
    const old = { ...command({ phrase: 'pega madeira' }), lastUsedAt: '2026-01-01T00:00:00.000Z' }
    writeFileSync(
      join(dir, 'learned.json'),
      JSON.stringify({ version: 1, commands: [old] }),
      'utf8',
    )
    const now = () => new Date('2026-08-20T12:00:00.000Z')

    expect(makeStore({ now }).load().loaded).toBe(1)
    expect(makeStore({ now }, { forgetAfterDays: 30 }).load()).toMatchObject({
      loaded: 0,
      expired: 1,
    })
  })
})

describe('LearnedStore: aprender e replicar', () => {
  it('grava o que a IA ensinou e acha na segunda vez', () => {
    const store = makeStore()
    expect(
      store.record({
        text: 'dudu, pega umas madeirinhas pra mim',
        intent: COLLECT,
        reply: 'Já vou pegar!',
        provider: 'gemini',
      }),
    ).toBe(true)

    const match = store.find('DUDU, PEGA UMAS MADEIRINHAS PRA MIM!')
    expect(match?.command.intent).toEqual(COLLECT)
    expect(match?.command.provider).toBe('gemini')
    expect(match?.command.replies).toEqual(['Já vou pegar!'])
  })

  it('não grava intenção fora do catálogo aprendível', () => {
    const store = makeStore()
    expect(
      store.record({
        text: 'vem aqui',
        intent: { type: 'GOTO_COORDS', params: { x: 1, y: 2, z: 3 } },
      }),
    ).toBe(false)
    expect(store.size).toBe(0)
  })

  it('mesma frase não cria entrada nova', () => {
    const store = makeStore()
    store.record({ text: 'pega madeira ai', intent: COLLECT, reply: 'Vou lá!' })
    store.record({ text: 'pega madeira ai', intent: COLLECT, reply: 'Já tô indo!' })
    expect(store.size).toBe(1)
    expect(store.all()[0]?.replies).toEqual(['Vou lá!', 'Já tô indo!'])
  })

  it('conta o uso no acerto', () => {
    const store = makeStore()
    store.record({ text: 'pega madeira ai', intent: COLLECT })
    store.touch('pega madeira ai')
    store.touch('pega madeira ai')
    expect(store.all()[0]?.hits).toBe(2)
  })

  it('descarta no replay a entrada que não valida mais', () => {
    writeFileSync(
      join(dir, 'learned.json'),
      JSON.stringify({
        version: 1,
        commands: [command({ phrase: 'pega madeira', intent: COLLECT })],
      }),
      'utf8',
    )
    const store = makeStore()
    store.load()
    // Corrompe a intenção em memória, como se o arquivo tivesse vindo assim.
    const forged = store.all()[0] as { intent: unknown }
    forged.intent = { type: 'COLLECT_BLOCK', params: { count: 8 } }

    expect(store.find('pega madeira')).toBeNull()
    expect(store.size).toBe(0)
  })

  it('esquece a pedido', () => {
    const store = makeStore()
    store.record({ text: 'pega madeira ai', intent: COLLECT })
    expect(store.forget('pega madeira ai')).toBe(true)
    expect(store.forget('pega madeira ai')).toBe(false)
    expect(store.find('pega madeira ai')).toBeNull()
  })

  it('teto de entradas descarta a usada há mais tempo', () => {
    let clock = new Date('2026-08-20T10:00:00.000Z').getTime()
    const store = makeStore({ now: () => new Date(clock) }, { maxEntries: 2 })

    store.record({ text: 'pega madeira', intent: COLLECT })
    clock += 1000
    store.record({ text: 'pega pedra', intent: COLLECT })
    clock += 1000
    store.record({ text: 'faz uma casa grande', intent: BUILD })

    expect(store.size).toBe(2)
    expect(store.all().map((c) => c.phrase)).toEqual(['pega pedra', 'faz uma casa grande'])
  })
})

describe('LearnedStore: arquivo', () => {
  it('escreve JSON válido e versionado, sem deixar temporário', () => {
    const store = makeStore()
    store.record({ text: 'pega madeira ai', intent: COLLECT })

    const raw = JSON.parse(readFileSync(join(dir, 'learned.json'), 'utf8')) as {
      version: number
      commands: unknown[]
    }
    expect(raw.version).toBe(1)
    expect(raw.commands).toHaveLength(1)
    expect(() => readFileSync(join(dir, 'learned.json.tmp'), 'utf8')).toThrow()
  })

  it('falha de escrita não derruba o bot', () => {
    const errors: string[] = []
    // Caminho dentro de um diretório impossível de criar (o pai é um arquivo).
    writeFileSync(join(dir, 'bloqueio'), 'nao sou diretorio', 'utf8')
    const store = makeStore(
      { onWriteError: (err: Error) => errors.push(err.message) },
      { path: join(dir, 'bloqueio', 'learned.json') },
    )

    expect(() => store.record({ text: 'pega madeira ai', intent: COLLECT })).not.toThrow()
    expect(errors).toHaveLength(1)
    // A entrada continua valendo na sessão: só o disco falhou.
    expect(store.find('pega madeira ai')).not.toBeNull()
  })
})

// ──────────────────── política: aprender e desaprender ─────────────────────

describe('shouldLearn', () => {
  /** Um pedido de verdade, para o teste falar só da condição que ele testa. */
  const pedido = { text: 'pega umas madeirinhas', botName: BOT }

  it('guarda o que veio da IA, tinha ação e deu certo', () => {
    expect(shouldLearn({ source: 'llm', hadAction: true, actionOk: true, ...pedido })).toBe(true)
  })

  it('não guarda ação que não deu certo', () => {
    // Recusa, cancelamento e falha chegam aqui como actionOk: false.
    expect(shouldLearn({ source: 'llm', hadAction: true, actionOk: false, ...pedido })).toBe(false)
  })

  it('não guarda conversa sem ação', () => {
    expect(shouldLearn({ source: 'llm', hadAction: false, actionOk: true, ...pedido })).toBe(false)
  })

  it('não guarda o que o parser ou o repertório resolveram', () => {
    expect(shouldLearn({ source: 'command', hadAction: true, actionOk: true, ...pedido })).toBe(
      false,
    )
    expect(shouldLearn({ source: 'repertoire', hadAction: true, actionOk: true, ...pedido })).toBe(
      false,
    )
  })

  it('não reaprende o que já é comando aprendido', () => {
    expect(shouldLearn({ source: 'learned', hadAction: true, actionOk: true, ...pedido })).toBe(
      false,
    )
  })

  // O caso real: `qual sua llm ?` virou FOLLOW porque a IA respondeu conversa e
  // mandou uma ação junto — e seguir o dono sempre "dá certo".
  it('não guarda pergunta que a IA respondeu com ação junto', () => {
    expect(
      shouldLearn({
        source: 'llm',
        hadAction: true,
        actionOk: true,
        text: 'qual sua llm ?',
        botName: BOT,
      }),
    ).toBe(false)
  })

  // O outro caso real: `construa uma casa quando eu falar ja` virou STAY.
  it('não guarda pedido preso a uma condição', () => {
    expect(
      shouldLearn({
        source: 'llm',
        hadAction: true,
        actionOk: true,
        text: 'construa uma casa quando eu falar ja',
        botName: BOT,
      }),
    ).toBe(false)
  })
})

describe('isQuestion', () => {
  it('reconhece pergunta pela interrogação', () => {
    expect(isQuestion('voce gosta de diamante?', BOT)).toBe(true)
  })

  it('reconhece pergunta sem interrogação, pela palavra que abre', () => {
    // Criança de 7 anos quase nunca fecha pergunta com "?".
    expect(isQuestion('quantos blocos de madeira voce tem', BOT)).toBe(true)
    expect(isQuestion('o que voce sabe fazer', BOT)).toBe(true)
  })

  it('enxerga a pergunta atrás do vocativo', () => {
    expect(isQuestion('dudu, qual sua llm', BOT)).toBe(true)
  })

  it('pedido não é pergunta', () => {
    expect(isQuestion('pega umas madeirinhas', BOT)).toBe(false)
    expect(isQuestion('constroi uma casinha de pedra', BOT)).toBe(false)
  })

  it('palavra interrogativa no meio da frase não faz pergunta', () => {
    // "quando" aqui é condição, não pergunta — quem barra é a outra guarda.
    expect(isQuestion('constroi uma casa quando eu falar ja', BOT)).toBe(false)
  })
})

describe('learnBlockReason', () => {
  it('diz por que a frase não vira comando decorado', () => {
    expect(learnBlockReason('qual sua llm ?', BOT)).toBe('pergunta')
    expect(learnBlockReason('construa uma casa quando eu falar ja', BOT)).toBe('condicao')
    expect(learnBlockReason('se eu falar ja voce constroi', BOT)).toBe('condicao')
    // Do arquivo real: "faça de concreto, se você não tiver, faz de madeira".
    expect(
      learnBlockReason('faca uma casa grande com concreto se voce nao tiver fas de madeira', BOT),
    ).toBe('condicao')
  })

  it('pedido direto passa', () => {
    expect(learnBlockReason('pega umas madeirinhas', BOT)).toBeNull()
    expect(learnBlockReason('me segue', BOT)).toBeNull()
  })

  // O custo aceito, escrito como teste para ninguém "consertar" sem querer.
  it('pedido em forma de pergunta perde o atalho, e isso é de propósito', () => {
    expect(learnBlockReason('sera que da pra pegar madeira?', BOT)).toBe('pergunta')
  })
})

describe('isEchoCommand', () => {
  it('reconhece entrada que nasceu de recado do jogo', () => {
    // A frase guardada já perdeu o "]" na normalização; quem denuncia é o
    // exemplo, que guarda como a mensagem chegou de verdade.
    expect(
      isEchoCommand({ examples: ['Teleported Odraude to FresherRobin90]'] }),
    ).toBe(true)
  })

  it('entrada de fala de verdade não é recado', () => {
    expect(isEchoCommand({ examples: ['pega umas madeirinhas'] })).toBe(false)
  })
})

describe('isCorrection', () => {
  it('reconhece a criança dizendo que não era aquilo', () => {
    expect(isCorrection('nao era isso', BOT)).toBe(true)
    expect(isCorrection('Não era isso!', BOT)).toBe(true)
    expect(isCorrection('errado', BOT)).toBe(true)
    expect(isCorrection('dudu, ta errado', BOT)).toBe(true)
  })

  it('não confunde com conversa parecida', () => {
    expect(isCorrection('nao era isso que eu queria construir', BOT)).toBe(false)
    expect(isCorrection('errado nada', BOT)).toBe(false)
    expect(isCorrection('para', BOT)).toBe(false)
  })
})

describe('shouldUnlearn', () => {
  const replay = { phrase: 'pega madeira', at: 1000 }

  it('`para` dentro da janela desfaz', () => {
    expect(shouldUnlearn(replay, 1000 + 14_000, 15_000)).toBe(true)
  })

  it('`para` no limite da janela ainda desfaz', () => {
    expect(shouldUnlearn(replay, 1000 + 15_000, 15_000)).toBe(true)
  })

  it('`para` fora da janela é só parar a ação', () => {
    expect(shouldUnlearn(replay, 1000 + 15_001, 15_000)).toBe(false)
  })

  it('sem replay recente não há o que desaprender', () => {
    expect(shouldUnlearn(null, 9999, 15_000)).toBe(false)
  })
})
