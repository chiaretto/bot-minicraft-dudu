import { describe, it, expect } from 'vitest'
import { parseLine, createLineSplitter, STATUS_PREFIX } from '../src/status'

const statusLine = (status: string) =>
  `${STATUS_PREFIX} ${JSON.stringify({ status, at: '2026-08-29T10:00:00.000Z' })}`

describe('leitura das linhas do bot', () => {
  it('reconhece cada estado do protocolo', () => {
    for (const status of ['ligando', 'procurando', 'no_mundo', 'desistiu']) {
      expect(parseLine(statusLine(status))).toEqual({ kind: 'status', status })
    }
  })

  it('linha de log continua sendo log', () => {
    const line = '{"level":30,"msg":"conectando ao servidor"}'
    expect(parseLine(line)).toEqual({ kind: 'log', text: line })
  })

  it('o cartão de startup não é confundido com status', () => {
    const line = '│  Odraude está de pé!  │'
    expect(parseLine(line).kind).toBe('log')
  })

  it('JSON quebrado cai como log, sem derrubar nada', () => {
    const line = `${STATUS_PREFIX} {isso nao e json`
    expect(() => parseLine(line)).not.toThrow()
    expect(parseLine(line).kind).toBe('log')
  })

  it('estado desconhecido cai como log', () => {
    // Bot mais novo falando com launcher mais velho.
    expect(parseLine(statusLine('dancando')).kind).toBe('log')
  })

  it('prefixo sem espaço não é status', () => {
    expect(parseLine(`${STATUS_PREFIX}algumacoisa`).kind).toBe('log')
  })
})

describe('quebra do stdout em linhas', () => {
  it('junta pedaços até fechar a linha', () => {
    const split = createLineSplitter()
    const meio = statusLine('no_mundo')

    expect(split(meio.slice(0, 10))).toEqual([])
    expect(split(meio.slice(10))).toEqual([])
    expect(split('\n')).toEqual([meio])
  })

  it('devolve várias linhas de um pedaço só', () => {
    const split = createLineSplitter()
    expect(split('um\ndois\ntres\n')).toEqual(['um', 'dois', 'tres'])
  })

  it('guarda o resto sem quebra de linha para o próximo pedaço', () => {
    const split = createLineSplitter()
    expect(split('um\ndo')).toEqual(['um'])
    expect(split('is\n')).toEqual(['dois'])
  })

  it('descarta o retorno de carro do Windows', () => {
    const split = createLineSplitter()
    expect(split('linha\r\n')).toEqual(['linha'])
  })

  it('ignora linha vazia', () => {
    const split = createLineSplitter()
    expect(split('\n\num\n\n')).toEqual(['um'])
  })

  it('uma linha de status partida ao meio ainda vira status', () => {
    const split = createLineSplitter()
    const linha = statusLine('desistiu')
    split(linha.slice(0, 20))
    const [completa] = split(`${linha.slice(20)}\n`)
    expect(parseLine(completa!)).toEqual({ kind: 'status', status: 'desistiu' })
  })
})
