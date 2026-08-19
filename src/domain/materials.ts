/**
 * Materiais que o bot conhece, e como a criança fala deles.
 *
 * Sem dependência de `mineflayer`: aqui é vocabulário, não efeito no mundo.
 * Ver: player_commands_delta.md → "Pegar bloco de verdade".
 */

/**
 * Grupos de blocos que valem como "a mesma coisa" para quem está jogando.
 *
 * Uma criança pede "madeira", não `birch_log`. E numa floresta de bétula o
 * carvalho não existe: procurar só `oak_log` devolveria "não achei" num lugar
 * cheio de árvore. Por isso a busca é sempre pelo GRUPO inteiro.
 */
export const MATERIAL_GROUPS: Record<string, readonly string[]> = {
  madeira: ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log'],
  pedra: ['stone', 'cobblestone'],
  terra: ['dirt'],
  areia: ['sand'],
  cascalho: ['gravel'],
}

export type MaterialGroup = keyof typeof MATERIAL_GROUPS

export function isMaterialGroup(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(MATERIAL_GROUPS, name)
}

/**
 * Blocos que atendem a um pedido.
 *
 * - nome de grupo (`madeira`) → o grupo inteiro
 * - membro de um grupo (`birch_log`) → o grupo inteiro, porque quem pediu
 *   bétula aceita carvalho antes de ouvir "não achei"
 * - qualquer outro nome → ele mesmo, sozinho
 */
export function resolveBlockCandidates(name: string): readonly string[] {
  if (isMaterialGroup(name)) return MATERIAL_GROUPS[name]!

  for (const members of Object.values(MATERIAL_GROUPS)) {
    if (members.includes(name)) {
      // O pedido explícito vem primeiro: quem pediu bétula ganha bétula se
      // houver bétula por perto.
      return [name, ...members.filter((m) => m !== name)]
    }
  }
  return [name]
}

/**
 * Dá para colher este bloco com o que o bot tem na mão?
 *
 * **Cavar não é o mesmo que conseguir o bloco.** Pedra quebrada sem picareta
 * simplesmente some: o bot gasta o tempo, abre o buraco e não leva nada. Foi
 * exatamente isso que aconteceu em 2026-08-19 — ele quebrou 52 pedras, anunciou
 * "Peguei 52 de pedra pra você!" e ficou de mãos vazias, sem degrau para sair
 * do buraco depois.
 *
 * `harvestTools` ausente quer dizer "cai na mão" (terra, areia, tronco).
 * Ver: player_commands_delta.md → "Só cava o que consegue levar".
 */
export function canHarvestWith(
  harvestTools: Record<string, unknown> | undefined | null,
  itemIdsEmMaos: readonly number[],
): boolean {
  if (!harvestTools) return true
  return itemIdsEmMaos.some((id) => harvestTools[String(id)] !== undefined)
}

/** Como o bot chama o material no chat. Nome técnico não vai para a criança. */
export function friendlyName(blockName: string): string {
  for (const [group, members] of Object.entries(MATERIAL_GROUPS)) {
    if (members.includes(blockName)) return group
  }
  return blockName
}
