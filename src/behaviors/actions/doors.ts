import type { Vec3Like } from '../../domain/types.js'
import { explainNoDoor, friendlyDoorName, openableNow, type DoorInfo } from '../../domain/doors.js'

/**
 * Abrir porta.
 *
 * O mundo entra por interface estreita, como em `build.ts` e `escape.ts`.
 * Ver: player_commands_delta.md → "Abrir porta".
 */

export class DoorAborted extends Error {
  override name = 'DoorAborted'
}

export class DoorRefused extends Error {
  override name = 'DoorRefused'
}

export interface DoorWorld {
  botPosition(): Vec3Like
  /** Portas, portões e alçapões por perto — mais próximo primeiro. */
  nearbyDoors(maxDistance: number): DoorInfo[]
  walkNear(pos: Vec3Like, range: number): Promise<void>
  /** Clica no bloco, como o jogador faria com o botão direito. */
  activate(pos: Vec3Like): Promise<void>
  doorAt(pos: Vec3Like): DoorInfo | null
}

export interface DoorDeps {
  world: DoorWorld
  signal: AbortSignal | null
  /** Até onde procurar porta. */
  searchRadius: number
}

export interface DoorOutcome {
  ok: boolean
  message: string
  /** Onde estava a porta que ele abriu, quando abriu alguma. */
  opened: Vec3Like | null
}

/** De quão perto o bot precisa estar para alcançar a porta. */
const REACH = 2

function checkAborted(signal: AbortSignal | null): void {
  if (signal?.aborted) throw new DoorAborted('abertura cancelada')
}

/** Existe porta fechada por perto que dê para empurrar? */
export function hasBlockingDoor(world: DoorWorld, radius: number): boolean {
  return openableNow(world.nearbyDoors(radius)).length > 0
}

const RECUSA: Record<ReturnType<typeof explainNoDoor>, string> = {
  nenhuma: 'não tô vendo porta nenhuma aqui',
  ja_aberta: 'a porta já tá aberta',
  so_ferro: 'essa porta é de ferro, ela só abre com botão ou alavanca',
}

/**
 * Abre a porta mais próxima que dê para abrir na mão.
 *
 * Porta de ferro é recusada com o motivo certo: ficar clicando numa porta que
 * só abre com redstone pareceria o bot quebrado.
 */
export async function openNearestDoor(deps: DoorDeps): Promise<DoorOutcome> {
  checkAborted(deps.signal)

  const porPerto = deps.world.nearbyDoors(deps.searchRadius)
  const candidatas = openableNow(porPerto)

  if (candidatas.length === 0) {
    throw new DoorRefused(RECUSA[explainNoDoor(porPerto)])
  }

  const alvo = candidatas[0]!
  const nome = friendlyDoorName(alvo.name)

  await deps.world.walkNear(alvo.position, REACH)
  checkAborted(deps.signal)
  await deps.world.activate(alvo.position)

  // Confere o resultado em vez de confiar no clique: servidor pode recusar, e
  // anunciar "abri!" com a porta fechada é o bot mentindo.
  const depois = deps.world.doorAt(alvo.position)
  if (depois !== null && !depois.open) {
    return { ok: false, message: `Tentei, mas a ${nome} não abriu.`, opened: null }
  }

  return { ok: true, message: `Abri a ${nome}!`, opened: alvo.position }
}
