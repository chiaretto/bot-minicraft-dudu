/**
 * Leitura do que o processo do bot escreve.
 *
 * Duas coisas saem misturadas no mesmo `stdout`: as linhas de status do
 * protocolo (contrato) e o log (texto para gente). Aqui elas são separadas — e
 * nada aqui importa `electron`: é função pura, testada sem abrir janela.
 *
 * O prefixo é o mesmo declarado em `src/app/status-channel.ts` do bot. Os dois
 * lados repetem a constante de propósito: são processos separados, e um
 * `import` entre eles amarraria o launcher ao build do bot.
 */

export type BotStatus = 'ligando' | 'procurando' | 'no_mundo' | 'desistiu'

export const STATUS_PREFIX = '@dudu-status'

/**
 * Prefixo das falas do bot. O mesmo declarado em `src/app/status-channel.ts`,
 * repetido aqui pelo mesmo motivo do outro: são processos separados.
 */
export const SPEECH_PREFIX = '@dudu-fala'

/** Prefixo da mochila. O terceiro do protocolo, repetido pelo mesmo motivo. */
export const INVENTORY_PREFIX = '@dudu-mochila'

const KNOWN: readonly BotStatus[] = ['ligando', 'procurando', 'no_mundo', 'desistiu']

/** Um item da mochila, como chega na linha do protocolo. */
export interface ItemDaMochila {
  id: string
  nome: string
  qtd: number
}

export type ChildLine =
  | { kind: 'status'; status: BotStatus }
  | { kind: 'speech'; text: string }
  | { kind: 'inventory'; itens: ItemDaMochila[] }
  | { kind: 'log'; text: string }

/**
 * Classifica uma linha do filho.
 *
 * Linha malformada com o prefixo cai como log: o adulto vê no bloco de detalhes
 * em vez de sumir em silêncio, e nada explode. Status inventado (versão nova do
 * bot falando com launcher velho) também vira log, pelo mesmo motivo.
 */
export function parseLine(line: string): ChildLine {
  if (line.startsWith(`${SPEECH_PREFIX} `)) {
    const payload = line.slice(SPEECH_PREFIX.length + 1)
    try {
      const parsed: unknown = JSON.parse(payload)
      const text = (parsed as { text?: unknown } | null)?.text
      if (typeof text === 'string' && text.trim().length > 0) {
        return { kind: 'speech', text: text.trim() }
      }
    } catch {
      // Fala com JSON quebrado cai como log, igual ao status.
    }
    return { kind: 'log', text: line }
  }

  if (line.startsWith(`${INVENTORY_PREFIX} `)) {
    const payload = line.slice(INVENTORY_PREFIX.length + 1)
    try {
      const parsed: unknown = JSON.parse(payload)
      const itens = (parsed as { itens?: unknown } | null)?.itens
      if (Array.isArray(itens)) {
        // Mochila vazia é uma lista vazia, e é informação: "ele não tem nada".
        return { kind: 'inventory', itens: itens.filter(ehItem) }
      }
    } catch {
      // Mochila com JSON quebrado cai como log, igual às outras duas.
    }
    return { kind: 'log', text: line }
  }

  if (!line.startsWith(`${STATUS_PREFIX} `)) return { kind: 'log', text: line }

  const payload = line.slice(STATUS_PREFIX.length + 1)
  try {
    const parsed: unknown = JSON.parse(payload)
    const status = (parsed as { status?: unknown } | null)?.status
    if (typeof status === 'string' && (KNOWN as readonly string[]).includes(status)) {
      return { kind: 'status', status: status as BotStatus }
    }
  } catch {
    // JSON quebrado não derruba o supervisor: cai como log, abaixo.
  }
  return { kind: 'log', text: line }
}

/** Item bem formado? Linha de versão nova com campo faltando não vira lixo. */
function ehItem(raw: unknown): raw is ItemDaMochila {
  const item = raw as { id?: unknown; nome?: unknown; qtd?: unknown } | null
  return (
    typeof item?.id === 'string' &&
    typeof item.nome === 'string' &&
    typeof item.qtd === 'number' &&
    item.qtd > 0
  )
}

/**
 * Quebra os pedaços do `stdout` em linhas inteiras.
 *
 * O `stdout` chega em pedaços arbitrários — uma linha de status pode vir
 * cortada no meio do JSON, e tratar pedaço como linha perderia a transição.
 */
export function createLineSplitter(): (chunk: string) => string[] {
  let buffer = ''
  return (chunk: string) => {
    buffer += chunk
    const parts = buffer.split('\n')
    // O último pedaço é o resto sem `\n`: fica guardado para o próximo chunk.
    buffer = parts.pop() ?? ''
    return parts.map((line) => line.replace(/\r$/, '')).filter((line) => line.length > 0)
  }
}
