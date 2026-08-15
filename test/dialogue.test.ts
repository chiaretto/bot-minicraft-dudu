import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import { normalize, stripVocative, prepare } from '../src/dialogue/normalize.js'
import { scorePattern, findBestMatch } from '../src/dialogue/matcher.js'
import { VariationSelector, matchesWhen } from '../src/dialogue/selector.js'
import { resolvePlaceholders } from '../src/dialogue/placeholders.js'
import {
  parseCatalog,
  loadCatalog,
  defaultCatalogPath,
  RepertoireError,
} from '../src/dialogue/loader.js'
import { Repertoire } from '../src/dialogue/repertoire.js'
import { dialogueSchema, personaSchema } from '../src/config/schema.js'
import { MIN_VARIATIONS_WARN } from '../src/dialogue/schema.js'
import type { WorldSnapshot } from '../src/domain/types.js'

const dialogue = dialogueSchema.parse({})
const persona = personaSchema.parse({})

function snapshot(over: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
    position: { x: 100.4, y: 64, z: -200.7 },
    health: 20,
    food: 20,
    timeOfDay: 'dia',
    isNight: false,
    inventory: [{ name: 'oak_log', count: 3 }],
    ownerVisible: true,
    ownerPosition: { x: 102, y: 64, z: -200 },
    ownerHealth: 20,
    nearbyEntities: [],
    dimension: 'overworld',
    state: 'IDLE',
    ...over,
  }
}

const catalog = loadCatalog(defaultCatalogPath()).catalog

function makeRepertoire(
  over: Partial<Parameters<typeof Repertoire.prototype.constructor>[0]> = {},
) {
  return new Repertoire({
    catalog,
    dialogue,
    persona,
    owner: 'Miguel',
    ...(over as object),
  })
}

describe('normalização', () => {
  it('ignora caixa, acento e pontuação', () => {
    expect(normalize('OLÁ!!!')).toBe('ola')
  })

  it('reduz letra repetida', () => {
    expect(normalize('oiiiiii')).toBe('oi')
  })

  it('remove o vocativo do bot no começo e no fim', () => {
    expect(stripVocative(normalize('dudu, oi'), 'Dudu')).toBe('oi')
    expect(stripVocative(normalize('oi dudu'), 'Dudu')).toBe('oi')
  })

  it('não apaga tudo quando a mensagem é só o nome do bot', () => {
    expect(prepare('Dudu', 'Dudu')).toBe('dudu')
  })
})

describe('matcher', () => {
  it('pontua texto idêntico como 1', () => {
    expect(scorePattern('oi', 'oi')).toBe(1)
  })

  it('casa palavra isolada dentro da frase', () => {
    expect(scorePattern('oi tudo bem', 'oi')).toBeGreaterThanOrEqual(0.85)
  })

  it('não casa palavra que é só prefixo de outra', () => {
    expect(scorePattern('oitavo andar', 'oi')).toBe(0)
  })

  it('entrada mais específica vence quando as duas casam', () => {
    const match = findBestMatch(prepare('quem te criou?', 'Dudu'), catalog.entries)
    expect(match?.entry.id).toBe('origem')
  })

  it('identifica a entrada de identidade', () => {
    const match = findBestMatch(prepare('quem e voce', 'Dudu'), catalog.entries)
    expect(match?.entry.id).toBe('identidade')
  })

  it('não casa nada para pergunta aberta', () => {
    const match = findBestMatch(
      prepare('você acha que existe vida em outro planeta?', 'Dudu'),
      catalog.entries,
    )
    expect(match === null || match.confidence < dialogue.minConfidence).toBe(true)
  })

  it('ignora entradas que não são de chat', () => {
    const match = findBestMatch('acabou o perigo', catalog.entries)
    expect(match?.entry.id).not.toBe('combate_fim')
  })
})

describe('repertório do esconde-esconde', () => {
  /** Toda fala que a sessão do jogo emite por id. */
  const FALAS_DA_SESSAO = [
    'jogo_aceito',
    'jogo_mande_contar',
    'jogo_pode_procurar',
    'jogo_fui_achado',
    'jogo_me_entrego',
    'jogo_contando_fim',
    'jogo_busca_errada',
    'jogo_achei',
    'jogo_nao_achei',
    'jogo_sem_esconderijo',
  ]

  /** Falas que o wiring do bot emite. */
  const FALAS_DO_BOT = [
    'jogo_cancelado_monstro',
    'jogo_cancelado',
    'jogo_desconhecido',
    'jogo_desligado',
    'jogo_ja_rolando',
  ]

  const TODAS = [...FALAS_DA_SESSAO, ...FALAS_DO_BOT]

  it('todas as entradas do jogo existem no catálogo', () => {
    const rep = makeRepertoire()
    for (const id of TODAS) {
      expect(rep.has(id), id).toBe(true)
    }
  })

  it('toda entrada do jogo responde quando chamada por id', () => {
    const rep = makeRepertoire()
    for (const id of TODAS) {
      const said = rep.say(id, snapshot({ state: 'GAME' }))
      expect(said, id).not.toBeNull()
      expect(said!.text.length, id).toBeGreaterThan(0)
    }
  })

  it('nenhuma entrada do jogo fica abaixo do mínimo de variações', () => {
    for (const id of TODAS) {
      const entry = catalog.entries.find((e) => e.id === id)
      expect(entry, id).toBeDefined()
      expect(entry!.responses.length, id).toBeGreaterThanOrEqual(MIN_VARIATIONS_WARN)
    }
  })

  it('não repete a fala de busca errada nas duas buscas seguidas', () => {
    const rep = makeRepertoire()
    const first = rep.say('jogo_busca_errada', snapshot())
    const second = rep.say('jogo_busca_errada', snapshot())
    expect(first!.text).not.toBe(second!.text)
  })

  it('as falas do jogo não são pescadas por conversa comum', () => {
    // São `trigger: fallback`: só saem por id, nunca por casamento de padrão.
    const rep = makeRepertoire()
    for (const text of ['pode procurar', 'achei', 'me entrego', 'lá vou eu', 'oi']) {
      const answer = rep.respond(text, snapshot())
      expect(answer === null || !TODAS.includes(answer.entryId), text).toBe(true)
    }
  })

  it('fala de criança: curta, sem termo técnico', () => {
    const proibidos = /pathfinder|timeout|raycast|sess[ãa]o|coordenada|null|erro|invalid/i
    for (const id of TODAS) {
      const entry = catalog.entries.find((e) => e.id === id)!
      for (const response of entry.responses) {
        const text = typeof response === 'string' ? response : response.text
        expect(text.length, `${id}: ${text}`).toBeLessThanOrEqual(120)
        expect(text, `${id}: ${text}`).not.toMatch(proibidos)
      }
    }
  })

  it('a recusa de jogo desconhecido oferece o que o bot sabe', () => {
    const entry = catalog.entries.find((e) => e.id === 'jogo_desconhecido')!
    for (const response of entry.responses) {
      const text = typeof response === 'string' ? response : response.text
      expect(text.toLowerCase(), text).toContain('esconde')
    }
  })

  it('com os jogos desligados, o bot NÃO oferece esconde-esconde', () => {
    // Oferecer o que está desligado é prometer o que o bot não faz.
    const entry = catalog.entries.find((e) => e.id === 'jogo_desligado')!
    for (const response of entry.responses) {
      const text = typeof response === 'string' ? response : response.text
      expect(text.toLowerCase(), text).not.toContain('esconde-esconde')
    }
  })

  it('a derrota é admitida com graça, sem discutir com a criança', () => {
    const entry = catalog.entries.find((e) => e.id === 'jogo_fui_achado')!
    const textos = entry.responses.map((r) => (typeof r === 'string' ? r : r.text)).join(' ')
    expect(textos).toMatch(/achou|pegou|perdi/i)
    expect(textos).not.toMatch(/trapa|roubou|n[ãa]o vale/i)
  })

  it('o catálogo anuncia que o bot sabe brincar', () => {
    const rep = makeRepertoire()
    const entry = catalog.entries.find((e) => e.id === 'capacidades')!
    const textos = entry.responses.map((r) => (typeof r === 'string' ? r : r.text)).join(' ')
    expect(textos.toLowerCase()).toContain('esconde-esconde')
    // E a pergunta direta chega na entrada certa.
    expect(rep.respond('voce sabe brincar', snapshot())?.entryId).toBe('capacidades')
  })

  it('aceita variação condicionada ao estado GAME', () => {
    expect(matchesWhen({ state: 'GAME' }, { snapshot: snapshot({ state: 'GAME' }) })).toBe(true)
    expect(matchesWhen({ state: 'GAME' }, { snapshot: snapshot({ state: 'IDLE' }) })).toBe(false)
  })
})

describe('variação de respostas', () => {
  it('nunca repete a última usada quando há alternativa', () => {
    const selector = new VariationSelector(() => 0)
    const responses = ['a', 'b']
    const first = selector.select('e', responses, {})
    const second = selector.select('e', responses, {})
    expect(first).not.toBe(second)
  })

  it('três saudações seguidas dão três respostas diferentes', () => {
    const rep = makeRepertoire()
    const seen = new Set<string>()
    for (let i = 0; i < 3; i++) {
      const r = rep.respond('oi', snapshot())
      expect(r).not.toBeNull()
      seen.add(r!.text)
    }
    expect(seen.size).toBe(3)
  })

  it('com uma só resposta, devolve sempre a mesma sem quebrar', () => {
    const selector = new VariationSelector()
    expect(selector.select('e', ['unica'], {})).toBe('unica')
    expect(selector.select('e', ['unica'], {})).toBe('unica')
  })
})

describe('placeholders', () => {
  it('resolve nome do dono e do bot', () => {
    const out = resolvePlaceholders('Oi {owner}! Sou eu, o {botName}!', {
      owner: 'Miguel',
      botName: 'Dudu',
      originStory: 'x',
    })
    expect(out).toBe('Oi Miguel! Sou eu, o Dudu!')
  })

  it('resolve vida do bot', () => {
    const out = resolvePlaceholders('Tô com {health} de vida!', {
      owner: 'Miguel',
      botName: 'Dudu',
      originStory: 'x',
      snapshot: snapshot({ health: 14 }),
    })
    expect(out).toBe('Tô com 14 de vida!')
  })

  it('resolve coordenadas arredondadas', () => {
    const out = resolvePlaceholders('{coords}', {
      owner: 'Miguel',
      botName: 'Dudu',
      originStory: 'x',
      snapshot: snapshot(),
    })
    expect(out).toBe('100, 64, -201')
  })

  it('a frase de origem vem da config', () => {
    const rep = makeRepertoire()
    const r = rep.respond('quem te criou?', snapshot())
    expect(r?.entryId).toBe('origem')
    // Todas as variações de `origem` falam do pai; a primeira é literalmente a config.
    expect(r!.text.toLowerCase()).toContain('pai')
  })
})

describe('filtros de contexto (when)', () => {
  it('escolhe a variante do estado atual', () => {
    const rep = makeRepertoire()
    const r = rep.respond('o que você tá fazendo?', snapshot({ state: 'STAY' }))
    expect(r?.entryId).toBe('o_que_faz_agora')
    expect(r!.text).toMatch(/guarda|Vigiando/i)
  })

  it('declina quando nenhuma variante casa com o contexto', () => {
    // `o_que_faz_agora` só tem variantes com `when: state`. Um estado sem
    // variante correspondente faz o repertório passar a bola para a IA.
    const rep = makeRepertoire()
    const r = rep.respond('o que você tá fazendo?', snapshot({ state: 'EMERGENCY' }))
    expect(r).toBeNull()
  })

  it('matchesWhen exige snapshot quando a cláusula depende do mundo', () => {
    expect(matchesWhen({ state: 'IDLE' }, { snapshot: null })).toBe(false)
    expect(matchesWhen(undefined, { snapshot: null })).toBe(true)
  })

  it('healthBelow só vale abaixo do limite', () => {
    expect(matchesWhen({ healthBelow: 10 }, { snapshot: snapshot({ health: 20 }) })).toBe(false)
    expect(matchesWhen({ healthBelow: 10 }, { snapshot: snapshot({ health: 5 }) })).toBe(true)
  })
})

describe('limiar de confiança', () => {
  it('match fraco prefere a IA', () => {
    const strict = new Repertoire({
      catalog,
      dialogue: { ...dialogue, minConfidence: 0.99 },
      persona,
      owner: 'Miguel',
    })
    // 0.85 (palavra dentro da frase) fica abaixo de 0.99 e é recusado.
    expect(strict.respond('oi tudo bem por ai', snapshot())).toBeNull()
  })

  it('repertório desligado passa tudo adiante', () => {
    const off = new Repertoire({
      catalog,
      dialogue: { ...dialogue, enabled: false },
      persona,
      owner: 'Miguel',
    })
    expect(off.respond('oi', snapshot())).toBeNull()
  })
})

describe('falas espontâneas', () => {
  it('dispara e respeita o cooldown', () => {
    let now = 1_000_000
    const rep = new Repertoire({ catalog, dialogue, persona, owner: 'Miguel', now: () => now })

    expect(rep.spontaneous('evento_anoiteceu', snapshot())).not.toBeNull()
    // Dentro do cooldown: suprimida.
    now += 1000
    expect(rep.spontaneous('evento_amanheceu', snapshot())).toBeNull()
    // Passado o cooldown: volta a falar.
    now += dialogue.spontaneousCooldownMs
    expect(rep.spontaneous('evento_amanheceu', snapshot())).not.toBeNull()
  })

  it('não fala quando espontâneas estão desligadas', () => {
    const off = new Repertoire({
      catalog,
      dialogue: { ...dialogue, spontaneous: false },
      persona,
      owner: 'Miguel',
    })
    expect(off.spontaneous('evento_anoiteceu', snapshot())).toBeNull()
  })

  it('respeita o when da própria entrada', () => {
    const rep = makeRepertoire()
    // evento_dono_machucado exige ownerHealthBelow: 8
    expect(rep.spontaneous('evento_dono_machucado', snapshot({ ownerHealth: 20 }))).toBeNull()
    expect(rep.spontaneous('evento_dono_machucado', snapshot({ ownerHealth: 4 }))).not.toBeNull()
  })

  it('não trata entrada de chat como espontânea', () => {
    const rep = makeRepertoire()
    expect(rep.spontaneous('saudacao', snapshot())).toBeNull()
  })
})

describe('say() para entradas de fallback', () => {
  it('responde nao_entendi', () => {
    const rep = makeRepertoire()
    expect(rep.say('nao_entendi', snapshot())?.text).toBeTruthy()
  })

  it('tem as entradas exigidas pelas outras camadas', () => {
    const rep = makeRepertoire()
    for (const id of [
      'nao_entendi',
      'espera',
      'combate_inicio',
      'combate_fim',
      'combate_creeper',
      'combate_desarmado',
      'combate_recuo',
    ]) {
      expect(rep.has(id), `entrada ausente: ${id}`).toBe(true)
    }
  })

  it('devolve null para entrada inexistente', () => {
    expect(makeRepertoire().say('nao_existe')).toBeNull()
  })
})

describe('catálogo padrão', () => {
  const report = loadCatalog(defaultCatalogPath())

  it('tem pelo menos as 21 entradas e 100 respostas do apêndice da spec', () => {
    expect(report.entryCount).toBeGreaterThanOrEqual(21)
    expect(report.responseCount).toBeGreaterThanOrEqual(100)
  })

  it('toda entrada tem ao menos 4 variações', () => {
    const poor = report.catalog.entries.filter((e) => e.responses.length < 4).map((e) => e.id)
    expect(poor).toEqual([])
    expect(report.warnings).toEqual([])
  })

  it('cobre as categorias exigidas pela proposta', () => {
    const ids = new Set(report.catalog.entries.map((e) => e.id))
    for (const id of [
      'saudacao',
      'despedida',
      'identidade',
      'origem',
      'capacidades',
      'estado_bot',
      'inventario_social',
      'cortesia',
      'afeto',
      'elogio_bot',
      'provocacao',
      'humor',
      'jogo_perguntas',
      'presenca',
      'recusa_escopo',
      'nao_entendi',
      'evento_anoiteceu',
      'evento_amanheceu',
      'evento_dono_morreu',
      'evento_dono_machucado',
    ]) {
      expect(ids.has(id), `categoria ausente: ${id}`).toBe(true)
    }
  })
})

describe('validação do catálogo', () => {
  const ok = { version: 1, entries: [{ id: 'a', patterns: ['oi'], responses: ['x'] }] }

  it('aceita catálogo mínimo válido', () => {
    expect(parseCatalog(ok).entryCount).toBe(1)
  })

  it('recusa entrada sem resposta nenhuma, citando o id', () => {
    expect(() => parseCatalog({ version: 1, entries: [{ id: 'vazia', responses: [] }] })).toThrow(
      /vazia/,
    )
  })

  it('recusa placeholder desconhecido, citando o id', () => {
    expect(() =>
      parseCatalog({
        version: 1,
        entries: [{ id: 'ruim', responses: ['oi {coisaQueNaoExiste}'] }],
      }),
    ).toThrow(/ruim.*coisaQueNaoExiste/s)
  })

  it('recusa ids repetidos', () => {
    expect(() =>
      parseCatalog({
        version: 1,
        entries: [
          { id: 'dup', responses: ['a'] },
          { id: 'dup', responses: ['b'] },
        ],
      }),
    ).toThrow(RepertoireError)
  })

  it('avisa (sem falhar) quando faltam variações', () => {
    const report = parseCatalog({ version: 1, entries: [{ id: 'poucas', responses: ['a', 'b'] }] })
    expect(report.warnings).toHaveLength(1)
    expect(report.warnings[0]).toContain('poucas')
  })

  it('o YAML embarcado é sintaticamente válido', () => {
    expect(() => parseYaml(readFileSync(defaultCatalogPath(), 'utf8'))).not.toThrow()
  })
})

describe('cascata: repertório não faz rede', () => {
  it('responde saudação sem qualquer I/O', () => {
    const rep = makeRepertoire()
    const before = Date.now()
    const r = rep.respond('dudu, oi', snapshot())
    expect(r).not.toBeNull()
    expect(Date.now() - before).toBeLessThan(100)
  })
})
