/**
 * Máquina de estados do processo supervisionado.
 *
 * Função pura: recebe estado + evento, devolve estado. Todo o `spawn`, o
 * `stdin` e o `kill` moram no `main.ts`; aqui só a regra, para poder ser testada
 * sem subir bot nem abrir janela.
 */

import type { BotStatus } from './status'

/**
 * O que a janela mostra.
 *
 * Os quatro do meio vêm do bot (ele anuncia). `parado`, `parando` e `caiu` são
 * só do supervisor: um processo não anuncia que nunca subiu nem que morreu.
 */
export type UiState =
  | 'parado'
  | 'ligando'
  | 'procurando'
  | 'no_mundo'
  | 'parando'
  | 'desistiu'
  | 'caiu'

export type SupervisorEvent =
  /** Alguém clicou em chamar e o processo foi criado. */
  | { type: 'chamou' }
  /** A parada foi pedida pelo canal. */
  | { type: 'pediu_parada' }
  /** Chegou uma linha de status do bot. */
  | { type: 'status'; status: BotStatus }
  /** O processo terminou. */
  | { type: 'saiu' }
  /** O processo nem chegou a subir. */
  | { type: 'falhou_ao_subir' }

/** Estados em que existe processo vivo (ou tentando). */
const VIVO: readonly UiState[] = ['ligando', 'procurando', 'no_mundo', 'parando']

export const INITIAL: UiState = 'parado'

export function next(state: UiState, event: SupervisorEvent): UiState {
  switch (event.type) {
    case 'chamou':
      // Chamar com um processo vivo não é transição legal — o `canStart`
      // barra antes, e o `main.ts` nunca chega a criar o segundo processo.
      return canStart(state) ? 'ligando' : state

    case 'pediu_parada':
      return VIVO.includes(state) ? 'parando' : state

    case 'status':
      // Status atrasado não ressuscita um bot que já está indo dormir: entre a
      // ordem de parar e a saída do processo ainda chegam linhas do backoff.
      if (state === 'parando' || state === 'parado') return state
      return event.status

    case 'saiu':
      // `desistiu` sobrevive à saída do processo de propósito: a frase de
      // "desistiu" explica o que fazer (abrir o mundo para LAN), e trocá-la por
      // "tá dormindo" apagaria a única pista que a criança tem.
      if (state === 'desistiu') return 'desistiu'
      if (state === 'parando' || state === 'parado') return 'parado'
      return 'caiu'

    case 'falhou_ao_subir':
      return 'caiu'
  }
}

/** Um bot por vez: o botão de chamar some enquanto houver processo vivo. */
export function canStart(state: UiState): boolean {
  return !VIVO.includes(state)
}

export function canStop(state: UiState): boolean {
  return VIVO.includes(state) && state !== 'parando'
}

/** Reiniciar é parar e subir: vale quando qualquer um dos dois vale. */
export function canRestart(state: UiState): boolean {
  return state !== 'parando'
}

export function isRunning(state: UiState): boolean {
  return VIVO.includes(state)
}
