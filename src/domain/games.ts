/**
 * Tipos das brincadeiras. Sem dependência de `mineflayer`: o que está aqui é a
 * regra do jogo, não o efeito no mundo.
 * Ver: bot_games_delta.md → "Registro de jogos conhecidos".
 */

/** Catálogo FECHADO de jogos. Pedido fora da lista nunca inicia rodada. */
export const GAME_NAMES = ['esconde_esconde'] as const

export type GameName = (typeof GAME_NAMES)[number]

export const GAME_ROLES = ['bot_esconde', 'bot_procura'] as const

export type GameRole = (typeof GAME_ROLES)[number]

/**
 * Papel padrão quando o convite não diz quem se esconde.
 * "vamos brincar" de uma criança de 7 anos quer dizer "some daí que eu te acho".
 */
export const DEFAULT_ROLE: GameRole = 'bot_esconde'

export function isGameName(value: string): value is GameName {
  return (GAME_NAMES as readonly string[]).includes(value)
}

/**
 * Fases de uma rodada. A máquina de estados global diz que o bot está *jogando*;
 * a fase diz em que ponto da brincadeira ele está. Misturar as duas coisas
 * encheria `BotState` de estados que só um jogo entende.
 */
export const GAME_PHASES = [
  // Papel: o bot se esconde.
  'escolhendo_esconderijo',
  'indo_para_esconderijo',
  'escondido',
  // Papel: o bot procura.
  'contando',
  'busca_falsa',
  'busca_real',
  'indo_ate_jogador',
  // Comum.
  'fim',
] as const

export type GamePhase = (typeof GAME_PHASES)[number]

/**
 * Como a rodada acabou, do ponto de vista do bot.
 * `cancelado` cobre tanto a interrupção (defesa, `para`, desconexão) quanto a
 * recusa antes de começar (nenhum esconderijo válido no lugar).
 */
export type GameOutcome = 'ganhou' | 'perdeu' | 'cancelado' | 'tempo_esgotado'

export interface GameResult {
  game: GameName
  role: GameRole
  outcome: GameOutcome
  /** Fase em que a rodada parou — útil no log quando algo termina cedo. */
  phase: GamePhase
}
