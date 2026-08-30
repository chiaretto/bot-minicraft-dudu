import { describe, it, expect } from 'vitest'
import { phraseFor, buttonLabels, RECADO_SEM_BOT } from '../src/phrases'
import type { UiState } from '../src/supervisor'

const TODOS: UiState[] = [
  'parado',
  'ligando',
  'procurando',
  'no_mundo',
  'parando',
  'desistiu',
  'caiu',
]

/**
 * Palavra que uma criança de 7 anos não entende. A regra número um vale para a
 * janela: se alguma delas aparecer na tela principal, o texto está errado.
 */
const PALAVRA_TECNICA =
  /\b(processo|porta|servidor|conex(ão|ao)|conectando|stdout|stderr|erro|exception|timeout|socket|log|config|yaml|localhost|npm|node)\b/i

describe('regra número um na janela', () => {
  it('todo estado tem frase, e nenhuma tem palavra técnica', () => {
    for (const state of TODOS) {
      const { text } = phraseFor(state, 'Odraude')
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toMatch(PALAVRA_TECNICA)
    }
  })

  it('toda frase é curta — uma linha', () => {
    for (const state of TODOS) {
      const { text } = phraseFor(state, 'Odraude')
      expect(text).not.toContain('\n')
      expect(text.length).toBeLessThanOrEqual(50)
    }
  })

  it('os botões também ficam sem palavra técnica', () => {
    const labels = buttonLabels('Odraude')
    for (const label of Object.values(labels)) {
      expect(label).not.toMatch(PALAVRA_TECNICA)
    }
  })

  it('o recado de "não achei o bot" continua sendo frase de criança', () => {
    expect(RECADO_SEM_BOT).not.toMatch(PALAVRA_TECNICA)
    expect(RECADO_SEM_BOT.length).toBeLessThanOrEqual(60)
  })
})

describe('o bot é chamado pelo nome dele', () => {
  it('usa o nome da persona nas frases', () => {
    expect(phraseFor('no_mundo', 'Odraude').text).toContain('Odraude')
    expect(phraseFor('parado', 'Dudu').text).toContain('Dudu')
  })

  it('usa o nome da persona nos botões', () => {
    expect(buttonLabels('Dudu').chamar).toContain('Dudu')
  })

  it('não sobra marcador de substituição em nenhum estado', () => {
    for (const state of TODOS) {
      expect(phraseFor(state, 'Dudu').text).not.toContain('{nome}')
    }
  })
})

describe('os estados soam diferentes', () => {
  it('procurando não é o mesmo que estar no mundo', () => {
    const procurando = phraseFor('procurando', 'Odraude')
    const noMundo = phraseFor('no_mundo', 'Odraude')

    expect(procurando.text).not.toBe(noMundo.text)
    expect(procurando.tone).toBe('esperando')
    expect(noMundo.tone).toBe('junto')
  })

  it('desistir ensina o passo seguinte', () => {
    const { text, tone } = phraseFor('desistiu', 'Odraude')
    expect(text).toMatch(/LAN/)
    expect(text).toMatch(/\?/)
    expect(tone).toBe('ops')
  })

  it('cair convida a tentar de novo', () => {
    expect(phraseFor('caiu', 'Odraude').text).toMatch(/de novo/i)
  })

  it('dormindo tem clima próprio', () => {
    expect(phraseFor('parado', 'Odraude').tone).toBe('dormindo')
  })
})
