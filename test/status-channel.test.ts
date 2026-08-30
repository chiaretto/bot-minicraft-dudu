import { describe, it, expect, vi } from 'vitest'
import {
  createStatusChannel,
  formatStatus,
  listenForStop,
  STATUS_PREFIX,
  isLauncherMode,
  type StopSource,
} from '../src/app/status-channel.js'

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
