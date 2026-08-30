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
import { isSystemEcho } from '../minecraft/chat.js'
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
 * A entrada nasceu de um recado do jogo, e não de uma fala?
 *
 * A checagem é nos **exemplos**, não na frase: a frase está normalizada e a
 * normalização come a pontuação, então o `]` que denuncia o recado já não está
 * lá. Os exemplos guardam como a mensagem chegou de verdade.
 */
export function isEchoCommand(command: Pick<LearnedCommand, 'examples'>): boolean {
  return command.examples.some((example) => isSystemEcho(example))
}

/**
 * Palavras que abrem pergunta.
 *
 * Lista fechada e sintática, como a de negação: nada aqui tenta entender a
 * frase. A pontuação sozinha não bastaria — criança de 7 anos escreve
 * "quantos blocos voce tem" sem `?` a maior parte das vezes.
 */
const QUESTION_STARTERS = [
  'qual',
  'quais',
  'quem',
  'como',
  'quando',
  'onde',
  'aonde',
  'por que',
  'porque',
  'quanto',
  'quantos',
  'quantas',
  'o que',
  'sera que',
  'voce sabe',
  'voce consegue',
] as const

/**
 * Palavras que amarram o pedido a uma condição.
 *
 * O bot não sabe esperar por gatilho: ele age agora. "construa uma casa quando
 * eu falar já" decorado vira uma casa imediata na próxima vez que a frase
 * aparecer — que é justamente o contrário do que foi pedido.
 */
const CONDITIONAL_MARKERS = [
  'quando',
  'se eu',
  'se voce',
  'depois que',
  'toda vez que',
  'sempre que',
] as const

/** Por que uma frase não pode virar comando decorado. `null` = pode. */
export type LearnBlockReason = 'pergunta' | 'condicao'

/**
 * A frase é pergunta?
 *
 * Duas formas: termina em `?` no texto cru, ou começa com palavra
 * interrogativa no texto normalizado (que é onde o vocativo já saiu, então
 * "dudu, qual sua llm" também cai aqui).
 */
export function isQuestion(text: string, botName: string): boolean {
  if (text.trim().endsWith('?')) return true

  const normalized = prepare(text, botName)
  return QUESTION_STARTERS.some(
    (starter) => normalized === starter || normalized.startsWith(`${starter} `),
  )
}

/**
 * Por que esta frase não vira comando decorado, se for o caso.
 *
 * A recusa é por FORMA, não por assunto. Foi escrita a partir de duas entradas
 * reais que o cache decorou errado: `qual sua llm ?` virou `FOLLOW` (a IA
 * respondeu conversa e mandou uma ação junto, seguir "deu certo" — sempre dá) e
 * `construa uma casa quando eu falar ja` virou `STAY`.
 *
 * O custo aceito: `sera que da pra pegar madeira?` também deixa de ser
 * decorado. A ação continua acontecendo pela IA — perder um atalho é barato,
 * decorar uma pergunta é caro.
 * Ver: learned_commands_delta.md → "Pergunta nunca vira comando aprendido".
 */
export function learnBlockReason(text: string, botName: string): LearnBlockReason | null {
  if (isQuestion(text, botName)) return 'pergunta'

  const normalized = prepare(text, botName)
  const words = normalized.split(' ')
  const conditional = CONDITIONAL_MARKERS.some((marker) =>
    marker.includes(' ') ? normalized.includes(marker) : words.includes(marker),
  )
  return conditional ? 'condicao' : null
}

/**
 * Condições para guardar um comando aprendido.
 *
 * As quatro valem juntas: veio da IA, tinha ação, a ação deu certo, e a frase é
 * um PEDIDO. Comando de regex não precisa de cache; conversa não é comando;
 * ação recusada, cancelada ou falha ensinaria o bot a errar mais rápido; e
 * pergunta respondida com ação junto viraria comando instantâneo para sempre.
 * Ver: learned_commands_delta.md → "Aprender o que a IA resolveu".
 */
export function shouldLearn(decision: {
  source: string
  hadAction: boolean
  actionOk: boolean
  text: string
  botName: string
}): boolean {
  if (decision.source !== 'llm' || !decision.hadAction || !decision.actionOk) return false
  return learnBlockReason(decision.text, decision.botName) === null
}

/**
 * Frases com que a criança diz que o bot fez a coisa errada.
 *
 * `para` já desfaz, mas não é o que uma criança de 7 anos diz na hora: ela diz
 * que não era aquilo. Sem estas frases, o único desfazer é uma palavra que ela
 * não vai usar no momento certo.
 * Ver: learned_commands_delta.md → "A criança desfaz com a palavra dela".
 */
const CORRECTIONS = [
  'nao era isso',
  'nao e isso',
  'nao foi isso',
  'nao era esse',
  'nao era essa',
  'errado',
  'ta errado',
  'esta errado',
  'isso ta errado',
] as const

/**
 * A criança está corrigindo o último comando replicado?
 *
 * Só a forma — quem decide se há o que desfazer é `shouldUnlearn`. Fora da
 * janela de um replay, "errado" é conversa comum e desce a cascata inteira.
 */
export function isCorrection(text: string, botName: string): boolean {
  const normalized = prepare(text, botName)
  return (CORRECTIONS as readonly string[]).includes(normalized)
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
