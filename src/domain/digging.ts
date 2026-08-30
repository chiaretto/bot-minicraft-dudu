/**
 * Onde cavar, e em que ordem.
 *
 * Geometria pura, sem `mineflayer`. A regra que atravessa o módulo: **o bot
 * nunca cava o chão embaixo dos próprios pés**. Foi por isso que a planta é
 * feita À FRENTE dele — cavar para baixo derruba o bot no buraco que ele
 * acabou de abrir, e sair de lá é outro comando.
 * Ver: player_commands_delta.md → "Cavar buraco e túnel".
 */
import type { Vec3Like } from './types.js'

/** Catálogo FECHADO de escavação. Pedido fora da lista nunca vira buraco. */
export const DIG_SHAPES = ['buraco', 'tunel'] as const

export type DigShape = (typeof DIG_SHAPES)[number]

export function isDigShape(value: string): value is DigShape {
  return (DIG_SHAPES as readonly string[]).includes(value)
}

/** Para onde o bot está virado, arredondado para uma das quatro direções. */
export interface Facing {
  dx: -1 | 0 | 1
  dz: -1 | 0 | 1
}

/**
 * Yaw do Minecraft → direção cardeal.
 *
 * Arredondar para os quatro lados é de propósito: buraco em diagonal fica
 * torto e a criança não entende o que ele fez.
 */
export function facingFromYaw(yaw: number): Facing {
  // No Minecraft, yaw 0 olha para +z e cresce no sentido anti-horário.
  const volta = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  const quarto = Math.round(volta / (Math.PI / 2)) % 4
  switch (quarto) {
    case 0:
      return { dx: 0, dz: 1 }
    case 1:
      return { dx: -1, dz: 0 }
    case 2:
      return { dx: 0, dz: -1 }
    default:
      return { dx: 1, dz: 0 }
  }
}

/** Distância à frente onde a obra começa. Um passo de folga do corpo do bot. */
const FRENTE = 2

/**
 * Blocos a cavar, na ordem.
 *
 * De cima para baixo no buraco (bloco de cima primeiro, senão o de baixo fica
 * inalcançável), e de perto para longe no túnel.
 */
export function planDig(shape: DigShape, botPos: Vec3Like, facing: Facing): Vec3Like[] {
  const base = {
    x: Math.floor(botPos.x) + facing.dx * FRENTE,
    y: Math.floor(botPos.y),
    z: Math.floor(botPos.z) + facing.dz * FRENTE,
  }

  // O eixo perpendicular ao que o bot encara, para dar largura à obra.
  const lado = { dx: facing.dz === 0 ? 0 : 1, dz: facing.dx === 0 ? 0 : 1 }

  const blocos: Vec3Like[] = []

  if (shape === 'buraco') {
    // Poço 2x2 e 2 de fundo, à frente do bot. De cima para baixo.
    for (let profundidade = 0; profundidade < 2; profundidade++) {
      for (let frente = 0; frente < 2; frente++) {
        for (let largura = 0; largura < 2; largura++) {
          blocos.push({
            x: base.x + facing.dx * frente + lado.dx * largura,
            y: base.y - profundidade,
            z: base.z + facing.dz * frente + lado.dz * largura,
          })
        }
      }
    }
    return blocos
  }

  // Túnel: 1 de largura, 2 de altura (pé e cabeça), 4 de comprimento.
  for (let passo = 0; passo < 4; passo++) {
    for (const altura of [1, 0]) {
      blocos.push({
        x: base.x + facing.dx * passo,
        y: base.y + altura,
        z: base.z + facing.dz * passo,
      })
    }
  }
  return blocos
}

/**
 * A posição é o chão embaixo do bot, ou o corpo dele?
 *
 * A guarda que impede o bot de se enterrar. Vale para a coluna inteira: os pés,
 * a cabeça e o bloco de apoio.
 */
export function isUnderBot(pos: Vec3Like, botPos: Vec3Like): boolean {
  const mesmoX = Math.floor(pos.x) === Math.floor(botPos.x)
  const mesmoZ = Math.floor(pos.z) === Math.floor(botPos.z)
  if (!mesmoX || !mesmoZ) return false

  const dy = Math.floor(pos.y) - Math.floor(botPos.y)
  return dy >= -1 && dy <= 1
}

/** Blocos que ninguém cava a pedido de uma criança de 7 anos. */
export const NEVER_DIG: ReadonlySet<string> = new Set([
  'bedrock',
  'obsidian',
  'lava',
  'water',
  'chest',
  'trapped_chest',
  'furnace',
  'crafting_table',
  'bed',
  'white_bed',
  'red_bed',
  'spawner',
  'end_portal_frame',
])

/**
 * O buraco é seguro de abrir?
 *
 * Lava do lado é o jeito mais rápido de a brincadeira virar susto. Água
 * inunda o buraco e afoga quem entrou. Nos dois casos o bot recusa **antes**
 * de cavar o primeiro bloco, em vez de descobrir no meio.
 */
export function dangerNear(vizinhos: readonly (string | null)[]): string | null {
  for (const nome of vizinhos) {
    if (nome === null) continue
    if (nome.includes('lava')) return 'lava'
    if (nome.includes('water')) return 'água'
  }
  return null
}
