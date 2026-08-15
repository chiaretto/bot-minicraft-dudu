import type { Intent } from '../domain/intent.js'
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
]

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
