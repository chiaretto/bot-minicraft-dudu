import type { Vec3Like } from './types.js'

/**
 * Sair de buraco empilhando bloco embaixo de si.
 *
 * Regra pura, sem `mineflayer`: aqui se decide SE precisa subir e QUANTO; quem
 * pula e coloca bloco é `behaviors/actions/escape.ts`.
 * Ver: player_commands_delta.md → "Sair de buraco".
 *
 * **Por que a decisão olha o dono, e não as paredes em volta.** Geometria local
 * não distingue "estou no fundo de um poço de 10 de largura" de "estou num
 * campo aberto": nos dois casos os vizinhos imediatos estão livres. O que
 * diferencia é o dono estar bem acima e o bot não conseguir chegar. Foi por
 * isso que a detecção não virou uma varredura de paredes.
 */

/** Quanto o bot sobe de uma vez só pulando, sem precisar de bloco. */
export const JUMP_HEIGHT = 1

export interface EscapeConfig {
  /** Diferença de altura a partir da qual vale a pena empilhar. */
  minDrop: number
  /** Teto de blocos empilhados numa tentativa. */
  maxHeight: number
}

/**
 * O bot está fundo o bastante para precisar de escada?
 *
 * Sem dono visível não há para onde subir: subir por subir só deixaria o bot
 * em cima de uma torre no meio do nada.
 */
export function needsEscape(
  botPos: Vec3Like,
  ownerPos: Vec3Like | null,
  config: EscapeConfig,
): boolean {
  if (ownerPos === null) return false
  return ownerPos.y - botPos.y >= config.minDrop
}

/**
 * Quantos blocos empilhar para alcançar o nível do dono.
 *
 * O último degrau é de graça: chegando a um bloco abaixo do dono, o pulo
 * resolve o resto. Limitado por `maxHeight` — uma torre até o céu por causa de
 * um dono voando de criativo seria pior que não sair do buraco.
 */
export function pillarHeight(
  botPos: Vec3Like,
  ownerPos: Vec3Like | null,
  config: EscapeConfig,
): number {
  if (!needsEscape(botPos, ownerPos, config)) return 0
  const diferenca = ownerPos!.y - botPos.y - JUMP_HEIGHT
  return Math.max(0, Math.min(Math.ceil(diferenca), config.maxHeight))
}

/** Vizinhos na horizontal, na altura dos pés e da cabeça. */
const SIDES: readonly Vec3Like[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
]

/**
 * Blocos que dá para cavar de onde o bot está, para virar material.
 *
 * Só na horizontal, e **nunca embaixo dos pés**: cavar o chão aprofunda o
 * buraco, que é exatamente o problema que estamos resolvendo.
 */
export function diggableNeighbors(
  isSolid: (pos: Vec3Like) => boolean,
  botPos: Vec3Like,
): Vec3Like[] {
  const alvos: Vec3Like[] = []
  for (const nivel of [0, 1]) {
    for (const lado of SIDES) {
      const pos = { x: botPos.x + lado.x, y: botPos.y + nivel, z: botPos.z + lado.z }
      if (isSolid(pos)) alvos.push(pos)
    }
  }
  return alvos
}

/**
 * Já dá para andar embora daqui?
 *
 * Verdadeiro quando o bot está no nível do dono ou acima — subir mais não
 * ajudaria em nada.
 */
export function reachedOwnerLevel(botPos: Vec3Like, ownerPos: Vec3Like | null): boolean {
  if (ownerPos === null) return true
  return botPos.y + JUMP_HEIGHT >= ownerPos.y
}
