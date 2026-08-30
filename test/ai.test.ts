import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { AiLayer, wrapWithResilience } from '../src/ai/index.js'
import {
  ResilientProvider,
  BusyError,
  CircuitOpenError,
  TimeoutError,
} from '../src/ai/resilient.js'
import { ProviderError, type ConversationContext, type LlmProvider } from '../src/ai/provider.js'
import { buildConversePrompt, identityFacts, ACTIONABLE_INTENTS } from '../src/ai/prompt.js'
import { cleanReply } from '../src/ai/providers/ollama.js'
import {
  validateIntent,
  parseIntentFromText,
  UNKNOWN_INTENT,
  validateReplyWithAction,
  type ReplyWithAction,
} from '../src/domain/intent.js'
import { llmSchema } from '../src/config/schema.js'

const llm = llmSchema.parse({})

const ctx: ConversationContext = {
  message: 'oi',
  owner: 'Miguel',
  botName: 'Dudu',
  originStory: 'Seu pai me criou pra jogar com você!',
  personaDescription: 'Você é o Dudu.',
  snapshot: null,
  history: [],
}

/** Provider de teste: comportamento programável, zero rede. */
class FakeProvider implements LlmProvider {
  calls = 0
  constructor(
    readonly name: 'ollama' | 'gemini' | 'none',
    private readonly behavior: {
      converse?: () => Promise<ReplyWithAction>
      warmUp?: () => Promise<void>
    } = {},
  ) {}

  async converse(): Promise<ReplyWithAction> {
    this.calls++
    return this.behavior.converse
      ? this.behavior.converse()
      : { reply: 'resposta feliz', action: null }
  }
  async warmUp(): Promise<void> {
    if (this.behavior.warmUp) await this.behavior.warmUp()
  }
}

describe('validação de intenção', () => {
  it('aceita intenção do catálogo', () => {
    const intent = validateIntent({ type: 'COLLECT_BLOCK', params: { block: 'oak_log', count: 4 } })
    expect(intent.type).toBe('COLLECT_BLOCK')
  })

  it('rejeita tipo fora do catálogo virando UNKNOWN', () => {
    expect(validateIntent({ type: 'BUILD_HOUSE', params: {} })).toEqual(UNKNOWN_INTENT)
  })

  it('rejeita JSON malformado virando UNKNOWN', () => {
    expect(parseIntentFromText('isso não é json')).toEqual(UNKNOWN_INTENT)
  })

  it('tolera cerca de markdown em volta do JSON', () => {
    expect(parseIntentFromText('```json\n{"type":"FOLLOW"}\n```').type).toBe('FOLLOW')
  })

  it('rejeita params inválidos', () => {
    expect(validateIntent({ type: 'COLLECT_BLOCK', params: { block: '', count: 4 } })).toEqual(
      UNKNOWN_INTENT,
    )
  })

  it('rejeita entrada que não é objeto', () => {
    expect(validateIntent('FOLLOW')).toEqual(UNKNOWN_INTENT)
    expect(validateIntent(null)).toEqual(UNKNOWN_INTENT)
  })

  it('aceita PLAY_GAME com papel explícito', () => {
    const intent = validateIntent({
      type: 'PLAY_GAME',
      params: { game: 'esconde_esconde', role: 'bot_esconde' },
    })
    expect(intent).toEqual({
      type: 'PLAY_GAME',
      params: { game: 'esconde_esconde', role: 'bot_esconde' },
    })
  })

  it('aceita PLAY_GAME sem papel — o padrão é resolvido depois', () => {
    const intent = validateIntent({ type: 'PLAY_GAME', params: { game: 'esconde_esconde' } })
    expect(intent.type).toBe('PLAY_GAME')
    expect(intent.type === 'PLAY_GAME' && intent.params.role).toBeUndefined()
  })

  it('rejeita papel fora dos possíveis', () => {
    expect(
      validateIntent({ type: 'PLAY_GAME', params: { game: 'esconde_esconde', role: 'juiz' } }),
    ).toEqual(UNKNOWN_INTENT)
  })

  it('aceita os papéis do pega-pega — a combinação com o jogo é do registro', () => {
    for (const role of ['bot_pega', 'bot_foge']) {
      const intent = validateIntent({ type: 'PLAY_GAME', params: { game: 'pega_pega', role } })
      expect(intent.type, role).toBe('PLAY_GAME')
    }
  })

  it('aceita o convite genérico, que não escolhe jogo nenhum', () => {
    const intent = validateIntent({ type: 'ASK_WHICH_GAME', params: {} })
    expect(intent.type).toBe('ASK_WHICH_GAME')
  })

  it('rejeita PLAY_GAME sem nome de jogo', () => {
    expect(validateIntent({ type: 'PLAY_GAME', params: {} })).toEqual(UNKNOWN_INTENT)
    expect(validateIntent({ type: 'PLAY_GAME', params: { game: '' } })).toEqual(UNKNOWN_INTENT)
  })

  it('aceita a forma de jogo desconhecido — quem recusa é o registro', () => {
    // O schema não pode ser a lista de jogos: jogo novo não deve mudar o
    // contrato entregue à IA. Ver: player_commands_delta.md.
    const intent = validateIntent({ type: 'PLAY_GAME', params: { game: 'poquer' } })
    expect(intent.type).toBe('PLAY_GAME')
  })
})

describe('prompt', () => {
  it('injeta a frase de origem como verdade fixa', () => {
    expect(identityFacts(ctx)).toContain('Seu pai me criou pra jogar com você!')
    expect(identityFacts(ctx)).toContain('NUNCA contradiz')
  })

  it('declara que o bot nunca ataca jogador', () => {
    expect(identityFacts(ctx)).toMatch(/NUNCA ataca outro jogador/)
  })

  it('prompt de conversa carrega a persona e a origem', () => {
    const prompt = buildConversePrompt(ctx)
    expect(prompt).toContain('Você é o Dudu.')
    expect(prompt).toContain('Seu pai me criou')
  })

  /**
   * O prompt de conversa é o ÚNICO lugar onde a IA fica sabendo o que o bot
   * consegue fazer. Intenção nova que não chegue aqui vira capacidade morta —
   * este teste é o que impede isso de passar em silêncio.
   */
  it('o prompt de conversa descreve todas as ações que a IA pode propor', () => {
    const prompt = buildConversePrompt(ctx)
    for (const type of ACTIONABLE_INTENTS) {
      // `ATTACK` é a única executável que a IA NÃO propõe: combate é
      // determinístico e quem resolve é o parser.
      // Ver: player_commands_delta.md → "Catálogo de ações executáveis".
      if (type === 'ATTACK') continue
      expect(prompt, type).toContain(type)
    }
    expect(prompt).not.toContain('BUILD_HOUSE')
  })

  it('o prompt NÃO oferece ATTACK como ação da IA', () => {
    const prompt = buildConversePrompt(ctx)
    expect(prompt).not.toContain('- ATTACK:')
  })

  it('o prompt manda a IA nunca prometer ataque', () => {
    // Era exatamente o bug: sem ação para propor, a IA improvisava "já tô indo
    // te ajudar!" e nada acontecia.
    const prompt = buildConversePrompt(ctx)
    expect(prompt).toMatch(/nunca promete atacar/i)
    expect(prompt).toContain('ataca')
  })

  it('o prompt ensina a não agir quando é só conversa', () => {
    const prompt = buildConversePrompt(ctx)
    expect(prompt).toContain('"action": null')
    expect(prompt).toContain('você gosta de diamante?')
    // Exemplo de pedido que o bot de fato NÃO sabe. Construir casa saiu daqui
    // quando ele aprendeu a construir — promessa desatualizada no prompt é tão
    // ruim quanto no repertório.
    expect(prompt).toContain('faz uma poção pra mim')
  })

  it('o prompt manda uma ação por resposta, nunca duas', () => {
    expect(buildConversePrompt(ctx)).toMatch(/UMA ação por resposta/i)
  })

  it('o prompt não deixa a IA escolher papel de brincadeira', () => {
    // Quem escolhe é a criança, pela pergunta do bot.
    expect(buildConversePrompt(ctx)).toMatch(/NÃO mande "role"/)
  })
})

describe('limpeza da resposta', () => {
  it('remove bloco de raciocínio de modelo thinking', () => {
    expect(cleanReply('<think>hmm deixa eu ver</think>Oi Miguel!')).toBe('Oi Miguel!')
  })

  it('remove markdown e ação entre asteriscos', () => {
    expect(cleanReply('*acena* **Oi** `amigo`')).toBe('Oi amigo')
  })

  it('apara resposta cortada pelo teto de tokens na última frase completa', () => {
    expect(cleanReply('Eu adoro a floresta! E aí uma coisa estranha aconte')).toBe(
      'Eu adoro a floresta!',
    )
  })

  it('mantém a resposta inteira quando ela já termina em pontuação', () => {
    expect(cleanReply('Eu prefiro a noite, é mais divertido.')).toBe(
      'Eu prefiro a noite, é mais divertido.',
    )
  })

  it('devolve o texto como veio quando não há nenhuma frase fechada', () => {
    expect(cleanReply('Oi amigo tudo bem com')).toBe('Oi amigo tudo bem com')
  })
})

describe('resiliência: timeout', () => {
  it('aborta quando o provider passa do tempo', async () => {
    const slow = new FakeProvider('ollama', {
      converse: () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ reply: 'tarde demais', action: null }), 5000),
        ),
    })
    const resilient = new ResilientProvider(slow, {
      timeoutMs: 30,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 1000,
      maxCallsPerMinute: 100,
      queueBehavior: 'repertoire',
    })

    await expect(resilient.converse(ctx)).rejects.toBeInstanceOf(TimeoutError)
  })
})

describe('resiliência: circuit breaker', () => {
  function failing(now: () => number) {
    const provider = new FakeProvider('ollama', {
      converse: () => Promise.reject(new Error('caiu')),
    })
    return new ResilientProvider(provider, {
      timeoutMs: 1000,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 60_000,
      maxCallsPerMinute: 100,
      queueBehavior: 'repertoire',
      now,
    })
  }

  it('abre após 3 falhas seguidas', async () => {
    let now = 0
    const resilient = failing(() => now)

    for (let i = 0; i < 3; i++) {
      await expect(resilient.converse(ctx)).rejects.toThrow()
    }
    expect(resilient.isCircuitOpen).toBe(true)
    await expect(resilient.converse(ctx)).rejects.toBeInstanceOf(CircuitOpenError)
  })

  it('fecha de novo depois do período de recuperação', async () => {
    let now = 0
    const resilient = failing(() => now)
    for (let i = 0; i < 3; i++) await expect(resilient.converse(ctx)).rejects.toThrow()
    expect(resilient.isCircuitOpen).toBe(true)

    now += 60_001
    expect(resilient.isCircuitOpen).toBe(false)
  })

  it('sucesso zera o contador de falhas', async () => {
    let now = 0
    let shouldFail = true
    const provider = new FakeProvider('ollama', {
      converse: () =>
        shouldFail
          ? Promise.reject(new Error('x'))
          : Promise.resolve({ reply: 'ok', action: null }),
    })
    const resilient = new ResilientProvider(provider, {
      timeoutMs: 1000,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 1000,
      maxCallsPerMinute: 100,
      queueBehavior: 'repertoire',
      now: () => now,
    })

    await expect(resilient.converse(ctx)).rejects.toThrow()
    await expect(resilient.converse(ctx)).rejects.toThrow()
    shouldFail = false
    expect((await resilient.converse(ctx)).reply).toBe('ok')
    shouldFail = true
    await expect(resilient.converse(ctx)).rejects.toThrow()
    expect(resilient.isCircuitOpen).toBe(false)
  })
})

describe('resiliência: uma inferência por vez', () => {
  it('recusa a segunda chamada concorrente', async () => {
    let release: (v: ReplyWithAction) => void = () => {}
    const provider = new FakeProvider('ollama', {
      converse: () => new Promise<ReplyWithAction>((resolve) => (release = resolve)),
    })
    const resilient = new ResilientProvider(provider, {
      timeoutMs: 5000,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 1000,
      maxCallsPerMinute: 100,
      queueBehavior: 'repertoire',
    })

    const first = resilient.converse(ctx)
    expect(resilient.busy).toBe(true)
    await expect(resilient.converse(ctx)).rejects.toBeInstanceOf(BusyError)

    release({ reply: 'pronto', action: null })
    expect((await first).reply).toBe('pronto')
    // Só a primeira chegou ao provider: nunca duas gerações em paralelo.
    expect(provider.calls).toBe(1)
  })
})

describe('resiliência: rate limit', () => {
  it('barra além do limite por minuto', async () => {
    const provider = new FakeProvider('ollama')
    const resilient = new ResilientProvider(provider, {
      timeoutMs: 1000,
      circuitBreakerThreshold: 99,
      circuitBreakerResetMs: 1000,
      maxCallsPerMinute: 2,
      queueBehavior: 'repertoire',
      now: () => 0,
    })

    await resilient.converse(ctx)
    await resilient.converse(ctx)
    await expect(resilient.converse(ctx)).rejects.toThrow(/limite de chamadas/)
  })
})

describe('AiLayer: provider none', () => {
  const layer = new AiLayer({ llm: { ...llm, provider: 'none' }, secrets: {} })

  it('desativa o nível 3', () => {
    expect(layer.enabled).toBe(false)
  })

  it('converse devolve null sem quebrar', async () => {
    expect(await layer.converse(ctx)).toBeNull()
  })

  it('warmUp não faz nada', async () => {
    expect(await layer.warmUp()).toBeNull()
  })
})

describe('AiLayer: fallback entre providers', () => {
  it('desligado por padrão', () => {
    const layer = new AiLayer({ llm, secrets: {} })
    expect(layer.fallback).toBeNull()
    expect(layer.leaksToCloudOnFallback).toBe(false)
  })

  it('sinaliza vazamento para nuvem quando local tem reserva de nuvem', () => {
    const layer = new AiLayer({
      llm: { ...llm, provider: 'ollama', fallbackProvider: 'gemini' },
      secrets: { geminiApiKey: 'k' },
    })
    expect(layer.fallback).not.toBeNull()
    expect(layer.leaksToCloudOnFallback).toBe(true)
  })
})

describe('AiLayer: isolamento de falhas', () => {
  it('converse devolve null em vez de propagar erro', async () => {
    const layer = new AiLayer({ llm, secrets: {} })
    // Substitui o provider interno por um que sempre falha.
    vi.spyOn(layer.primary, 'converse').mockRejectedValue(new Error('caiu'))
    expect(await layer.converse(ctx)).toBeNull()
  })

  it('resposta vazia conta como falha', async () => {
    const layer = new AiLayer({ llm, secrets: {} })
    vi.spyOn(layer.primary, 'converse').mockResolvedValue({ reply: '   ', action: null })
    expect(await layer.converse(ctx)).toBeNull()
  })

  it('warmUp falhando devolve erro acionável sem lançar', async () => {
    const layer = new AiLayer({ llm, secrets: {} })
    vi.spyOn(layer.primary, 'warmUp').mockRejectedValue(
      new ProviderError('Ollama inacessível', 'ollama', "rode 'ollama serve'"),
    )
    const err = await layer.warmUp()
    expect(err).toBeInstanceOf(ProviderError)
    expect(err!.toActionableMessage()).toContain("rode 'ollama serve'")
  })
})

describe('suíte de conformidade: mesmos casos nos dois providers', () => {
  // Roda o MESMO conjunto de expectativas contra cada implementação, atrás da
  // interface. É o que garante que trocar de provider não muda comportamento.
  for (const name of ['ollama', 'gemini'] as const) {
    describe(name, () => {
      const layer = () =>
        new AiLayer({ llm: { ...llm, provider: name }, secrets: { geminiApiKey: 'k' } })

      it('expõe o nome correto', () => {
        expect(layer().primary.name).toBe(name)
      })

      it('está habilitado', () => {
        expect(layer().enabled).toBe(true)
      })

      it('ação fora do catálogo é descartada, mas a fala sobrevive', async () => {
        const l = layer()
        vi.spyOn(l.primary, 'converse').mockResolvedValue(
          validateReplyWithAction({
            reply: 'Essa eu não sei fazer!',
            action: { type: 'BUILD_HOUSE', params: {} },
          }),
        )
        const result = await l.converse(ctx)
        expect(result?.value.action).toBeNull()
        expect(result?.value.reply).toBe('Essa eu não sei fazer!')
      })

      it('falha do provider não propaga', async () => {
        const l = layer()
        vi.spyOn(l.primary, 'converse').mockRejectedValue(new Error('rede caiu'))
        expect(await l.converse(ctx)).toBeNull()
      })
    })
  }
})

describe('timeout por provider', () => {
  it('ollama usa 12s e gemini 5s por padrão', () => {
    expect(llm.ollama.timeoutMs).toBe(12_000)
    expect(llm.gemini.timeoutMs).toBe(5_000)
  })

  it('wrapWithResilience escolhe o timeout do provider certo', async () => {
    const slow = new FakeProvider('ollama', {
      converse: () => new Promise((r) => setTimeout(() => r('x'), 200)),
    })
    const fast = wrapWithResilience(slow, { ...llm, ollama: { ...llm.ollama, timeoutMs: 20 } })
    await expect(fast.converse(ctx)).rejects.toBeInstanceOf(TimeoutError)
  })
})

describe('encapsulamento do provider', () => {
  it('nada fora de src/ai/providers menciona Ollama ou Gemini', () => {
    const offenders: string[] = []

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          if (full.includes(join('ai', 'providers'))) continue
          walk(full)
          continue
        }
        if (!entry.endsWith('.ts')) continue
        const content = readFileSync(full, 'utf8')
        // Só o acoplamento de implementação conta: import da lib ou uso da
        // classe concreta. Menção em comentário ou string de config é legítima.
        if (
          /from ['"]ollama['"]|from ['"]@google\/genai['"]|new OllamaProvider|new GeminiProvider/.test(
            content,
          )
        ) {
          offenders.push(full)
        }
      }
    }
    walk('src')

    // src/ai/index.ts é a fábrica — é o único ponto autorizado a instanciar.
    expect(offenders.filter((f) => !f.endsWith(join('ai', 'index.ts')))).toEqual([])
  })
})
