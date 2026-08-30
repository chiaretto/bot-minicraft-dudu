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
 * Nome falado pela criança → nome do mob.
 *
 * Quinta lista fechada do projeto (junto de intenções, plantas, jogos e
 * intenções aprendíveis), pelo mesmo motivo: limitar o que o bot decide sozinho.
 *
 * Inclui os PACÍFICOS de propósito, e isso não é sobrecarga — é o que faz a
 * recusa funcionar. Sem `vaca` mapeada, "ataca a vaca" cairia no padrão genérico
 * e o bot bateria num zumbi qualquer, atendendo um pedido que a criança não fez.
 *
 * As chaves já vêm normalizadas: minúsculas e sem acento, como `prepare()` de
 * `dialogue/normalize.ts` entrega. Chave com acento nunca casaria.
 * Ver: player_commands_delta.md → "Catálogo de nomes de criatura em português".
 */
export const MOB_NAMES_PT: Readonly<Record<string, string>> = {
  // Hostis
  zumbi: 'zombie',
  zumbis: 'zombie',
  'zumbi aldeao': 'zombie_villager',
  afogado: 'drowned',
  esqueleto: 'skeleton',
  aranha: 'spider',
  'aranha da caverna': 'cave_spider',
  bruxa: 'witch',
  creeper: 'creeper',
  saqueador: 'pillager',
  devastador: 'ravager',
  slime: 'slime',
  gosma: 'slime',
  blaze: 'blaze',
  fantasma: 'phantom',
  'peixe prateado': 'silverfish',
  // Pacíficos — presentes para a recusa ser reconhecida, não improvisada
  vaca: 'cow',
  ovelha: 'sheep',
  porco: 'pig',
  galinha: 'chicken',
  coelho: 'rabbit',
  raposa: 'fox',
  abelha: 'bee',
  cavalo: 'horse',
  lobo: 'wolf',
  cachorro: 'wolf',
  gato: 'cat',
  papagaio: 'parrot',
  aldeao: 'villager',
  golem: 'iron_golem',
}

/**
 * Hostis que o bot encara **de mão**, sem arma nenhuma.
 *
 * Lista fechada em vez de cálculo de dano: dá para ler e saber exatamente o que
 * o bot vai encarar, e não surpreende quando um mob novo entra no jogo.
 *
 * A regra antiga era "desarmado nunca engaja". O raciocínio estava certo — o bot
 * morreria à toa — mas o resultado estava errado: como ele entra no mundo com o
 * inventário vazio e não sabe craftar, isso significava um bot que NUNCA atacava
 * nada, nem o zumbi batendo no dono. Para a criança, um amigo que nunca defende.
 * Ver: player_defense_delta.md → "Catálogo de alvos enfrentáveis desarmado".
 */
export const UNARMED_OK = new Set([
  'zombie',
  'zombie_villager',
  'husk',
  'drowned',
  'skeleton',
  'stray',
  'bogged',
  'spider',
  'cave_spider',
  'silverfish',
  'endermite',
  'slime',
  'magma_cube',
  'vex',
])

/**
 * Traduz o nome falado, ou `null` quando o catálogo não conhece.
 *
 * `null` NÃO é erro: significa "ataca" sem alvo nomeado, e quem decide é a
 * seleção pelo mais perto.
 */
export function mobFromSpokenName(spoken: string): string | null {
  return MOB_NAMES_PT[spoken.trim()] ?? null
}

/** O bot encara este alvo sem arma nenhuma? */
export function canFightUnarmed(entity: Pick<NearbyEntity, 'name' | 'type' | 'isTamed'>): boolean {
  return isAttackable(entity) && UNARMED_OK.has(entity.name.toLowerCase())
}

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
