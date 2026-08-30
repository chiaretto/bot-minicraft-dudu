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
 * Uma voz do sistema, reduzida ao que a escolha precisa.
 *
 * Não é a `SpeechSynthesisVoice` do navegador de propósito: a política tem que
 * ser testável sem navegador nenhum, e o que ela olha é nome e idioma.
 */
export interface VozDisponivel {
  name: string
  lang: string
}

/**
 * As vozes que servem, na ordem em que devem aparecer na lista.
 *
 * Só português: uma voz em inglês lendo "tá esquentando!" sai como outra
 * língua, e a criança não reconhece nada. `pt-BR` antes de `pt-PT` porque é o
 * português dela.
 */
export function vozesEmPortugues(vozes: readonly VozDisponivel[]): VozDisponivel[] {
  return vozes
    .filter((voz) => voz.lang?.toLowerCase().startsWith('pt'))
    .sort((a, b) => {
      const brA = a.lang.toLowerCase() === 'pt-br' ? 0 : 1
      const brB = b.lang.toLowerCase() === 'pt-br' ? 0 : 1
      return brA - brB || a.name.localeCompare(b.name)
    })
}

/**
 * A voz a usar: a escolhida, se ainda existir; senão a melhor em português.
 *
 * Voz salva que sumiu do sistema (desinstalada, ou outro computador) **não**
 * pode calar o bot — ele volta para a melhor disponível em silêncio.
 */
export function escolherVoz(
  vozes: readonly VozDisponivel[],
  nomeSalvo?: string | null,
): VozDisponivel | null {
  const candidatas = vozesEmPortugues(vozes)
  if (nomeSalvo) {
    const salva = candidatas.find((voz) => voz.name === nomeSalvo)
    if (salva) return salva
  }
  return candidatas[0] ?? null
}

/** Velocidade e tom da fala. */
export interface AjustesDeVoz {
  rate: number
  pitch: number
}

/** O padrão é o que já era: mudar sozinho a voz de alguém seria surpresa. */
export const AJUSTES_PADRAO: AjustesDeVoz = { rate: 1, pitch: 1 }

export const LIMITES = { rate: { min: 0.5, max: 1.5 }, pitch: { min: 0.5, max: 2 } }

/**
 * Ajusta para dentro do que o sintetizador aceita.
 *
 * Valor fora da faixa faz o `speechSynthesis` ignorar a fala inteira em vez de
 * reclamar — o sintoma seria o bot emudecer sem motivo aparente. Vale também
 * para o que voltou do armazenamento: lá pode ter qualquer coisa.
 */
export function normalizarAjustes(bruto: Partial<AjustesDeVoz> | null | undefined): AjustesDeVoz {
  const limitar = (valor: unknown, min: number, max: number, padrao: number): number => {
    const numero = typeof valor === 'number' ? valor : Number(valor)
    if (!Number.isFinite(numero)) return padrao
    return Math.min(max, Math.max(min, numero))
  }

  return {
    rate: limitar(bruto?.rate, LIMITES.rate.min, LIMITES.rate.max, AJUSTES_PADRAO.rate),
    pitch: limitar(bruto?.pitch, LIMITES.pitch.min, LIMITES.pitch.max, AJUSTES_PADRAO.pitch),
  }
}

/** Frase de teste do botão de ouvir. Curta, e do jeito que ele fala mesmo. */
export const FALA_DE_TESTE = 'Oi! Sou eu, o Dudu. Vamos brincar?'

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
