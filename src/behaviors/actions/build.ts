import type { Vec3Like } from '../../domain/types.js'
import {
  isStructureName,
  planStructure,
  type Blueprint,
  type StructureName,
} from '../../domain/blueprints.js'
import { friendlyName, resolveBlockCandidates } from '../../domain/materials.js'

/**
 * Construção de coisa simples.
 *
 * O mundo entra por uma interface estreita — mesmo motivo do `GameWorld`: a
 * regra da obra é testável sem servidor, e o que encosta em `mineflayer` fica
 * num adaptador só.
 * Ver: player_commands_delta.md → "Construir coisa simples".
 */

export class BuildAborted extends Error {
  override name = 'BuildAborted'
}

export class BuildRefused extends Error {
  override name = 'BuildRefused'
}

export interface BuildWorld {
  /** Onde o bot está, já arredondado para bloco. */
  botPosition(): Vec3Like
  ownerPosition(): Vec3Like | null
  /** `true` quando há bloco de verdade ali (ar, água e grama alta não contam). */
  isSolid(pos: Vec3Like): boolean
  /** Quanto o bot tem de cada bloco, por nome. */
  inventoryCounts(): Record<string, number>
  equipBlock(name: string): Promise<void>
  walkNear(pos: Vec3Like, range: number): Promise<void>
  /** Coloca um bloco encostado em `reference`, na face apontada por `face`. */
  placeBlock(reference: Vec3Like, face: Vec3Like): Promise<void>
}

export interface BuildDeps {
  world: BuildWorld
  signal: AbortSignal | null
  /** Teto de segurança: obra maior que isto é recusada. */
  maxBlocks: number
  /** Blocos que o bot pode usar como material. */
  allowlist: readonly string[]
  /** Busca mais material. Devolve quantos conseguiu trazer. */
  gather?: (block: string, count: number) => Promise<number>
  onProgress?: (placed: number, total: number) => void
}

export interface BuildOutcome {
  ok: boolean
  message: string
  placed: number
  total: number
}

/** Quantas voltas dar na lista de pendentes antes de desistir. */
const MAX_PASSES = 4

/** De quão longe o bot tenta colocar o bloco. */
const REACH = 3

const NEIGHBORS: readonly Vec3Like[] = [
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 0, z: -1 },
  { x: 0, y: 0, z: 1 },
]

function add(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function checkAborted(signal: AbortSignal | null): void {
  if (signal?.aborted) throw new BuildAborted('obra cancelada')
}

/**
 * Onde a obra começa: ao lado do bot, nunca em cima do jogador.
 *
 * Pura de propósito — errar a âncora é o jeito mais fácil de enterrar a
 * criança dentro de uma parede, e isso precisa de teste.
 */
export function chooseAnchor(
  botPos: Vec3Like,
  ownerPos: Vec3Like | null,
  footprint: { width: number; depth: number },
): Vec3Like {
  const base = { x: Math.floor(botPos.x) + 2, y: Math.floor(botPos.y), z: Math.floor(botPos.z) + 2 }
  if (!ownerPos) return base

  const inside =
    ownerPos.x >= base.x - 1 &&
    ownerPos.x <= base.x + footprint.width &&
    ownerPos.z >= base.z - 1 &&
    ownerPos.z <= base.z + footprint.depth

  // O jogador está onde a casa ia nascer: joga a obra para o outro lado.
  return inside ? { ...base, x: base.x + footprint.width + 2 } : base
}

/**
 * Escolhe o material da obra.
 *
 * Sem pedido explícito, vence o que o bot tem em maior quantidade — construir
 * com o que já está na mochila evita mandar a criança esperar uma coleta.
 */
export function chooseMaterial(
  counts: Record<string, number>,
  allowlist: readonly string[],
  requested?: string,
): string | null {
  if (requested) {
    const candidates = resolveBlockCandidates(requested).filter((c) => allowlist.includes(c))
    if (candidates.length === 0) return null
    // Entre os aceitáveis, o que ele já tem mais; se não tem nenhum, o pedido.
    const melhor = [...candidates].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))[0]!
    return melhor
  }

  const disponivel = allowlist
    .filter((name) => (counts[name] ?? 0) > 0)
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
  return disponivel[0] ?? null
}

/** Vizinho sólido que serve de apoio, com a face para onde o bloco vai. */
function findReference(
  world: BuildWorld,
  target: Vec3Like,
): { reference: Vec3Like; face: Vec3Like } | null {
  for (const offset of NEIGHBORS) {
    const neighbor = add(target, offset)
    if (world.isSolid(neighbor)) {
      // A face aponta do apoio para o alvo — o inverso do deslocamento.
      return { reference: neighbor, face: { x: -offset.x, y: -offset.y, z: -offset.z } }
    }
  }
  return null
}

/**
 * Levanta a estrutura pedida.
 *
 * Nunca derruba o que já existe: posição ocupada é pulada. É o que impede uma
 * casa nascer no lugar da casa do jogador.
 */
export async function buildStructure(
  deps: BuildDeps,
  structure: string,
  material?: string,
): Promise<BuildOutcome> {
  if (!isStructureName(structure)) {
    throw new BuildRefused(`não sei construir ${structure}`)
  }

  const blueprint = planStructure(structure as StructureName)
  const total = blueprint.blocks.length

  if (total > deps.maxBlocks) {
    throw new BuildRefused('essa obra é grande demais pra mim')
  }

  const escolhido = chooseMaterial(deps.world.inventoryCounts(), deps.allowlist, material)
  if (escolhido === null) {
    throw new BuildRefused(
      material ? `não posso construir com ${material}` : 'não tenho bloco nenhum pra construir',
    )
  }

  const anchor = chooseAnchor(
    deps.world.botPosition(),
    deps.world.ownerPosition(),
    blueprint.footprint,
  )

  const faltando = await ensureMaterial(deps, blueprint, anchor, escolhido)
  if (faltando > 0) {
    throw new BuildRefused(
      `me faltam ${faltando} de ${friendlyName(escolhido)} pra terminar. Me dá um pouco?`,
    )
  }

  return place(deps, blueprint, anchor, escolhido, total)
}

/** Quantos blocos ainda precisam ser postos, descontando o que já existe ali. */
function missingCount(world: BuildWorld, blueprint: Blueprint, anchor: Vec3Like): number {
  return blueprint.blocks.filter((b) => !world.isSolid(add(anchor, b))).length
}

/**
 * Garante material suficiente, buscando mais quando o bot souber.
 * Devolve quanto ainda falta — zero quer dizer que dá para começar.
 */
async function ensureMaterial(
  deps: BuildDeps,
  blueprint: Blueprint,
  anchor: Vec3Like,
  material: string,
): Promise<number> {
  const precisa = missingCount(deps.world, blueprint, anchor)
  const tem = deps.world.inventoryCounts()[material] ?? 0
  if (tem >= precisa) return 0
  if (!deps.gather) return precisa - tem

  checkAborted(deps.signal)
  await deps.gather(material, precisa - tem)

  const depois = deps.world.inventoryCounts()[material] ?? 0
  return Math.max(0, precisa - depois)
}

/**
 * Coloca os blocos, em passadas.
 *
 * Bloco sem apoio na hora fica para a passada seguinte: o vizinho que faltava
 * pode ter sido posto no meio do caminho. Passada que não avança nada encerra
 * a obra — insistir em laço com a criança olhando é pior que parar e falar.
 */
async function place(
  deps: BuildDeps,
  blueprint: Blueprint,
  anchor: Vec3Like,
  material: string,
  total: number,
): Promise<BuildOutcome> {
  let pendentes = [...blueprint.blocks]
  let postos = 0

  for (let pass = 0; pass < MAX_PASSES && pendentes.length > 0; pass++) {
    const adiados: typeof pendentes = []

    for (const bloco of pendentes) {
      checkAborted(deps.signal)
      const alvo = add(anchor, bloco)

      // Já tem coisa ali: o terreno resolveu por nós. Nunca derrubamos nada.
      if (deps.world.isSolid(alvo)) {
        postos++
        deps.onProgress?.(postos, total)
        continue
      }

      const apoio = findReference(deps.world, alvo)
      if (apoio === null) {
        adiados.push(bloco)
        continue
      }

      try {
        await deps.world.walkNear(alvo, REACH)
        checkAborted(deps.signal)
        await deps.world.equipBlock(material)
        await deps.world.placeBlock(apoio.reference, apoio.face)
        postos++
        deps.onProgress?.(postos, total)
      } catch (err) {
        // Cancelamento manda; qualquer outra falha é um bloco para depois.
        if (err instanceof BuildAborted) throw err
        adiados.push(bloco)
      }
    }

    // Passada inteira sem avançar: não vai avançar na próxima também.
    if (adiados.length === pendentes.length) break
    pendentes = adiados
  }

  if (postos === 0) {
    return { ok: false, message: 'Não consegui construir aqui, desculpa!', placed: 0, total }
  }
  if (postos < total) {
    return {
      ok: true,
      message: `Fiz o que deu da ${blueprint.structure}! Faltaram uns pedaços.`,
      placed: postos,
      total,
    }
  }
  return {
    ok: true,
    message: `Pronto! Sua ${blueprint.structure} tá de pé. Entra pra ver!`,
    placed: postos,
    total,
  }
}
