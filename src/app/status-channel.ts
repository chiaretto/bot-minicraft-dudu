import type { GroupedItem } from '../domain/item-names.js'

/**
 * Protocolo com o processo supervisor (o aplicativo de desktop).
 *
 * Duas metades da mesma conversa, e por isso moram no mesmo arquivo:
 *
 * - **status para fora**: uma linha por transição de ciclo de vida em `stdout`,
 *   com prefixo reservado. Existe para o supervisor não ter que adivinhar o
 *   estado interpretando mensagem de log — log é texto para gente e muda sem
 *   aviso; isto aqui é contrato.
 * - **parada para dentro**: uma linha `parar` no `stdin` vale por `SIGINT`.
 *   Não é preciosismo, é necessidade do Windows: `SIGTERM` mandado para um
 *   processo filho lá não é sinal de verdade, o Node o traduz para
 *   `TerminateProcess` e o handler de encerramento NÃO roda. Sem este canal,
 *   parar o bot pela janela o deixaria de fantasma no mundo até o servidor
 *   derrubá-lo por timeout.
 *
 * As duas metades ficam desligadas por padrão: sem `DUDU_LAUNCHER=1` a saída do
 * bot é byte a byte a de sempre e o `stdin` é ignorado.
 */

/**
 * Ciclo de vida da conexão, do ponto de vista de quem espera o bot aparecer no
 * mundo.
 *
 * `parado` e `caiu` não estão aqui de propósito: são estados que só o
 * supervisor conhece (processo que nunca subiu, processo que morreu sem avisar).
 * Um processo não anuncia a própria morte.
 */
export type BotStatus = 'ligando' | 'procurando' | 'no_mundo' | 'desistiu'

/**
 * Prefixo que marca a linha como status.
 *
 * Precisa ser algo que nem o cartão de startup nem o `pino` produzem: o `pino`
 * abre com `{`, o cartão com caractere de moldura.
 */
export const STATUS_PREFIX = '@dudu-status'

/**
 * Prefixo das falas do bot, para o supervisor poder LER EM VOZ ALTA.
 *
 * Separado do status de propósito: status é ciclo de vida e muda meia dúzia de
 * vezes por sessão; fala acontece o tempo todo. Um canal só faria o supervisor
 * ter que adivinhar qual é qual.
 *
 * A dona do bot tem 7 anos e lê devagar, e o chat do Minecraft rola rápido:
 * ouvir é o que faz ela acompanhar a conversa.
 * Ver: desktop_launcher_delta.md → "Ler as falas em voz alta".
 */
export const SPEECH_PREFIX = '@dudu-fala'

/**
 * Prefixo da mochila do bot, para o supervisor poder MOSTRAR o que ele carrega.
 *
 * O terceiro canal, e cada um tem um ritmo próprio: status muda meia dúzia de
 * vezes por sessão, fala acontece o tempo todo, e a mochila é periódica e só
 * quando muda.
 * Ver: desktop_launcher_delta.md → "Canal da mochila no protocolo".
 */
export const INVENTORY_PREFIX = '@dudu-mochila'

/** Linha do `stdin` que vale por `SIGINT`. */
export const STOP_COMMAND = 'parar'

export function isLauncherMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['DUDU_LAUNCHER'] === '1'
}

/**
 * Monta a linha de status. Função pura — o estado vai em campo estruturado, e
 * não em frase: quem traduz para palavra de criança é o supervisor.
 */
export function formatStatus(status: BotStatus, at: Date = new Date()): string {
  return `${STATUS_PREFIX} ${JSON.stringify({ status, at: at.toISOString() })}`
}

/** Monta a linha de fala. Pura, como a de status. */
export function formatSpeech(text: string): string {
  return `${SPEECH_PREFIX} ${JSON.stringify({ text })}`
}

/**
 * Monta a linha da mochila.
 *
 * Cada item vai com o id **e** o nome traduzido. Os dois juntos são o que evita
 * duplicar vocabulário: a janela mostra o nome para a criança e tem o id à mão
 * para o bloco do adulto. Os dois lados repetem constante de protocolo, nunca
 * catálogo.
 */
export function formatInventory(items: readonly GroupedItem[]): string {
  const total = items.reduce((soma, item) => soma + item.qtd, 0)
  return `${INVENTORY_PREFIX} ${JSON.stringify({ itens: items, total })}`
}

export interface StatusChannel {
  emit(status: BotStatus): void
  /** Anuncia o que o bot acabou de falar no chat. */
  speak(text: string): void
  /** Anuncia a mochila. Mochila igual à última não vira linha. */
  sendInventory(items: readonly GroupedItem[]): void
}

/** Canal mudo, para quando ninguém está supervisionando. */
const SILENT: StatusChannel = { emit: () => {}, speak: () => {}, sendInventory: () => {} }

export interface StatusChannelOptions {
  env?: NodeJS.ProcessEnv
  /** Injetável no teste; em produção é o `stdout`. */
  write?: (line: string) => void
}

export function createStatusChannel(options: StatusChannelOptions = {}): StatusChannel {
  const { env = process.env, write = (line: string) => process.stdout.write(`${line}\n`) } = options
  if (!isLauncherMode(env)) return SILENT

  let last: BotStatus | null = null
  let lastInventory: string | null = null
  return {
    emit(status) {
      // Repetir o mesmo estado não é transição. O `end` seguido de reconexão
      // dispararia `procurando` várias vezes durante o backoff.
      if (status === last) return
      last = status
      write(formatStatus(status))
    },
    speak(text) {
      const limpo = text.trim()
      // Fala vazia não é fala. E repetição É: o bot repete "quente!" de
      // propósito, e a criança precisa ouvir cada uma.
      if (limpo) write(formatSpeech(limpo))
    },
    sendInventory(items) {
      // Dedup no EMISSOR: quem sabe se a mochila mudou é quem tem a mochila.
      // Sem isto, uma casa de 52 blocos encheria o canal de dezenas de linhas.
      const linha = formatInventory(items)
      if (linha === lastInventory) return
      lastInventory = linha
      write(linha)
    },
  }
}

/** Fonte de linhas de comando: o `stdin`, ou um dublê no teste. */
export interface StopSource {
  setEncoding(encoding: 'utf8'): unknown
  on(event: 'data', listener: (chunk: string) => void): unknown
}

/**
 * Escuta o canal de parada. Devolve `false` quando não há supervisor — o
 * `stdin` fica intocado, e quem roda `npm run dev` continua com o terminal
 * livre.
 *
 * Linha desconhecida é ignorada: o canal não é console de comando, é um botão.
 */
export function listenForStop(
  onStop: () => void,
  options: { env?: NodeJS.ProcessEnv; input?: StopSource } = {},
): boolean {
  const { env = process.env, input = process.stdin } = options
  if (!isLauncherMode(env)) return false

  let buffer = ''
  input.setEncoding('utf8')
  input.on('data', (chunk: string) => {
    buffer += chunk
    let cut = buffer.indexOf('\n')
    while (cut !== -1) {
      const line = buffer.slice(0, cut).trim()
      buffer = buffer.slice(cut + 1)
      // O `onStop` é idempotente do outro lado (o `shutdown` do `main.ts` tem
      // guarda de reentrada), então pedido repetido não encerra duas vezes.
      if (line === STOP_COMMAND) onStop()
      cut = buffer.indexOf('\n')
    }
  })
  return true
}
