import type {
  BotState,
  InventoryItem,
  NearbyEntity,
  TimeOfDay,
  Vec3Like,
  WorldSnapshot,
} from '../domain/types.js'
import { HOSTILE_ALLOWLIST, CREEPER, NEVER_ATTACK } from '../domain/mobs.js'

/** Forma mínima de bot que o snapshot precisa — mantém o módulo testável. */
export interface SnapshotSource {
  entity?: { position: Vec3Like } | null
  health?: number
  food?: number
  time?: { timeOfDay: number }
  game?: { dimension?: string }
  inventory?: { items(): Array<{ name: string; count: number }> }
  players?: Record<string, { entity?: { position: Vec3Like } | null } | undefined>
  entities?: Record<string, RawEntity | undefined>
}

export interface RawEntity {
  id: number
  name?: string
  username?: string
  type?: string
  position: Vec3Like
  /** mineflayer expõe metadata variável; usamos só o que é estável. */
  metadata?: unknown[]
  isValid?: boolean
}

export function distance(a: Vec3Like, b: Vec3Like): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** Ticks do Minecraft → período do dia. 0 = amanhecer, 13000 = anoitecer. */
export function toTimeOfDay(ticks: number): TimeOfDay {
  const t = ((ticks % 24000) + 24000) % 24000
  if (t >= 13000) return 'noite'
  if (t >= 9000) return 'tarde'
  return 'dia'
}

export function isNight(ticks: number): boolean {
  return toTimeOfDay(ticks) === 'noite'
}

function classify(entity: RawEntity): NearbyEntity['type'] {
  if (entity.type === 'player' || entity.username) return 'player'
  const name = (entity.name ?? '').toLowerCase()
  if (name === CREEPER || HOSTILE_ALLOWLIST.has(name)) return 'hostile'
  if (NEVER_ATTACK.has(name)) return 'passive'
  return 'other'
}

/** Creeper inflado aparece na metadata como um flag booleano/positivo. */
export function detectIgnited(entity: RawEntity): boolean {
  if ((entity.name ?? '').toLowerCase() !== CREEPER) return false
  const meta = entity.metadata ?? []
  return meta.some((value) => value === true || value === 1)
}

export interface SnapshotOptions {
  ownerName: string
  state: BotState
  /** Alvos por id de entidade, quando o servidor informa quem o mob persegue. */
  entityTargets?: Map<number, string>
}

export function buildSnapshot(bot: SnapshotSource, options: SnapshotOptions): WorldSnapshot {
  const position = bot.entity?.position ?? { x: 0, y: 0, z: 0 }
  const ticks = bot.time?.timeOfDay ?? 0
  const ownerEntity = bot.players?.[options.ownerName]?.entity ?? null
  const ownerPosition = ownerEntity?.position ?? null

  const inventory: InventoryItem[] = (bot.inventory?.items() ?? []).map((item) => ({
    name: item.name,
    count: item.count,
  }))

  const nearbyEntities: NearbyEntity[] = []
  for (const raw of Object.values(bot.entities ?? {})) {
    if (!raw) continue
    if (raw.isValid === false) continue
    // O próprio bot não é entidade próxima.
    if (raw.position === position) continue

    const name = raw.username ?? raw.name ?? 'unknown'
    const distanceToBot = distance(position, raw.position)
    // Só o que está perto interessa; o resto é ruído para a IA e para a defesa.
    if (distanceToBot > 48) continue

    nearbyEntities.push({
      id: raw.id,
      name,
      type: classify(raw),
      position: raw.position,
      distanceToBot,
      distanceToOwner: ownerPosition ? distance(ownerPosition, raw.position) : null,
      targetName: options.entityTargets?.get(raw.id) ?? null,
      isIgnited: detectIgnited(raw),
      isTamed: false,
    })
  }

  return {
    position,
    health: bot.health ?? 20,
    food: bot.food ?? 20,
    timeOfDay: toTimeOfDay(ticks),
    isNight: isNight(ticks),
    inventory,
    ownerVisible: ownerPosition !== null,
    ownerPosition,
    ownerHealth: null,
    nearbyEntities,
    dimension: bot.game?.dimension ?? 'overworld',
    state: options.state,
  }
}
