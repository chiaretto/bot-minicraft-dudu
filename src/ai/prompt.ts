import type { ConversationContext } from './provider.js'
import { INTENT_TYPES, type IntentType } from '../domain/intent.js'

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
    'entregar item, defender o jogador de monstros e construir casinha e torre.',
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
    'construir — "structure" é "casa" ou "torre". ' +
    '"material" é opcional (madeira, pedra…): sem ele o bot usa o que tiver',
  ESCAPE_HOLE:
    'sair de um buraco fazendo escadinha de blocos. ' +
    'Use quando ele estiver preso lá embaixo e não conseguir chegar no jogador',
  GOTO_COORDS: 'ir até um lugar — precisa de "x", "y" e "z"',
  DROP_ITEM_TO_OWNER: 'entregar um item para o jogador — precisa de "item"',
  LOOK_AT_OWNER: 'virar e olhar para o jogador',
  EQUIP_ITEM: 'pegar um item na mão — precisa de "item"',
  DEFENSE_ON: 'voltar a brigar com monstro para proteger o jogador',
  DEFENSE_OFF: 'parar de brigar com monstro',
  PLAY_GAME:
    'começar uma brincadeira — "game" é "esconde_esconde" ou "pega_pega". ' +
    'NÃO mande "role": quem escolhe o papel é o jogador, e o bot pergunta',
  ASK_WHICH_GAME: 'perguntar qual brincadeira, quando o convite não disser qual',
}

/** Tipos que podem virar ação. `CHAT` e `UNKNOWN` nunca viram efeito no mundo. */
export const ACTIONABLE_INTENTS = INTENT_TYPES.filter(
  (t): t is Exclude<IntentType, 'CHAT' | 'UNKNOWN'> => t !== 'CHAT' && t !== 'UNKNOWN',
)

function actionCatalog(): string {
  return ACTIONABLE_INTENTS.map((type) => `- ${type}: ${ACTION_DESCRIPTIONS[type]}`).join('\n')
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
    ctx.personaDescription,
    '',
    identityFacts(ctx),
    '',
    '## Situação atual no jogo',
    worldContext(ctx),
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
