import type { ConversationContext } from './provider.js'
import { INTENT_TYPES } from '../domain/intent.js'

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
    'entregar item e defender o jogador de monstros.',
    'Você NÃO sabe: construir casas, craftar, fazer poções.',
    'Você NUNCA ataca outro jogador, em nenhuma circunstância.',
  ].join('\n')
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
    `- Fale português do Brasil, do jeito que se fala com criança.`,
    '- UMA frase curta, no máximo 200 caracteres. Nunca faça listas.',
    '- Você está digitando no chat de um jogo: seja direto e caloroso.',
    '- Não use markdown, não use asteriscos, não descreva ações entre asteriscos.',
  ].join('\n')
}

export function buildInterpretPrompt(ctx: ConversationContext): string {
  return [
    `Você traduz o pedido de um jogador de Minecraft em UMA intenção estruturada.`,
    '',
    `Tipos permitidos (qualquer outra coisa deve virar UNKNOWN): ${INTENT_TYPES.join(', ')}`,
    '',
    'Regras:',
    '- Responda SOMENTE com um objeto JSON. Sem texto antes ou depois.',
    '- Se o pedido não couber exatamente num dos tipos, devolva {"type":"UNKNOWN"}.',
    '- Se for só conversa e não um pedido de ação, devolva {"type":"CHAT"}.',
    '- Nunca invente um tipo novo.',
    '',
    'Exemplos:',
    '  "pega umas madeiras pra mim" -> {"type":"COLLECT_BLOCK","params":{"block":"oak_log","count":4}}',
    '  "vem cá" -> {"type":"FOLLOW","params":{}}',
    '  "constrói uma casa" -> {"type":"UNKNOWN","params":{}}',
    '  "você gosta de diamante?" -> {"type":"CHAT","params":{}}',
    '',
    `O jogador se chama ${ctx.owner}.`,
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
