import { describe, it, expect } from 'vitest'
import {
  next,
  canStart,
  canStop,
  canRestart,
  isRunning,
  INITIAL,
  type UiState,
  type SupervisorEvent,
} from '../src/supervisor'

/** Roda uma sequência de eventos a partir de `parado`. */
function run(...events: SupervisorEvent[]): UiState {
  return events.reduce<UiState>(next, INITIAL)
}

describe('ciclo de vida feliz', () => {
  it('vai de parado até dentro do mundo', () => {
    expect(run({ type: 'chamou' })).toBe('ligando')
    expect(run({ type: 'chamou' }, { type: 'status', status: 'procurando' })).toBe('procurando')
    expect(
      run(
        { type: 'chamou' },
        { type: 'status', status: 'procurando' },
        { type: 'status', status: 'no_mundo' },
      ),
    ).toBe('no_mundo')
  })

  it('parar leva a parando e depois a parado', () => {
    const parando = run(
      { type: 'chamou' },
      { type: 'status', status: 'no_mundo' },
      { type: 'pediu_parada' },
    )
    expect(parando).toBe('parando')
    expect(next(parando, { type: 'saiu' })).toBe('parado')
  })
})

describe('um bot por vez', () => {
  it('chamar com processo vivo não muda nada', () => {
    for (const vivo of ['ligando', 'procurando', 'no_mundo', 'parando'] as UiState[]) {
      expect(next(vivo, { type: 'chamou' })).toBe(vivo)
      expect(canStart(vivo)).toBe(false)
    }
  })

  it('chamar vale de novo depois que o bot para, desiste ou cai', () => {
    for (const livre of ['parado', 'desistiu', 'caiu'] as UiState[]) {
      expect(canStart(livre)).toBe(true)
      expect(next(livre, { type: 'chamou' })).toBe('ligando')
    }
  })

  it('parar só vale com processo vivo e ainda não parando', () => {
    expect(canStop('no_mundo')).toBe(true)
    expect(canStop('procurando')).toBe(true)
    expect(canStop('parando')).toBe(false)
    expect(canStop('parado')).toBe(false)
    expect(canStop('caiu')).toBe(false)
  })

  it('reiniciar vale em tudo menos no meio de uma parada', () => {
    expect(canRestart('no_mundo')).toBe(true)
    expect(canRestart('parado')).toBe(true)
    expect(canRestart('desistiu')).toBe(true)
    expect(canRestart('parando')).toBe(false)
  })
})

describe('estado atrasado não ressuscita o bot', () => {
  it('status que chega depois da ordem de parar é ignorado', () => {
    // Entre o `parar` e a saída do processo ainda chegam linhas do backoff.
    const parando = run(
      { type: 'chamou' },
      { type: 'status', status: 'no_mundo' },
      { type: 'pediu_parada' },
    )
    expect(next(parando, { type: 'status', status: 'procurando' })).toBe('parando')
    expect(next(parando, { type: 'status', status: 'no_mundo' })).toBe('parando')
  })

  it('status que chega depois do processo morto é ignorado', () => {
    expect(next('parado', { type: 'status', status: 'no_mundo' })).toBe('parado')
  })
})

describe('quando dá errado', () => {
  it('morrer sem ninguém pedir vira caiu', () => {
    const noMundo = run({ type: 'chamou' }, { type: 'status', status: 'no_mundo' })
    expect(next(noMundo, { type: 'saiu' })).toBe('caiu')
  })

  it('desistir sobrevive à saída do processo', () => {
    // A frase de "desistiu" ensina a abrir o mundo pra LAN; trocá-la por "tá
    // dormindo" apagaria a única pista que a criança tem.
    const desistiu = run(
      { type: 'chamou' },
      { type: 'status', status: 'procurando' },
      { type: 'status', status: 'desistiu' },
    )
    expect(next(desistiu, { type: 'saiu' })).toBe('desistiu')
  })

  it('não conseguir subir o processo vira caiu', () => {
    expect(next('ligando', { type: 'falhou_ao_subir' })).toBe('caiu')
  })

  it('cair do mundo e reconectar volta a procurando', () => {
    const noMundo = run({ type: 'chamou' }, { type: 'status', status: 'no_mundo' })
    expect(next(noMundo, { type: 'status', status: 'procurando' })).toBe('procurando')
  })
})

describe('processo vivo', () => {
  it('sabe quando ainda existe um bot rodando', () => {
    expect(isRunning('ligando')).toBe(true)
    expect(isRunning('procurando')).toBe(true)
    expect(isRunning('no_mundo')).toBe(true)
    expect(isRunning('parando')).toBe(true)
    expect(isRunning('parado')).toBe(false)
    expect(isRunning('desistiu')).toBe(false)
    expect(isRunning('caiu')).toBe(false)
  })
})
