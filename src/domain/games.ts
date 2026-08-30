/**
 * Tipos das brincadeiras. Sem dependência de `mineflayer`: o que está aqui é a
 * regra do jogo, não o efeito no mundo.
 * Ver: bot_games_delta.md → "Registro de jogos conhecidos".
 */

/** Catálogo FECHADO de jogos. Pedido fora da lista nunca inicia rodada. */
export const GAME_NAMES = ['esconde_esconde', 'pega_pega', 'quente_frio'] as const

export type GameName = (typeof GAME_NAMES)[number]

export const GAME_ROLES = [
  'bot_esconde',
  'bot_procura',
  'bot_pega',
  'bot_foge',
  'bot_esconde_ponto',
] as const

export type GameRole = (typeof GAME_ROLES)[number]

/** Que papéis fazem sentido em cada jogo. Papel de um jogo não vale em outro. */
export const ROLES_BY_GAME: Record<GameName, readonly GameRole[]> = {
  esconde_esconde: ['bot_esconde', 'bot_procura'],
  pega_pega: ['bot_pega', 'bot_foge'],
  // Um papel só: quem esconde o ponto é sempre o bot. Não há o que perguntar,
  // e perguntar por perguntar seria uma pergunta de uma resposta só.
  quente_frio: ['bot_esconde_ponto'],
}

/**
 * Quem vai fazer a parte que a pergunta citou: o jogador ou o bot.
 *
 * A pergunta é sempre sobre UMA ação — "quem se esconde?", "quem corre?" — e a
 * resposta diz só de quem ela é. Quem fica com a outra ponta é consequência.
 */
export type RoleChoice = 'jogador' | 'bot'

/**
 * Resposta da criança → papel DO BOT, por jogo.
 *
 * A mesma palavra vale ao contrário nos dois jogos, e é fácil inverter isso sem
 * perceber: `eu` no esconde-esconde é "eu me escondo" (o bot procura); no
 * pega-pega é "eu corro" (o bot pega). Por isso a escolha pendente guarda o
 * jogo, e nada aqui é decidido sem ele.
 * Ver: bot_games_delta.md → "Papel ausente é pergunta, não padrão".
 */
export const BOT_ROLE_BY_CHOICE: Record<GameName, Record<RoleChoice, GameRole>> = {
  esconde_esconde: { jogador: 'bot_procura', bot: 'bot_esconde' },
  pega_pega: { jogador: 'bot_pega', bot: 'bot_foge' },
  // As duas respostas dão no mesmo: no quente e frio quem esconde é o bot, e a
  // criança procura. A pergunta nem chega a ser feita.
  quente_frio: { jogador: 'bot_esconde_ponto', bot: 'bot_esconde_ponto' },
}

export function botRoleForChoice(game: GameName, choice: RoleChoice): GameRole {
  return BOT_ROLE_BY_CHOICE[game][choice]
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
  // Quente e frio.
  'escondendo_tesouro',
  'esquentando',
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
