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

/**
 * Como a criança fala de cada material → nome do grupo.
 *
 * Catálogo FECHADO, pelo mesmo motivo do catálogo de bichos: sem ele,
 * "quantos amigos você tem?" viraria uma contagem de um bloco que não existe.
 * Nome fora daqui não vira comando e desce na cascata como conversa.
 * Ver: player_commands_delta.md → "Contar item da mochila".
 */
const SPOKEN_MATERIALS: Record<string, MaterialGroup> = {
  madeira: 'madeira',
  madeiras: 'madeira',
  tronco: 'madeira',
  troncos: 'madeira',
  pau: 'madeira',
  pedra: 'pedra',
  pedras: 'pedra',
  pedregulho: 'pedra',
  terra: 'terra',
  terras: 'terra',
  areia: 'areia',
  areias: 'areia',
  cascalho: 'cascalho',
}

/**
 * Nome falado → material do catálogo, ou `null` para não virar comando.
 *
 * Tolera o "bloco de" e o "blocos de" na frente, que é como criança pede.
 */
export function materialFromSpokenName(spoken: string): MaterialGroup | null {
  const limpo = spoken
    .trim()
    .replace(/^blocos? de /u, '')
    .replace(/^de /u, '')
    .trim()

  if (SPOKEN_MATERIALS[limpo]) return SPOKEN_MATERIALS[limpo]!
  // Nome técnico do bloco também vale: `oak_log` é membro de um grupo.
  for (const [grupo, membros] of Object.entries(MATERIAL_GROUPS)) {
    if (membros.includes(limpo)) return grupo as MaterialGroup
  }
  return null
}

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
