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

export interface StatusChannel {
  emit(status: BotStatus): void
}

/** Canal mudo, para quando ninguém está supervisionando. */
const SILENT: StatusChannel = { emit: () => {} }

export interface StatusChannelOptions {
  env?: NodeJS.ProcessEnv
  /** Injetável no teste; em produção é o `stdout`. */
  write?: (line: string) => void
}

export function createStatusChannel(options: StatusChannelOptions = {}): StatusChannel {
  const { env = process.env, write = (line: string) => process.stdout.write(`${line}\n`) } = options
  if (!isLauncherMode(env)) return SILENT

  let last: BotStatus | null = null
  return {
    emit(status) {
      // Repetir o mesmo estado não é transição. O `end` seguido de reconexão
      // dispararia `procurando` várias vezes durante o backoff.
      if (status === last) return
      last = status
      write(formatStatus(status))
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
