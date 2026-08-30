/**
 * Quente e frio: a regra da temperatura.
 *
 * Pura e sem `mineflayer`. Toda a brincadeira cabe aqui: comparar a distância
 * de agora com a de antes e traduzir isso numa palavra que uma criança de 7
 * anos entende sem explicação.
 * Ver: bot_games_delta.md → "Quente e frio".
 */

/**
 * O que o bot fala a cada passo.
 *
 * `morno` existe porque a criança para de andar para pensar, e um "frio" nessa
 * hora seria mentira: ela não se afastou, só ficou parada.
 */
export const TEMPERATURES = ['achou', 'pelando', 'quente', 'morno', 'frio', 'gelado'] as const

export type Temperature = (typeof TEMPERATURES)[number]

/** Entrada do repertório de cada temperatura. Uma fala por palavra. */
export const TEMPERATURE_ENTRY: Record<Temperature, string> = {
  achou: 'qf_achou',
  pelando: 'qf_pelando',
  quente: 'qf_quente',
  morno: 'qf_morno',
  frio: 'qf_frio',
  gelado: 'qf_gelado',
}

/** Mexeu menos que isto entre um passo e outro? Então ela ficou parada. */
const PASSO_MINIMO = 1.5

/** A partir daqui é longe o bastante para o "gelado". */
const LONGE = 25

export interface TemperatureInput {
  /** Distância do jogador ao ponto escondido, agora. */
  distance: number
  /** A mesma distância no passo anterior, ou `null` no primeiro. */
  previous: number | null
  /** Encostou a esta distância, achou. */
  foundRadius: number
}

/**
 * Qual palavra dizer agora.
 *
 * A ordem das checagens é a regra: achar ganha de tudo, e "pelando" é sobre
 * distância ABSOLUTA — perto é perto mesmo que ela tenha acabado de se afastar
 * um passo. O resto é sobre o MOVIMENTO, que é o que faz a brincadeira
 * funcionar: a criança aprende a ler o próprio passo.
 */
export function temperature(input: TemperatureInput): Temperature {
  if (input.distance <= input.foundRadius) return 'achou'
  if (input.distance <= input.foundRadius * 2.5) return 'pelando'

  // Primeiro passo: não há movimento para comparar, só distância.
  if (input.previous === null) return input.distance > LONGE ? 'gelado' : 'frio'

  const aproximou = input.previous - input.distance
  if (Math.abs(aproximou) < PASSO_MINIMO) return 'morno'
  if (aproximou > 0) return 'quente'
  return input.distance > LONGE ? 'gelado' : 'frio'
}
