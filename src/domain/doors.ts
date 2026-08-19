/**
 * Portas, portões e alçapões.
 *
 * Regra pura, sem `mineflayer`: aqui se decide o que dá para abrir com a mão e
 * como chamar isso no chat. Quem clica é `behaviors/actions/doors.ts`.
 * Ver: player_commands_delta.md → "Abrir porta".
 */

/** Metade de uma porta. Portão e alçapão são de um bloco só. */
export type DoorHalf = 'upper' | 'lower'

export interface DoorInfo {
  position: { x: number; y: number; z: number }
  /** Nome do bloco, como `oak_door` ou `spruce_fence_gate`. */
  name: string
  open: boolean
  half?: DoorHalf
}

export function isDoor(name: string): boolean {
  return name.endsWith('_door') || name === 'door'
}

export function isGate(name: string): boolean {
  return name.endsWith('_fence_gate') || name === 'fence_gate'
}

export function isTrapdoor(name: string): boolean {
  return name.endsWith('_trapdoor') || name === 'trapdoor'
}

/** Porta, portão ou alçapão — qualquer coisa que abre e fecha. */
export function isOpenable(name: string): boolean {
  return isDoor(name) || isGate(name) || isTrapdoor(name)
}

/**
 * Ferro não abre na mão: precisa de botão, alavanca ou placa de pressão.
 *
 * Prometer que abre e ficar clicando sem nada acontecer é pior que dizer que
 * não dá — ver `openspec/project.md` → "Público do bot".
 */
export function needsRedstone(name: string): boolean {
  return name.startsWith('iron_')
}

/** Dá para abrir só empurrando? */
export function isHandOpenable(name: string): boolean {
  return isOpenable(name) && !needsRedstone(name)
}

/**
 * Como o bot chama isso no chat. Nome técnico nunca chega à criança.
 */
export function friendlyDoorName(name: string): string {
  if (isGate(name)) return 'portão'
  if (isTrapdoor(name)) return 'alçapão'
  return 'porta'
}

/**
 * A metade de baixo é a que vale.
 *
 * Uma porta ocupa dois blocos e as duas metades aparecem na busca. Clicar em
 * qualquer uma funciona, mas tratar as duas como portas diferentes faria o bot
 * "abrir duas portas" — e, pior, abrir e fechar a mesma na sequência.
 */
export function isPrimaryPart(door: DoorInfo): boolean {
  return door.half === undefined || door.half === 'lower'
}

/**
 * O que dá para abrir agora: fechado, de abrir na mão, e sem contar a metade
 * de cima duas vezes.
 */
export function openableNow(doors: readonly DoorInfo[]): DoorInfo[] {
  return doors.filter((d) => !d.open && isHandOpenable(d.name) && isPrimaryPart(d))
}

/** Por que não deu, quando não deu — para o bot falar a verdade certa. */
export type NoDoorReason = 'nenhuma' | 'ja_aberta' | 'so_ferro'

export function explainNoDoor(doors: readonly DoorInfo[]): NoDoorReason {
  const relevantes = doors.filter(isPrimaryPart)
  if (relevantes.length === 0) return 'nenhuma'
  if (relevantes.some((d) => !d.open && needsRedstone(d.name))) return 'so_ferro'
  if (relevantes.every((d) => d.open)) return 'ja_aberta'
  return 'nenhuma'
}
