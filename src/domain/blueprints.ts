/**
 * Plantas das construções simples que o bot sabe levantar.
 *
 * Geometria pura, sem `mineflayer`: aqui se decide O QUE construir e em que
 * ordem; quem coloca bloco é `behaviors/actions/build.ts`.
 * Ver: player_commands_delta.md → "Construir coisa simples".
 */

/** Catálogo FECHADO. Pedido fora da lista nunca vira obra. */
export const STRUCTURE_NAMES = ['casa', 'torre', 'piscina', 'ponte', 'escada', 'cerca'] as const

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
  /** O que o bot fala quando a obra fica inteira. */
  finishedLine: string
  /** O que ele fala quando faltaram pedaços. Honesto sobre o que não dá pra usar. */
  partialLine: string
}

/**
 * Uma planta: a geometria e as duas falas, no mesmo lugar.
 *
 * As falas ficam aqui, e não num mapa em outro arquivo, porque mapa paralelo é
 * o que alguém esquece de estender ao acrescentar a sétima planta — e aí a
 * piscina volta a convidar a criança a "entrar pra ver".
 */
interface StructurePlan {
  blocks: BlueprintBlock[]
  footprint: { width: number; depth: number; height: number }
  finishedLine: string
  partialLine: string
}

// ─────────────────────────── CAIXA COM TELHADO ──────────────────────────────

interface RoomPlan {
  /** Lado da base, em blocos. Ímpar, para a porta ficar no meio. */
  size: number
  /** Altura das paredes. O telhado fica logo acima. */
  wallHeight: number
  /** `true` põe janela no meio das paredes que não têm porta. */
  windows: boolean
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
 * Caixa fechada com telhado: é a casa e é a torre.
 *
 * A porta fica no meio da parede `z = 0` e ocupa a altura toda da parede — de
 * um jeito que a criança consiga entrar sem precisar quebrar nada.
 */
function planRoom(plan: RoomPlan): { blocks: BlueprintBlock[]; footprint: StructurePlan['footprint'] } {
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

// ──────────────────────────── AS SEIS PLANTAS ───────────────────────────────

const PLANS: Record<StructureName, () => StructurePlan> = {
  // Casinha de 5x5 com porta, três janelas e telhado plano: ~52 blocos.
  // Pequena de propósito — obra grande demora demais para uma criança de 7
  // anos assistir, e cada bloco a mais é uma chance a mais de dar errado.
  casa: () => ({
    ...planRoom({ size: 5, wallHeight: 2, windows: true }),
    finishedLine: 'Pronto! Sua casa tá de pé. Entra pra ver!',
    partialLine: 'Fiz o que deu da casa! Faltaram uns pedaços.',
  }),

  // Torre estreita e mais alta, sem janela.
  torre: () => ({
    ...planRoom({ size: 3, wallHeight: 4, windows: false }),
    finishedLine: 'Torre pronta! Ficou bem alta, olha só.',
    partialLine: 'Fiz o que deu da torre! Ela ainda não chegou lá em cima.',
  }),

  // 2026-08-30: pedida duas vezes no log de 29/08, e recusada as duas.
  // Bacia de 5x5 com borda de 1: fundo fechado e NENHUM bloco por cima —
  // piscina com tampa não é piscina. Vazia de propósito: o bot não tem balde,
  // e a fala do fim diz isso em vez de prometer água.
  piscina: () => {
    const size = 5
    const blocks: BlueprintBlock[] = []

    // Fundo inteiro primeiro: cada bloco se apoia no chão.
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) blocks.push({ x, y: 0, z })
    }
    // Borda depois: cada bloco se apoia no fundo que acabou de ficar pronto.
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        if (isPerimeter(x, z, size)) blocks.push({ x, y: 1, z })
      }
    }

    return {
      blocks,
      footprint: { width: size, depth: size, height: 2 },
      finishedLine: 'Piscina pronta! Agora joga água dentro com o balde.',
      partialLine: 'Fiz um pedaço da piscina! Faltou fechar a borda, a água ia vazar.',
    }
  },

  // 2026-08-30: passarela de 3 de largura por 9 de comprimento, com
  // guarda-corpo dos dois lados. O tabuleiro sai NA ORDEM DO COMPRIMENTO, cada
  // bloco encostado no anterior — é o que deixa a ponte crescer sobre um vão,
  // onde não existe chão nenhum para apoiar.
  ponte: () => {
    const width = 3
    const length = 9
    const blocks: BlueprintBlock[] = []

    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) blocks.push({ x, y: 0, z })
    }
    for (let z = 0; z < length; z++) {
      for (const x of [0, width - 1]) blocks.push({ x, y: 1, z })
    }

    return {
      blocks,
      footprint: { width, depth: length, height: 2 },
      finishedLine: 'Ponte pronta! Pode atravessar, tem parede dos dois lados.',
      partialLine: 'Fiz um pedaço da ponte! Ela ainda não chega do outro lado, cuidado.',
    }
  },

  // 2026-08-30: escadaria de 5 degraus, 2 de largura. Cada degrau é maciço até
  // o chão — degrau flutuante não tem em que se apoiar. A ordem é CAMADA por
  // camada, nunca coluna por coluna: subir um degrau inteiro antes do seguinte
  // desceria uma camada no meio da obra.
  escada: () => {
    const steps = 5
    const depth = 2
    const blocks: BlueprintBlock[] = []

    for (let y = 0; y < steps; y++) {
      for (let x = y; x < steps; x++) {
        for (let z = 0; z < depth; z++) blocks.push({ x, y, z })
      }
    }

    return {
      blocks,
      footprint: { width: steps, depth, height: steps },
      finishedLine: 'Escada pronta! Sobe aí devagarinho.',
      partialLine: 'Fiz uns degraus só! A escada ainda não chegou lá em cima.',
    }
  },

  // 2026-08-30: curral de 7x7 com parede de 2 — bicho de Minecraft pula 1
  // bloco, então cerca de 1 não segura ninguém. O vão do portão é da altura
  // inteira, como a porta da casa, para a criança entrar sem quebrar nada.
  cerca: () => {
    const size = 7
    const height = 2
    const gate = Math.floor(size / 2)
    const blocks: BlueprintBlock[] = []

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          if (!isPerimeter(x, z, size)) continue
          if (x === gate && z === 0) continue // portão
          blocks.push({ x, y, z })
        }
      }
    }

    return {
      blocks,
      footprint: { width: size, depth: size, height },
      finishedLine: 'Curral pronto! Agora é só levar os bichos pra dentro.',
      partialLine: 'Fiz um pedaço do curral! Ficou um buraco, os bichos podem fugir.',
    }
  },
}

/** Monta a planta da estrutura pedida. */
export function planStructure(structure: StructureName): Blueprint {
  const plan = PLANS[structure]()
  return { structure, ...plan }
}

/** Quantos blocos a obra inteira consome. */
export function blocksNeeded(blueprint: Blueprint): number {
  return blueprint.blocks.length
}
