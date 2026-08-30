import { describe, it, expect } from 'vitest'
import {
  botSpeakers,
  classifyExchanges,
  closestEntries,
  groupGaps,
  rankLearned,
  resolveLocally,
  PROMOTE_AFTER_HITS,
  type LoggedTurn,
} from '../src/tools/gaps.js'
import type { LearnedCommand } from '../src/dialogue/learned.js'
import { entrySchema, type RawEntry } from '../src/dialogue/schema.js'

const BOT = 'Dudu'

function entry(over: Partial<RawEntry> & { id: string }): RawEntry {
  return entrySchema.parse({ responses: ['oi'], ...over })
}

const ENTRIES: RawEntry[] = [
  entry({ id: 'saudacao', patterns: ['oi', 'ola'] }),
  entry({ id: 'habilidade_fisica', patterns: ['voce sabe voar', 'voce sabe nadar'] }),
  entry({ id: 'nao_entendi', trigger: 'fallback', patterns: [] }),
]

const OPTIONS = { botName: BOT, entries: ENTRIES, minConfidence: 0.7 }

function turn(over: Partial<LoggedTurn> & { speaker: string; text: string }): LoggedTurn {
  return { day: '2026-08-19', ...over }
}

const player = (text: string, day = '2026-08-19') =>
  turn({ speaker: 'Kid', text, source: 'command', day })
const bot = (text: string, over: Partial<LoggedTurn> = {}) =>
  turn({ speaker: BOT, text, source: 'repertoire', ...over })

describe('botSpeakers', () => {
  it('deduz o bot pela origem da fala, não por config', () => {
    const bots = botSpeakers([player('oi'), bot('oi!', { entryId: 'saudacao' })])
    expect([...bots]).toEqual([BOT])
  })

  it('trata como jogador quem só fala com source command', () => {
    const bots = botSpeakers([
      player('oi'),
      turn({ speaker: 'Outro', text: 'eai', source: 'command' }),
    ])
    expect(bots.has('Outro')).toBe(false)
  })
})

describe('classifyExchanges', () => {
  it('marca miss quando a resposta foi nao_entendi', () => {
    const exchanges = classifyExchanges([
      player('cave um buraco'),
      bot('Hmm, não entendi.', { entryId: 'nao_entendi' }),
    ])
    expect(exchanges).toHaveLength(1)
    expect(exchanges[0]?.kind).toBe('miss')
  })

  it('marca ai quando só a IA resolveu, guardando a resposta dela', () => {
    const exchanges = classifyExchanges([
      player('voce gosta de chuva'),
      bot('Adoro! Fico ouvindo o barulhinho.', { source: 'llm' }),
    ])
    expect(exchanges[0]?.kind).toBe('ai')
    expect(exchanges[0]?.botReply).toBe('Adoro! Fico ouvindo o barulhinho.')
  })

  it('não conta fala espontânea como resposta', () => {
    const exchanges = classifyExchanges([
      player('oi'),
      bot('Anoiteceu!', { source: 'spontaneous', entryId: 'evento_anoiteceu' }),
      bot('Hmm, não entendi.', { entryId: 'nao_entendi' }),
    ])
    expect(exchanges[0]?.kind).toBe('miss')
  })

  it('fecha a janela na próxima fala do jogador', () => {
    const exchanges = classifyExchanges([
      player('oi'),
      player('cave um buraco'),
      bot('Hmm, não entendi.', { entryId: 'nao_entendi' }),
    ])
    expect(exchanges[0]?.kind).toBe('local') // "oi" ficou sem resposta, não é miss
    expect(exchanges[1]?.kind).toBe('miss')
  })

  it('ignora fala vazia', () => {
    expect(classifyExchanges([player('   ')])).toHaveLength(0)
  })
})

describe('groupGaps', () => {
  it('junta as variações de escrita num só grupo', () => {
    const turns = [
      player('ME PROTEJA!!'),
      bot('Hmm, não entendi.', { entryId: 'nao_entendi' }),
      player('me proteja'),
      bot('Não peguei essa.', { entryId: 'nao_entendi' }),
      player('Dudu me proteja'),
      bot('Repete pra mim?', { entryId: 'nao_entendi' }),
    ]
    const groups = groupGaps(classifyExchanges(turns), OPTIONS)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.normalized).toBe('me proteja')
    expect(groups[0]?.count).toBe(3)
    expect(groups[0]?.variants).toHaveLength(3)
  })

  it('não mistura miss com o que a IA resolveu', () => {
    const groups = groupGaps(
      classifyExchanges([
        player('me proteja'),
        bot('Hmm, não entendi.', { entryId: 'nao_entendi' }),
        player('me proteja', '2026-08-20'),
        bot('Deixa comigo!', { source: 'llm', day: '2026-08-20' }),
      ]),
      OPTIONS,
    )
    expect(groups.map((g) => g.kind).sort()).toEqual(['ai', 'miss'])
  })

  it('marca o gap que a cascata já resolve hoje', () => {
    const groups = groupGaps(
      classifyExchanges([
        player('voce sabe voar?'),
        bot('Não entendi.', { entryId: 'nao_entendi' }),
      ]),
      OPTIONS,
    )
    expect(groups[0]?.resolvedNow.level).toBe('repertorio')
  })

  it('reconhece comando, não só repertório, como gap já fechado', () => {
    const groups = groupGaps(
      classifyExchanges([player('me segue'), bot('Não entendi.', { entryId: 'nao_entendi' })]),
      OPTIONS,
    )
    expect(groups[0]?.resolvedNow.level).toBe('comando')
  })

  it('ordena pelo que mais repetiu', () => {
    const turns = [
      player('cave um buraco'),
      bot('Não entendi.', { entryId: 'nao_entendi' }),
      player('me proteja'),
      bot('Não entendi.', { entryId: 'nao_entendi' }),
      player('me proteja'),
      bot('Não entendi.', { entryId: 'nao_entendi' }),
    ]
    const groups = groupGaps(classifyExchanges(turns), OPTIONS)
    expect(groups[0]?.normalized).toBe('me proteja')
  })
})

describe('closestEntries', () => {
  it('aponta a entrada parecida para virar padrão a mais', () => {
    const [top] = closestEntries('voce sabe voar mesmo', ENTRIES)
    expect(top?.entryId).toBe('habilidade_fisica')
    expect(top?.score).toBe(1)
  })

  it('devolve vazio quando o assunto é novo', () => {
    expect(closestEntries('constroi uma ponte', ENTRIES)).toEqual([])
  })

  it('não sugere entrada de fallback nem espontânea', () => {
    const entries = [entry({ id: 'nao_entendi', trigger: 'fallback', patterns: ['oi'] })]
    expect(closestEntries('oi', entries)).toEqual([])
  })
})

describe('resolveLocally', () => {
  it('comando ganha do repertório, como na cascata real', () => {
    expect(resolveLocally('para', OPTIONS).level).toBe('comando')
  })

  it('diz qual entrada casou', () => {
    const result = resolveLocally('Oi!!', OPTIONS)
    expect(result.level).toBe('repertorio')
    expect(result.detail).toContain('saudacao')
  })

  it('sobra para a IA o que ninguém cobre', () => {
    expect(resolveLocally('constroi uma ponte de vidro', OPTIONS).level).toBe('ia')
  })
})

describe('comandos aprendidos no relatório', () => {
  const learned: LearnedCommand[] = [
    {
      phrase: 'pega umas madeirinhas',
      intent: { type: 'COLLECT_BLOCK', params: { block: 'madeira', count: 8 } },
      replies: ['Já vou pegar!'],
      provider: 'gemini',
      examples: ['pega umas madeirinhas', 'PEGA UMAS MADEIRINHAS'],
      learnedAt: '2026-08-20T10:00:00.000Z',
      lastUsedAt: '2026-08-20T11:00:00.000Z',
      hits: 5,
    },
    {
      phrase: 'faz uma casinha de pedra',
      intent: { type: 'BUILD', params: { structure: 'casa', material: 'pedra' } },
      replies: [],
      provider: 'ollama',
      examples: ['faz uma casinha de pedra'],
      learnedAt: '2026-08-20T10:00:00.000Z',
      lastUsedAt: '2026-08-20T10:30:00.000Z',
      hits: 1,
    },
  ]

  it('ordena pelo que a criança mais repete', () => {
    expect(rankLearned(learned).map((l) => l.phrase)).toEqual([
      'pega umas madeirinhas',
      'faz uma casinha de pedra',
    ])
  })

  it('marca candidato a virar regex a partir do teto de usos', () => {
    const ranked = rankLearned(learned)
    expect(ranked[0]?.promote).toBe(true)
    expect(ranked[1]?.promote).toBe(false)
    expect(PROMOTE_AFTER_HITS).toBeGreaterThan(1)
  })

  it('guarda quem ensinou e a intenção', () => {
    const [top] = rankLearned(learned)
    expect(top?.provider).toBe('gemini')
    expect(top?.intent).toBe('COLLECT_BLOCK')
  })

  it('comando aprendido conta como resolvido local, não como lacuna', () => {
    const exchanges = classifyExchanges([
      player('pega umas madeirinhas'),
      bot('Deixa comigo!', { source: 'learned', entryId: 'comando_aprendido' }),
    ])
    expect(exchanges[0]?.kind).toBe('local')
    expect(groupGaps(exchanges, OPTIONS)).toEqual([])
  })

  it('reconhece o bot num log que só tem falas de comando aprendido', () => {
    const bots = botSpeakers([player('pega madeira'), bot('Já vou!', { source: 'learned' })])
    expect(bots.has(BOT)).toBe(true)
  })
})

/**
 * O relatório lê só conversa: recado do jogo gravado antes do filtro da borda
 * existir não pode virar lacuna de repertório.
 * Ver: conversation_memory_delta.md → "A rotina de manutenção lê só conversa".
 */
describe('recado do jogo no histórico antigo', () => {
  const turns: LoggedTurn[] = [
    turn({ speaker: 'Miguel', text: 'Set own game mode to Creative Mode]', source: 'command' }),
    turn({ speaker: 'Dudu', text: 'Eba, modo criativo!', source: 'llm' }),
    turn({ speaker: 'Miguel', text: 'Teleported Odraude to Miguel]', source: 'command' }),
    turn({ speaker: 'Dudu', text: 'Cheguei perto de você!', source: 'llm' }),
    turn({ speaker: 'Miguel', text: 'me conta um segredo do minecraft', source: 'command' }),
    turn({ speaker: 'Dudu', text: 'não entendi', source: 'repertoire', entryId: 'nao_entendi' }),
  ]

  it('não vira troca de conversa nenhuma', () => {
    const exchanges = classifyExchanges(turns)
    expect(exchanges).toHaveLength(1)
    expect(exchanges[0]?.playerText).toBe('me conta um segredo do minecraft')
  })

  it('não aparece como lacuna no relatório', () => {
    const groups = groupGaps(classifyExchanges(turns), OPTIONS)
    expect(groups.map((g) => g.normalized)).toEqual(['me conta um segredo do minecraft'])
  })
})
