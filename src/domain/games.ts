/**
 * Tipos das brincadeiras. Sem dependência de `mineflayer`: o que está aqui é a
 * regra do jogo, não o efeito no mundo.
 * Ver: bot_games_delta.md → "Registro de jogos conhecidos".
 */

/** Catálogo FECHADO de jogos. Pedido fora da lista nunca inicia rodada. */
export const GAME_NAMES = ['esconde_esconde', 'pega_pega'] as const

export type GameName = (typeof GAME_NAMES)[number]

export const GAME_ROLES = ['bot_esconde', 'bot_procura', 'bot_pega', 'bot_foge'] as const

export type GameRole = (typeof GAME_ROLES)[number]

/** Que papéis fazem sentido em cada jogo. Papel de um jogo não vale em outro. */
export const ROLES_BY_GAME: Record<GameName, readonly GameRole[]> = {
  esconde_esconde: ['bot_esconde', 'bot_procura'],
  pega_pega: ['bot_pega', 'bot_foge'],
}

/**
 * Papel padrão de cada jogo, quando o convite não diz quem faz o quê.
 *
 * No esconde-esconde, "vamos brincar" de uma criança de 7 anos quer dizer
 * "some daí que eu te acho". No pega-pega quer dizer "corre atrás de mim" — nos
 * dois casos ela quer a parte ativa para si, e o bot fica com a outra ponta.
 */
export const DEFAULT_ROLE_BY_GAME: Record<GameName, GameRole> = {
  esconde_esconde: 'bot_esconde',
  pega_pega: 'bot_pega',
}

export function isGameName(value: string): value is GameName {
  return (GAME_NAMES as readonly string[]).includes(value)
}

export function isRoleValidForGame(game: GameName, role: GameRole): boolean {
  return ROLES_BY_GAME[game].includes(role)
}

/**
 * Fases de uma rodada. A máquina de estados global diz que o bot está *jogando*;
 * a fase diz em que ponto da brincadeira ele está. Misturar as duas coisas
 * encheria `BotState` de estados que só um jogo entende.
 */
export const GAME_PHASES = [
  // Esconde-esconde, papel: o bot se esconde.
  'escolhendo_esconderijo',
  'indo_para_esconderijo',
  'escondido',
  // Esconde-esconde, papel: o bot procura.
  'busca_falsa',
  'busca_real',
  'indo_ate_jogador',
  // Pega-pega.
  'perseguindo',
  'fugindo',
  /** Cansou de fugir: parado de propósito, esperando ser pego. */
  'entregue',
  // Comum aos dois jogos.
  'contando',
  'fim',
] as const

export type GamePhase = (typeof GAME_PHASES)[number]

/**
 * Como a rodada acabou, do ponto de vista do bot.
 *
 * `cancelado` cobre tanto a interrupção (defesa, `para`, desconexão) quanto a
 * recusa antes de começar (nenhum esconderijo válido no lugar).
 *
 * `tempo_esgotado` é a REDE DE SEGURANÇA do `roundTimeoutMs`, não regra de jogo:
 * o bot cansar no pega-pega é `perdeu`, porque desistir de correr é perder.
 */
export type GameOutcome = 'ganhou' | 'perdeu' | 'cancelado' | 'tempo_esgotado'

export interface GameResult {
  game: GameName
  role: GameRole
  outcome: GameOutcome
  /** Fase em que a rodada parou — útil no log quando algo termina cedo. */
  phase: GamePhase
}
