import type { NearbyEntity } from './types.js'

/**
 * Allowlist FECHADA de mobs que o bot pode atacar.
 * Ver: player_defense_delta.md → "Alvos proibidos".
 */
export const HOSTILE_ALLOWLIST = new Set([
  'zombie',
  'zombie_villager',
  'husk',
  'drowned',
  'skeleton',
  'stray',
  'bogged',
  'spider',
  'cave_spider',
  'witch',
  'pillager',
  'vindicator',
  'evoker',
  'ravager',
  'silverfish',
  'endermite',
  'slime',
  'magma_cube',
  'blaze',
  'zombified_piglin',
  'piglin_brute',
  'hoglin',
  'zoglin',
  'wither_skeleton',
  'guardian',
  'elder_guardian',
  'phantom',
  'vex',
])

/**
 * Denylist ABSOLUTA. Vence a allowlist em qualquer circunstância.
 * Jogadores nunca são alvo — PvP está fora de escopo por decisão de produto.
 */
export const NEVER_ATTACK = new Set([
  'player',
  'villager',
  'iron_golem',
  'snow_golem',
  'wolf',
  'cat',
  'ocelot',
  'horse',
  'donkey',
  'mule',
  'llama',
  'parrot',
  'axolotl',
  'allay',
  'cow',
  'sheep',
  'pig',
  'chicken',
  'rabbit',
  'fox',
  'bee',
  'armor_stand',
  'item',
  'experience_orb',
])

export const CREEPER = 'creeper'

/**
 * Decide se uma entidade pode receber um golpe.
 *
 * Chamada DUAS vezes: na seleção de alvo e de novo no instante do golpe.
 * A segunda checagem existe porque a entidade pode ter mudado de estado
 * (ex.: lobo que foi domesticado) entre uma coisa e outra.
 * Ver: player_defense_delta.md → "Guarda verificada no momento do ataque".
 */
export function isAttackable(entity: Pick<NearbyEntity, 'name' | 'type' | 'isTamed'>): boolean {
  const name = entity.name.toLowerCase()
  if (entity.type === 'player') return false
  if (entity.isTamed === true) return false
  if (NEVER_ATTACK.has(name)) return false
  // Creeper é hostil, mas o engajamento dele tem regra própria (nunca corpo a
  // corpo perto do dono). Aqui ele é "atacável" só em tese; quem decide é o
  // planejador de defesa.
  if (name === CREEPER) return true
  return HOSTILE_ALLOWLIST.has(name)
}

export function isCreeper(entity: Pick<NearbyEntity, 'name'>): boolean {
  return entity.name.toLowerCase() === CREEPER
}

/** Espadas e machados, do mais forte para o mais fraco. */
const WEAPON_RANK: Record<string, number> = {
  netherite_sword: 100,
  diamond_sword: 90,
  netherite_axe: 85,
  iron_sword: 80,
  diamond_axe: 75,
  stone_sword: 60,
  iron_axe: 55,
  golden_sword: 50,
  wooden_sword: 40,
  stone_axe: 35,
  golden_axe: 30,
  wooden_axe: 20,
}

export function weaponRank(itemName: string): number {
  return WEAPON_RANK[itemName.toLowerCase()] ?? 0
}

/** Melhor arma do inventário, ou `null` se o bot estiver desarmado. */
export function bestWeapon<T extends { name: string }>(items: readonly T[]): T | null {
  let best: T | null = null
  let bestScore = 0
  for (const item of items) {
    const score = weaponRank(item.name)
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }
  return best
}
