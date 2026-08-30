/**
 * Nome dos itens do jogo em português.
 *
 * Catálogo FECHADO, como o de bicho, planta, jogo e material — e pelo mesmo
 * motivo de sempre: o que a criança ouve não pode depender do que o jogo
 * chama as coisas internamente.
 *
 * A regra número um manda traduzir o conceito técnico quando ele precisa
 * aparecer. Sem isto, o bot dizia "Toma aí o cooked_beef!" para uma criança de
 * 7 anos.
 * Ver: player_commands_delta.md → "Catálogo de nomes de item em português".
 */

/**
 * O que o bot manuseia: bloco de obra, comida, ferramenta, arma e o resto do
 * que ele pode carregar por causa de alguma ação que existe.
 *
 * Não é o jogo inteiro de propósito — item que ninguém do bot toca não precisa
 * de nome aqui, e a lista existe para ser conferida de olho.
 */
export const ITEM_NAMES: Record<string, string> = {
  // ── Blocos de obra e coleta ───────────────────────────────────────────────
  oak_log: 'madeira',
  birch_log: 'madeira',
  spruce_log: 'madeira',
  jungle_log: 'madeira',
  acacia_log: 'madeira',
  dark_oak_log: 'madeira',
  oak_planks: 'tábua',
  birch_planks: 'tábua',
  stone: 'pedra',
  cobblestone: 'pedra',
  dirt: 'terra',
  grass_block: 'grama',
  sand: 'areia',
  gravel: 'cascalho',

  // ── Comida (o cardápio dos instintos) ─────────────────────────────────────
  bread: 'pão',
  apple: 'maçã',
  baked_potato: 'batata assada',
  carrot: 'cenoura',
  cooked_beef: 'carne assada',
  cooked_porkchop: 'carne de porco assada',
  cooked_chicken: 'frango assado',
  cooked_mutton: 'carne de carneiro',
  cooked_rabbit: 'carne de coelho',
  cooked_cod: 'peixe assado',
  cooked_salmon: 'salmão assado',
  melon_slice: 'fatia de melancia',
  cookie: 'biscoito',

  // ── O que ele usa nas ações ───────────────────────────────────────────────
  torch: 'tocha',
  water_bucket: 'balde com água',
  bucket: 'balde',

  // ── Camas: todas as cores, porque `SLEEP` procura qualquer uma ────────────
  white_bed: 'cama',
  orange_bed: 'cama',
  magenta_bed: 'cama',
  light_blue_bed: 'cama',
  yellow_bed: 'cama',
  lime_bed: 'cama',
  pink_bed: 'cama',
  gray_bed: 'cama',
  light_gray_bed: 'cama',
  cyan_bed: 'cama',
  purple_bed: 'cama',
  blue_bed: 'cama',
  brown_bed: 'cama',
  green_bed: 'cama',
  red_bed: 'cama',
  black_bed: 'cama',

  // ── Armas e ferramentas ───────────────────────────────────────────────────
  wooden_sword: 'espada de madeira',
  stone_sword: 'espada de pedra',
  iron_sword: 'espada de ferro',
  golden_sword: 'espada de ouro',
  diamond_sword: 'espada de diamante',
  netherite_sword: 'espada de netherita',
  wooden_axe: 'machado de madeira',
  stone_axe: 'machado de pedra',
  iron_axe: 'machado de ferro',
  diamond_axe: 'machado de diamante',
  wooden_pickaxe: 'picareta de madeira',
  stone_pickaxe: 'picareta de pedra',
  iron_pickaxe: 'picareta de ferro',
  golden_pickaxe: 'picareta de ouro',
  diamond_pickaxe: 'picareta de diamante',
  netherite_pickaxe: 'picareta de netherita',
  wooden_shovel: 'pá de madeira',
  stone_shovel: 'pá de pedra',
  iron_shovel: 'pá de ferro',
  diamond_shovel: 'pá de diamante',
  wooden_hoe: 'enxada de madeira',
  stone_hoe: 'enxada de pedra',
  iron_hoe: 'enxada de ferro',
  shield: 'escudo',
}

/**
 * Nome que a criança entende, ou o próprio id quando o catálogo não conhece.
 *
 * Nunca devolve vazio e nunca esconde: item desconhecido aparece com o nome
 * técnico, e a falta vira item novo no catálogo — não um buraco silencioso na
 * fala nem uma conta errada na mochila.
 */
export function friendlyItemName(id: string): string {
  return ITEM_NAMES[id] ?? id
}

/** O catálogo conhece este item? Existe para o teste e para a rotina. */
export function isKnownItem(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(ITEM_NAMES, id)
}

/** Um item da mochila, do jeito que a criança vê. */
export interface GroupedItem {
  /** Id de um dos itens do grupo, para quem precisar do nome técnico. */
  id: string
  /** O que a criança lê. */
  nome: string
  qtd: number
}

/**
 * Junta a mochila pelo nome que a criança lê.
 *
 * A mochila do jogo vem **por slot**: três pilhas de carvalho são três
 * entradas de 64. E `oak_log` e `birch_log` são "madeira" para quem está
 * jogando — mostrar "madeira 64" três vezes seria a informação errada.
 *
 * Ordena pela quantidade, do maior para o menor: é o que responde "tenho
 * bastante do quê?", que é a pergunta que a criança faz.
 */
export function groupItems(items: readonly { name: string; count: number }[]): GroupedItem[] {
  const porNome = new Map<string, GroupedItem>()

  for (const item of items) {
    if (item.count <= 0) continue
    const nome = friendlyItemName(item.name)
    const atual = porNome.get(nome)
    if (atual) atual.qtd += item.count
    else porNome.set(nome, { id: item.name, nome, qtd: item.count })
  }

  return [...porNome.values()].sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome))
}
