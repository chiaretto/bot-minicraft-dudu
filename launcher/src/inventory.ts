/**
 * O que a janela mostra da mochila.
 *
 * Regra pura: nada aqui conhece `electron`. A mochila chega **já traduzida e
 * já somada** do bot — o vocabulário é dele, e duplicar o catálogo aqui seria
 * ter duas listas para manter. O que sobra para este lado é o que é decisão de
 * tela: quantos itens cabem e o que dizer do resto.
 * Ver: desktop_launcher_delta.md → "A mochila do bot na janela".
 */

/** Um item da mochila, do jeito que chega pelo protocolo. */
export interface ItemDaMochila {
  id: string
  nome: string
  qtd: number
}

/** Quantos itens cabem no painel sem ele virar uma lista rolante. */
export const MAX_ITENS = 8

/** O que aparece quando não há nada. */
export const MOCHILA_VAZIA = 'A mochila dele tá vazia.'

export interface PainelDaMochila {
  /** Os itens que aparecem, já cortados no teto. */
  itens: ItemDaMochila[]
  /**
   * A linha do que não coube, ou `null`. Nunca some em silêncio: se a criança
   * não vê o item nem a sobra, ela acha que ele não tem.
   */
  resto: string | null
  /** O texto de mochila vazia, ou `null` quando há o que mostrar. */
  vazio: string | null
}

/**
 * Monta o painel.
 *
 * A lista chega ordenada do maior para o menor, e o corte respeita isso: o que
 * fica de fora é sempre o que ele tem menos.
 */
export function montarPainel(itens: readonly ItemDaMochila[]): PainelDaMochila {
  const validos = itens.filter((item) => item.qtd > 0)

  if (validos.length === 0) {
    return { itens: [], resto: null, vazio: MOCHILA_VAZIA }
  }

  const mostrados = validos.slice(0, MAX_ITENS)
  const sobra = validos.length - mostrados.length

  return {
    itens: mostrados,
    resto: sobra > 0 ? `e mais ${sobra} ${sobra === 1 ? 'coisa' : 'coisas'}` : null,
    vazio: null,
  }
}

/** Como cada item é escrito na tela: "12 de madeira". */
export function linhaDoItem(item: ItemDaMochila): string {
  return `${item.qtd} de ${item.nome}`
}
