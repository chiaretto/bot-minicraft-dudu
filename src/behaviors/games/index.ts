import type { HideAndSeekConfig } from '../../config/schema.js'
import { DEFAULT_ROLE, isGameName, type GameName, type GameRole } from '../../domain/games.js'
import { HideAndSeekSession, type GameWorld } from './hide-and-seek.js'

export { GameAborted, HideAndSeekSession } from './hide-and-seek.js'
export type { GameWorld, HideAndSeekDeps } from './hide-and-seek.js'

/**
 * Registro dos jogos que o bot conhece.
 *
 * Pedido fora da lista nunca inicia rodada e nunca fica sem resposta — a
 * criança que pede xadrez merece ouvir "essa eu ainda não aprendi, mas eu sei
 * brincar de esconde-esconde".
 * Ver: bot_games_delta.md → "Registro de jogos conhecidos".
 */

export interface GameStartRequest {
  game: string
  role?: GameRole
}

export interface GameSessionDeps {
  world: GameWorld
  hideAndSeek: HideAndSeekConfig
  signal: AbortSignal | null
  random?: () => number
}

export interface GameSession {
  run(): Promise<import('../../domain/games.js').GameResult>
  requestReveal(): void
  readonly currentPhase: import('../../domain/games.js').GamePhase
}

/** Nome canônico do jogo, ou `null` quando o bot não conhece o pedido. */
export function resolveGame(name: string): GameName | null {
  return isGameName(name) ? name : null
}

export function resolveRole(role?: GameRole): GameRole {
  return role ?? DEFAULT_ROLE
}

/**
 * Cria a sessão do jogo pedido, ou `null` quando o jogo é desconhecido.
 * Quem chama é responsável por falar no chat — aqui não há efeito nenhum.
 */
export function createSession(
  request: GameStartRequest,
  deps: GameSessionDeps,
): GameSession | null {
  const game = resolveGame(request.game)
  if (game === null) return null

  switch (game) {
    case 'esconde_esconde':
      return new HideAndSeekSession({
        world: deps.world,
        config: deps.hideAndSeek,
        role: resolveRole(request.role),
        signal: deps.signal,
        ...(deps.random ? { random: deps.random } : {}),
      })
  }
}
