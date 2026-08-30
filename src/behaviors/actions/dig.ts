import type { Vec3Like } from '../../domain/types.js'
import {
  dangerNear,
  isUnderBot,
  planDig,
  NEVER_DIG,
  type DigShape,
  type Facing,
} from '../../domain/digging.js'

/**
 * Cavar buraco e túnel.
 *
 * O mundo entra por interface estreita, como em `build.ts` e `escape.ts`: a
 * regra é testável sem servidor e só o adaptador encosta em `mineflayer`.
 * Ver: player_commands_delta.md → "Cavar buraco e túnel".
 */

export class DigAborted extends Error {
  override name = 'DigAborted'
}

export class DigRefused extends Error {
  override name = 'DigRefused'
}

export interface DigWorld {
  botPosition(): Vec3Like
  facing(): Facing
  /** Nome do bloco naquela posição, ou `null` quando é ar. */
  blockNameAt(pos: Vec3Like): string | null
  /** O bot consegue LEVAR o que sair dali com o que tem na mão? */
  canHarvest(pos: Vec3Like): boolean
  walkNear(pos: Vec3Like, range: number): Promise<void>
  digBlock(pos: Vec3Like): Promise<void>
}

export interface DigDeps {
  world: DigWorld
  signal: AbortSignal | null
  /** Blocos que ele pode cavar. A mesma allowlist da coleta. */
  allowlist: readonly string[]
  /** Teto de blocos numa escavação. */
  maxBlocks: number
  onProgress?: (cavados: number, total: number) => void
}

export interface DigOutcome {
  ok: boolean
  message: string
  dug: number
  total: number
}

function checkAborted(signal: AbortSignal | null): void {
  if (signal?.aborted) throw new DigAborted('escavação cancelada')
}

const VIZINHOS: readonly Vec3Like[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 1, z: 0 },
]

function add(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

/**
 * Abre um buraco ou um túnel à frente do bot.
 *
 * Três recusas ANTES do primeiro golpe, porque descobrir no meio é pior:
 * lava ou água por perto, bloco que ele não consegue levar, e obra maior que o
 * teto. Depois disso, cada bloco que não dá para cavar é pulado em silêncio —
 * o buraco sai menor, e isso é melhor do que parar no meio.
 */
export async function digShape(deps: DigDeps, shape: DigShape): Promise<DigOutcome> {
  const { world } = deps
  const botPos = world.botPosition()
  const alvos = planDig(shape, botPos, world.facing())

  if (alvos.length > deps.maxBlocks) {
    throw new DigRefused('esse buraco é grande demais pra mim')
  }

  // Nenhuma posição pode ser o corpo do bot nem o chão dele. A planta já nasce
  // à frente; isto é a rede de segurança, e ela é barata.
  if (alvos.some((pos) => isUnderBot(pos, botPos))) {
    throw new DigRefused('assim eu ia cavar embaixo dos meus próprios pés')
  }

  const perigo = perigoPerto(world, alvos)
  if (perigo) {
    throw new DigRefused(`tem ${perigo} bem aí do lado, é perigoso cavar aqui`)
  }

  const total = alvos.length
  let cavados = 0

  for (const alvo of alvos) {
    checkAborted(deps.signal)

    const nome = world.blockNameAt(alvo)
    // Ar: já está cavado, e o buraco fica do tamanho que o terreno deixou.
    if (nome === null) continue
    if (NEVER_DIG.has(nome)) continue
    if (!deps.allowlist.includes(nome)) continue
    if (!world.canHarvest(alvo)) continue

    try {
      await world.walkNear(alvo, 3)
      checkAborted(deps.signal)
      await world.digBlock(alvo)
      cavados++
      deps.onProgress?.(cavados, total)
    } catch (err) {
      if (err instanceof DigAborted) throw err
      // Um bloco teimoso não derruba a escavação inteira.
    }
  }

  if (cavados === 0) {
    return {
      ok: false,
      message: 'Não consegui cavar aqui, desculpa! Esse chão é duro demais pra mim.',
      dug: 0,
      total,
    }
  }

  const nome = shape === 'buraco' ? 'buraco' : 'túnel'
  return {
    ok: true,
    message:
      cavados < total
        ? `Cavei o que deu do ${nome}! Tinha bloco que eu não consigo quebrar.`
        : `Pronto, ${nome} cavado! Cuidado pra não cair.`,
    dug: cavados,
    total,
  }
}

/** Lava ou água encostada em algum dos alvos? */
function perigoPerto(world: DigWorld, alvos: readonly Vec3Like[]): string | null {
  for (const alvo of alvos) {
    const nomes = VIZINHOS.map((offset) => world.blockNameAt(add(alvo, offset)))
    const perigo = dangerNear(nomes)
    if (perigo) return perigo
  }
  return null
}
