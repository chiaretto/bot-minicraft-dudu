import type { Bot } from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import type { BehaviorConfig } from '../../config/schema.js'
import type { Intent } from '../../domain/intent.js'
import { bestWeapon } from '../../domain/mobs.js'
import { friendlyName, resolveBlockCandidates } from '../../domain/materials.js'
import { buildStructure, BuildAborted, BuildRefused, type BuildWorld } from './build.js'
import { escapeHole, EscapeAborted, EscapeRefused, type EscapeWorld } from './escape.js'
import type { Vec3Like } from '../../domain/types.js'

const { goals } = pathfinderPkg

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
  // "madeira" vale por qualquer tronco, e quem pede bétula aceita carvalho
  // antes de ouvir "não achei" numa floresta cheia de árvore.
  const permitidos = resolveBlockCandidates(blockName).filter((c) =>
    deps.behavior.collectAllowlist.includes(c),
  )
  if (permitidos.length === 0) {
    throw new ActionRefused(`não posso mexer em ${friendlyName(blockName)}`)
  }

  const ids = permitidos
    .map((name) => deps.bot.registry.blocksByName[name]?.id)
    .filter((id): id is number => id !== undefined)
  if (ids.length === 0) throw new ActionRefused(`não conheço o bloco ${blockName}`)

  let collected = 0
  for (let i = 0; i < count; i++) {
    checkAborted(deps.signal)

    const target = deps.bot.findBlock({ matching: ids, maxDistance: 32 })
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

  const nome = friendlyName(blockName)
  if (collected === 0) return { ok: false, message: `Não achei nenhum ${nome} por aqui.` }
  return { ok: true, message: `Peguei ${collected} de ${nome} pra você!` }
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

/**
 * Adapta o mundo real para a interface estreita que a obra usa.
 *
 * Único lugar onde a construção encosta em `mineflayer`. Ver `gameWorld()` em
 * `app/bot.ts`: mesmo padrão, mesmo motivo.
 */
export function buildWorldFrom(deps: ActionDeps): BuildWorld {
  const { bot } = deps
  const at = (p: Vec3Like) => bot.blockAt(new Vec3(p.x, p.y, p.z))

  return {
    botPosition: () => bot.entity.position,
    ownerPosition: () => bot.players[deps.ownerName]?.entity?.position ?? null,
    isSolid: (pos) => {
      const block = at(pos)
      // Ar, água e grama alta não seguram nada — para a obra, não existem.
      return block !== null && block.boundingBox === 'block'
    },
    inventoryCounts: () => {
      const counts: Record<string, number> = {}
      for (const item of bot.inventory.items()) {
        counts[item.name] = (counts[item.name] ?? 0) + item.count
      }
      return counts
    },
    equipBlock: async (name) => {
      const held = bot.heldItem
      if (held?.name === name) return
      const item = bot.inventory.items().find((i) => i.name === name)
      if (!item) throw new ActionRefused(`acabou meu ${friendlyName(name)}`)
      await bot.equip(item, 'hand')
    },
    walkNear: async (pos, range) => {
      await withGuards(
        bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, range)),
        deps.signal,
        deps.behavior.actionTimeoutMs,
      )
    },
    placeBlock: async (reference, face) => {
      const block = at(reference)
      if (!block) throw new ActionRefused('o apoio sumiu')
      await withGuards(
        bot.placeBlock(block, new Vec3(face.x, face.y, face.z)),
        deps.signal,
        deps.behavior.actionTimeoutMs,
      )
    },
  }
}

/**
 * Constrói uma estrutura simples.
 *
 * Quando falta material e `buildAutoGather` está ligado, ele mesmo vai buscar
 * — a alternativa seria a criança pedir uma casa e ouvir "não tenho bloco"
 * toda vez.
 */
export async function build(
  deps: ActionDeps,
  structure: string,
  material?: string,
  onProgress?: (placed: number, total: number) => void,
): Promise<ActionOutcome> {
  try {
    const outcome = await buildStructure(
      {
        world: buildWorldFrom(deps),
        signal: deps.signal,
        maxBlocks: deps.behavior.buildMaxBlocks,
        allowlist: deps.behavior.buildAllowlist,
        ...(deps.behavior.buildAutoGather
          ? {
              gather: async (block: string, count: number) => {
                const result = await collectBlock(deps, block, count)
                return result.ok ? count : 0
              },
            }
          : {}),
        ...(onProgress ? { onProgress } : {}),
      },
      structure,
      material,
    )
    return { ok: outcome.ok, message: outcome.message }
  } catch (err) {
    // Traduz para os erros que o `app/` já sabe tratar.
    if (err instanceof BuildAborted) throw new ActionAborted(err.message)
    if (err instanceof BuildRefused) throw new ActionRefused(err.message)
    throw err
  }
}

/**
 * Adapta o mundo real para a interface estreita da subida.
 *
 * `pillarUp` é a única parte deste projeto que depende de TEMPO de física: o
 * bloco só entra embaixo dos pés no ápice do pulo. Por isso ele espera o bot
 * subir de verdade em vez de dormir um tanto fixo.
 */
export function escapeWorldFrom(deps: ActionDeps): EscapeWorld {
  const { bot } = deps
  const at = (p: Vec3Like) => bot.blockAt(new Vec3(p.x, p.y, p.z))

  return {
    botPosition: () => bot.entity.position,
    ownerPosition: () => bot.players[deps.ownerName]?.entity?.position ?? null,
    isSolid: (pos) => {
      const block = at(pos)
      return block !== null && block.boundingBox === 'block'
    },
    blockNameAt: (pos) => at(pos)?.name ?? null,
    inventoryCounts: () => {
      const counts: Record<string, number> = {}
      for (const item of bot.inventory.items()) {
        counts[item.name] = (counts[item.name] ?? 0) + item.count
      }
      return counts
    },
    equipBlock: async (name) => {
      if (bot.heldItem?.name === name) return
      const item = bot.inventory.items().find((i) => i.name === name)
      if (!item) throw new ActionRefused(`acabou meu ${friendlyName(name)}`)
      await bot.equip(item, 'hand')
    },
    digBlock: async (pos) => {
      const block = at(pos)
      if (!block) return
      await withGuards(bot.dig(block), deps.signal, deps.behavior.actionTimeoutMs)
    },
    pillarUp: async () => {
      const antes = Math.floor(bot.entity.position.y)

      // Olhar para baixo antes de pular: o bloco vai embaixo dos pés.
      await bot.lookAt(bot.entity.position.offset(0, -1, 0), true)
      bot.setControlState('jump', true)
      try {
        await waitForApex(bot, antes)
        const apoio = bot.blockAt(bot.entity.position.offset(0, -1, 0))
        if (!apoio) throw new ActionRefused('sumiu o chão embaixo de mim')
        await bot.placeBlock(apoio, new Vec3(0, 1, 0))
      } finally {
        bot.setControlState('jump', false)
      }
    },
  }
}

/**
 * Espera o bot subir o bastante para caber um bloco embaixo dele.
 *
 * Sem isso o bloco é colocado antes de sair do chão e o pulo não rende nada.
 */
async function waitForApex(bot: Bot, chaoInicial: number): Promise<void> {
  const limite = Date.now() + 1_000
  while (Date.now() < limite) {
    if (bot.entity.position.y - chaoInicial >= 1.05) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/**
 * Sai de buraco fazendo escadinha.
 *
 * Cava só o que a coleta permite E que serve de degrau: a interseção das duas
 * allowlists. É o que impede o bot de cavar a casa do jogador para subir.
 */
export async function escape(
  deps: ActionDeps,
  onProgress?: (subiu: number, total: number) => void,
): Promise<ActionOutcome> {
  const permitidos = deps.behavior.buildAllowlist.filter((nome) =>
    deps.behavior.collectAllowlist.includes(nome),
  )

  try {
    const outcome = await escapeHole({
      world: escapeWorldFrom(deps),
      signal: deps.signal,
      config: {
        minDrop: deps.behavior.escapeMinDrop,
        maxHeight: deps.behavior.escapeMaxHeight,
      },
      allowlist: permitidos,
      maxDigs: deps.behavior.escapeMaxDigs,
      ...(onProgress ? { onProgress } : {}),
    })
    return { ok: outcome.ok, message: outcome.message }
  } catch (err) {
    if (err instanceof EscapeAborted) throw new ActionAborted(err.message)
    if (err instanceof EscapeRefused) throw new ActionRefused(err.message)
    throw err
  }
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
    case 'BUILD':
      return build(deps, intent.params.structure, intent.params.material)
    case 'ESCAPE_HOLE':
      return escape(deps)
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
