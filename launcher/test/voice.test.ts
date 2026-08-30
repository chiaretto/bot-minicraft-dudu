import { describe, it, expect } from 'vitest'
import { MAX_CHARS, MAX_QUEUE, enqueueSpeech, prepareSpeech } from '../src/voice'
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
