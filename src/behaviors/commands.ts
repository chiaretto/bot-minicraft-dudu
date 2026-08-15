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
    patterns: [/^para$/, /^pare$/, /^parar$/, /^para tudo$/, /^cancela$/, /^chega$/],
  },
  {
    intent: { type: 'FOLLOW', params: {} },
    patterns: [
      /^vem$/,
      /^vem ca$/,
      /^vem aqui$/,
      /^vem comigo$/,
      /^me segue$/,
      /^me segui$/,
      /^segue me$/,
      /^me acompanha$/,
      /^vamos$/,
      /^bora$/,
    ],
  },
  {
    intent: { type: 'STAY', params: {} },
    patterns: [
      /^fica aqui$/,
      /^fique aqui$/,
      /^fica ai$/,
      /^espera aqui$/,
      /^nao sai daqui$/,
      /^fica parado$/,
      /^me espera$/,
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
 * Reconhece um comando, ou `null` para a mensagem descer na cascata.
 * Nunca faz I/O e nunca chama a IA.
 */
export function parseCommand(text: string, botName: string): ParsedCommand | null {
  const normalized = prepare(text, botName)
  if (!normalized) return null

  for (const command of COMMANDS) {
    for (const pattern of command.patterns) {
      if (pattern.test(normalized)) {
        return { intent: command.intent, matched: normalized }
      }
    }
  }
  return null
}

/** Exposto para teste: quantos padrões o parser cobre. */
export function commandPatternCount(): number {
  return COMMANDS.reduce((sum, c) => sum + c.patterns.length, 0)
}
