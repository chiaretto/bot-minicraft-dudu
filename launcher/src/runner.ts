/**
 * Dono do processo do bot: cria, escuta, para.
 *
 * Fica separado do `main.ts` para que o ciclo de vida do processo não se
 * misture com o ciclo de vida da janela — e para que a regra difícil (parar sem
 * deixar fantasma no mundo) tenha um lugar só.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createLineSplitter, parseLine, type BotStatus, type ItemDaMochila } from './status'

/**
 * Quanto tempo esperar o bot sair sozinho depois do pedido de parada.
 *
 * Ele precisa mandar o `quit` ao servidor e fechar o arquivo do dia; o
 * `main.ts` do bot já dá 500 ms para o `quit` chegar. Este teto é o dobro com
 * folga — passou disso, alguma coisa travou e o `kill` é melhor que um bot
 * parado de fantasma no mundo.
 */
const STOP_TIMEOUT_MS = 5_000

export class BotNotFoundError extends Error {
  override name = 'BotNotFoundError'
}

export interface RunnerEvents {
  onStatus(status: BotStatus): void
  onLog(line: string): void
  /** O bot falou no chat. O supervisor decide se lê em voz alta. */
  onSpeech?(text: string): void
  /** A mochila mudou. Só chega quando muda: o bot engole a repetição. */
  onInventory?(itens: ItemDaMochila[]): void
  onExit(): void
  onSpawnError(message: string): void
}

export class BotRunner {
  private child: ChildProcessWithoutNullStreams | null = null
  /** Verdadeiro entre o pedido de parada e a saída do processo. */
  private stopping = false
  private killTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly repoRoot: string,
    private readonly events: RunnerEvents,
  ) {}

  get running(): boolean {
    return this.child !== null
  }

  /**
   * Confere se a pasta do bot ainda está lá antes de tentar subir.
   *
   * O aplicativo empacotado aponta para a cópia do repositório — se ela foi
   * movida, o erro precisa ser uma frase, não um stack trace.
   */
  checkBotPath(): void {
    if (!existsSync(join(this.repoRoot, 'package.json'))) {
      throw new BotNotFoundError(`não achei o bot em ${this.repoRoot}`)
    }
  }

  start(): void {
    if (this.child) return
    this.checkBotPath()

    // `npm` no Windows é um `.cmd`, e `spawn` sem shell não o executa. Chamar o
    // `tsx` direto pelo `node` evita o shell e um processo intermediário — que
    // é justamente o que deixaria um bot órfão ao matar o pai.
    //
    // ARMADILHA: aqui `process.execPath` é o binário do ELECTRON, não o do
    // Node. Sem `ELECTRON_RUN_AS_NODE`, o filho sobe como uma segunda instância
    // do aplicativo — que o `requestSingleInstanceLock` mata no mesmo instante.
    // O sintoma é o bot "cair" menos de um segundo depois de ser chamado.
    // Com a variável, o mesmo binário roda como Node puro, e não é preciso ter
    // um `node` no PATH.
    const child = spawn(
      process.execPath,
      [join(this.repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join('src', 'app', 'main.ts')],
      {
        cwd: this.repoRoot,
        env: { ...process.env, DUDU_LAUNCHER: '1', ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    ) as ChildProcessWithoutNullStreams

    this.child = child
    this.stopping = false

    const splitOut = createLineSplitter()
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      for (const line of splitOut(chunk)) {
        const parsed = parseLine(line)
        if (parsed.kind === 'status') this.events.onStatus(parsed.status)
        else if (parsed.kind === 'speech') this.events.onSpeech?.(parsed.text)
        else if (parsed.kind === 'inventory') this.events.onInventory?.(parsed.itens)
        else this.events.onLog(parsed.text)
      }
    })

    // O `stderr` nunca carrega status: é log e só log.
    const splitErr = createLineSplitter()
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      for (const line of splitErr(chunk)) this.events.onLog(line)
    })

    child.on('error', (err) => {
      this.clear()
      this.events.onSpawnError(err.message)
    })

    child.on('exit', () => {
      this.clear()
      this.events.onExit()
    })
  }

  /**
   * Pede a parada pelo canal de `stdin`, não por sinal.
   *
   * No Windows, `SIGTERM` mandado a um processo filho não é sinal de verdade: o
   * Node o traduz para `TerminateProcess` e o handler de encerramento do bot
   * NÃO roda — ele sairia sem desconectar e ficaria de fantasma no mundo até o
   * servidor derrubá-lo por timeout. O `kill` só entra se o pedido educado não
   * for atendido.
   */
  stop(): Promise<void> {
    const child = this.child
    if (!child) return Promise.resolve()
    if (this.stopping) return this.waitForExit(child)

    this.stopping = true
    try {
      child.stdin.write('parar\n')
    } catch {
      // `stdin` já fechado: o processo está indo embora de qualquer jeito.
    }

    this.killTimer = setTimeout(() => {
      if (this.child === child) child.kill()
    }, STOP_TIMEOUT_MS)

    return this.waitForExit(child)
  }

  /** Parar e subir de novo — esperando a saída de verdade, não o timeout. */
  async restart(): Promise<void> {
    await this.stop()
    this.start()
  }

  private waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
    return new Promise((resolve) => child.once('exit', () => resolve()))
  }

  private clear(): void {
    if (this.killTimer) {
      clearTimeout(this.killTimer)
      this.killTimer = null
    }
    this.child = null
    this.stopping = false
  }
}
