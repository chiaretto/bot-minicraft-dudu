/**
 * Instintos de sobrevivência: comer com fome e acender tocha no escuro.
 *
 * Regra pura, sem `mineflayer`: aqui se decide SE é hora, e o efeito no mundo
 * fica em `behaviors/actions/`. Como a defesa, isto **nunca** passa por IA —
 * fome e escuro não são assunto de conversa, são estado do mundo.
 * Ver: player_defense_delta.md → "Instintos de sobrevivência".
 */
import type { BotState } from './types.js'

/**
 * Catálogo FECHADO de comida.
 *
 * Fechado pelo mesmo motivo dos outros catálogos do projeto: sem ele, o bot
 * come o que a criança lhe deu para guardar. Nada de podre, nada de peixe cru,
 * nada de maçã dourada — item raro que a criança está guardando não vira
 * lanche do bot.
 */
export const FOOD_ITEMS: readonly string[] = [
  'bread',
  'apple',
  'baked_potato',
  'carrot',
  'cooked_beef',
  'cooked_porkchop',
  'cooked_chicken',
  'cooked_mutton',
  'cooked_rabbit',
  'cooked_cod',
  'cooked_salmon',
  'melon_slice',
  'cookie',
]

/**
 * Estados em que o bot pode parar para se cuidar.
 *
 * Comer trava o bot por quase dois segundos, e acender tocha exige parar. No
 * meio de uma briga, de uma brincadeira ou de uma emergência isso é pior do
 * que a fome: quem está fugindo de creeper não para para comer pão.
 */
const CALM_STATES: readonly BotState[] = ['IDLE', 'FOLLOW', 'STAY']

export function isCalm(state: BotState): boolean {
  return CALM_STATES.includes(state)
}

/** A comida que ele vai comer, ou `null`. A primeira do catálogo que tiver. */
export function chooseFood(items: readonly { name: string; count: number }[]): string | null {
  for (const nome of FOOD_ITEMS) {
    if (items.some((i) => i.name === nome && i.count > 0)) return nome
  }
  return null
}

export interface EatDecision {
  food: number
  hasFood: boolean
  state: BotState
  /** Abaixo disto ele come. 20 é barriga cheia. */
  threshold: number
}

/**
 * É hora de comer?
 *
 * Comer com a barriga cheia é desperdiçar comida que a criança pode precisar
 * depois — e o jogo nem deixa. Por isso o limiar, e não "come quando tem".
 */
export function shouldEat(d: EatDecision): boolean {
  if (!d.hasFood) return false
  if (!isCalm(d.state)) return false
  return d.food <= d.threshold
}

export interface TorchDecision {
  /** Nível de luz onde o bot está: 0 é breu, 15 é sol a pino. */
  light: number
  hasTorch: boolean
  state: BotState
  /** Abaixo disto o lugar é escuro o bastante para monstro nascer. */
  threshold: number
  /** Desde a última tocha. Sem isto ele acende uma por passo. */
  msSinceLast: number
  minIntervalMs: number
  /** Distância da última tocha acesa, para não fazer fileira no mesmo lugar. */
  distanceFromLast: number
  minDistance: number
}

/**
 * É hora de acender uma tocha?
 *
 * Três guardas juntas, e todas contra a mesma coisa: o bot virar uma fábrica de
 * tochas. Escuro basta para acender **uma**; o tempo e a distância são o que
 * impedem a segunda no mesmo lugar.
 */
export function shouldPlaceTorch(d: TorchDecision): boolean {
  if (!d.hasTorch) return false
  if (!isCalm(d.state)) return false
  if (d.light > d.threshold) return false
  if (d.msSinceLast < d.minIntervalMs) return false
  return d.distanceFromLast >= d.minDistance
}
