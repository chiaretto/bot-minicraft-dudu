/**
 * Comandos aprendidos: nível 1.5 da cascata de resolução.
 *
 * Quando a IA traduz um pedido em ação e a ação dá certo, o par
 * `frase normalizada → intenção validada` fica guardado. Na próxima vez que a
 * criança falar a mesma coisa, o bot age sem chamada de rede.
 *
 * Aqui só a regra, pura e sem I/O: quem lê e grava o arquivo é
 * `memory/learned-store.ts`.
 * Ver: learned_commands_delta.md
 */
import { scorePattern } from './matcher.js'
import { prepare } from './normalize.js'
import type { Intent } from '../domain/intent.js'

export interface LearnedCommand {
  /** Frase já normalizada — é a chave de casamento. */
  phrase: string
  /** Intenção validada, como saiu do catálogo fechado. */
  intent: Intent
  /**
   * Falas que a IA deu para esta frase.
   *
   * NÃO são ditas no replay: podem estar presas ao momento do aprendizado
   * ("tá escuro aqui, acende uma tocha") e sairiam fora de hora. Ficam como
   * matéria-prima para o `/upgrade-repertoire` transformar em variação escrita
   * à mão. A fala do replay vem da entrada `comando_aprendido`.
   */
  replies: string[]
  /** Provider que ensinou: dá para saber se veio do Gemini ou do modelo local. */
  provider: string
  /** Como a criança realmente escreveu, para a rotina do repertório. */
  examples: string[]
  learnedAt: string
  lastUsedAt: string
  hits: number
}

export interface LearnedMatch {
  command: LearnedCommand
  confidence: number
}

/** Normalização da chave: a mesma que a cascata aplica a toda mensagem. */
export function learnedPhrase(text: string, botName: string): string {
  return prepare(text, botName)
}

/**
 * Palavras que invertem o pedido.
 *
 * O limiar alto recusa o casamento por saco de palavras, mas NÃO resolve
 * negação: "nao pega madeira" contém a frase "pega madeira" inteira, com
 * limites de palavra, e casaria com 0.85. Para conversa isso seria uma resposta
 * esquisita; para ação, seria o bot fazendo exatamente o contrário do pedido.
 */
const NEGATIONS = ['nao', 'nunca', 'nem'] as const

/**
 * O texto nega algo que a frase guardada não negava?
 *
 * A comparação é contra as palavras da frase: um comando aprendido a partir de
 * "nao mexe no meu bau" continua casando com ele mesmo — a negação faz parte do
 * pedido ali. O que não pode é negação NOVA, que só existe no texto de agora.
 */
function negatedBeyondPhrase(normalizedText: string, phrase: string): boolean {
  const inPhrase = new Set(phrase.split(' '))
  return normalizedText
    .split(' ')
    .some((word) => (NEGATIONS as readonly string[]).includes(word) && !inPhrase.has(word))
}

/**
 * Melhor comando aprendido para o texto, ou `null` para a mensagem seguir na
 * cascata.
 *
 * Reusa o `scorePattern` do repertório, mas o limiar de quem chama é mais alto
 * (0.85 contra 0.7). Isso aceita texto idêntico e frase inteira contida, e
 * recusa o casamento por saco de palavras — "nao pega madeira" tem as mesmas
 * palavras de "pega madeira". Para conversa isso custa uma resposta esquisita;
 * para ação, custa o bot fazendo o contrário do que foi pedido.
 *
 * Desempate: confiança primeiro, depois o mais usado. Entre dois comandos que
 * casam igual, o que a criança pede mais é o que ela provavelmente quis.
 */
export function findLearned(
  normalizedText: string,
  commands: readonly LearnedCommand[],
  minConfidence: number,
): LearnedMatch | null {
  if (!normalizedText) return null

  let best: LearnedMatch | null = null
  for (const command of commands) {
    const confidence = scorePattern(normalizedText, command.phrase)
    if (confidence < minConfidence) continue
    if (negatedBeyondPhrase(normalizedText, command.phrase)) continue

    if (
      best === null ||
      confidence > best.confidence ||
      (confidence === best.confidence && command.hits > best.command.hits)
    ) {
      best = { command, confidence }
    }
  }

  return best
}

/**
 * Junta uma fala nova à lista, sem repetir e sem crescer além do teto.
 * A mais recente fica no fim: é a que melhor representa como a IA fala hoje.
 */
export function mergeReply(replies: readonly string[], reply: string, max: number): string[] {
  if (max <= 0) return []

  const clean = reply.trim()
  if (!clean) return replies.slice(-max)

  const without = replies.filter((r) => r !== clean)
  return [...without, clean].slice(-max)
}

/**
 * Condições para guardar um comando aprendido.
 *
 * As três valem juntas: veio da IA, tinha ação, a ação deu certo. Comando de
 * regex não precisa de cache; conversa não é comando; e ação recusada,
 * cancelada ou falha ensinaria o bot a errar mais rápido.
 * Ver: learned_commands_delta.md → "Aprender o que a IA resolveu".
 */
export function shouldLearn(decision: {
  source: string
  hadAction: boolean
  actionOk: boolean
}): boolean {
  return decision.source === 'llm' && decision.hadAction && decision.actionOk
}

/**
 * O `para` que acabou de chegar desfaz o último comando aprendido?
 *
 * Só dentro da janela. Fora dela, `para` volta a ser apenas "pare o que está
 * fazendo": quem interrompe uma coleta longa minutos depois não está
 * reclamando do aprendizado.
 * Ver: learned_commands_delta.md → "Desaprender comando errado".
 */
export function shouldUnlearn(
  lastReplay: { phrase: string; at: number } | null,
  now: number,
  windowMs: number,
): boolean {
  if (lastReplay === null) return false
  return now - lastReplay.at <= windowMs
}
