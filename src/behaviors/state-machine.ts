import {
  NON_RESUMABLE_STATES,
  STATE_PRIORITY,
  type BotState,
  type Vec3Like,
} from '../domain/types.js'

export interface StateContext {
  /** Coordenada memorizada do STAY. */
  stayPoint?: Vec3Like
  /** Descrição da ação em curso, para retomada. */
  actionLabel?: string
  /** Progresso já feito, para a ação retomar de onde parou. */
  actionProgress?: number
  /** Ids das entidades sendo combatidas. */
  targets?: number[]
}

export interface StackedState {
  state: BotState
  context: StateContext
}

export interface TransitionResult {
  from: BotState
  to: BotState
  /** `true` quando o estado anterior foi empilhado para retomada. */
  stacked: boolean
}

/**
 * Máquina de estados com prioridade declarada e pilha de retomada.
 *
 * Um estado só é interrompido por outro de prioridade MAIOR, e nesse caso o
 * interrompido é empilhado com seu contexto. Sem essa disciplina, defesa e
 * comando do jogador brigam pelo controle do pathfinder — o bug clássico de
 * bot com dois loops de movimento.
 * Ver: player_defense_delta.md → "Prioridade entre estados".
 */
export class StateMachine {
  private current: BotState = 'IDLE'
  private context: StateContext = {}
  private stack: StackedState[] = []
  private abortController: AbortController | null = null

  get state(): BotState {
    return this.current
  }

  get ctx(): Readonly<StateContext> {
    return this.context
  }

  get stackDepth(): number {
    return this.stack.length
  }

  /** Sinal que a ação em curso deve observar para cancelar de verdade. */
  get signal(): AbortSignal | null {
    return this.abortController?.signal ?? null
  }

  private cancelCurrent(): void {
    this.abortController?.abort()
    this.abortController = null
  }

  /**
   * Transição por prioridade: interrompe e empilha o estado atual.
   * Devolve `null` quando a prioridade do novo estado não é suficiente.
   */
  interrupt(to: BotState, context: StateContext = {}): TransitionResult | null {
    if (STATE_PRIORITY[to] <= STATE_PRIORITY[this.current]) return null

    const from = this.current
    // IDLE não vale a pena empilhar: retomar "não fazer nada" é o mesmo que
    // simplesmente voltar ao IDLE.
    // Jogo não é retomável: o esconderijo já foi queimado e a criança já saiu
    // do lugar. Ver: bot_games_delta.md → "Fim do combate não retoma o jogo".
    const shouldStack = from !== 'IDLE' && !NON_RESUMABLE_STATES.has(from)
    if (shouldStack) this.stack.push({ state: from, context: this.context })

    this.cancelCurrent()
    this.current = to
    this.context = context
    this.abortController = new AbortController()

    return { from, to, stacked: shouldStack }
  }

  /**
   * Transição por ordem do jogador: sempre vale, e limpa a pilha.
   * `dudu, para` não deve deixar nada pendente para retomar depois.
   */
  command(to: BotState, context: StateContext = {}): TransitionResult {
    const from = this.current
    this.cancelCurrent()
    this.stack = []
    this.current = to
    this.context = context
    this.abortController = to === 'IDLE' ? null : new AbortController()
    return { from, to, stacked: false }
  }

  /**
   * Termina o estado atual e volta ao empilhado, se houver.
   * É o que faz o bot voltar a seguir — ou voltar à coordenada do STAY —
   * depois que o combate acaba.
   */
  resume(): TransitionResult {
    const from = this.current
    this.cancelCurrent()

    const previous = this.stack.pop()
    if (previous) {
      this.current = previous.state
      this.context = previous.context
      this.abortController = new AbortController()
    } else {
      this.current = 'IDLE'
      this.context = {}
      this.abortController = null
    }

    return { from, to: this.current, stacked: false }
  }

  /** Atualiza o contexto sem trocar de estado (ex.: progresso de uma ação). */
  patchContext(patch: Partial<StateContext>): void {
    this.context = { ...this.context, ...patch }
  }

  /** `true` se o estado atual pode ser interrompido pelo estado dado. */
  canInterrupt(to: BotState): boolean {
    return STATE_PRIORITY[to] > STATE_PRIORITY[this.current]
  }

  reset(): void {
    this.cancelCurrent()
    this.current = 'IDLE'
    this.context = {}
    this.stack = []
  }
}
