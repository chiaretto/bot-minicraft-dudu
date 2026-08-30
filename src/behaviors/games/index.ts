import type { HideAndSeekConfig, HotColdConfig, TagConfig } from '../../config/schema.js'
import { isGameName, isRoleValidForGame, type GameName, type GameRole } from '../../domain/games.js'
import { HideAndSeekSession } from './hide-and-seek.js'
import { TagSession } from './tag.js'
import { HotColdSession } from './hot-cold.js'
import type { GameWorld } from './world.js'

export { GameAborted, type GameWorld } from './world.js'
export { HideAndSeekSession } from './hide-and-seek.js'
export type { HideAndSeekDeps } from './hide-and-seek.js'
export { TagSession } from './tag.js'
export type { TagDeps } from './tag.js'
export { HotColdSession } from './hot-cold.js'
export type { HotColdDeps } from './hot-cold.js'

/**
 * Registro dos jogos que o bot conhece.
 *
 * Pedido fora da lista nunca inicia rodada e nunca fica sem resposta — a
 * criança que pede xadrez merece ouvir "essa eu ainda não aprendi, mas eu sei
 * brincar de esconde-esconde e de pega-pega".
 * Ver: bot_games_delta.md → "Registro de jogos conhecidos".
 */

export interface GameStartRequest {
  game: string
  /** Obrigatório: pedido sem papel vira pergunta antes de chegar aqui. */
  role: GameRole
}

export interface GameSessionDeps {
  world: GameWorld
  hideAndSeek: HideAndSeekConfig
  tag: TagConfig
  hotCold: HotColdConfig
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

/**
 * Papel efetivo do pedido, ou `null` quando o papel não é daquele jogo.
 *
 * Não existe mais papel padrão: pedido sem papel é pergunta ao jogador, e quem
 * pergunta é o `app/`. Aqui todo pedido já chega decidido. Pedir `bot_esconde`
 * no pega-pega continua sendo pedido torto — virar rodada de qualquer jeito
 * daria uma brincadeira que ninguém sabe jogar.
 */
export function resolveRole(game: GameName, role: GameRole): GameRole | null {
  return isRoleValidForGame(game, role) ? role : null
}

/**
 * Cria a sessão do jogo pedido, ou `null` quando o jogo é desconhecido — ou
 * quando o papel pedido não existe naquele jogo.
 * Quem chama é responsável por falar no chat: aqui não há efeito nenhum.
 */
export function createSession(
  request: GameStartRequest,
  deps: GameSessionDeps,
): GameSession | null {
  const game = resolveGame(request.game)
  if (game === null) return null

  const role = resolveRole(game, request.role)
  if (role === null) return null

  switch (game) {
    case 'esconde_esconde':
      return new HideAndSeekSession({
        world: deps.world,
        config: deps.hideAndSeek,
        role,
        signal: deps.signal,
        ...(deps.random ? { random: deps.random } : {}),
      })

    case 'pega_pega':
      return new TagSession({
        world: deps.world,
        config: deps.tag,
        role,
        signal: deps.signal,
        ...(deps.random ? { random: deps.random } : {}),
      })

    case 'quente_frio':
      return new HotColdSession({
        world: deps.world,
        config: deps.hotCold,
        role,
        signal: deps.signal,
        ...(deps.random ? { random: deps.random } : {}),
      })
  }
}
