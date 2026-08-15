/**
 * Normaliza o texto do jogador antes do casamento de padrões.
 *
 * Tolera como uma criança realmente digita: CAPS, acento, pontuação repetida,
 * "oiiiiii". Sem isso o repertório erraria a maior parte dos casos reais.
 * Ver: local_dialogue_delta.md → "Normalização e casamento de padrões".
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // pontuação e emoji viram espaço
    .replace(/(\p{L})\1{2,}/gu, '$1') // oiiiiii -> oi
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Remove o vocativo do bot: "dudu, oi" e "oi dudu" viram "oi".
 * Roda depois de `normalize`, sobre texto já normalizado.
 */
export function stripVocative(normalized: string, botName: string): string {
  const name = normalize(botName)
  if (!name) return normalized

  let out = normalized
  // No começo: "dudu oi"
  const leading = new RegExp(`^${escapeRegex(name)}\\b\\s*`, 'u')
  out = out.replace(leading, '')
  // No fim: "oi dudu"
  const trailing = new RegExp(`\\s*\\b${escapeRegex(name)}$`, 'u')
  out = out.replace(trailing, '')
  return out.trim() || normalized
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Pipeline completo aplicado a toda mensagem que entra na cascata. */
export function prepare(text: string, botName: string): string {
  return stripVocative(normalize(text), botName)
}
