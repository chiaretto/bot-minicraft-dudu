import type { Bot } from 'mineflayer'
import { goals } from 'mineflayer-pathfinder'
import type { BehaviorConfig } from '../../config/schema.js'
import type { Intent } from '../../domain/intent.js'
import { bestWeapon } from '../../domain/mobs.js'

export class ActionAborted extends Error {
  override name = 'ActionAborted'
}
export class ActionRefused extends Error {
  override name = 'ActionRefused'
}
export class NoProgress extends Error {
  override name = 'NoProgress'
}

export interface ActionDeps {
  bot: Bot
  behavior: BehaviorConfig
  ownerName: string
  signal: AbortSignal | null
  /** Injetável para teste. */
  now?: () => number
}

export interface ActionOutcome {
  ok: boolean
  message: string
}

function checkAborted(signal: AbortSignal | null): void {
  if (signal?.aborted) throw new ActionAborted('ação cancelada')
}

/**
 * Corre a promise contra o abort E contra o timeout.
 * Sem isso `dudu, para` só teria efeito depois que a ação terminasse sozinha —
 * exatamente o que a spec exige que NÃO aconteça.
 */
async function withGuards<T>(
  promise: Promise<T>,
  signal: AbortSignal | null,
  timeoutMs: number,
): Promise<T> {
  const guards: Promise<never>[] = []

  let timer: ReturnType<typeof setTimeout> | undefined
  guards.push(
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new NoProgress('tempo máximo da ação estourou')), timeoutMs)
    }),
  )

  if (signal) {
    guards.push(
      new Promise<never>((_, reject) => {
        if (signal.aborted) return reject(new ActionAborted('ação cancelada'))
        signal.addEventListener('abort', () => reject(new ActionAborted('ação cancelada')), {
          once: true,
        })
      }),
    )
  }

  try {
    return await Promise.race([promise, ...guards])
  } finally {
    clearTimeout(timer)
  }
}

/** Vai até uma coordenada. */
export async function gotoCoords(
  deps: ActionDeps,
  x: number,
  y: number,
  z: number,
): Promise<ActionOutcome> {
  checkAborted(deps.signal)
  await withGuards(
    deps.bot.pathfinder.goto(new goals.GoalNear(x, y, z, 1)),
    deps.signal,
    deps.behavior.actionTimeoutMs,
  )
  return { ok: true, message: `Cheguei em ${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)}!` }
}

/**
 * Coleta blocos, respeitando a allowlist.
 *
 * A allowlist é o que impede uma alucinação da IA de virar a casa do jogador
 * demolida. Ver: player_commands_delta.md → "Bloco fora da allowlist".
 */
export async function collectBlock(
  deps: ActionDeps,
  blockName: string,
  count: number,
  onProgress?: (collected: number) => void,
): Promise<ActionOutcome> {
  if (!deps.behavior.collectAllowlist.includes(blockName)) {
    throw new ActionRefused(`não posso mexer em ${blockName}`)
  }

  const blockType = deps.bot.registry.blocksByName[blockName]
  if (!blockType) throw new ActionRefused(`não conheço o bloco ${blockName}`)

  let collected = 0
  for (let i = 0; i < count; i++) {
    checkAborted(deps.signal)

    const target = deps.bot.findBlock({ matching: blockType.id, maxDistance: 32 })
    if (!target) break

    await withGuards(
      deps.bot.pathfinder.goto(
        new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2),
      ),
      deps.signal,
      deps.behavior.actionTimeoutMs,
    )
    checkAborted(deps.signal)
    await withGuards(deps.bot.dig(target), deps.signal, deps.behavior.actionTimeoutMs)

    collected++
    onProgress?.(collected)
  }

  if (collected === 0) return { ok: false, message: `Não achei nenhum ${blockName} por aqui.` }
  return { ok: true, message: `Peguei ${collected} ${blockName} pra você!` }
}

/** Leva um item até o dono e larga perto dele. */
export async function dropItemToOwner(
  deps: ActionDeps,
  itemName: string,
  count?: number,
): Promise<ActionOutcome> {
  const item = deps.bot.inventory.items().find((i) => i.name === itemName)
  if (!item) throw new ActionRefused(`não tenho ${itemName} comigo`)

  const owner = deps.bot.players[deps.ownerName]?.entity
  if (!owner) throw new ActionRefused('não tô te vendo pra te entregar')

  await withGuards(
    deps.bot.pathfinder.goto(
      new goals.GoalNear(owner.position.x, owner.position.y, owner.position.z, 2),
    ),
    deps.signal,
    deps.behavior.actionTimeoutMs,
  )
  checkAborted(deps.signal)
  await withGuards(
    deps.bot.toss(item.type, null, count ?? item.count),
    deps.signal,
    deps.behavior.actionTimeoutMs,
  )

  return { ok: true, message: `Toma aí o ${itemName}!` }
}

export async function lookAtOwner(deps: ActionDeps): Promise<ActionOutcome> {
  const owner = deps.bot.players[deps.ownerName]?.entity
  if (!owner) throw new ActionRefused('não tô te vendo')
  await deps.bot.lookAt(owner.position.offset(0, 1.6, 0))
  return { ok: true, message: 'Tô olhando pra você!' }
}

export async function equipItem(deps: ActionDeps, itemName: string): Promise<ActionOutcome> {
  const item = deps.bot.inventory.items().find((i) => i.name === itemName)
  if (!item) throw new ActionRefused(`não tenho ${itemName}`)
  await deps.bot.equip(item, 'hand')
  return { ok: true, message: `Equipei ${itemName}!` }
}

/** Equipa a melhor arma do inventário. Devolve o nome, ou null se desarmado. */
export async function equipBestWeapon(bot: Bot): Promise<string | null> {
  const weapon = bestWeapon(bot.inventory.items())
  if (!weapon) return null
  await bot.equip(weapon, 'hand')
  return weapon.name
}

/** Despacha uma intenção validada para a ação correspondente. */
export async function runIntent(deps: ActionDeps, intent: Intent): Promise<ActionOutcome> {
  switch (intent.type) {
    case 'COLLECT_BLOCK':
      return collectBlock(deps, intent.params.block, intent.params.count)
    case 'GOTO_COORDS':
      return gotoCoords(deps, intent.params.x, intent.params.y, intent.params.z)
    case 'DROP_ITEM_TO_OWNER':
      return dropItemToOwner(deps, intent.params.item, intent.params.count)
    case 'LOOK_AT_OWNER':
      return lookAtOwner(deps)
    case 'EQUIP_ITEM':
      return equipItem(deps, intent.params.item)
    default:
      throw new ActionRefused('essa eu não sei fazer')
  }
}
