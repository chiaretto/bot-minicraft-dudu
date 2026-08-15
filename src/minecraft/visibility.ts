import { Vec3 } from 'vec3'
import type { Vec3Like } from '../domain/types.js'
import { distance } from './snapshot.js'

/**
 * Linha de visão por raycast — a percepção que o esconde-esconde precisa.
 *
 * Por que não basta distância: o `mineflayer` recebe a posição de todos os
 * jogadores pelo protocolo, então o bot SEMPRE sabe onde a criança está. Se
 * "achar" fosse só chegar perto, o jogo acabaria no primeiro segundo. Aqui é
 * onde a regra fica honesta: quem está atrás de uma parede não é achado, mesmo
 * com a coordenada na mão.
 * Ver: bot_games_delta.md → "Linha de visão".
 */

/** Altura dos olhos de um jogador em pé, em blocos. */
export const EYE_HEIGHT = 1.62

/**
 * Forma mínima de mundo que a visibilidade precisa — mantém o módulo testável
 * sem servidor, no mesmo padrão de `SnapshotSource`.
 */
export interface RaycastWorld {
  /**
   * Devolve o primeiro obstáculo no caminho, ou `null` com o caminho livre.
   * `direction` é unitário e `maxDistance` está em blocos.
   *
   * O tipo do acerto é `object` de propósito: só a PRESENÇA importa aqui, e as
   * versões do `prismarine-world` divergem no que devolvem (bloco completo em
   * runtime, `RaycastResult` nos tipos). Depender do formato criaria um
   * acoplamento que nenhuma regra deste módulo precisa.
   */
  raycast(origin: Vec3Like, direction: Vec3Like, maxDistance: number): object | null | undefined
}

export function atEyeLevel(position: Vec3Like): Vec3Like {
  return { x: position.x, y: position.y + EYE_HEIGHT, z: position.z }
}

/**
 * Vetor unitário de `from` para `to`. Devolve `null` para pontos coincidentes,
 * que não têm direção definida.
 */
export function directionTo(from: Vec3Like, to: Vec3Like): Vec3Like | null {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const length = Math.hypot(dx, dy, dz)
  if (length === 0) return null
  return { x: dx / length, y: dy / length, z: dz / length }
}

export interface LineOfSightOptions {
  /** Alcance máximo. Além disso não enxerga, mesmo com o caminho livre. */
  maxDistance: number
  /** Aplica a altura dos olhos nas duas pontas. Padrão: sim. */
  eyeLevel?: boolean
}

/**
 * `true` quando não há bloco sólido entre os dois pontos, dentro do alcance.
 *
 * Falha fechada: mundo indisponível ou raycast que lança viram "não enxerga".
 * No esconde-esconde isso favorece quem se esconde — o erro seguro é o bot
 * demorar mais para achar, nunca declarar que achou sem ter visto.
 */
export function hasLineOfSight(
  world: RaycastWorld | null | undefined,
  from: Vec3Like,
  to: Vec3Like,
  options: LineOfSightOptions,
): boolean {
  const useEyes = options.eyeLevel !== false
  const origin = useEyes ? atEyeLevel(from) : from
  const target = useEyes ? atEyeLevel(to) : to

  const span = distance(origin, target)
  if (span > options.maxDistance) return false
  // Pontos praticamente colados: não há o que obstruir entre eles.
  if (span < 1e-6) return true

  if (!world) return false

  const direction = directionTo(origin, target)
  if (!direction) return true

  try {
    // O alvo entra no caminho: parar exatamente nele acusaria o próprio corpo
    // como obstáculo, então o alcance do raio é a distância menos uma folga.
    const hit = world.raycast(origin, direction, Math.max(0, span - 0.5))
    return hit === null || hit === undefined
  } catch {
    return false
  }
}

/**
 * `true` quando `target` está dentro do cone de visão de quem olha.
 *
 * Não serve como critério de esconderijo — o jogador vira a cabeça num
 * instante e o cone deixa de valer. Serve como desempate: entre dois pontos
 * igualmente escondidos, o que está às costas do jogador é o melhor de ir,
 * porque a caminhada até lá aparece menos.
 * `yaw` segue a convenção do Minecraft: 0 aponta para +z e cresce no sentido
 * horário visto de cima.
 */
export function isInFieldOfView(
  from: Vec3Like,
  yaw: number,
  target: Vec3Like,
  halfAngleRad: number,
): boolean {
  const dx = target.x - from.x
  const dz = target.z - from.z
  if (Math.hypot(dx, dz) < 1e-6) return true

  const facingX = -Math.sin(yaw)
  const facingZ = Math.cos(yaw)

  const length = Math.hypot(dx, dz)
  const dot = (dx / length) * facingX + (dz / length) * facingZ
  // `dot` pode passar de 1 por erro de ponto flutuante e fazer `acos` virar NaN.
  const clamped = Math.min(1, Math.max(-1, dot))
  return Math.acos(clamped) <= halfAngleRad
}

/** Meio-cone padrão: ~70°, um campo de visão de jogo generoso. */
export const DEFAULT_FOV_HALF_ANGLE = (70 * Math.PI) / 180

/** O que a fábrica precisa de um bot para consultar o mundo. */
export interface RaycastSource {
  world?: {
    raycast(from: Vec3, direction: Vec3, range: number): object | null | undefined
  }
}

/**
 * Adapta o mundo do `mineflayer` para a interface testável acima.
 *
 * A conversão para `Vec3` não é burocracia: o iterador do raycast chama
 * `.minus()` na origem, e um objeto solto `{x,y,z}` faria a consulta lançar —
 * que, com o `try` de `hasLineOfSight`, viraria um bot que nunca acha ninguém.
 */
export function raycastWorldFrom(source: RaycastSource | null | undefined): RaycastWorld | null {
  const world = source?.world
  if (!world) return null
  return {
    raycast(origin, direction, maxDistance) {
      return world.raycast(
        new Vec3(origin.x, origin.y, origin.z),
        new Vec3(direction.x, direction.y, direction.z),
        maxDistance,
      )
    },
  }
}
