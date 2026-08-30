import { z } from 'zod'

/**
 * Campos que são segredo e por isso NUNCA podem aparecer em config.yaml.
 * O loader recusa iniciar se encontrar qualquer um deles no arquivo.
 * Ver: configuration_delta.md → "Segredos apenas por variável de ambiente".
 */
export const FORBIDDEN_YAML_KEYS = [
  'geminiApiKey',
  'claudeOauthToken',
  'apiKey',
  'token',
  'password',
  'senha',
] as const

export const serverSchema = z.object({
  host: z.string().min(1).default('localhost'),
  port: z.number().int().positive().default(25565),
  /** Versão do protocolo. Validada contra o servidor real no startup. */
  version: z.string().min(1),
  /** `offline` dispensa conta Mojang/Microsoft — típico de servidor local. */
  auth: z.enum(['offline', 'microsoft']).default('offline'),
  username: z.string().min(1).default('Dudu'),
  reconnect: z
    .object({
      enabled: z.boolean().default(true),
      initialDelayMs: z.number().int().positive().default(1000),
      maxDelayMs: z.number().int().positive().default(60_000),
      maxAttempts: z.number().int().positive().default(10),
    })
    .default({}),
})

export const personaSchema = z.object({
  name: z.string().min(1).default('Dudu'),
  description: z.string().default('Você é um amigo prestativo e animado no Minecraft.'),
  /**
   * Frase de origem. Alimenta o repertório (`{originStory}`) E o system prompt
   * da IA — as duas fontes precisam contar a mesma história.
   */
  originStory: z.string().default('Seu pai me criou pra jogar com você!'),
})

export const dialogueSchema = z.object({
  enabled: z.boolean().default(true),
  minConfidence: z.number().min(0).max(1).default(0.7),
  catalogPath: z.string().default('data/repertoire.yaml'),
  spontaneous: z.boolean().default(true),
  spontaneousCooldownMs: z.number().int().nonnegative().default(60_000),
})

export const memorySchema = z.object({
  dir: z.string().default('data/conversations'),
  shortTermWindow: z.number().int().positive().default(10),
  /** `null` = guardar para sempre. */
  retentionDays: z.number().int().positive().nullable().default(null),
  resumeToday: z.boolean().default(true),
})

export const defenseSchema = z.object({
  enabled: z.boolean().default(true),
  protectRadius: z.number().positive().default(16),
  criticalHealth: z.number().positive().default(6),
  engagementTimeoutMs: z.number().int().positive().default(30_000),
  maxSimultaneousTargets: z.number().int().positive().default(3),
  /** Distância mínima da qual o bot trata um creeper como "perto do dono". */
  creeperSafeDistance: z.number().positive().default(10),
})

/**
 * Parâmetros do esconde-esconde. Os defaults funcionam sem ninguém mexer em
 * nada; as distâncias são o que se ajusta quando a rodada fica fácil ou
 * difícil demais para a criança.
 * Ver: configuration_delta.md → "Bloco `games`".
 */
export const hideAndSeekSchema = z
  .object({
    /** Esconderijo nunca colado no jogador. */
    hideMinDistance: z.number().positive().default(10),
    /** Nem tão longe que a brincadeira vire caminhada. */
    hideMaxDistance: z.number().positive().default(30),
    /** Pontos avaliados a cada rodada de busca por esconderijo. */
    hideCandidateSamples: z.number().int().positive().default(24),
    /**
     * Quanto tempo o bot anda procurando um lugar de verdade para se esconder.
     *
     * Sem isso ele aceitava o primeiro ponto "não visível" e ficava parado no
     * campo aberto, de costas para o jogador. Procurar leva tempo: é andar até
     * achar uma construção, uma árvore ou um barranco que realmente tape.
     */
    hideSearchMs: z.number().int().positive().default(20_000),
    /** Encostou a esta distância, achou. */
    touchDistance: z.number().positive().default(2),
    /** Alcance máximo do "ver" do bot, mesmo com caminho livre. */
    seeDistance: z.number().positive().default(20),
    /** Ele conta até 20, um número por segundo. */
    countTo: z.number().int().positive().default(20),
    /**
     * Ritmo da contagem. Com `countTo: 20`, um número por segundo faz a
     * contagem inteira levar **20 segundos** — o mesmo tempo que o bot leva
     * procurando esconderijo, para a criança ter a mesma folga que ele.
     * O `ChatSender` impõe um piso de 900 ms; abaixo disso não adianta pedir.
     */
    countIntervalMs: z.number().int().positive().default(1000),
    /**
     * Erros de propósito antes de procurar de verdade. NÃO é enfeite: é a única
     * coisa que impede o bot de "achar" na hora, já que o protocolo entrega a
     * posição do jogador de graça.
     * Ver: bot_games_delta.md → "Cegueira deliberada durante o fingimento".
     */
    fakeSearches: z.number().int().nonnegative().default(2),
    fakeSearchMinDistanceFromOwner: z.number().positive().default(8),
    /** Rodada nunca fica pendurada. */
    roundTimeoutMs: z.number().int().positive().default(180_000),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.hideMinDistance > cfg.hideMaxDistance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hideMinDistance'],
        message: `não pode ser maior que hideMaxDistance (${cfg.hideMaxDistance})`,
      })
    }
    // Busca falsa mais perto que o toque encostaria no jogador e acabaria a
    // brincadeira antes de começar.
    if (cfg.fakeSearchMinDistanceFromOwner < cfg.touchDistance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fakeSearchMinDistanceFromOwner'],
        message: `não pode ser menor que touchDistance (${cfg.touchDistance})`,
      })
    }
  })

/**
 * Parâmetros do pega-pega. Os defaults funcionam sem ninguém mexer em nada; os
 * dois sprints são o que se ajusta quando a rodada fica fácil ou impossível
 * para a criança.
 * Ver: configuration_delta.md → "Sub-bloco `games.tag`".
 */
export const tagSchema = z
  .object({
    /** Ele conta 5 antes de sair correndo atrás. */
    countTo: z.number().int().positive().default(5),
    /** 5 x 1 s = a vantagem de saída da criança. */
    countIntervalMs: z.number().int().positive().default(1000),
    /** Correndo atrás: passou disso, ele cansa e perde. */
    chaseTimeoutMs: z.number().int().positive().default(60_000),
    /** Fugindo: passou disso, ele para e se deixa pegar. */
    fleeTimeoutMs: z.number().int().positive().default(60_000),
    /** Quanto ele espera parado, já entregue, até alguém encostar. */
    surrenderTimeoutMs: z.number().int().positive().default(30_000),
    /** Encostou a esta distância, pegou. */
    touchDistance: z.number().positive().default(2),
    /** O quanto ele cola no jogador enquanto persegue. */
    chaseFollowDistance: z.number().positive().default(1),
    /**
     * Os dois sprints NÃO são simétricos de propósito. Com sprint nos dois
     * papéis o bot ganha sempre e a criança para de brincar; sem sprint em
     * nenhum, ele nunca pega ninguém e toda rodada acaba em "cansei".
     */
    chaseSprint: z.boolean().default(true),
    fleeSprint: z.boolean().default(false),
    /** Salto mínimo de cada ponto de fuga, a partir de onde o bot está. */
    fleeStepMin: z.number().positive().default(8),
    fleeStepMax: z.number().positive().default(16),
    /** Fugir mundo afora tira o bot do campo de visão da criança. */
    fleeMaxDistanceFromOwner: z.number().positive().default(40),
    fleeCandidateSamples: z.number().int().positive().default(16),
    /** Rede de segurança: rodada nunca fica pendurada. */
    roundTimeoutMs: z.number().int().positive().default(180_000),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.fleeStepMin > cfg.fleeStepMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fleeStepMin'],
        message: `não pode ser maior que fleeStepMax (${cfg.fleeStepMax})`,
      })
    }
    // Salto maior que o teto garantiria candidato inválido em toda escolha.
    if (cfg.fleeStepMax > cfg.fleeMaxDistanceFromOwner) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fleeStepMax'],
        message: `não pode ser maior que fleeMaxDistanceFromOwner (${cfg.fleeMaxDistanceFromOwner})`,
      })
    }
    // Com o toque maior que o salto, o bot chegaria ao ponto de fuga já dentro
    // da distância de ser pego, e a rodada acabaria sozinha.
    if (cfg.touchDistance >= cfg.fleeStepMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['touchDistance'],
        message: `precisa ser menor que fleeStepMin (${cfg.fleeStepMin})`,
      })
    }
    // A rede de segurança não pode disparar antes da regra do jogo valer: seria
    // o bot morrendo no meio da frase em vez de perder por cansaço.
    const needed =
      cfg.countTo * cfg.countIntervalMs +
      Math.max(cfg.chaseTimeoutMs, cfg.fleeTimeoutMs) +
      cfg.surrenderTimeoutMs
    if (needed > cfg.roundTimeoutMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['roundTimeoutMs'],
        message: `precisa ser de pelo menos ${needed} ms, senão a rodada acaba antes da regra do jogo valer`,
      })
    }
  })

export const gamesSchema = z.object({
  enabled: z.boolean().default(true),
  /**
   * Quanto tempo a pergunta "quem se esconde?" fica valendo. Passado o prazo,
   * um `eu` solto volta a ser conversa em vez de iniciar rodada.
   */
  roleQuestionTimeoutMs: z.number().int().positive().default(45_000),
  hideAndSeek: hideAndSeekSchema.default({}),
  tag: tagSchema.default({}),
})

export const ollamaSchema = z.object({
  baseUrl: z.string().url().default('http://localhost:11434'),
  model: z.string().min(1).default('qwen3:4b'),
  timeoutMs: z.number().int().positive().default(12_000),
  keepAlive: z.string().default('30m'),
})

export const geminiSchema = z.object({
  // Alias '-latest': identificador de versão fixa é aposentado pelo Google e
  // passa a devolver 404. Foi o que aconteceu com 'gemini-2.0-flash'.
  model: z.string().min(1).default('gemini-flash-lite-latest'),
  timeoutMs: z.number().int().positive().default(5_000),
})

/**
 * Provider Claude Code, pelo Agent SDK.
 *
 * Diferente dos outros dois, este tem **sessão**: o SDK sobe um subprocesso, e
 * pagar essa subida a cada fala da criança dominaria qualquer ganho de escolher
 * um modelo rápido (medido: ~5 s de subida contra ~1,4 s de resposta com a
 * sessão de pé). Por isso existem os limites de reciclagem aqui embaixo — eles
 * não têm equivalente no Ollama nem no Gemini.
 * Ver: llm_provider_delta.md → "Sessão viva".
 */
export const claudeSchema = z.object({
  model: z.string().min(1).default('claude-haiku-4-5'),
  timeoutMs: z.number().int().positive().default(15_000),
  /** Idade máxima da sessão antes de reciclar. */
  sessionMaxAgeMs: z
    .number()
    .int()
    .positive()
    .default(30 * 60_000),
  /** Falas atendidas por uma sessão antes de reciclar. */
  sessionMaxTurns: z.number().int().positive().default(50),
})

export const llmSchema = z.object({
  provider: z.enum(['ollama', 'gemini', 'claude', 'none']).default('ollama'),
  fallbackProvider: z.enum(['ollama', 'gemini', 'claude']).nullable().default(null),
  ollama: ollamaSchema.default({}),
  gemini: geminiSchema.default({}),
  claude: claudeSchema.default({}),
  warmUpOnStart: z.boolean().default(true),
  /** Após esse tempo sem resposta, o bot fala algo de espera no chat. */
  fillerAfterMs: z.number().int().positive().default(2_000),
  /** O que fazer com uma segunda mensagem enquanto já há inferência em voo. */
  queueBehavior: z.enum(['queue', 'repertoire']).default('repertoire'),
  maxCallsPerMinute: z.number().int().positive().default(10),
  circuitBreakerThreshold: z.number().int().positive().default(3),
  circuitBreakerResetMs: z.number().int().positive().default(60_000),
})

/**
 * Histórico de comandos aprendidos da IA (nível 1.5 da cascata).
 *
 * `minConfidence` é mais rígido que o do repertório de propósito: em 0.7 o
 * casamento aceita saco de palavras, e "nao pega madeira" tem as mesmas
 * palavras de "pega madeira". Para conversa isso custa uma resposta esquisita;
 * para ação, custa o bot fazendo o contrário do pedido.
 * Ver: configuration_delta.md → "Bloco `learned`".
 */
export const learnedSchema = z.object({
  enabled: z.boolean().default(true),
  /** Fora do git, como todo o `data/`: é dado derivado da fala da criança. */
  path: z.string().min(1).default('data/learned-commands.json'),
  minConfidence: z.number().min(0).max(1).default(0.85),
  /** Teto de entradas; a usada há mais tempo sai primeiro. */
  maxEntries: z.number().int().positive().default(200),
  /** Falas da IA guardadas por entrada, como material para a rotina diária. */
  maxRepliesPerEntry: z.number().int().nonnegative().default(4),
  /** `null` = guardar para sempre, como `memory.retentionDays`. */
  forgetAfterDays: z.number().int().positive().nullable().default(null),
  /** Janela em que um `para` desfaz o aprendizado que acabou de ser usado. */
  unlearnOnStopMs: z.number().int().positive().default(15_000),
})

export const behaviorSchema = z.object({
  followDistance: z.number().positive().default(3),
  stayTolerance: z.number().positive().default(2),
  actionTimeoutMs: z.number().int().positive().default(60_000),
  noProgressMs: z.number().int().positive().default(10_000),
  collectAllowlist: z
    .array(z.string())
    .default([
      'oak_log',
      'birch_log',
      'spruce_log',
      'jungle_log',
      'acacia_log',
      'dark_oak_log',
      'dirt',
      'sand',
      'gravel',
      'cobblestone',
      'stone',
    ]),
  /**
   * Blocos que o bot pode USAR como material de obra.
   *
   * Separada da allowlist de coleta de propósito: o que ele pode cavar não é
   * necessariamente o que faz uma casa decente, e um dia uma pode mudar sem a
   * outra.
   */
  buildAllowlist: z
    .array(z.string())
    .default([
      'oak_log',
      'birch_log',
      'spruce_log',
      'jungle_log',
      'acacia_log',
      'dark_oak_log',
      'cobblestone',
      'stone',
      'dirt',
      'sand',
    ]),
  /** Teto de segurança: obra maior que isto é recusada antes de começar. */
  buildMaxBlocks: z.number().int().positive().default(120),
  /** Até onde procurar porta quando pedem para abrir, ou quando ele trava. */
  doorSearchRadius: z.number().int().positive().default(6),
  /** Desnível a partir do qual vale a pena fazer escada em vez de só pular. */
  escapeMinDrop: z.number().int().positive().default(3),
  /** Teto de degraus numa tentativa. Evita torre até o céu. */
  escapeMaxHeight: z.number().int().positive().default(24),
  /** Teto de blocos cavados para arranjar degrau, para não virar escavação. */
  escapeMaxDigs: z.number().int().positive().default(12),
  /** Quanto tempo parado seguindo o dono antes de suspeitar de buraco. */
  escapeStuckMs: z.number().int().positive().default(6_000),
  /** Buscar material sozinho quando faltar, em vez de só recusar. */
  buildAutoGather: z.boolean().default(true),
  /**
   * Comer sozinho quando a fome apertar.
   *
   * Instinto, não comando: como a defesa, não passa por IA nem por pedido.
   */
  autoEat: z.boolean().default(true),
  /** Fome (0 a 20) a partir da qual ele come. 20 é barriga cheia. */
  eatBelowFood: z.number().int().min(0).max(20).default(14),
  /** Acender tocha sozinho quando estiver escuro. */
  autoTorch: z.boolean().default(true),
  /** Luz (0 a 15) abaixo da qual o lugar merece uma tocha. */
  torchBelowLight: z.number().int().min(0).max(15).default(7),
  /** Espera mínima entre duas tochas, para ele não virar fábrica de tocha. */
  torchMinIntervalMs: z.number().int().positive().default(20_000),
  /** Distância mínima da última tocha acesa. */
  torchMinDistance: z.number().int().positive().default(5),
  /** De quanto em quanto tempo ele checa fome e escuro. */
  survivalTickMs: z.number().int().positive().default(3_000),
  /** Teto de blocos numa escavação pedida. O buraco tem 8 e o túnel 8. */
  digMaxBlocks: z.number().int().positive().default(16),
})

export const configSchema = z.object({
  ownerPlayer: z
    .string({ required_error: 'ownerPlayer é obrigatório' })
    .min(1, 'ownerPlayer é obrigatório'),
  server: serverSchema,
  persona: personaSchema.default({}),
  dialogue: dialogueSchema.default({}),
  memory: memorySchema.default({}),
  defense: defenseSchema.default({}),
  games: gamesSchema.default({}),
  llm: llmSchema.default({}),
  learned: learnedSchema.default({}),
  behavior: behaviorSchema.default({}),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
})

export type Config = z.infer<typeof configSchema>
export type LlmConfig = z.infer<typeof llmSchema>
export type DefenseConfig = z.infer<typeof defenseSchema>
export type GamesConfig = z.infer<typeof gamesSchema>
export type HideAndSeekConfig = z.infer<typeof hideAndSeekSchema>
export type TagConfig = z.infer<typeof tagSchema>
export type DialogueConfig = z.infer<typeof dialogueSchema>
export type LearnedConfig = z.infer<typeof learnedSchema>
export type MemoryConfig = z.infer<typeof memorySchema>
export type BehaviorConfig = z.infer<typeof behaviorSchema>
export type PersonaConfig = z.infer<typeof personaSchema>

/** Segredos, que vêm só do ambiente e nunca do YAML. */
export interface Secrets {
  geminiApiKey?: string
  /** Credencial da assinatura, de `claude setup-token`. Não é chave de API. */
  claudeOauthToken?: string
  minecraftPassword?: string
}
