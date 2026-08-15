import type { DefenseConfig } from '../../config/schema.js'
import type { NearbyEntity, Threat, WorldSnapshot } from '../../domain/types.js'
import { isAttackable, isCreeper } from '../../domain/mobs.js'

export interface WatchOptions {
  defense: DefenseConfig
  ownerName: string
  /** Ids que causaram dano ao dono recentemente. */
  recentAttackers?: ReadonlySet<number>
}

/**
 * Classifica ameaças ao dono. Puro e síncrono de propósito: roda a cada tick e
 * nunca pode esperar por rede.
 * Ver: player_defense_delta.md → "Detecção de ameaça ao dono".
 */
export function classifyThreats(snapshot: WorldSnapshot, options: WatchOptions): Threat[] {
  if (!options.defense.enabled) return []
  if (!snapshot.ownerVisible || snapshot.ownerPosition === null) return []

  const threats: Threat[] = []

  for (const entity of snapshot.nearbyEntities) {
    if (entity.type !== 'hostile') continue
    // Jogador, passivo e domesticado nunca entram — nem como ameaça.
    if (!isAttackable(entity)) continue

    const distanceToOwner = entity.distanceToOwner
    if (distanceToOwner === null) continue
    // Fora do perímetro do dono o bot não se mete: ele defende, não caça.
    if (distanceToOwner > options.defense.protectRadius) continue

    const attackedOwner = options.recentAttackers?.has(entity.id) ?? false
    const aimingAtOwner = entity.targetName === options.ownerName
    const aimingAtBot = entity.targetName !== null && entity.targetName !== options.ownerName

    // Dentro do raio de proteção, um hostil sem alvo conhecido também conta:
    // um zumbi encostado no dono é ameaça mesmo que o servidor não diga a quem
    // ele mira.
    const relevant = attackedOwner || aimingAtOwner || aimingAtBot || entity.targetName === null
    if (!relevant) continue

    threats.push({
      entity,
      targetingOwner: attackedOwner || aimingAtOwner,
      isCreeper: isCreeper(entity),
      distanceToOwner,
    })
  }

  return threats
}

/**
 * Ordena por prioridade: quem está machucando o dono primeiro, depois o mais
 * próximo dele.
 */
export function prioritize(threats: readonly Threat[], maxTargets: number): Threat[] {
  return [...threats]
    .sort((a, b) => {
      if (a.targetingOwner !== b.targetingOwner) return a.targetingOwner ? -1 : 1
      return a.distanceToOwner - b.distanceToOwner
    })
    .slice(0, maxTargets)
}

export type DefensePlan =
  | { kind: 'none' }
  | { kind: 'retreat'; reason: 'criticalHealth' }
  | { kind: 'flee-creeper'; threat: Threat }
  | { kind: 'unarmed'; threat: Threat }
  | { kind: 'engage'; threat: Threat; weapon: string }

export interface PlanOptions extends WatchOptions {
  /** Melhor arma do inventário, ou `null` se desarmado. */
  weapon: string | null
}

/**
 * Decide o que fazer diante das ameaças. Determinístico e sem efeito colateral,
 * para ser exercitado inteiro por teste.
 *
 * Ordem das regras, que é a parte que importa:
 *   1. vida crítica  → recuar (EMERGENCY vence DEFEND)
 *   2. creeper perto → fugir, NUNCA corpo a corpo
 *   3. sem arma      → não engajar
 *   4. caso contrário → engajar o alvo prioritário
 */
export function planDefense(
  snapshot: WorldSnapshot,
  threats: readonly Threat[],
  options: PlanOptions,
): DefensePlan {
  // 1. Auto-preservação vence tudo. Um bot morto não protege ninguém.
  if (snapshot.health < options.defense.criticalHealth) {
    return { kind: 'retreat', reason: 'criticalHealth' }
  }

  if (threats.length === 0) return { kind: 'none' }

  const ordered = prioritize(threats, options.defense.maxSimultaneousTargets)

  // 2. Creeper perto do dono: a explosão machuca exatamente quem o bot
  // deveria proteger. Nunca vai para corpo a corpo.
  const creeper = ordered.find(
    (t) => t.isCreeper && t.distanceToOwner <= options.defense.creeperSafeDistance,
  )
  if (creeper) return { kind: 'flee-creeper', threat: creeper }

  const target = ordered.find((t) => !t.isCreeper)
  if (!target) {
    // Só sobrou creeper, mas longe do dono: ignora.
    return { kind: 'none' }
  }

  // 3. Desarmado não engaja: só morreria e largaria o inventário.
  if (options.weapon === null) return { kind: 'unarmed', threat: target }

  return { kind: 'engage', threat: target, weapon: options.weapon }
}

/**
 * Segunda checagem, no instante do golpe. A entidade pode ter mudado de estado
 * entre a seleção e o ataque.
 */
export function canStrike(entity: NearbyEntity): boolean {
  return isAttackable(entity) && !isCreeper(entity)
}
