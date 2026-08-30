import type { ConversationContext } from './provider.js'
import { INTENT_TYPES, type IntentType } from '../domain/intent.js'
import { STRUCTURE_NAMES } from '../domain/blueprints.js'

/**
 * As plantas que o bot sabe levantar, escritas para o prompt.
 *
 * Sai de `STRUCTURE_NAMES` e não da mão de ninguém: prompt desatualizado é a IA
 * recusando o que o bot sabe fazer — foi o que aconteceu com a piscina, pedida
 * duas vezes e recusada as duas enquanto o catálogo dizia "casa ou torre".
 * Ver: local_dialogue_delta.md → "O prompt da IA acompanha a capacidade".
 */
function structureList(): string {
  const nomes = STRUCTURE_NAMES.map((n) => `"${n}"`)
  return `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`
}

/**
 * Fatos de identidade injetados como verdade fixa.
 *
 * Sem isso a IA inventa outra história de origem quando a pergunta chega
 * reformulada ("me conta como você surgiu"), contradizendo o repertório.
 * Ver: local_dialogue_delta.md → "Coerência entre repertório e IA".
 */
export function identityFacts(ctx: ConversationContext): string {
  return [
    `Seu nome é ${ctx.botName}.`,
    `Seu melhor amigo e dono é ${ctx.owner}.`,
    `Sua origem, que você NUNCA contradiz nem reinventa: "${ctx.originStory}"`,
    'Você sabe: seguir o jogador, ficar de guarda num lugar, parar, pegar blocos,',
    'entregar item, defender o jogador de monstros e construir estas coisas:',
    `${STRUCTURE_NAMES.join(', ')}.`,
    'Você NÃO sabe: craftar, fazer poções, nem construir o que não está na sua lista.',
    'Você NUNCA ataca outro jogador, em nenhuma circunstância.',
  ].join('\n')
}

/**
 * O que cada ação do catálogo faz, em uma linha.
 *
 * Uma entrada por tipo executável de `INTENT_TYPES` — `CHAT` e `UNKNOWN` ficam
 * de fora porque não são ação. O teste trava a cobertura: acrescentar intenção
 * nova sem descrevê-la aqui quebra a suíte, em vez de virar uma capacidade que
 * a IA nunca vai propor.
 * Ver: ai_companion_delta.md → "A IA sabe o que o bot sabe fazer".
 */
export const ACTION_DESCRIPTIONS: Record<Exclude<IntentType, 'CHAT' | 'UNKNOWN'>, string> = {
  FOLLOW: 'ir atrás do jogador e acompanhar ele',
  STAY: 'ficar parado onde está, de guarda',
  STOP: 'parar tudo o que está fazendo',
  COLLECT_BLOCK:
    'ir pegar blocos — precisa de "block" e "count". ' +
    '"block" pode ser um grupo: madeira, pedra, terra, areia',
  BUILD:
    `construir — "structure" é ${structureList()}. ` +
    '"material" é opcional (madeira, pedra…): sem ele o bot usa o que tiver. ' +
    'A piscina sai vazia: ele não tem balde, quem põe a água é o jogador',
  ESCAPE_HOLE:
    'sair de um buraco fazendo escadinha de blocos. ' +
    'Use quando ele estiver preso lá embaixo e não conseguir chegar no jogador',
  OPEN_DOOR:
    'abrir a porta, o portão ou o alçapão mais perto. ' +
    'Porta de ferro ele não abre: essa só abre com botão ou alavanca',
  GOTO_COORDS: 'ir até um lugar — precisa de "x", "y" e "z"',
  DROP_ITEM_TO_OWNER: 'entregar um item para o jogador — precisa de "item"',
  LOOK_AT_OWNER: 'virar e olhar para o jogador',
  COUNT_ITEM: 'dizer quanto ele tem de um material — "item" é madeira, pedra, terra, areia ou cascalho',
  PLACE_BLOCK:
    'pôr UM bloco no chão à frente dele — "material" é opcional (madeira, pedra…)',
  DIG: 'cavar à frente dele — "shape" é "buraco" (poço 2x2) ou "tunel" (4 de comprimento)',
  JUMP: 'dar uns pulinhos no lugar, de brincadeira',
  TRICK: 'fazer graça: girar no lugar e terminar com um pulo',
  EQUIP_ITEM: 'pegar um item na mão — precisa de "item"',
  DEFENSE_ON: 'voltar a brigar com monstro para proteger o jogador',
  DEFENSE_OFF: 'parar de brigar com monstro',
  PLAY_GAME:
    'começar uma brincadeira — "game" é "esconde_esconde" ou "pega_pega". ' +
    'NÃO mande "role": quem escolhe o papel é o jogador, e o bot pergunta',
  ASK_WHICH_GAME: 'perguntar qual brincadeira, quando o convite não disser qual',
  ATTACK:
    'atacar um monstro — **você NÃO propõe esta ação**. ' +
    'Atacar é comando direto: quem resolve é o parser, não você',
}

/** Tipos que podem virar ação. `CHAT` e `UNKNOWN` nunca viram efeito no mundo. */
export const ACTIONABLE_INTENTS = INTENT_TYPES.filter(
  (t): t is Exclude<IntentType, 'CHAT' | 'UNKNOWN'> => t !== 'CHAT' && t !== 'UNKNOWN',
)

/**
 * O que a IA vê como ação disponível — `ATTACK` fica de fora.
 *
 * Combate é determinístico e não passa por IA (`project.md`). Mas ela precisa
 * saber que o comando EXISTE: sem isso ela improvisa promessa ("já tô indo te
 * ajudar!") quando a criança pede para atacar, e nada acontece. Saber vem da
 * instrução de "Quando mandar ação"; poder propor, não vem.
 */
const AI_ACTION_CATALOG = ACTIONABLE_INTENTS.filter((t) => t !== 'ATTACK')

function actionCatalog(): string {
  return AI_ACTION_CATALOG.map((type) => `- ${type}: ${ACTION_DESCRIPTIONS[type]}`).join('\n')
}

/** O que ele carrega, em uma linha. Só os cinco maiores: o resto é ruído. */
function inventoryLine(snap: NonNullable<ConversationContext['snapshot']>): string {
  if (snap.inventory.length === 0) return 'nada'
  return snap.inventory
    .slice(0, 5)
    .map((item) => `${item.count} de ${item.name}`)
    .join(', ')
}

function worldContext(ctx: ConversationContext): string {
  const snap = ctx.snapshot
  if (!snap) return 'Você ainda não está no mundo.'

  const hostis = snap.nearbyEntities
    .filter((e) => e.type === 'hostile')
    .slice(0, 4)
    .map((e) => `${e.name} a ${Math.round(e.distanceToBot)} blocos`)

  return [
    `Hora do jogo: ${snap.timeOfDay}.`,
    `Sua vida: ${Math.round(snap.health)}/20. Fome: ${Math.round(snap.food)}/20.`,
    // A mochila estava faltando aqui, e a IA respondia no escuro: "quantos
    // blocos de madeira você tem?" virou "isso eu não sei ver".
    `Na sua mochila: ${inventoryLine(snap)}.`,
    `Sua posição: ${Math.round(snap.position.x)}, ${Math.round(snap.position.y)}, ${Math.round(snap.position.z)}.`,
    snap.ownerVisible ? `${ctx.owner} está por perto.` : `Você não está vendo o ${ctx.owner}.`,
    hostis.length > 0 ? `Monstros por perto: ${hostis.join(', ')}.` : 'Nenhum monstro por perto.',
    `O que você está fazendo agora: ${snap.state}.`,
  ].join('\n')
}

/**
 * Prompt único: a fala e a ação saem da mesma chamada.
 *
 * Antes havia um segundo prompt só para interpretar pedido, e ele nunca rodava
 * — a IA respondia e o bot não fazia nada. Ver: ai_companion_delta.md →
 * "Chamada separada de interpretação".
 */
export function buildConversePrompt(ctx: ConversationContext): string {
  return [
    staticPrompt(ctx),
    '',
    '## Situação atual no jogo',
    worldContext(ctx),
  ].join('\n')
}

/** O bloco de mundo, sozinho. Muda a cada fala; o resto do prompt não. */
export function worldBlock(ctx: ConversationContext): string {
  return ['## Situação atual no jogo', worldContext(ctx)].join('\n')
}

/**
 * A parte do prompt que NÃO muda durante uma sessão: persona, identidade,
 * regras de resposta, catálogo de ação e exemplos.
 *
 * Existe separada por causa do provider Claude Code, que fixa o system prompt na
 * criação da sessão e precisa dele antes de o bot entrar no mundo. Os outros
 * providers continuam recebendo o prompt inteiro por `buildConversePrompt`.
 */
export function staticPrompt(ctx: ConversationContext): string {
  return [
    ctx.personaDescription,
    '',
    identityFacts(ctx),
    '',
    '## Como responder',
    'Responda SEMPRE com um objeto JSON com dois campos:',
    '- "reply": o que você fala no chat.',
    '- "action": o que você vai fazer, ou null quando não for fazer nada.',
    '',
    `- Você fala com uma criança de 7 anos: palavra simples, tom de amigo.`,
    '- UMA frase curta, no máximo 100 caracteres. Nunca faça listas.',
    '- Você está digitando no chat de um jogo: seja direto e caloroso.',
    '- Não use markdown, não use asteriscos, não descreva ações entre asteriscos.',
    '',
    '## O que você consegue fazer',
    actionCatalog(),
    '',
    '## Quando mandar ação',
    '- Só quando o jogador PEDIR alguma coisa. Conversa é "action": null.',
    '- No máximo UMA ação por resposta. Nunca duas.',
    '- Pedido que não está na lista acima: "action": null, e diga que não sabe.',
    '- A fala combina com a ação: se vai pegar madeira, diga que vai pegar.',
    '',
    '## Atacar é comando, não é ação sua',
    'Brigar com monstro NÃO está na sua lista de ações e você NUNCA promete atacar.',
    'Quando o jogador pedir para atacar, matar ou bater em alguma coisa:',
    '- "action": null, sempre.',
    '- Ensine a frase que funciona: mandar "ataca" ou "ataca o zumbi".',
    '- Nunca diga "já vou", "tô indo" nem "deixa comigo" para pedido de ataque —',
    '  quem faz isso é o comando, e prometer sem fazer é o pior que você pode fazer.',
    '',
    '## Exemplos',
    '  "pega umas madeiras pra mim"',
    '    -> {"reply":"Já vou pegar!","action":{"type":"COLLECT_BLOCK","params":{"block":"madeira","count":4}}}',
    '  "constrói uma casinha pra mim"',
    '    -> {"reply":"Deixa comigo, já começo!","action":{"type":"BUILD","params":{"structure":"casa"}}}',
    '  "faz uma torre de pedra"',
    '    -> {"reply":"Vou fazer uma bem alta!","action":{"type":"BUILD","params":{"structure":"torre","material":"pedra"}}}',
    '  "vem cá"',
    '    -> {"reply":"Tô indo!","action":{"type":"FOLLOW","params":{}}}',
    '  "fica aqui vigiando"',
    '    -> {"reply":"Pode deixar, eu fico!","action":{"type":"STAY","params":{}}}',
    '  "me dá uma maçã"',
    '    -> {"reply":"Toma!","action":{"type":"DROP_ITEM_TO_OWNER","params":{"item":"apple"}}}',
    '  "bora brincar de esconder"',
    '    -> {"reply":"Oba, vamos!","action":{"type":"PLAY_GAME","params":{"game":"esconde_esconde"}}}',
    '  "você gosta de diamante?"',
    '    -> {"reply":"Adoro! Brilha muito!","action":null}',
    '  "faz uma poção pra mim"',
    '    -> {"reply":"Essa eu não sei fazer ainda, desculpa!","action":null}',
    // Exemplo obrigatório: sem ele o modelo tenta emitir uma ação para o pedido
    // de ataque e, como ATTACK não está no schema, a saída estruturada acaba
    // empurrando para outra ação válida — já saiu STOP, que cancelaria o que a
    // criança estava mandando fazer.
    '  "ataca aquele bicho"',
    '    -> {"reply":"Fala \\"ataca\\" que eu vou lá!","action":null}',
    '  "mata o monstro ali"',
    '    -> {"reply":"Manda \\"ataca o zumbi\\" que eu resolvo!","action":null}',
  ].join('\n')
}

/** Converte a janela curta no formato de mensagens de chat. */
export function historyMessages(
  ctx: ConversationContext,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return ctx.history
    .filter((turn) => turn.text.trim().length > 0)
    .map((turn) => ({
      role: turn.speaker === ctx.botName ? ('assistant' as const) : ('user' as const),
      content: turn.text,
    }))
}
