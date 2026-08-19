import type { Vec3Like } from '../../domain/types.js'
import {
  diggableNeighbors,
  needsEscape,
  pillarHeight,
  reachedOwnerLevel,
  type EscapeConfig,
} from '../../domain/escape.js'
import { friendlyName } from '../../domain/materials.js'

/**
 * Sair de buraco fazendo escadinha de blocos.
 *
 * O mundo entra por interface estreita, como em `build.ts`: a regra é testável
 * sem servidor e só o adaptador encosta em `mineflayer`.
 * Ver: player_commands_delta.md → "Sair de buraco".
 */

export class EscapeAborted extends Error {
  override name = 'EscapeAborted'
}

export class EscapeRefused extends Error {
  override name = 'EscapeRefused'
}

export interface EscapeWorld {
  botPosition(): Vec3Like
  ownerPosition(): Vec3Like | null
  isSolid(pos: Vec3Like): boolean
  /** Nome do bloco naquela posição, ou `null` quando não há bloco. */
  blockNameAt(pos: Vec3Like): string | null
  inventoryCounts(): Record<string, number>
  equipBlock(name: string): Promise<void>
  /** Cava o bloco e recolhe o que cair. */
  digBlock(pos: Vec3Like): Promise<void>
  /** Pula e coloca um bloco embaixo dos próprios pés. */
  pillarUp(): Promise<void>
}

export interface EscapeDeps {
  world: EscapeWorld
  signal: AbortSignal | null
  config: EscapeConfig
  /** Blocos que servem de degrau. */
  allowlist: readonly string[]
  /** Teto de blocos cavados numa tentativa, para não virar escavação. */
  maxDigs: number
  onProgress?: (subiu: number, total: number) => void
}

export interface EscapeOutcome {
  ok: boolean
  message: string
  /** Quantos degraus o bot conseguiu subir. */
  climbed: number
}

function checkAborted(signal: AbortSignal | null): void {
  if (signal?.aborted) throw new EscapeAborted('subida cancelada')
}

/** Primeiro bloco da mochila que serve de degrau. */
function degrauDisponivel(
  counts: Record<string, number>,
  allowlist: readonly string[],
): string | null {
  const comEstoque = allowlist
    .filter((nome) => (counts[nome] ?? 0) > 0)
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
  return comEstoque[0] ?? null
}

/**
 * Cava as paredes em volta até ter degrau suficiente.
 *
 * Só na horizontal: cavar o chão aprofundaria o buraco. Devolve o material
 * conseguido, ou `null` quando não deu para arranjar nada.
 */
async function arranjarMaterial(deps: EscapeDeps, precisa: number): Promise<string | null> {
  const { world } = deps
  let cavados = 0

  while (cavados < deps.maxDigs) {
    checkAborted(deps.signal)

    const jaTem = degrauDisponivel(world.inventoryCounts(), deps.allowlist)
    if (jaTem !== null && (world.inventoryCounts()[jaTem] ?? 0) >= precisa) return jaTem

    const candidatos = diggableNeighbors((p) => world.isSolid(p), world.botPosition()).filter(
      (pos) => {
        const nome = world.blockNameAt(pos)
        return nome !== null && deps.allowlist.includes(nome)
      },
    )
    if (candidatos.length === 0) break

    try {
      await world.digBlock(candidatos[0]!)
      cavados++
    } catch (err) {
      if (err instanceof EscapeAborted) throw err
      break
    }
  }

  return degrauDisponivel(world.inventoryCounts(), deps.allowlist)
}

/**
 * Sobe até o nível do dono empilhando bloco embaixo de si.
 *
 * Nunca sobe "por subir": sem dono à vista não há para onde ir, e uma torre no
 * meio do nada é pior que ficar parado.
 */
export async function escapeHole(deps: EscapeDeps): Promise<EscapeOutcome> {
  const { world } = deps
  checkAborted(deps.signal)

  const inicio = world.botPosition()
  const dono = world.ownerPosition()

  if (!needsEscape(inicio, dono, deps.config)) {
    throw new EscapeRefused('não tô num buraco')
  }

  const total = pillarHeight(inicio, dono, deps.config)
  if (total <= 0) throw new EscapeRefused('não tô num buraco')

  const material = await arranjarMaterial(deps, total)
  if (material === null) {
    throw new EscapeRefused('não tenho bloco pra fazer degrau e não achei o que cavar aqui')
  }

  let subiu = 0
  for (let i = 0; i < total; i++) {
    checkAborted(deps.signal)

    // O dono pode ter descido até o bot enquanto ele subia.
    if (reachedOwnerLevel(world.botPosition(), world.ownerPosition())) break

    const emMaos = degrauDisponivel(world.inventoryCounts(), deps.allowlist)
    if (emMaos === null) break

    try {
      await world.equipBlock(emMaos)
      await world.pillarUp()
      subiu++
      deps.onProgress?.(subiu, total)
    } catch (err) {
      if (err instanceof EscapeAborted) throw err
      break
    }
  }

  if (subiu === 0) {
    return { ok: false, message: 'Não consegui subir daqui, me ajuda?', climbed: 0 }
  }
  if (!reachedOwnerLevel(world.botPosition(), world.ownerPosition())) {
    return {
      ok: true,
      message: `Subi ${subiu} de ${friendlyName(material)}, mas ainda tô fundo!`,
      climbed: subiu,
    }
  }
  return { ok: true, message: 'Saí do buraco! Tô indo aí!', climbed: subiu }
}
