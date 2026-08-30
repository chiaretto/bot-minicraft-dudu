import { describe, it, expect } from 'vitest'
import {
  AJUSTES_PADRAO,
  FALA_DE_TESTE,
  LIMITES,
  MAX_CHARS,
  MAX_QUEUE,
  enqueueSpeech,
  escolherVoz,
  normalizarAjustes,
  prepareSpeech,
  vozesEmPortugues,
} from '../src/voice'
import { parseLine, SPEECH_PREFIX } from '../src/status'

/**
 * Ler as falas em voz alta.
 *
 * A dona do bot tem 7 anos e lê devagar; o chat do Minecraft rola rápido.
 * Ver: desktop_launcher_delta.md → "Ler as falas em voz alta".
 */
describe('preparar a fala', () => {
  it('deixa passar o que já está bom', () => {
    expect(prepareSpeech('Tô indo!')).toBe('Tô indo!')
  })

  /** `:D` sai como "dois pontos, dê" em quase todo sintetizador. */
  it('tira emoticon, que a voz leria letra por letra', () => {
    expect(prepareSpeech('Bom sono pra você :D')).toBe('Bom sono pra você')
    expect(prepareSpeech('oi :) tudo bem')).toBe('oi tudo bem')
  })

  it('não confunde emoticon com dois-pontos de frase', () => {
    expect(prepareSpeech('Escolhe: esconde-esconde ou pega-pega?')).toBe(
      'Escolhe: esconde-esconde ou pega-pega?',
    )
  })

  it('pontuação repetida vira uma só', () => {
    // "corre!!!" já é "corre!" — repetição vira pausa esquisita na voz.
    expect(prepareSpeech('CREEPER! Corre!!!')).toBe('CREEPER! Corre!')
  })

  it('espaço sobrando some', () => {
    expect(prepareSpeech('  oi   ,   {owner}  ')).toBe('oi , {owner}')
  })

  it('fala vazia não é fala', () => {
    expect(prepareSpeech('')).toBeNull()
    expect(prepareSpeech('   ')).toBeNull()
    expect(prepareSpeech(':D')).toBeNull()
  })

  it('fala comprida é cortada na última palavra inteira', () => {
    const longa = 'palavra '.repeat(60).trim()
    const saida = prepareSpeech(longa)!
    expect(saida.length).toBeLessThanOrEqual(MAX_CHARS)
    // Não termina no meio de uma sílaba.
    expect(saida.endsWith('palavra')).toBe(true)
  })

  it('toda fala de verdade do bot passa inteira', () => {
    // Falas reais do repertório: nenhuma delas deveria ser cortada.
    for (const fala of [
      'Deixa comigo, Miguel!',
      'Piscina pronta! Agora joga água dentro com o balde.',
      'PELANDO! Tá quase em cima!',
      'Só dá pra dormir de noite! Me chama quando escurecer.',
    ]) {
      expect(prepareSpeech(fala), fala).toBe(fala)
    }
  })
})

describe('fila de leitura', () => {
  it('guarda o que chega', () => {
    expect(enqueueSpeech([], 'um')).toEqual(['um'])
    expect(enqueueSpeech(['um'], 'dois')).toEqual(['um', 'dois'])
  })

  /**
   * Numa rodada de quente e frio o bot fala a cada dois segundos. Fila grande
   * faria a voz ficar meio minuto atrás do jogo.
   */
  it('passou do teto, a mais VELHA sai', () => {
    let fila: string[] = []
    for (const t of ['um', 'dois', 'tres', 'quatro', 'cinco']) fila = enqueueSpeech(fila, t)

    expect(fila).toHaveLength(MAX_QUEUE)
    expect(fila[fila.length - 1]).toBe('cinco')
    expect(fila).not.toContain('um')
  })
})

describe('a linha de fala no stdout', () => {
  it('é reconhecida e desembrulhada', () => {
    const linha = `${SPEECH_PREFIX} ${JSON.stringify({ text: 'Tô indo!' })}`
    expect(parseLine(linha)).toEqual({ kind: 'speech', text: 'Tô indo!' })
  })

  it('JSON quebrado cai como log, em vez de sumir', () => {
    expect(parseLine(`${SPEECH_PREFIX} {isso não é json`).kind).toBe('log')
  })

  it('fala vazia não vira fala', () => {
    const linha = `${SPEECH_PREFIX} ${JSON.stringify({ text: '   ' })}`
    expect(parseLine(linha).kind).toBe('log')
  })

  it('log comum continua sendo log', () => {
    expect(parseLine('{"level":30,"msg":"bot falou"}').kind).toBe('log')
  })

  it('status continua sendo status', () => {
    expect(parseLine('@dudu-status {"status":"no_mundo"}')).toEqual({
      kind: 'status',
      status: 'no_mundo',
    })
  })
})

/**
 * Escolher a voz, e ajustar velocidade e tom.
 * Ver: desktop_launcher_delta.md → "Escolher a voz do bot".
 */
describe('quais vozes servem', () => {
  const vozes = [
    { name: 'Microsoft David', lang: 'en-US' },
    { name: 'Microsoft Maria', lang: 'pt-BR' },
    { name: 'Microsoft Helia', lang: 'pt-PT' },
    { name: 'Microsoft Daniel', lang: 'pt-BR' },
  ]

  it('só português: voz em inglês lendo "tá esquentando" não serve', () => {
    expect(vozesEmPortugues(vozes).map((v) => v.name)).not.toContain('Microsoft David')
  })

  it('pt-BR antes de pt-PT, porque é o português dela', () => {
    const ordem = vozesEmPortugues(vozes).map((v) => v.lang)
    expect(ordem[0]).toBe('pt-BR')
    expect(ordem[ordem.length - 1]).toBe('pt-PT')
  })

  it('sistema sem voz em português devolve lista vazia', () => {
    expect(vozesEmPortugues([{ name: 'David', lang: 'en-US' }])).toEqual([])
  })
})

describe('qual voz usar', () => {
  const vozes = [
    { name: 'Maria', lang: 'pt-BR' },
    { name: 'Daniel', lang: 'pt-BR' },
  ]

  it('a escolhida, quando ela existe', () => {
    expect(escolherVoz(vozes, 'Daniel')?.name).toBe('Daniel')
  })

  it('sem escolha, a primeira em português', () => {
    expect(escolherVoz(vozes, null)?.name).toBe('Daniel')
  })

  /**
   * Voz desinstalada, ou o mesmo perfil noutro computador. Isso não pode calar
   * o bot: ele volta para a melhor disponível, em silêncio.
   */
  it('voz salva que sumiu do sistema não cala o bot', () => {
    expect(escolherVoz(vozes, 'Voz Que Nao Existe')?.name).toBe('Daniel')
  })

  it('sem voz nenhuma em português, devolve null e o sistema decide', () => {
    expect(escolherVoz([{ name: 'David', lang: 'en-US' }], null)).toBeNull()
  })
})

describe('velocidade e tom', () => {
  it('o padrão é o que já era — mudar sozinho seria surpresa', () => {
    expect(AJUSTES_PADRAO).toEqual({ rate: 1, pitch: 1 })
    expect(normalizarAjustes(null)).toEqual(AJUSTES_PADRAO)
  })

  it('guarda o que foi escolhido', () => {
    expect(normalizarAjustes({ rate: 0.9, pitch: 1.2 })).toEqual({ rate: 0.9, pitch: 1.2 })
  })

  /**
   * Valor fora da faixa faz o `speechSynthesis` ignorar a fala INTEIRA em vez
   * de reclamar: o sintoma seria o bot emudecer sem motivo aparente.
   */
  it('valor absurdo é trazido para dentro da faixa', () => {
    expect(normalizarAjustes({ rate: 99, pitch: -5 })).toEqual({
      rate: LIMITES.rate.max,
      pitch: LIMITES.pitch.min,
    })
  })

  it('lixo vindo do armazenamento vira o padrão', () => {
    expect(normalizarAjustes({ rate: NaN, pitch: undefined })).toEqual(AJUSTES_PADRAO)
    expect(normalizarAjustes({ rate: 'rápido' } as never)).toEqual(AJUSTES_PADRAO)
  })

  it('a fala de teste é curta e do jeito que ele fala', () => {
    expect(FALA_DE_TESTE.length).toBeLessThan(60)
    expect(prepareSpeech(FALA_DE_TESTE)).toBe(FALA_DE_TESTE)
  })
})
