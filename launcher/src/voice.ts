/**
 * O que vale a pena ler em voz alta, e como.
 *
 * Regra pura: nada aqui conhece `electron` nem `speechSynthesis`. Quem fala é a
 * janela, que é o único lugar com um sintetizador; o que ela recebe já vem
 * decidido daqui.
 *
 * O porquê da feature inteira: a dona do bot tem 7 anos e lê devagar, e o chat
 * do Minecraft rola rápido. Ouvir é o que faz ela acompanhar a conversa.
 * Ver: desktop_launcher_delta.md → "Ler as falas em voz alta".
 */

/** Fala mais longa que isto é cortada. Voz lenta demais cansa. */
export const MAX_CHARS = 180

/**
 * Quantas falas ficam na fila de leitura.
 *
 * Fila grande faz a voz atrasar: numa rodada de quente e frio o bot fala a cada
 * dois segundos, e ouvir a resposta de meio minuto atrás confunde mais do que
 * ajuda. Passou do teto, a mais VELHA é descartada — o que importa é o que ele
 * acabou de dizer.
 */
export const MAX_QUEUE = 3

/**
 * Emoticons e enfeites que a voz leria letra por letra.
 *
 * `:D` sai como "dois pontos, dê" em quase todo sintetizador, e a criança ouve
 * um ruído no meio da frase.
 */
const EMOTICON = /(^|\s)[:;=]-?[)D(P/\\|]+(?=\s|$)/gu

/**
 * Prepara a fala para ser lida.
 *
 * Devolve `null` quando não há nada que valha a pena ouvir.
 */
export function prepareSpeech(raw: string): string | null {
  const limpo = raw
    .replace(EMOTICON, ' ')
    // Repetição de pontuação vira pausa esquisita: "corre!!!" já é "corre!".
    .replace(/([!?.,])\1{1,}/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim()

  if (limpo.length === 0) return null

  if (limpo.length <= MAX_CHARS) return limpo
  // Corta na última palavra inteira, para não terminar no meio de uma sílaba.
  const cortado = limpo.slice(0, MAX_CHARS)
  const ultimoEspaco = cortado.lastIndexOf(' ')
  return ultimoEspaco > 0 ? cortado.slice(0, ultimoEspaco) : cortado
}

/**
 * Acrescenta uma fala à fila, respeitando o teto.
 *
 * Função pura: devolve a fila nova em vez de mexer na que recebeu, para dar
 * para testar a política sem um sintetizador por perto.
 */
export function enqueueSpeech(queue: readonly string[], text: string): string[] {
  const proxima = [...queue, text]
  return proxima.length <= MAX_QUEUE ? proxima : proxima.slice(proxima.length - MAX_QUEUE)
}
