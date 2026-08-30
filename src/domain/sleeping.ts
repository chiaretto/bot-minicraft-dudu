/**
 * Dormir na cama.
 *
 * Regra pura, sem `mineflayer`. O que está aqui é o **quando**: o Minecraft só
 * deixa dormir de noite, e recusar cedo é melhor do que o bot atravessar o
 * mundo até uma cama para levar um "não" do servidor.
 * Ver: player_commands_delta.md → "Dormir na cama".
 */
import type { TimeOfDay } from './types.js'

/** Toda cama do jogo termina assim. São 16 cores, e nenhuma é especial. */
export function isBedName(name: string): boolean {
  return name.endsWith('_bed')
}

export type SleepRefusal = 'de_dia' | 'sem_cama' | 'longe'

/** Até onde ele procura cama. Mais que isso é viagem, não é "vamos dormir". */
export const BED_SEARCH_RADIUS = 24

/**
 * Dá para dormir agora?
 *
 * `null` quer dizer que sim. Qualquer outra coisa é o motivo da recusa, que
 * vira fala — nunca um silêncio.
 */
export function sleepRefusal(input: {
  timeOfDay: TimeOfDay
  bedDistance: number | null
  maxDistance?: number
}): SleepRefusal | null {
  if (input.timeOfDay !== 'noite') return 'de_dia'
  if (input.bedDistance === null) return 'sem_cama'
  if (input.bedDistance > (input.maxDistance ?? BED_SEARCH_RADIUS)) return 'longe'
  return null
}

/**
 * O que ele fala em cada recusa.
 *
 * Fica junto da regra de propósito: recusa sem fala é o bot parecendo quebrado,
 * e quem acrescentar um motivo novo é obrigado pelo tipo a escrever a fala.
 */
export const SLEEP_REFUSAL_LINES: Record<SleepRefusal, string> = {
  de_dia: 'Só dá pra dormir de noite! Me chama quando escurecer.',
  sem_cama: 'Não achei cama nenhuma por aqui. Põe uma cama que eu deito!',
  longe: 'A cama que eu achei tá muito longe daqui, {owner}.',
}
