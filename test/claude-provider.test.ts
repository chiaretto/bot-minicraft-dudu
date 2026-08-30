import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ConversationContext } from '../src/ai/provider.js'

/**
 * Dublê do Agent SDK.
 *
 * Guarda as opções de cada sessão para os testes de escopo mínimo poderem
 * afirmar sobre elas — é o único jeito de provar que o harness ficou desligado
 * sem subir um subprocesso de verdade.
 */
const sessions: Array<{ options: Record<string, unknown>; prompts: string[]; closed: boolean }> = []

/** O que a próxima sessão vai responder. Cada item é um turno. */
let respostas: Array<Record<string, unknown> | Error> = []

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ prompt, options }: { prompt: AsyncIterable<unknown>; options: Record<string, unknown> }) => {
    const session = { options, prompts: [] as string[], closed: false }
    sessions.push(session)

    const input = prompt[Symbol.asyncIterator]()

    return {
      async next() {
        const incoming = await input.next()
        if (incoming.done) {
          session.closed = true
          return { done: true, value: undefined }
        }
        const msg = incoming.value as { message: { content: string } }
        session.prompts.push(msg.message.content)

        // Fila compartilhada entre sessões: uma sessão nova depois de uma queda
        // precisa pegar a resposta SEGUINTE, não repetir a que derrubou.
        const resposta = respostas.shift() ?? { subtype: 'success', is_error: false, result: '{}' }
        if (resposta instanceof Error) throw resposta
        return { done: false, value: { type: 'result', ...resposta } }
      },
      async return() {
        session.closed = true
        return { done: true, value: undefined }
      },
    }
  },
}))

const { ClaudeProvider } = await import('../src/ai/providers/claude.js')

const ctx: ConversationContext = {
  message: 'pega umas madeiras',
  owner: 'Miguel',
  botName: 'Odraude',
  originStory: 'Nasci de um bloco de terra.',
  personaDescription: 'Você é o Odraude, um amigo animado.',
  snapshot: null,
  history: [],
}

const opcoes = { model: 'claude-haiku-4-5', sessionMaxAgeMs: 60_000, sessionMaxTurns: 10 }

const sucesso = (structured: unknown, texto = '') => ({
  subtype: 'success',
  is_error: false,
  result: texto,
  structured_output: structured,
})

beforeEach(() => {
  sessions.length = 0
  respostas = []
})

describe('escopo mínimo do harness', () => {
  it('não oferece nenhuma ferramenta ao modelo', async () => {
    respostas = [sucesso({ reply: 'Já vou!', action: null })]
    const p = new ClaudeProvider(opcoes)
    await p.converse(ctx)

    // `tools: []` é o que desliga; `allowedTools` seria a lista de
    // auto-aprovação e deixaria a ferramenta no contexto.
    expect(sessions[0]!.options.tools).toEqual([])
  })

  it('não lê configuração nenhuma do disco', async () => {
    respostas = [sucesso({ reply: 'oi', action: null })]
    await new ClaudeProvider(opcoes).converse(ctx)

    // Vazio é o que garante o CLAUDE.md do projeto fora do prompt: a doc do SDK
    // diz que 'project' é obrigatório para carregá-lo.
    expect(sessions[0]!.options.settingSources).toEqual([])
    expect(sessions[0]!.options.mcpServers).toEqual({})
  })

  it('usa o prompt do bot, não o preset de agente de código', async () => {
    respostas = [sucesso({ reply: 'oi', action: null })]
    await new ClaudeProvider(opcoes).converse(ctx)

    const prompt = sessions[0]!.options.systemPrompt
    expect(typeof prompt).toBe('string')
    expect(prompt).toContain('Odraude')
    expect(prompt).toContain('criança de 7 anos')
    expect(prompt).not.toMatchObject({ type: 'preset' })
  })

  it('desliga raciocínio e limita o turno', async () => {
    respostas = [sucesso({ reply: 'oi', action: null })]
    await new ClaudeProvider(opcoes).converse(ctx)

    expect(sessions[0]!.options.thinking).toEqual({ type: 'disabled' })
    // Dois porque o SDK conta a fala do jogador e a resposta do bot como
    // turnos separados; com 1 a chamada estoura em `error_max_turns`.
    expect(sessions[0]!.options.maxTurns).toBe(2)
  })

  it('pede o mesmo formato de resposta dos outros providers', async () => {
    respostas = [sucesso({ reply: 'oi', action: null })]
    await new ClaudeProvider(opcoes).converse(ctx)

    const format = sessions[0]!.options.outputFormat as { type: string; schema: unknown }
    expect(format.type).toBe('json_schema')
    expect(format.schema).toMatchObject({ properties: { reply: { type: 'string' } } })
  })

  it('usa o modelo da configuração', async () => {
    respostas = [sucesso({ reply: 'oi', action: null })]
    await new ClaudeProvider({ ...opcoes, model: 'claude-sonnet-5' }).converse(ctx)
    expect(sessions[0]!.options.model).toBe('claude-sonnet-5')
  })
})

describe('sessão viva', () => {
  it('o aquecimento sobe a sessão antes da primeira fala', async () => {
    respostas = [sucesso({ reply: 'oi', action: null })]
    const p = new ClaudeProvider(opcoes)
    await p.warmUp(ctx)

    // Não basta criar a sessão: `query()` é preguiçoso e só sobe o processo na
    // primeira mensagem. Por isso o aquecimento manda uma fala de mentira.
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.prompts).toHaveLength(1)
  })

  it('a primeira fala da criança REUSA a sessão aquecida', async () => {
    // Era o bug que a medição revelou: a sessão aquecida tinha prompt genérico
    // e era descartada, então a criança pagava a subida do processo mesmo assim.
    respostas = [sucesso({ reply: 'oi', action: null }), sucesso({ reply: 'Tô indo!', action: null })]
    const p = new ClaudeProvider(opcoes)

    await p.warmUp(ctx)
    const r = await p.converse(ctx)

    expect(sessions).toHaveLength(1)
    expect(r.reply).toBe('Tô indo!')
  })

  it('a sessão aquecida já tem a persona, não um prompt genérico', async () => {
    respostas = [sucesso({ reply: 'oi', action: null })]
    await new ClaudeProvider(opcoes).warmUp(ctx)

    const prompt = sessions[0]!.options.systemPrompt as string
    expect(prompt).toContain('Odraude')
    expect(prompt).toContain('criança de 7 anos')
    expect(prompt).toContain('COLLECT_BLOCK')
  })

  it('sem identidade o aquecimento não faz nada', async () => {
    const p = new ClaudeProvider(opcoes)
    await p.warmUp()
    expect(sessions).toHaveLength(0)
  })

  it('falas seguidas não sobem processo novo', async () => {
    respostas = [sucesso({ reply: 'um', action: null }), sucesso({ reply: 'dois', action: null })]
    const p = new ClaudeProvider(opcoes)

    await p.converse(ctx)
    await p.converse(ctx)

    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.prompts).toHaveLength(2)
  })

  it('recicla a sessão depois do limite de falas', async () => {
    respostas = [sucesso({ reply: 'a', action: null }), sucesso({ reply: 'b', action: null })]
    const p = new ClaudeProvider({ ...opcoes, sessionMaxTurns: 1 })

    await p.converse(ctx)
    await p.converse(ctx)

    expect(sessions).toHaveLength(2)
    expect(sessions[0]!.closed).toBe(true)
  })

  it('recicla a sessão depois do limite de idade', async () => {
    respostas = [sucesso({ reply: 'a', action: null }), sucesso({ reply: 'b', action: null })]
    const p = new ClaudeProvider({ ...opcoes, sessionMaxAgeMs: 1 })

    await p.converse(ctx)
    await new Promise((r) => setTimeout(r, 5))
    await p.converse(ctx)

    expect(sessions).toHaveLength(2)
  })

  it('sessão morta é resubida sozinha e a fala é atendida', async () => {
    respostas = [new Error('sessão encerrada'), sucesso({ reply: 'Voltei!', action: null })]
    const p = new ClaudeProvider(opcoes)

    const r = await p.converse(ctx)

    expect(r.reply).toBe('Voltei!')
    expect(sessions).toHaveLength(2)
  })

  it('falha persistente vira erro do provider, para a cascata cair no repertório', async () => {
    respostas = [new Error('boom'), new Error('boom')]
    const p = new ClaudeProvider(opcoes)

    await expect(p.converse(ctx)).rejects.toMatchObject({ provider: 'claude' })
  })

  it('encerrar o bot fecha a sessão, sem subprocesso órfão', async () => {
    respostas = [sucesso({ reply: 'oi', action: null })]
    const p = new ClaudeProvider(opcoes)
    await p.warmUp(ctx)
    p.stop()
    expect(sessions[0]!.closed).toBe(true)
  })
})

describe('fala e ação', () => {
  it('resposta estruturada vira fala e ação', async () => {
    respostas = [
      sucesso({
        reply: 'Já vou pegar!',
        action: { type: 'COLLECT_BLOCK', params: { block: 'madeira', count: 4 } },
      }),
    ]
    const r = await new ClaudeProvider(opcoes).converse(ctx)

    expect(r.reply).toBe('Já vou pegar!')
    expect(r.action).toMatchObject({ type: 'COLLECT_BLOCK' })
  })

  it('sem resposta estruturada, o texto é lido pelo parser tolerante', async () => {
    respostas = [sucesso(undefined, '{"reply":"Deixa comigo!","action":null}')]
    const r = await new ClaudeProvider(opcoes).converse(ctx)

    expect(r.reply).toBe('Deixa comigo!')
    expect(r.action).toBeNull()
  })

  it('texto que não é JSON vira fala pura, sem ação e sem erro', async () => {
    respostas = [sucesso(undefined, 'Oi! Tudo bem?')]
    const r = await new ClaudeProvider(opcoes).converse(ctx)

    expect(r.reply).toBe('Oi! Tudo bem?')
    expect(r.action).toBeNull()
  })

  it('limpa markdown, como os outros providers', async () => {
    respostas = [sucesso({ reply: 'Vou **correndo** te achar!', action: null })]
    const r = await new ClaudeProvider(opcoes).converse(ctx)
    expect(r.reply).not.toContain('*')
  })
})

describe('a credencial nunca aparece', () => {
  it('token no erro do SDK é redigido', async () => {
    const token = `sk-ant-oat01-${'x'.repeat(60)}`
    respostas = [new Error(`auth failed for ${token}`), new Error(`auth failed for ${token}`)]

    await new ClaudeProvider(opcoes)
      .converse(ctx)
      .then(() => expect.fail('deveria ter falhado'))
      .catch((err: Error) => {
        expect(err.message).not.toContain(token)
      })
  })

  it('erro de credencial diz o comando que resolve', async () => {
    respostas = [new Error('401 unauthorized'), new Error('401 unauthorized')]

    await new ClaudeProvider(opcoes)
      .converse(ctx)
      .then(() => expect.fail('deveria ter falhado'))
      .catch((err: { hint?: string }) => {
        expect(err.hint).toContain('claude setup-token')
      })
  })

  it('cota esgotada explica que a assinatura é compartilhada', async () => {
    respostas = [new Error('usage limit reached'), new Error('usage limit reached')]

    await new ClaudeProvider(opcoes)
      .converse(ctx)
      .then(() => expect.fail('deveria ter falhado'))
      .catch((err: { message: string; hint?: string }) => {
        expect(err.message).toContain('cota')
        expect(err.hint).toContain('assinatura')
      })
  })
})
