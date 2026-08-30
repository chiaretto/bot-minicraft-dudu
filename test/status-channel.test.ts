import { describe, it, expect, vi } from 'vitest'
import {
  INVENTORY_PREFIX,
  SPEECH_PREFIX,
  STATUS_PREFIX,
  createStatusChannel,
  formatInventory,
  formatSpeech,
  formatStatus,
  isLauncherMode,
  listenForStop,
  type StopSource,
} from '../src/app/status-channel.js'
import { groupItems } from '../src/domain/item-names.js'

const LAUNCHER = { DUDU_LAUNCHER: '1' } as NodeJS.ProcessEnv
const TERMINAL = {} as NodeJS.ProcessEnv

/** Dublê do `stdin`: guarda o ouvinte para o teste empurrar linhas. */
function fakeInput(): StopSource & { send(chunk: string): void } {
  let listener: ((chunk: string) => void) | null = null
  return {
    setEncoding: () => undefined,
    on: (_event, fn) => {
      listener = fn
      return undefined
    },
    send: (chunk) => listener?.(chunk),
  }
}

describe('canal de status: formato da linha', () => {
  it('marca a linha com o prefixo reservado', () => {
    expect(formatStatus('no_mundo').startsWith(`${STATUS_PREFIX} `)).toBe(true)
  })

  it('leva o estado em campo estruturado, não em frase', () => {
    const line = formatStatus('procurando', new Date('2026-08-29T10:00:00.000Z'))
    const payload = JSON.parse(line.slice(STATUS_PREFIX.length + 1))
    expect(payload.status).toBe('procurando')
    expect(payload.at).toBe('2026-08-29T10:00:00.000Z')
  })

  it('não colide com o log do pino nem com a moldura do cartão', () => {
    // O `pino` abre a linha com `{`; o cartão, com caractere de moldura.
    const line = formatStatus('ligando')
    expect(line.startsWith('{')).toBe(false)
    expect(line).toMatch(/^@/)
  })
})

describe('canal de status: quando fala', () => {
  it('anuncia cada transição do ciclo de vida', () => {
    const lines: string[] = []
    const channel = createStatusChannel({ env: LAUNCHER, write: (l) => lines.push(l) })

    channel.emit('ligando')
    channel.emit('procurando')
    channel.emit('no_mundo')
    channel.emit('desistiu')

    const states = lines.map((l) => JSON.parse(l.slice(STATUS_PREFIX.length + 1)).status)
    expect(states).toEqual(['ligando', 'procurando', 'no_mundo', 'desistiu'])
  })

  it('repetir o mesmo estado não é transição', () => {
    const lines: string[] = []
    const channel = createStatusChannel({ env: LAUNCHER, write: (l) => lines.push(l) })

    // É o que acontece no backoff: vários `end` seguidos, sem conectar.
    channel.emit('procurando')
    channel.emit('procurando')
    channel.emit('procurando')

    expect(lines).toHaveLength(1)
  })

  it('volta a falar quando o estado muda de verdade', () => {
    const lines: string[] = []
    const channel = createStatusChannel({ env: LAUNCHER, write: (l) => lines.push(l) })

    channel.emit('procurando')
    channel.emit('no_mundo')
    channel.emit('procurando')

    expect(lines).toHaveLength(3)
  })

  it('fica em silêncio sem a variável de ambiente', () => {
    const lines: string[] = []
    const channel = createStatusChannel({ env: TERMINAL, write: (l) => lines.push(l) })

    channel.emit('ligando')
    channel.emit('procurando')
    channel.emit('no_mundo')

    expect(lines).toEqual([])
  })

  it('só liga com o valor exato', () => {
    expect(isLauncherMode({ DUDU_LAUNCHER: '1' } as NodeJS.ProcessEnv)).toBe(true)
    expect(isLauncherMode({ DUDU_LAUNCHER: '0' } as NodeJS.ProcessEnv)).toBe(false)
    expect(isLauncherMode({ DUDU_LAUNCHER: 'true' } as NodeJS.ProcessEnv)).toBe(false)
    expect(isLauncherMode({} as NodeJS.ProcessEnv)).toBe(false)
  })
})

describe('canal de parada', () => {
  it('a linha `parar` dispara o encerramento', () => {
    const onStop = vi.fn()
    const input = fakeInput()
    listenForStop(onStop, { env: LAUNCHER, input })

    input.send('parar\n')

    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('linha partida em pedaços continua valendo', () => {
    const onStop = vi.fn()
    const input = fakeInput()
    listenForStop(onStop, { env: LAUNCHER, input })

    input.send('pa')
    input.send('rar')
    expect(onStop).not.toHaveBeenCalled()

    input.send('\n')
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('linha desconhecida é ignorada sem quebrar', () => {
    const onStop = vi.fn()
    const input = fakeInput()
    listenForStop(onStop, { env: LAUNCHER, input })

    input.send('vai\n')
    input.send('para sempre\n')
    input.send('\n')

    expect(onStop).not.toHaveBeenCalled()
  })

  it('não toca no stdin sem a variável de ambiente', () => {
    const onStop = vi.fn()
    const input = fakeInput()
    const listening = listenForStop(onStop, { env: TERMINAL, input })

    input.send('parar\n')

    expect(listening).toBe(false)
    expect(onStop).not.toHaveBeenCalled()
  })

  it('pedido repetido apenas repassa — a guarda de reentrada é do shutdown', () => {
    // O `main.ts` já tem `shuttingDown`; o canal não duplica essa guarda.
    let encerramentos = 0
    let encerrando = false
    const shutdown = () => {
      if (encerrando) return
      encerrando = true
      encerramentos++
    }
    const input = fakeInput()
    listenForStop(shutdown, { env: LAUNCHER, input })

    input.send('parar\nparar\n')

    expect(encerramentos).toBe(1)
  })
})

/**
 * O canal de fala: o supervisor lê em voz alta o que o bot diz no chat.
 * Ver: desktop_launcher_delta.md → "Ler as falas em voz alta".
 */
describe('canal de fala', () => {
  it('a linha carrega o texto, em JSON', () => {
    expect(formatSpeech('Tô indo!')).toBe(`${SPEECH_PREFIX} {"text":"Tô indo!"}`)
  })

  it('sem supervisor, ninguém fala nada no stdout', () => {
    const linhas: string[] = []
    const canal = createStatusChannel({ env: {}, write: (l) => linhas.push(l) })
    canal.speak('Tô indo!')
    expect(linhas).toEqual([])
  })

  it('com supervisor, cada fala vira uma linha', () => {
    const linhas: string[] = []
    const canal = createStatusChannel({
      env: { DUDU_LAUNCHER: '1' },
      write: (l) => linhas.push(l),
    })
    canal.speak('Deixa comigo!')
    canal.speak('Peguei 8 de madeira!')
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toContain('Deixa comigo!')
  })

  /**
   * Diferente do status, repetição AQUI é de propósito: o bot repete "quente!"
   * numa rodada de quente e frio, e a criança precisa ouvir cada uma.
   */
  it('fala repetida sai de novo', () => {
    const linhas: string[] = []
    const canal = createStatusChannel({
      env: { DUDU_LAUNCHER: '1' },
      write: (l) => linhas.push(l),
    })
    canal.speak('Tá esquentando!')
    canal.speak('Tá esquentando!')
    expect(linhas).toHaveLength(2)
  })

  it('fala vazia não vira linha', () => {
    const linhas: string[] = []
    const canal = createStatusChannel({
      env: { DUDU_LAUNCHER: '1' },
      write: (l) => linhas.push(l),
    })
    canal.speak('   ')
    expect(linhas).toEqual([])
  })

  it('o prefixo da fala é diferente do de status', () => {
    // Um canal só faria o supervisor ter que adivinhar qual é qual.
    expect(SPEECH_PREFIX).not.toBe(STATUS_PREFIX)
  })
})

/**
 * O canal da mochila: o terceiro do protocolo.
 * Ver: desktop_launcher_delta.md → "Canal da mochila no protocolo".
 */
describe('canal da mochila', () => {
  const madeira = { id: 'oak_log', nome: 'madeira', qtd: 12 }
  const pedra = { id: 'cobblestone', nome: 'pedra', qtd: 3 }

  const canalComSupervisor = (linhas: string[]) =>
    createStatusChannel({ env: { DUDU_LAUNCHER: '1' }, write: (l) => linhas.push(l) })

  it('a linha carrega id, nome e quantidade', () => {
    const linha = formatInventory([madeira])
    expect(linha).toContain(INVENTORY_PREFIX)
    expect(linha).toContain('oak_log')
    expect(linha).toContain('madeira')
    expect(linha).toContain('12')
  })

  it('a linha traz o total somado', () => {
    expect(formatInventory([madeira, pedra])).toContain('"total":15')
  })

  it('sem supervisor, mochila nenhuma sai no stdout', () => {
    const linhas: string[] = []
    const canal = createStatusChannel({ env: {}, write: (l) => linhas.push(l) })
    canal.sendInventory([madeira])
    expect(linhas).toEqual([])
  })

  /**
   * A guarda que importa: uma casa de 52 blocos encheria o canal de dezenas de
   * linhas se cada passada mandasse a mochila de novo.
   */
  it('mochila igual à última NÃO vira linha', () => {
    const linhas: string[] = []
    const canal = canalComSupervisor(linhas)
    canal.sendInventory([madeira])
    canal.sendInventory([madeira])
    canal.sendInventory([{ ...madeira }])
    expect(linhas).toHaveLength(1)
  })

  it('mochila que mudou vira linha nova', () => {
    const linhas: string[] = []
    const canal = canalComSupervisor(linhas)
    canal.sendInventory([madeira])
    canal.sendInventory([{ ...madeira, qtd: 20 }])
    expect(linhas).toHaveLength(2)
    expect(linhas[1]).toContain('20')
  })

  it('mochila vazia é anunciada, não escondida', () => {
    const linhas: string[] = []
    const canal = canalComSupervisor(linhas)
    canal.sendInventory([])
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toContain('"total":0')
  })

  it('os três prefixos são diferentes entre si', () => {
    // Um canal só faria o supervisor ter que adivinhar qual é qual.
    expect(new Set([STATUS_PREFIX, SPEECH_PREFIX, INVENTORY_PREFIX]).size).toBe(3)
  })
})

/**
 * Juntar a mochila pelo nome que a criança lê.
 * Ver: player_commands_delta.md → "Catálogo de nomes de item em português".
 */
describe('agrupar a mochila', () => {
  it('soma as pilhas do mesmo item', () => {
    const saida = groupItems([
      { name: 'oak_log', count: 64 },
      { name: 'oak_log', count: 32 },
    ])
    expect(saida).toEqual([{ id: 'oak_log', nome: 'madeira', qtd: 96 }])
  })

  /** `oak_log` e `birch_log` são "madeira" para quem está jogando. */
  it('junta o que tem o mesmo nome na boca da criança', () => {
    const saida = groupItems([
      { name: 'oak_log', count: 10 },
      { name: 'birch_log', count: 5 },
    ])
    expect(saida).toHaveLength(1)
    expect(saida[0]!.qtd).toBe(15)
  })

  it('ordena do que ele tem mais para o que tem menos', () => {
    const saida = groupItems([
      { name: 'cobblestone', count: 3 },
      { name: 'oak_log', count: 64 },
      { name: 'bread', count: 8 },
    ])
    expect(saida.map((i) => i.nome)).toEqual(['madeira', 'pão', 'pedra'])
  })

  it('pilha zerada não entra', () => {
    expect(groupItems([{ name: 'bread', count: 0 }])).toEqual([])
  })

  it('mochila vazia dá lista vazia', () => {
    expect(groupItems([])).toEqual([])
  })

  it('item fora do catálogo aparece com o id', () => {
    const saida = groupItems([{ name: 'elytra', count: 1 }])
    expect(saida[0]!.nome).toBe('elytra')
  })
})
