/**
 * Plantas das construções simples que o bot sabe levantar.
 *
 * Geometria pura, sem `mineflayer`: aqui se decide O QUE construir e em que
 * ordem; quem coloca bloco é `behaviors/actions/build.ts`.
 * Ver: player_commands_delta.md → "Construir coisa simples".
 */

/** Catálogo FECHADO. Pedido fora da lista nunca vira obra. */
export const STRUCTURE_NAMES = ['casa', 'torre'] as const

export type StructureName = (typeof STRUCTURE_NAMES)[number]

export function isStructureName(value: string): value is StructureName {
  return (STRUCTURE_NAMES as readonly string[]).includes(value)
}

/** Deslocamento em relação à âncora — canto da obra, no nível do chão. */
export interface BlueprintBlock {
  x: number
  y: number
  z: number
}

export interface Blueprint {
  structure: StructureName
  /**
   * Blocos NA ORDEM DE COLOCAÇÃO.
   *
   * A ordem não é enfeite: no Minecraft só dá para colocar bloco encostado em
   * outro que já existe. Uma ordem errada deixa o telhado sem apoio e a obra
   * pela metade. O invariante está travado por teste.
   */
  blocks: readonly BlueprintBlock[]
  footprint: { width: number; depth: number; height: number }
}

interface Plan {
  /** Lado da base, em blocos. Ímpar, para a porta ficar no meio. */
  size: number
  /** Altura das paredes. O telhado fica logo acima. */
  wallHeight: number
  /** `true` põe janela no meio das paredes que não têm porta. */
  windows: boolean
}

const PLANS: Record<StructureName, Plan> = {
  // Casinha de 5x5 com porta, três janelas e telhado plano: ~52 blocos.
  // Pequena de propósito — obra grande demora demais para uma criança de 7
  // anos assistir, e cada bloco a mais é uma chance a mais de dar errado.
  casa: { size: 5, wallHeight: 2, windows: true },
  // Torre estreita e mais alta, sem janela.
  torre: { size: 3, wallHeight: 4, windows: false },
}

function isPerimeter(x: number, z: number, size: number): boolean {
  return x === 0 || z === 0 || x === size - 1 || z === size - 1
}

/** Distância de Chebyshev até o centro da base. Ordena o telhado de fora para dentro. */
function distanceFromCenter(x: number, z: number, size: number): number {
  const mid = (size - 1) / 2
  return Math.max(Math.abs(x - mid), Math.abs(z - mid))
}

/**
 * Monta a planta da estrutura pedida.
 *
 * A porta fica no meio da parede `z = 0` e ocupa a altura toda da parede — de
 * um jeito que a criança consiga entrar sem precisar quebrar nada.
 */
export function planStructure(structure: StructureName): Blueprint {
  const plan = PLANS[structure]
  const { size, wallHeight, windows } = plan
  const mid = Math.floor(size / 2)
  const blocks: BlueprintBlock[] = []

  // ── Paredes ────────────────────────────────────────────────────────────
  for (let y = 0; y < wallHeight; y++) {
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        if (!isPerimeter(x, z, size)) continue

        // Porta: vão na parede da frente, da altura inteira.
        if (x === mid && z === 0) continue

        // Janelas: só na última fileira, e nunca na parede da porta.
        const isTopRow = y === wallHeight - 1
        const isWindow =
          windows &&
          isTopRow &&
          ((x === mid && z === size - 1) || (z === mid && (x === 0 || x === size - 1)))
        if (isWindow) continue

        blocks.push({ x, y, z })
      }
    }
  }

  // ── Telhado ────────────────────────────────────────────────────────────
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      blocks.push({ x, y: wallHeight, z })
    }
  }

  return {
    structure,
    blocks: orderForPlacement(blocks, size),
    footprint: { width: size, depth: size, height: wallHeight + 1 },
  }
}

/**
 * Ordena para que todo bloco tenha em que se apoiar quando chegar a vez dele.
 *
 * De baixo para cima, e dentro de cada camada de fora para dentro. É o que faz
 * o telhado fechar: o anel de fora se apoia na parede, o anel seguinte se
 * apoia no anel de fora, e assim até o meio.
 */
function orderForPlacement(blocks: BlueprintBlock[], size: number): BlueprintBlock[] {
  return [...blocks].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y
    const da = distanceFromCenter(a.x, a.z, size)
    const db = distanceFromCenter(b.x, b.z, size)
    if (da !== db) return db - da
    if (a.x !== b.x) return a.x - b.x
    return a.z - b.z
  })
}

/** Quantos blocos a obra inteira consome. */
export function blocksNeeded(blueprint: Blueprint): number {
  return blueprint.blocks.length
}
