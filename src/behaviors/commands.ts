import type { Intent } from '../domain/intent.js'
import { botRoleForChoice, type GameName, type GameRole, type RoleChoice } from '../domain/games.js'
import { mobFromSpokenName } from '../domain/mobs.js'
import { materialFromSpokenName } from '../domain/materials.js'
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
      // 2026-08-19 (log): "venha aqui" e "vem aonde estou" caíam na IA.
      /^venha$/,
      /^venha aqui$/,
      /^venha ca$/,
      /^venha comigo$/,
      /^vem aonde estou$/,
      /^vem aonde eu estou$/,
      /^vem onde estou$/,
      /^vem onde eu estou$/,
      // 2026-08-19 (log): "ande", sozinho, é chamado pra vir andando junto.
      /^ande$/,
      /^anda$/,
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
      /^nao me siga$/,
      // 2026-08-19 (log): a criança pede parando o verbo de vários jeitos
      // ("pare", "pode parar") e erra a digitação ("segir"). Uma linha por
      // variação viraria lista sem fim: aqui só o verbo varia.
      /^(pode )?par[ae]r? de me segu?ir$/,
      /^fique parado$/,
      /^fique de guarda$/,
    ],
  },
  {
    intent: { type: 'DEFENSE_OFF', params: {} },
    patterns: [/^nao briga$/, /^nao lute$/, /^nao luta$/, /^para de brigar$/, /^nao ataca$/],
  },
  {
    intent: { type: 'DEFENSE_ON', params: {} },
    patterns: [
      /^pode brigar$/,
      /^pode lutar$/,
      /^me defende$/,
      /^pode atacar$/,
      // 2026-08-19 (log): "me proteja" foi o pedido mais repetido que ninguém
      // atendia. Pergunta ("voce me protege?") é conversa e fica no repertório.
      /^me proteja$/,
      /^me protege$/,
      /^me protega$/,
      /^me defenda$/,
      /^pode me defender$/,
      /^cuida de mim$/,
    ],
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
  // 2026-08-30: pedida duas vezes no log de 29/08 ("construa uma piscina") e
  // recusada as duas. O verbo que a criança usou foi "construa" — os padrões
  // cobrem a família inteira mesmo assim, que ela troca de verbo sem avisar.
  {
    intent: { type: 'BUILD', params: { structure: 'piscina' } },
    patterns: [
      /^constroi uma piscina$/,
      /^construa uma piscina$/,
      /^faz uma piscina$/,
      /^faca uma piscina$/,
      /^me faz uma piscina$/,
      /^quero uma piscina$/,
      /^monta uma piscina$/,
      /^faz uma piscininha$/,
      /^piscininha$/,
    ],
  },
  {
    intent: { type: 'BUILD', params: { structure: 'ponte' } },
    patterns: [
      /^constroi uma ponte$/,
      /^construa uma ponte$/,
      /^faz uma ponte$/,
      /^faca uma ponte$/,
      /^me faz uma ponte$/,
      /^quero uma ponte$/,
      /^monta uma ponte$/,
      /^faz uma pontezinha$/,
      /^pontezinha$/,
    ],
  },
  // ATENÇÃO à palavra "escada": `faz uma escada` e `faz uma escadinha` já são
  // ESCAPE_HOLE desde `add-escape-hole`, e é assim que quem está preso num
  // buraco pede socorro. Estes padrões pegam só a família do VERBO DE OBRA
  // ("constroi", "construa", "monta", "quero", "me faz"), que ninguém usa
  // quando está caído numa ravina. O empate fica com quem chegou antes: perder
  // uma escadaria é chato, ficar preso num buraco é pior.
  {
    intent: { type: 'BUILD', params: { structure: 'escada' } },
    patterns: [
      /^constroi uma escada$/,
      /^construa uma escada$/,
      /^me faz uma escada$/,
      /^quero uma escada$/,
      /^monta uma escada$/,
      /^constroi uma escadinha$/,
      /^construa uma escadinha$/,
    ],
  },
  // "curral" é como a criança chama, "cerca" é o nome da planta. Os dois valem.
  {
    intent: { type: 'BUILD', params: { structure: 'cerca' } },
    patterns: [
      /^constroi uma cerca$/,
      /^construa uma cerca$/,
      /^faz uma cerca$/,
      /^faca uma cerca$/,
      /^constroi um curral$/,
      /^construa um curral$/,
      /^faz um curral$/,
      /^faca um curral$/,
      /^me faz um curral$/,
      /^quero um curral$/,
      /^monta um curral$/,
      /^faz um cercadinho$/,
      /^cercadinho$/,
    ],
  },
  // ── Onde eu morri ───────────────────────────────────────────────────────
  // 2026-08-30: o bot guarda o lugar da última morte do dono e leva ele de
  // volta. As coisas ficam caídas cinco minutos — é uma corrida contra o
  // relógio, e é justamente aí que a criança mais precisa de ajuda.
  {
    intent: { type: 'GO_TO_DEATH_SPOT', params: {} },
    patterns: [
      /^onde eu morri$/,
      /^me leva onde eu morri$/,
      /^vai onde eu morri$/,
      /^me leva ate onde eu morri$/,
      /^pega minhas coisas$/,
      /^pega as minhas coisas$/,
      /^busca minhas coisas$/,
      /^cade minhas coisas$/,
      /^me leva pras minhas coisas$/,
      /^leva eu onde eu morri$/,
      /^morri la$/,
      /^eu morri ali$/,
    ],
  },
  // ── Dormir ──────────────────────────────────────────────────────────────
  // 2026-08-30: os padrões vieram da entrada `pedido_dormir`, que existia só
  // para dizer "eu não durmo". Dormir pula a noite — a parte do jogo que mais
  // assusta criança de 7 anos.
  {
    intent: { type: 'SLEEP', params: {} },
    patterns: [
      /^vamos dormir$/,
      /^vai dormir$/,
      /^va dormir$/,
      /^dorme$/,
      /^durma$/,
      /^dorme ai$/,
      /^deita na cama$/,
      /^deite na cama$/,
      /^deita ai$/,
      /^deite ai$/,
      /^vai pra cama$/,
      /^hora de dormir$/,
      // "boa noite" fica FORA de propósito: é despedida na boca de uma criança,
      // não ordem. Mandar o bot para a cama porque ela se despediu seria
      // obedecer a coisa errada.
    ],
  },
  // ── Pôr bloco e cavar ───────────────────────────────────────────────────
  // 2026-08-30: os padrões vieram das entradas `pedido_cavar` e
  // `pedido_soltar_item`, que existiam só para dizer "não sei fazer".
  {
    intent: { type: 'PLACE_BLOCK', params: {} },
    patterns: [
      /^poe um bloco aqui$/,
      /^poe um bloco$/,
      /^poem um bloco aqui$/,
      /^coloca um bloco aqui$/,
      /^coloca um bloco$/,
      /^bota um bloco aqui$/,
      /^bota um bloco no chao$/,
      /^bote um bloco no chao$/,
      /^poe um bloco no chao$/,
      /^coloca um bloco no chao$/,
      /^larga um bloco aqui$/,
    ],
  },
  // Cavar para baixo cai no BURACO, que é um poço à frente: cavar embaixo dos
  // próprios pés derruba o bot no buraco que ele acabou de abrir, e sair de lá
  // é outro comando.
  {
    intent: { type: 'DIG', params: { shape: 'buraco' } },
    patterns: [
      /^cava um buraco$/,
      /^cave um buraco$/,
      /^cavar um buraco$/,
      /^faz um buraco$/,
      /^faca um buraco$/,
      /^cava aqui$/,
      /^cava pra baixo$/,
      /^cava$/,
      /^cave$/,
    ],
  },
  {
    intent: { type: 'DIG', params: { shape: 'tunel' } },
    patterns: [
      /^cava um tunel$/,
      /^cave um tunel$/,
      /^cavar um tunel$/,
      /^faz um tunel$/,
      /^faca um tunel$/,
    ],
  },
  // ── Graça: pular e dancinha ─────────────────────────────────────────────
  // 2026-08-30: os 18 padrões vieram inteiros das entradas `pedido_pular` e
  // `pedido_truque`, que existiam só para dizer "ainda não aprendi". As duas
  // entradas foram removidas do repertório no mesmo change: comando de ação
  // não é repertório, e a recusa ganharia do comando na frase que o parser não
  // pegasse — o bot diria que não sabe pular logo depois de pular.
  {
    intent: { type: 'JUMP', params: {} },
    patterns: [
      /^pula$/,
      /^pule$/,
      /^pula ai$/,
      /^pule ai$/,
      /^pula pra mim$/,
      /^pule pra mim$/,
      /^pula agora$/,
      /^pule agora$/,
      /^da uns pulos$/,
      /^da um pulo$/,
      /^da uns pulinhos$/,
      /^pula pula$/,
    ],
  },
  {
    intent: { type: 'TRICK', params: {} },
    patterns: [
      /^faz uma dancinha$/,
      /^faca uma dancinha$/,
      /^dança$/,
      /^danca$/,
      /^dance$/,
      /^faz um truque$/,
      /^faca um truque$/,
      /^gira no lugar$/,
      /^gira$/,
      /^roda no lugar$/,
      /^roda$/,
      /^da uma volta$/,
      /^ande em circulos$/,
      /^anda em circulos$/,
      /^ande em circulo$/,
      /^anda em circulo$/,
    ],
  },
  // ── Brincadeiras ────────────────────────────────────────────────────────
  // 2026-08-30: quente e frio, o terceiro jogo. Vem antes dos outros convites
  // porque "quente e frio" não colide com nada, e sem papel de propósito: o
  // jogo tem um papel só e a pergunta nunca é feita.
  {
    intent: { type: 'PLAY_GAME', params: { game: 'quente_frio' } },
    patterns: [
      /^quente e frio$/,
      /^quente ou frio$/,
      /^quente frio$/,
      /^vamos brincar de quente e frio$/,
      /^brincar de quente e frio$/,
      /^vamos de quente e frio$/,
      /^bora quente e frio$/,
      /^esconde alguma coisa$/,
      /^esconde um tesouro$/,
    ],
  },
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
      // 2026-08-19 (log): "me procure" apareceu 3x num dia só.
      /^me procure$/,
      /^me ache$/,
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
      // 2026-08-19 (log): a criança manda esconder E avisa que vai achar, na
      // mesma frase.
      /^se esconda e vou te achar$/,
      /^se esconda que eu vou te achar$/,
      /^se esconde que eu vou te achar$/,
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
      // 2026-08-19 (log): ela chama a brincadeira de "esconder", não de
      // "esconde esconde".
      // 2026-08-19 (log): trocar de brincadeira no meio ("agora de ...").
      /^agora de esconde esconde$/,
      /^agora esconde esconde$/,
      /^agora de esconder$/,
      /^vamos brincar de esconder$/,
      /^vamos jogar de esconder$/,
      /^bora brincar de esconder$/,
      /^brincar de esconder$/,
      /^vamos de esconder$/,
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
      // 2026-08-19 (log): sem o "eu" na frente, e o revezamento de papel no
      // meio da brincadeira ("agora eu pego").
      /^vou te pegar$/,
      /^corre que vou te pegar$/,
      /^agora eu pego$/,
      /^agora eu te pego$/,
      /^minha vez de pegar$/,
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
      // 2026-08-19 (log): "vamos brincade de pega-pega" — erro de digitação é
      // o caso normal, não a exceção.
      /^agora de pega pega$/,
      /^agora pega pega$/,
      /^vamos brinca(r|de) de pega pega$/,
      /^vamos jogar de pega pega$/,
      /^vamos brincar de pega$/,
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
  // Quente e frio tem um papel só e nunca faz a pergunta — as listas ficam
  // vazias porque o tipo cobra a chave, não porque exista resposta a dar.
  quente_frio: { jogador: [], bot: [] },
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

/**
 * Ataque sem alvo nomeado: o bot mira a ameaça mais perto do dono.
 *
 * Frases EXATAS de propósito. Um padrão aberto como `^mata (.*)$` transformaria
 * "mata a saudade" num ataque de verdade.
 */
const ATTACK_ANY = [
  /^ataca$/,
  /^ataque$/,
  /^atacar$/,
  /^ataca ele$/,
  /^ataca ela$/,
  /^ataca esse$/,
  /^ataca essa$/,
  /^ataca isso$/,
  /^mata ele$/,
  /^mata ela$/,
  /^mata esse$/,
  /^mata essa$/,
  /^bate nele$/,
  /^bate nela$/,
  /^bate nesse$/,
  /^pega ele$/,
  /^briga com ele$/,
  /^luta com ele$/,
]

/**
 * Ataque com alvo nomeado. O que vem depois do artigo é capturado e precisa
 * estar no catálogo fechado — senão NÃO vira comando e a frase desce na cascata.
 *
 * Recusar o desconhecido é de propósito: atacar o bicho errado é pior que não
 * atacar, e uma frase que não é pedido de ataque ("mata a saudade") tem que
 * continuar sendo conversa.
 */
const ATTACK_NAMED = [
  /^ataca (?:o |a |os |as |aquele |aquela |esse |essa |um |uma )?(.+)$/,
  /^ataque (?:o |a |os |as |aquele |aquela |esse |essa |um |uma )?(.+)$/,
  /^mata (?:o |a |os |as |aquele |aquela |esse |essa |um |uma )?(.+)$/,
  /^bate n(?:o |a )(.+)$/,
  /^briga com (?:o |a )?(.+)$/,
]

function parseAttack(normalized: string): ParsedCommand | null {
  for (const pattern of ATTACK_ANY) {
    if (pattern.test(normalized)) {
      return { intent: { type: 'ATTACK', params: {} }, matched: normalized }
    }
  }

  for (const pattern of ATTACK_NAMED) {
    const found = pattern.exec(normalized)
    if (!found?.[1]) continue
    const target = mobFromSpokenName(found[1])
    if (!target) continue // nome fora do catálogo: não é comando
    return { intent: { type: 'ATTACK', params: { target } }, matched: normalized }
  }

  return null
}

/**
 * Contar item da mochila. O que vem depois do "quanto" é capturado e precisa
 * estar no catálogo de materiais — senão NÃO vira comando.
 *
 * A regra é a mesma do ataque nomeado, e pelo mesmo motivo: um padrão aberto
 * transformaria "quantos amigos você tem?" numa contagem de um bloco que não
 * existe. Nome desconhecido desce na cascata e vira conversa.
 */
const COUNT_PATTERNS = [
  /^quantos? (.+) voce tem$/,
  /^quantas? (.+) voce tem$/,
  /^quanto de (.+) voce tem$/,
  /^quanta (.+) voce tem$/,
  /^voce tem quantos? (.+)$/,
  /^voce tem quantas? (.+)$/,
  /^quantos? (.+) tem na mochila$/,
  /^quanto (.+) voce tem ai$/,
]

function parseCount(normalized: string): ParsedCommand | null {
  for (const pattern of COUNT_PATTERNS) {
    const found = pattern.exec(normalized)
    if (!found?.[1]) continue
    const item = materialFromSpokenName(found[1])
    if (!item) continue // nome fora do catálogo: não é comando
    return { intent: { type: 'COUNT_ITEM', params: { item } }, matched: normalized }
  }
  return null
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

  // A tabela fixa vem primeiro para `pode atacar` e `nao ataca` continuarem
  // sendo controle da defesa, e não pedido de ataque.
  const direct = match(normalized)
  if (direct) return direct

  const attack = parseAttack(normalized)
  if (attack) return attack

  const count = parseCount(normalized)
  if (count) return count

  const stripped = stripFillers(normalized)
  if (stripped === normalized || !stripped) return null
  return match(stripped) ?? parseAttack(stripped) ?? parseCount(stripped)
}

/** Exposto para teste: quantos padrões o parser cobre. */
export function commandPatternCount(): number {
  return COMMANDS.reduce((sum, c) => sum + c.patterns.length, 0)
}
