import type { Intent } from '../domain/intent.js'
import { botRoleForChoice, type GameName, type GameRole, type RoleChoice } from '../domain/games.js'
import { prepare } from '../dialogue/normalize.js'

interface CommandPattern {
  intent: Intent
  patterns: RegExp[]
}

/**
 * Nível 1 da cascata: comandos frequentes reconhecidos por regex, antes de
 * qualquer chamada de rede.
 *
 * É o que faz `vem`, `fica aqui` e `para` continuarem funcionando com a IA
 * fora do ar. Os padrões rodam sobre texto já normalizado (sem acento, sem
 * pontuação, sem vocativo).
 */
const COMMANDS: CommandPattern[] = [
  {
    intent: { type: 'STOP', params: {} },
    patterns: [
      /^para$/,
      /^pare$/,
      /^parar$/,
      /^para tudo$/,
      /^cancela$/,
      /^cancelar$/,
      /^chega$/,
      /^para com isso$/,
      /^pode parar$/,
      /^esquece$/,
      /^deixa pra la$/,
    ],
  },
  {
    intent: { type: 'FOLLOW', params: {} },
    patterns: [
      /^vem$/,
      /^vem ca$/,
      /^vem aqui$/,
      /^vem comigo$/,
      /^vem junto$/,
      /^vem pra ca$/,
      /^vem pra perto$/,
      /^vem atras de mim$/,
      /^me segue$/,
      /^me segui$/,
      // Imperativo "correto": é como a maioria das pessoas escreve de primeira.
      /^me siga$/,
      /^siga me$/,
      /^siga$/,
      /^segue$/,
      /^segue me$/,
      /^me sigue$/,
      /^me acompanha$/,
      /^me acompanhe$/,
      /^anda comigo$/,
      /^vamos$/,
      /^vamos embora$/,
      /^bora$/,
      /^bora la$/,
    ],
  },
  {
    intent: { type: 'STAY', params: {} },
    patterns: [
      /^fica aqui$/,
      /^fique aqui$/,
      /^fica ai$/,
      /^fique ai$/,
      /^espera aqui$/,
      /^espera ai$/,
      /^aguarda aqui$/,
      /^nao sai daqui$/,
      /^fica parado$/,
      /^fica de guarda$/,
      /^me espera$/,
      /^me espere$/,
      /^nao me segue$/,
      /^para de me seguir$/,
    ],
  },
  {
    intent: { type: 'DEFENSE_OFF', params: {} },
    patterns: [/^nao briga$/, /^nao lute$/, /^nao luta$/, /^para de brigar$/, /^nao ataca$/],
  },
  {
    intent: { type: 'DEFENSE_ON', params: {} },
    patterns: [/^pode brigar$/, /^pode lutar$/, /^me defende$/, /^pode atacar$/],
  },
  {
    intent: { type: 'LOOK_AT_OWNER', params: {} },
    patterns: [/^olha pra mim$/, /^olha aqui$/, /^me olha$/],
  },
  // ── Abrir porta ─────────────────────────────────────────────────────────
  // Ver: player_commands_delta.md → "Abrir porta".
  {
    intent: { type: 'OPEN_DOOR', params: {} },
    patterns: [
      /^abre a porta$/,
      /^abra a porta$/,
      /^abre porta$/,
      /^abre o portao$/,
      /^abra o portao$/,
      /^abre o alcapao$/,
      /^pode abrir a porta$/,
      /^abre ai$/,
      /^abre pra mim$/,
      /^abre essa porta$/,
      /^destranca a porta$/,
    ],
  },
  // ── Sair de buraco ──────────────────────────────────────────────────────
  // Vem ANTES de FOLLOW: "sobe aqui" tem cara de chamado, mas quem está no
  // fundo de uma ravina precisa subir antes de conseguir vir.
  // Ver: player_commands_delta.md → "Sair de buraco".
  {
    intent: { type: 'ESCAPE_HOLE', params: {} },
    patterns: [
      /^sai do buraco$/,
      /^sai dai do buraco$/,
      /^sobe$/,
      /^sobe aqui$/,
      /^sobe pra ca$/,
      /^faz uma escada$/,
      /^faz uma escadinha$/,
      /^faz escada pra subir$/,
      /^voce ta preso$/,
      /^ta preso ai$/,
      /^sai desse buraco$/,
    ],
  },
  // ── Pegar bloco e construir ─────────────────────────────────────────────
  // Nível 1 de propósito: pedir madeira é tão comum quanto pedir para seguir,
  // e assim funciona com `llm.provider: 'none'` e sem esperar o modelo.
  // O bloco vai pelo NOME DO GRUPO — a busca cobre o grupo inteiro, senão numa
  // floresta de bétula "pega madeira" devolveria "não achei".
  // Ver: player_commands_delta.md → "Pegar bloco de verdade".
  {
    intent: { type: 'COLLECT_BLOCK', params: { block: 'madeira', count: 8 } },
    patterns: [
      /^pega madeira$/,
      /^pegue madeira$/,
      /^pega umas madeiras?$/,
      /^pega um pouco de madeira$/,
      /^me da madeira$/,
      /^preciso de madeira$/,
      /^pega tronco$/,
      /^pega pau$/,
    ],
  },
  {
    intent: { type: 'COLLECT_BLOCK', params: { block: 'pedra', count: 8 } },
    patterns: [
      /^pega pedra$/,
      /^pegue pedra$/,
      /^pega umas pedras$/,
      /^pega um pouco de pedra$/,
      /^me da pedra$/,
      /^preciso de pedra$/,
    ],
  },
  {
    intent: { type: 'COLLECT_BLOCK', params: { block: 'terra', count: 8 } },
    patterns: [/^pega terra$/, /^pegue terra$/, /^me da terra$/, /^pega umas terras$/],
  },
  {
    intent: { type: 'COLLECT_BLOCK', params: { block: 'areia', count: 8 } },
    patterns: [/^pega areia$/, /^pegue areia$/, /^me da areia$/],
  },
  {
    intent: { type: 'BUILD', params: { structure: 'casa' } },
    patterns: [
      /^constroi uma casa$/,
      /^constroi uma casinha$/,
      /^constroi uma casa pra mim$/,
      /^construa uma casa$/,
      /^faz uma casa$/,
      /^faz uma casinha$/,
      /^faca uma casa$/,
      /^me faz uma casa$/,
      /^quero uma casa$/,
      /^monta uma casa$/,
      /^casinha$/,
    ],
  },
  {
    intent: { type: 'BUILD', params: { structure: 'torre' } },
    patterns: [
      /^constroi uma torre$/,
      /^construa uma torre$/,
      /^faz uma torre$/,
      /^faca uma torre$/,
      /^me faz uma torre$/,
      /^quero uma torre$/,
      /^monta uma torre$/,
    ],
  },
  // ── Brincadeiras ────────────────────────────────────────────────────────
  // Vêm antes do convite genérico: "eu vou me esconder" também casaria com
  // "vou me esconder" de um convite qualquer, e o papel ficaria trocado.
  {
    intent: { type: 'PLAY_GAME', params: { game: 'esconde_esconde', role: 'bot_procura' } },
    patterns: [
      /^eu vou me esconder$/,
      /^vou me esconder$/,
      /^eu me escondo$/,
      /^me procura$/,
      /^vem me procurar$/,
      /^vem me achar$/,
      /^me acha$/,
      /^conta ate 10$/,
      /^conta ate dez$/,
      /^fecha o olho e conta$/,
      /^conta ai$/,
      /^voce procura$/,
      /^voce conta$/,
    ],
  },
  {
    intent: { type: 'PLAY_GAME', params: { game: 'esconde_esconde', role: 'bot_esconde' } },
    patterns: [
      /^se esconde$/,
      /^se esconda$/,
      /^vai se esconder$/,
      /^voce se esconde$/,
      /^voce se esconda$/,
      /^some daqui que eu te acho$/,
      /^eu vou te achar$/,
      /^eu vou te procurar$/,
    ],
  },
  // Convite pelo NOME do jogo: não diz quem faz o quê, então não escolhe papel.
  // Quem digita "esconde esconde" quer brincar, não quer necessariamente ser o
  // que procura — antes, o padrão do código decidia por ela.
  // Ver: bot_games_delta.md → "Papel ausente é pergunta, não padrão".
  {
    intent: { type: 'PLAY_GAME', params: { game: 'esconde_esconde' } },
    patterns: [
      /^vamos brincar de esconde esconde$/,
      /^vamos brincar de esconde$/,
      /^vamos jogar esconde esconde$/,
      /^bora brincar de esconde esconde$/,
      /^bora jogar esconde esconde$/,
      /^bora de esconde esconde$/,
      /^quer brincar de esconde esconde$/,
      /^quer jogar esconde esconde$/,
      /^brincar de esconde esconde$/,
      /^esconde esconde$/,
      /^vamos de esconde esconde$/,
    ],
  },
  // ── Pega-pega ──────────────────────────────────────────────────────────
  // Como no esconde-esconde, o papel explícito vem ANTES do convite pelo nome
  // do jogo: "eu vou te pegar" também casaria com um convite qualquer, e o
  // papel sairia trocado — quem corre atrás seria o bot, não a criança.
  {
    intent: { type: 'PLAY_GAME', params: { game: 'pega_pega', role: 'bot_foge' } },
    patterns: [
      /^eu vou te pegar$/,
      /^eu te pego$/,
      /^eu pego voce$/,
      /^eu vou correr atras de voce$/,
      /^voce corre$/,
      /^voce foge$/,
      /^corre que eu vou te pegar$/,
      /^corre que eu to indo$/,
      /^sai correndo$/,
      /^foge de mim$/,
      /^foge que eu te pego$/,
    ],
  },
  {
    intent: { type: 'PLAY_GAME', params: { game: 'pega_pega', role: 'bot_pega' } },
    patterns: [
      /^me pega$/,
      /^vem me pegar$/,
      /^tenta me pegar$/,
      /^corre atras de mim$/,
      /^vem correndo atras de mim$/,
      /^voce pega$/,
      /^voce me pega$/,
    ],
  },
  // Nome do jogo, com as variantes regionais que a criança pode usar. Todas são
  // o MESMO jogo: pique-pega não é outra brincadeira. Nenhuma delas diz quem
  // corre, então nenhuma escolhe papel.
  {
    intent: { type: 'PLAY_GAME', params: { game: 'pega_pega' } },
    patterns: [
      /^pega pega$/,
      /^pique pega$/,
      /^pira pega$/,
      /^vamos brincar de pega pega$/,
      /^vamos brincar de pique pega$/,
      /^vamos jogar pega pega$/,
      /^bora brincar de pega pega$/,
      /^bora jogar pega pega$/,
      /^bora de pega pega$/,
      /^quer brincar de pega pega$/,
      /^quer jogar pega pega$/,
      /^brincar de pega pega$/,
      /^vamos de pega pega$/,
    ],
  },
  // Convite genérico, sem nome de jogo. Com duas brincadeiras no registro,
  // começar uma delas seria escolher pela criança — ele pergunta.
  // A pergunta não precisa de estado pendente: o nome de cada jogo já é, aqui
  // em cima, um convite válido sozinho.
  {
    intent: { type: 'ASK_WHICH_GAME', params: {} },
    patterns: [
      /^vamos brincar$/,
      /^vamos jogar$/,
      /^bora brincar$/,
      /^bora jogar$/,
      /^quer brincar$/,
      /^quer jogar$/,
      /^brincar$/,
      /^vamos brincar de alguma coisa$/,
    ],
  },
]

/**
 * O jogador desistiu da rodada.
 *
 * O que isso significa depende do jogo: no esconde-esconde o bot aparece; no
 * pega-pega ele para de fugir e se entrega, ou entende que a criança parou de
 * correr e vai pegá-la. Quem interpreta é a sessão.
 *
 * Não é intenção do catálogo: só faz sentido com uma rodada em andamento, e
 * fora dela `cade voce` é conversa que o repertório responde. Quem chama
 * verifica o estado antes.
 * Ver: bot_games_delta.md → "Jogador desiste".
 */
const GIVE_UP_PATTERNS: RegExp[] = [
  /^desisto$/,
  /^eu desisto$/,
  /^me entrego$/,
  /^cade voce$/,
  /^onde voce ta$/,
  /^onde voce esta$/,
  /^nao acho voce$/,
  /^nao te achei$/,
  /^nao to achando voce$/,
  /^aparece$/,
  /^sai dai$/,
  // Pega-pega: desistir é parar de correr, dos dois lados.
  /^nao te pego$/,
  /^nao consigo te pegar$/,
  /^cansei$/,
  /^cansei de correr$/,
  /^para de correr$/,
  /^para de fugir$/,
]

export function isGiveUp(text: string, botName: string): boolean {
  const normalized = prepare(text, botName)
  if (!normalized) return false
  if (GIVE_UP_PATTERNS.some((p) => p.test(normalized))) return true

  const stripped = stripFillers(normalized)
  return stripped !== normalized && stripped.length > 0
    ? GIVE_UP_PATTERNS.some((p) => p.test(stripped))
    : false
}

/**
 * Respostas à pergunta de papel, por jogo.
 *
 * **Regra que segura tudo isto de pé:** cada lista só usa o verbo que a
 * pergunta citou — `esconder` no esconde-esconde, `correr`/`fugir` no
 * pega-pega — mais os pronomes soltos. Aceitar o outro verbo inverteria o
 * sentido: `voce pega` respondendo "quem corre?" pareceria dizer "o bot corre",
 * quando na verdade quer dizer o contrário. Essas frases já são comando com
 * papel explícito e são resolvidas pelo parser normal, com o papel certo.
 * Ver: bot_games_delta.md → "Papel ausente é pergunta, não padrão".
 */
const ROLE_ANSWERS: Record<GameName, Record<RoleChoice, RegExp[]>> = {
  esconde_esconde: {
    jogador: [
      /^eu$/,
      /^sou eu$/,
      /^eu quero$/,
      /^eu me escondo$/,
      /^eu escondo$/,
      /^eu que me escondo$/,
      /^eu vou me esconder$/,
    ],
    bot: [
      /^voce$/,
      /^tu$/,
      /^e voce$/,
      /^voce se esconde$/,
      /^voce esconde$/,
      /^voce que se esconde$/,
      /^voce vai se esconder$/,
    ],
  },
  pega_pega: {
    jogador: [
      /^eu$/,
      /^sou eu$/,
      /^eu quero$/,
      /^eu corro$/,
      /^eu fujo$/,
      /^eu que corro$/,
      /^eu vou correr$/,
    ],
    bot: [
      /^voce$/,
      /^tu$/,
      /^e voce$/,
      /^voce corre$/,
      /^voce foge$/,
      /^voce que corre$/,
      /^voce vai correr$/,
    ],
  },
}

/**
 * Lê a resposta da pergunta de papel e devolve o papel DO BOT, ou `null` quando
 * a mensagem não responde nada.
 *
 * Recebe o jogo porque a mesma palavra vale ao contrário nos dois: `eu` no
 * esconde-esconde é `bot_procura`, e no pega-pega é `bot_pega`.
 *
 * Só faz sentido com uma pergunta pendente — fora dela, `eu` é conversa. Quem
 * chama verifica isso antes, igual ao `isGiveUp`.
 */
export function parseRoleAnswer(text: string, botName: string, game: GameName): GameRole | null {
  const normalized = prepare(text, botName)
  if (!normalized) return null

  const stripped = stripFillers(normalized)
  const candidates = stripped && stripped !== normalized ? [normalized, stripped] : [normalized]

  for (const choice of ['jogador', 'bot'] as const) {
    const patterns = ROLE_ANSWERS[game][choice]
    if (candidates.some((c) => patterns.some((p) => p.test(c)))) {
      return botRoleForChoice(game, choice)
    }
  }
  return null
}

export interface ParsedCommand {
  intent: Intent
  matched: string
}

/**
 * Enfeite no fim da frase: "me segue ai", "vem por favor", "para agora".
 * Só é removido depois que o texto cru falhou, senão "fica ai" — que é comando
 * de verdade — viraria "fica" e deixaria de casar.
 */
const TRAILING_FILLER = /\s+(por favor|pfvr|pfv|agora|ja|ai|vai|pra mim|ta bom)$/u

function stripFillers(text: string): string {
  let out = text
  let previous = ''
  while (out !== previous && out) {
    previous = out
    out = out.replace(TRAILING_FILLER, '').trim()
  }
  return out
}

function match(normalized: string): ParsedCommand | null {
  for (const command of COMMANDS) {
    for (const pattern of command.patterns) {
      if (pattern.test(normalized)) {
        return { intent: command.intent, matched: normalized }
      }
    }
  }
  return null
}

/**
 * Reconhece um comando, ou `null` para a mensagem descer na cascata.
 * Nunca faz I/O e nunca chama a IA.
 */
export function parseCommand(text: string, botName: string): ParsedCommand | null {
  const normalized = prepare(text, botName)
  if (!normalized) return null

  const direct = match(normalized)
  if (direct) return direct

  const stripped = stripFillers(normalized)
  if (stripped === normalized || !stripped) return null
  return match(stripped)
}

/** Exposto para teste: quantos padrões o parser cobre. */
export function commandPatternCount(): number {
  return COMMANDS.reduce((sum, c) => sum + c.patterns.length, 0)
}
