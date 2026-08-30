import { describe, it, expect } from 'vitest'
import { MAX_ITENS, MOCHILA_VAZIA, linhaDoItem, montarPainel } from '../src/inventory'
import { parseLine, INVENTORY_PREFIX } from '../src/status'

const item = (nome: string, qtd: number) => ({ id: nome, nome, qtd })

/**
 * A mochila do bot na janela.
 * Ver: desktop_launcher_delta.md → "A mochila do bot na janela".
 */
describe('painel da mochila', () => {
  it('mostra o que ele carrega', () => {
    const painel = montarPainel([item('madeira', 12), item('pedra', 3)])
    expect(painel.itens).toHaveLength(2)
    expect(painel.vazio).toBeNull()
    expect(painel.resto).toBeNull()
  })

  /**
   * Sumir com a informação deixa quem lê sem saber se está vazia ou se
   * quebrou — a mesma lição do prompt da IA.
   */
  it('mochila vazia é dita, não escondida', () => {
    const painel = montarPainel([])
    expect(painel.vazio).toBe(MOCHILA_VAZIA)
    expect(painel.itens).toEqual([])
  })

  it('item com quantidade zero não entra', () => {
    expect(montarPainel([item('pão', 0)]).vazio).toBe(MOCHILA_VAZIA)
  })

  it('corta no teto e diz quantas coisas sobraram', () => {
    const muitos = Array.from({ length: MAX_ITENS + 3 }, (_, i) => item(`coisa${i}`, 100 - i))
    const painel = montarPainel(muitos)

    expect(painel.itens).toHaveLength(MAX_ITENS)
    expect(painel.resto).toBe('e mais 3 coisas')
  })

  it('uma coisa só no resto fala no singular', () => {
    const muitos = Array.from({ length: MAX_ITENS + 1 }, (_, i) => item(`coisa${i}`, 100 - i))
    expect(montarPainel(muitos).resto).toBe('e mais 1 coisa')
  })

  /** O corte respeita a ordem que veio: fica de fora o que ele tem menos. */
  it('o que fica de fora é o que ele tem menos', () => {
    const muitos = Array.from({ length: MAX_ITENS + 1 }, (_, i) => item(`coisa${i}`, 100 - i))
    const painel = montarPainel(muitos)
    expect(painel.itens[0]!.nome).toBe('coisa0')
    expect(painel.itens.map((i) => i.nome)).not.toContain(`coisa${MAX_ITENS}`)
  })

  it('cada item é escrito como a criança lê', () => {
    expect(linhaDoItem(item('madeira', 12))).toBe('12 de madeira')
  })
})

describe('a linha da mochila no stdout', () => {
  const linha = (payload: unknown) => `${INVENTORY_PREFIX} ${JSON.stringify(payload)}`

  it('é reconhecida e desembrulhada', () => {
    const saida = parseLine(linha({ itens: [{ id: 'oak_log', nome: 'madeira', qtd: 12 }], total: 12 }))
    expect(saida).toEqual({
      kind: 'inventory',
      itens: [{ id: 'oak_log', nome: 'madeira', qtd: 12 }],
    })
  })

  it('mochila vazia é uma lista vazia, e é informação', () => {
    expect(parseLine(linha({ itens: [], total: 0 }))).toEqual({ kind: 'inventory', itens: [] })
  })

  /** Linha de versão nova com campo faltando não pode virar lixo na tela. */
  it('item malformado é descartado, o resto passa', () => {
    const saida = parseLine(
      linha({ itens: [{ id: 'oak_log', nome: 'madeira', qtd: 12 }, { id: 'x' }, null] }),
    )
    expect(saida.kind === 'inventory' && saida.itens).toHaveLength(1)
  })

  it('JSON quebrado cai como log, em vez de sumir', () => {
    expect(parseLine(`${INVENTORY_PREFIX} {não sou json`).kind).toBe('log')
  })

  it('os outros dois canais continuam funcionando', () => {
    expect(parseLine('@dudu-status {"status":"no_mundo"}').kind).toBe('status')
    expect(parseLine('@dudu-fala {"text":"oi"}').kind).toBe('speech')
    expect(parseLine('{"level":30,"msg":"bot falou"}').kind).toBe('log')
  })
})
