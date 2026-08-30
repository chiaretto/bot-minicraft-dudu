import type { Bot } from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import type { BehaviorConfig } from '../../config/schema.js'
import type { Intent } from '../../domain/intent.js'
import { bestWeapon } from '../../domain/mobs.js'
import { canHarvestWith, friendlyName, resolveBlockCandidates } from '../../domain/materials.js'
import { buildStructure, BuildAborted, BuildRefused, type BuildWorld } from './build.js'
import { escapeHole, EscapeAborted, EscapeRefused, type EscapeWorld } from './escape.js'
import {
  openNearestDoor,
  hasBlockingDoor,
  DoorAborted,
  DoorRefused,
  type DoorWorld,
} from './doors.js'
import { isOpenable, type DoorInfo } from '../../domain/doors.js'
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

  const nome = friendlyName(blockName)

  // Só procura o que ele consegue LEVAR. Quebrar pedra sem picareta some com o
  // bloco: o bot gasta o tempo, abre o buraco e não leva nada.
  const colhiveis = permitidos.filter((name) => canHarvestNow(deps.bot, name))
  if (colhiveis.length === 0) {
    throw new ActionRefused(`preciso de uma picareta pra pegar ${nome}`)
  }

  const ids = colhiveis
    .map((name) => deps.bot.registry.blocksByName[name]?.id)
    .filter((id): id is number => id !== undefined)
  if (ids.length === 0) throw new ActionRefused(`não conheço o bloco ${blockName}`)

  const antes = countInInventory(deps.bot, colhiveis)

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

    await equipBestToolFor(deps.bot, target)
    await withGuards(deps.bot.dig(target), deps.signal, deps.behavior.actionTimeoutMs)
    await pickUpDrop(deps, target.position)

    onProgress?.(countInInventory(deps.bot, colhiveis) - antes)
  }

  // O que vale é o que ENTROU na mochila, não quantos blocos ele quebrou.
  const collected = countInInventory(deps.bot, colhiveis) - antes
  if (collected <= 0) return { ok: false, message: `Não consegui pegar ${nome} por aqui.` }
  return { ok: true, message: `Peguei ${collected} de ${nome} pra você!` }
}

/** Quanto o bot tem, somando todos os nomes dados. */
function countInInventory(bot: Bot, names: readonly string[]): number {
  const alvo = new Set(names)
  return bot.inventory
    .items()
    .filter((i) => alvo.has(i.name))
    .reduce((soma, i) => soma + i.count, 0)
}

/** O bot consegue LEVAR este bloco com o que tem agora? */
export function canHarvestNow(bot: Bot, blockName: string): boolean {
  const data = bot.registry.blocksByName[blockName]
  if (!data) return false
  const idsEmMaos = bot.inventory.items().map((i) => i.type)
  return canHarvestWith(data.harvestTools as Record<string, unknown> | undefined, idsEmMaos)
}

/** Põe na mão a melhor ferramenta para aquele bloco, se houver alguma. */
async function equipBestToolFor(bot: Bot, block: Parameters<Bot['dig']>[0]): Promise<void> {
  const tool = bot.pathfinder.bestHarvestTool(block)
  if (tool && bot.heldItem?.type !== tool.type) await bot.equip(tool, 'hand')
}

/**
 * Anda em cima de onde o bloco caiu, para recolher o drop.
 *
 * Cavar a 2 blocos de distância derruba o item fora do alcance de coleta (~1
 * bloco): sem este passo o bot quebra tudo e volta de mãos vazias. Falhar aqui
 * não derruba a coleta — só significa que aquele item ficou no chão.
 */
async function pickUpDrop(deps: ActionDeps, position: Vec3Like): Promise<void> {
  try {
    await withGuards(
      deps.bot.pathfinder.goto(new goals.GoalNear(position.x, position.y, position.z, 0)),
      deps.signal,
      Math.min(deps.behavior.actionTimeoutMs, 5_000),
    )
  } catch (err) {
    if (err instanceof ActionAborted) throw err
  }
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

/**
 * Espera, mas obedecendo ao `para`.
 *
 * Graça é feita de pausas curtas, e uma pausa que ignora o abort faz o `para`
 * parecer quebrado para quem está olhando.
 */
function sleep(ms: number, signal: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ActionAborted('ação cancelada'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort(): void {
      clearTimeout(timer)
      reject(new ActionAborted('ação cancelada'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Diz quanto ele tem de um material.
 *
 * Não é ação no mundo: é uma pergunta que o snapshot já sabia responder e que
 * ia parar na IA — que respondia "isso eu não sei ver", porque a mochila não
 * estava no prompt. Aqui a resposta é exata e não custa rede.
 * Ver: player_commands_delta.md → "Contar item da mochila".
 */
export async function countItem(deps: ActionDeps, item: string): Promise<ActionOutcome> {
  const nomes = resolveBlockCandidates(item)
  const total = countInInventory(deps.bot, nomes)
  const nome = friendlyName(nomes[0] ?? item)

  if (total === 0) {
    return { ok: true, message: `Não tenho ${nome} nenhuma agora. Quer que eu busque?` }
  }
  return { ok: true, message: `Tenho ${total} de ${nome} aqui comigo!` }
}

/** Quantos pulos saem de um `pula`. Três é a graça inteira. */
const JUMP_TIMES = 3

/**
 * Pula no lugar, a pedido.
 *
 * Nenhum controle de andar é ligado: pulo que anda leva o bot para dentro de
 * um buraco enquanto a criança acha graça.
 * Ver: player_commands_delta.md → "Pular a pedido".
 */
export async function jump(deps: ActionDeps): Promise<ActionOutcome> {
  const { bot } = deps
  try {
    for (let i = 0; i < JUMP_TIMES; i++) {
      checkAborted(deps.signal)
      bot.setControlState('jump', true)
      await sleep(250, deps.signal)
      bot.setControlState('jump', false)
      await sleep(200, deps.signal)
    }
  } finally {
    // Controle preso ligado deixa o bot pulando para sempre — inclusive depois
    // de um `para`.
    bot.setControlState('jump', false)
  }
  return { ok: true, message: 'Olha eu pulando!' }
}

/** Em quantos passos o giro fecha a volta. */
const TRICK_STEPS = 8

/**
 * Faz graça: gira uma volta no lugar e termina com um pulo.
 *
 * Gira, não anda em círculo: girar é seguro em qualquer terreno, e andar em
 * círculo cai em buraco.
 * Ver: player_commands_delta.md → "Fazer graça a pedido".
 */
export async function trick(deps: ActionDeps): Promise<ActionOutcome> {
  const { bot } = deps
  const inicio = bot.entity.yaw
  const passo = (Math.PI * 2) / TRICK_STEPS

  for (let i = 1; i <= TRICK_STEPS; i++) {
    checkAborted(deps.signal)
    await bot.look(inicio + passo * i, 0, true)
    await sleep(120, deps.signal)
  }

  await jump(deps)
  return { ok: true, message: 'Tcharam! Gostou da minha dancinha?' }
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
  // Só oferece material que ele já tem OU que consegue colher de verdade.
  // Pedra sem picareta entrava na lista, ele saía para buscar e voltava vazio.
  const naMochila = new Set(deps.bot.inventory.items().map((i) => i.name))
  const viaveis = deps.behavior.buildAllowlist.filter(
    (nome) => naMochila.has(nome) || canHarvestNow(deps.bot, nome),
  )

  try {
    const outcome = await buildStructure(
      {
        world: buildWorldFrom(deps),
        signal: deps.signal,
        maxBlocks: deps.behavior.buildMaxBlocks,
        allowlist: viaveis.length > 0 ? viaveis : deps.behavior.buildAllowlist,
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
    canHarvest: (pos) => {
      const block = at(pos)
      return block !== null && canHarvestNow(bot, block.name)
    },
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

/**
 * Adapta o mundo real para a interface estreita das portas.
 *
 * **`movements.canOpenDoors` continua `false` de propósito.** Naquela flag o
 * `openable` do pathfinder só inclui bloco com "gate" no nome — ela cobre
 * portão de cerca, não porta — e o próprio autor da lib anotou "Causes issues.
 * Probably due to none paper servers", que é exatamente o nosso caso (mundo
 * aberto em LAN, vanilla). Porta é resolvida aqui, clicando.
 */
export function doorWorldFrom(deps: ActionDeps): DoorWorld {
  const { bot } = deps
  const at = (p: Vec3Like) => bot.blockAt(new Vec3(p.x, p.y, p.z))

  const info = (block: ReturnType<typeof at>): DoorInfo | null => {
    if (!block || !isOpenable(block.name)) return null
    const props = block.getProperties() as { open?: unknown; half?: unknown }
    return {
      position: block.position,
      name: block.name,
      open: props.open === true || props.open === 'true',
      ...(props.half === 'upper' || props.half === 'lower' ? { half: props.half } : {}),
    }
  }

  return {
    botPosition: () => bot.entity.position,
    nearbyDoors: (maxDistance) => {
      const ids = Object.values(bot.registry.blocksByName)
        .filter((b) => isOpenable(b.name))
        .map((b) => b.id)
      const blocos = bot.findBlocks({ matching: ids, maxDistance, count: 16 })
      return blocos
        .map((pos) => info(bot.blockAt(pos)))
        .filter((d): d is DoorInfo => d !== null)
        .sort(
          (a, b) =>
            distanceTo(bot.entity.position, a.position) -
            distanceTo(bot.entity.position, b.position),
        )
    },
    walkNear: async (pos, range) => {
      await withGuards(
        bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, range)),
        deps.signal,
        deps.behavior.actionTimeoutMs,
      )
    },
    activate: async (pos) => {
      const block = at(pos)
      if (!block) throw new ActionRefused('a porta sumiu')
      await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true)
      await withGuards(bot.activateBlock(block), deps.signal, deps.behavior.actionTimeoutMs)
    },
    doorAt: (pos) => info(at(pos)),
  }
}

function distanceTo(a: Vec3Like, b: Vec3Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** Abre a porta mais próxima que dê para abrir na mão. */
export async function openDoor(deps: ActionDeps): Promise<ActionOutcome> {
  try {
    const outcome = await openNearestDoor({
      world: doorWorldFrom(deps),
      signal: deps.signal,
      searchRadius: deps.behavior.doorSearchRadius,
    })
    return { ok: outcome.ok, message: outcome.message }
  } catch (err) {
    if (err instanceof DoorAborted) throw new ActionAborted(err.message)
    if (err instanceof DoorRefused) throw new ActionRefused(err.message)
    throw err
  }
}

/** Existe porta fechada atrapalhando o caminho? Usado pelo vigia de "preso". */
export function blockedByDoor(deps: ActionDeps): boolean {
  return hasBlockingDoor(doorWorldFrom(deps), deps.behavior.doorSearchRadius)
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
    case 'OPEN_DOOR':
      return openDoor(deps)
    case 'GOTO_COORDS':
      return gotoCoords(deps, intent.params.x, intent.params.y, intent.params.z)
    case 'DROP_ITEM_TO_OWNER':
      return dropItemToOwner(deps, intent.params.item, intent.params.count)
    case 'LOOK_AT_OWNER':
      return lookAtOwner(deps)
    case 'EQUIP_ITEM':
      return equipItem(deps, intent.params.item)
    case 'COUNT_ITEM':
      return countItem(deps, intent.params.item)
    case 'JUMP':
      return jump(deps)
    case 'TRICK':
      return trick(deps)
    default:
      throw new ActionRefused('essa eu não sei fazer')
  }
}
