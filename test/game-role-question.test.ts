import { describe, it, expect } from 'vitest'
import { parseCommand, parseRoleAnswer } from '../src/behaviors/commands.js'
import { botRoleForChoice, BOT_ROLE_BY_CHOICE } from '../src/domain/games.js'
import { resolveRole } from '../src/behaviors/games/index.js'
import { gamesSchema } from '../src/config/schema.js'
import { loadCatalog, defaultCatalogPath } from '../src/dialogue/loader.js'
import { normalize } from '../src/dialogue/normalize.js'

/**
 * A pergunta de papel: convite que não diz quem faz o quê não escolhe pela
 * criança.
 * Ver: bot_games_delta.md → "Papel ausente é pergunta, não padrão".
 */

const BOT = 'Dudu'

describe('mapa de escolha → papel do bot', () => {
  it('`eu` significa papéis OPOSTOS nos dois jogos', () => {
    expect(botRoleForChoice('esconde_esconde', 'jogador')).toBe('bot_procura')
    expect(botRoleForChoice('pega_pega', 'jogador')).toBe('bot_pega')
  })

  it('`você` também significa papéis opostos nos dois jogos', () => {
    expect(botRoleForChoice('esconde_esconde', 'bot')).toBe('bot_esconde')
    expect(botRoleForChoice('pega_pega', 'bot')).toBe('bot_foge')
  })

  it('todo papel do mapa é válido para o jogo em que aparece', () => {
    for (const [game, choices] of Object.entries(BOT_ROLE_BY_CHOICE)) {
      for (const role of Object.values(choices)) {
        expect(resolveRole(game as never, role), `${game}/${role}`).toBe(role)
      }
    }
  })

  it('as duas escolhas de um jogo dão papéis diferentes', () => {
    for (const choices of Object.values(BOT_ROLE_BY_CHOICE)) {
      expect(choices.jogador).not.toBe(choices.bot)
    }
  })
})

describe('respostas da pergunta de papel', () => {
  it('a criança se esconde: o bot procura', () => {
    for (const text of ['eu', 'sou eu', 'eu me escondo', 'dudu, eu vou me esconder']) {
      expect(parseRoleAnswer(text, BOT, 'esconde_esconde'), text).toBe('bot_procura')
    }
  })

  it('o bot se esconde', () => {
    for (const text of ['voce', 'tu', 'voce se esconde', 'você vai se esconder']) {
      expect(parseRoleAnswer(text, BOT, 'esconde_esconde'), text).toBe('bot_esconde')
    }
  })

  it('a criança corre: o bot pega', () => {
    for (const text of ['eu', 'sou eu', 'eu corro', 'eu fujo']) {
      expect(parseRoleAnswer(text, BOT, 'pega_pega'), text).toBe('bot_pega')
    }
  })

  it('o bot corre', () => {
    for (const text of ['voce', 'tu', 'voce corre', 'você foge']) {
      expect(parseRoleAnswer(text, BOT, 'pega_pega'), text).toBe('bot_foge')
    }
  })

  it('a MESMA resposta dá papéis opostos conforme o jogo pendente', () => {
    expect(parseRoleAnswer('eu', BOT, 'esconde_esconde')).toBe('bot_procura')
    expect(parseRoleAnswer('eu', BOT, 'pega_pega')).toBe('bot_pega')
    expect(parseRoleAnswer('voce', BOT, 'esconde_esconde')).toBe('bot_esconde')
    expect(parseRoleAnswer('voce', BOT, 'pega_pega')).toBe('bot_foge')
  })

  it('aceita CAPS, acento e pontuação, como a criança digita', () => {
    expect(parseRoleAnswer('EU!!!', BOT, 'pega_pega')).toBe('bot_pega')
    expect(parseRoleAnswer('Você!', BOT, 'esconde_esconde')).toBe('bot_esconde')
    expect(parseRoleAnswer('eu, por favor', BOT, 'pega_pega')).toBe('bot_pega')
  })

  it('mensagem que não responde nada devolve null', () => {
    for (const text of ['oi', 'que horas sao', 'me segue', 'nao sei', '']) {
      expect(parseRoleAnswer(text, BOT, 'pega_pega'), text).toBeNull()
    }
  })

  /**
   * A armadilha que definiu o formato das listas: a resposta só usa o verbo que
   * a pergunta citou. `voce pega` respondendo "quem corre?" pareceria dizer que
   * o bot corre, quando quer dizer o contrário — então ele NÃO é resposta, e
   * segue como comando com papel explícito, que já resolve certo.
   */
  it('o verbo do outro papel não é resposta — é comando, e com o papel certo', () => {
    expect(parseRoleAnswer('voce pega', BOT, 'pega_pega')).toBeNull()
    const comando = parseCommand('voce pega', BOT)
    expect(comando?.intent.type === 'PLAY_GAME' && comando.intent.params.role).toBe('bot_pega')

    expect(parseRoleAnswer('voce procura', BOT, 'esconde_esconde')).toBeNull()
    const outro = parseCommand('voce procura', BOT)
    expect(outro?.intent.type === 'PLAY_GAME' && outro.intent.params.role).toBe('bot_procura')
  })

  /**
   * `voce corre` é resposta E comando explícito. Os dois caminhos precisam dar
   * o MESMO papel, senão o resultado dependeria de haver pergunta pendente.
   */
  it('frase que é resposta e comando dá o mesmo papel pelos dois caminhos', () => {
    for (const [text, game] of [
      ['voce corre', 'pega_pega'],
      ['voce foge', 'pega_pega'],
      ['eu vou me esconder', 'esconde_esconde'],
      ['voce se esconde', 'esconde_esconde'],
    ] as const) {
      const comoResposta = parseRoleAnswer(text, BOT, game)
      const comando = parseCommand(text, BOT)
      const comoComando =
        comando?.intent.type === 'PLAY_GAME' ? (comando.intent.params.role ?? null) : null
      expect(comoResposta, text).toBe(comoComando)
    }
  })
})

describe('convite sem papel', () => {
  it('o nome do jogo convida sem escolher papel', () => {
    for (const text of ['pega pega', 'esconde esconde', 'bora de pega pega']) {
      const parsed = parseCommand(text, BOT)
      expect(parsed?.intent.type, text).toBe('PLAY_GAME')
      expect(parsed?.intent.type === 'PLAY_GAME' && parsed.intent.params.role, text).toBeUndefined()
    }
  })

  it('a frase que diz o papel continua começando direto', () => {
    for (const [text, role] of [
      ['me pega', 'bot_pega'],
      ['eu vou te pegar', 'bot_foge'],
      ['se esconde', 'bot_esconde'],
      ['eu vou me esconder', 'bot_procura'],
    ] as const) {
      const parsed = parseCommand(text, BOT)
      expect(parsed?.intent.type === 'PLAY_GAME' && parsed.intent.params.role, text).toBe(role)
    }
  })
})

describe('configuração e falas da pergunta', () => {
  it('o prazo da pergunta tem padrão de 45 s', () => {
    expect(gamesSchema.parse({}).roleQuestionTimeoutMs).toBe(45_000)
  })

  it('prazo customizado é respeitado', () => {
    expect(gamesSchema.parse({ roleQuestionTimeoutMs: 20_000 }).roleQuestionTimeoutMs).toBe(20_000)
  })

  it('prazo inválido derruba o startup', () => {
    expect(() => gamesSchema.parse({ roleQuestionTimeoutMs: 0 })).toThrow()
    expect(() => gamesSchema.parse({ roleQuestionTimeoutMs: -1 })).toThrow()
  })

  it('as duas perguntas existem no repertório, com 4+ variações', () => {
    const { catalog } = loadCatalog(defaultCatalogPath())
    for (const id of ['jogo_quem_esconde', 'jogo_quem_corre']) {
      const entry = catalog.entries.find((e) => e.id === id)
      expect(entry, id).toBeDefined()
      expect(entry!.responses.length, id).toBeGreaterThanOrEqual(4)
    }
  })

  /**
   * O ponto todo do change: uma pergunta que cita só um lado deixaria a criança
   * de novo sem saber que a outra opção existe.
   */
  it('toda variação nomeia AS DUAS opções', () => {
    const { catalog } = loadCatalog(defaultCatalogPath())
    for (const id of ['jogo_quem_esconde', 'jogo_quem_corre']) {
      const entry = catalog.entries.find((e) => e.id === id)
      for (const response of entry!.responses) {
        // Normalizado antes de medir: letra acentuada não conta como caractere
        // de palavra em regex, e a borda de `\bvocê\b` nunca casaria.
        const texto = normalize(response)
        expect(texto, `${id}: ${response}`).toMatch(/\beu\b/)
        expect(texto, `${id}: ${response}`).toMatch(/\bvoce\b/)
      }
    }
  })
})
