import { describe, it, expect, vi } from 'vitest'
import { MessageRouter } from '../src/behaviors/router.js'
import { Repertoire } from '../src/dialogue/repertoire.js'
import { loadCatalog, defaultCatalogPath } from '../src/dialogue/loader.js'
import { AiLayer } from '../src/ai/index.js'
import { dialogueSchema, personaSchema, llmSchema } from '../src/config/schema.js'
import type { WorldSnapshot } from '../src/domain/types.js'

const catalog = loadCatalog(defaultCatalogPath()).catalog
const dialogue = dialogueSchema.parse({})
const persona = personaSchema.parse({})
const llm = llmSchema.parse({})

const snapshot: WorldSnapshot = {
  position: { x: 0, y: 64, z: 0 },
  health: 20,
  food: 20,
  timeOfDay: 'dia',
  isNight: false,
  inventory: [],
  ownerVisible: true,
  ownerPosition: { x: 2, y: 64, z: 0 },
  ownerHealth: 20,
  nearbyEntities: [],
  dimension: 'overworld',
  state: 'IDLE',
}

function build(over: { llmProvider?: 'ollama' | 'none' } = {}) {
  const repertoire = new Repertoire({ catalog, dialogue, persona, owner: 'Miguel' })
  const ai = new AiLayer({
    llm: { ...llm, provider: over.llmProvider ?? 'ollama' },
    secrets: {},
  })
  const fillers: string[] = []
  const router = new MessageRouter({
    repertoire,
    ai,
    persona,
    owner: 'Miguel',
    onFiller: (t) => fillers.push(t),
    fillerAfterMs: 20,
    history: () => [],
  })
  return { router, ai, repertoire, fillers }
}

describe('cascata: nível 1 (comando) tem precedência', () => {
  it('comando resolve sem consultar repertório nem IA', async () => {
    const { router, ai, repertoire } = build()
    const aiSpy = vi.spyOn(ai, 'converse')
    const repSpy = vi.spyOn(repertoire, 'respond')

    const result = await router.route('dudu, me segue', snapshot)

    expect(result.source).toBe('command')
    expect(result.intent?.type).toBe('FOLLOW')
    expect(result.reply).toBeNull()
    expect(repSpy).not.toHaveBeenCalled()
    expect(aiSpy).not.toHaveBeenCalled()
  })
})

describe('cascata: nível 2 (repertório) resolve sem IA', () => {
  it('saudação nunca chega ao provider', async () => {
    const { router, ai } = build()
    const aiSpy = vi.spyOn(ai, 'converse')

    const result = await router.route('dudu, oi', snapshot)

    expect(result.source).toBe('repertoire')
    expect(result.entryId).toBe('saudacao')
    expect(result.reply).toBeTruthy()
    expect(aiSpy).not.toHaveBeenCalled()
  })

  it('pergunta de origem nunca chega ao provider', async () => {
    const { router, ai } = build()
    const aiSpy = vi.spyOn(ai, 'converse')

    const result = await router.route('quem te criou?', snapshot)

    expect(result.entryId).toBe('origem')
    expect(result.reply!.toLowerCase()).toContain('pai')
    expect(aiSpy).not.toHaveBeenCalled()
  })

  it('pergunta de capacidades nunca chega ao provider', async () => {
    const { router, ai } = build()
    const aiSpy = vi.spyOn(ai, 'converse')

    const result = await router.route('o que você sabe fazer?', snapshot)

    expect(result.entryId).toBe('capacidades')
    expect(aiSpy).not.toHaveBeenCalled()
  })

  it('responde em menos de 100 ms', async () => {
    const { router } = build()
    const started = Date.now()
    await router.route('dudu, oi', snapshot)
    expect(Date.now() - started).toBeLessThan(100)
  })
})

describe('cascata: nível 3 (IA) só recebe o que sobrou', () => {
  it('pergunta aberta desce para a IA', async () => {
    const { router, ai } = build()
    vi.spyOn(ai, 'converse').mockResolvedValue({
      value: { reply: 'Acho que sim! O universo é grandão.', action: null },
      provider: 'ollama',
      latencyMs: 900,
    })

    const result = await router.route('você acha que existe vida em outro planeta?', snapshot)

    expect(result.source).toBe('llm')
    expect(result.provider).toBe('ollama')
    expect(result.reply).toContain('universo')
  })

  it('IA falhando cai no repertório, não quebra', async () => {
    const { router, ai } = build()
    vi.spyOn(ai, 'converse').mockResolvedValue(null)

    const result = await router.route('você acha que existe vida em outro planeta?', snapshot)

    expect(result.source).toBe('repertoire')
    expect(result.entryId).toBe('nao_entendi')
    expect(result.reply).toBeTruthy()
  })

  it('provider none desativa o nível 3 sem quebrar nada', async () => {
    const { router, ai } = build({ llmProvider: 'none' })
    const aiSpy = vi.spyOn(ai, 'converse')

    const result = await router.route('você acha que existe vida em outro planeta?', snapshot)

    expect(result.entryId).toBe('nao_entendi')
    expect(aiSpy).not.toHaveBeenCalled()
  })

  it('com provider none os comandos continuam funcionando', async () => {
    const { router } = build({ llmProvider: 'none' })
    expect((await router.route('dudu, me segue', snapshot)).intent?.type).toBe('FOLLOW')
  })

  it('com provider none o repertório continua conversando', async () => {
    const { router } = build({ llmProvider: 'none' })
    for (const text of ['oi', 'quem te criou?', 'o que você sabe fazer?']) {
      const result = await router.route(text, snapshot)
      expect(result.source, text).toBe('repertoire')
      expect(result.entryId, text).not.toBe('nao_entendi')
    }
  })
})

describe('fala de espera', () => {
  it('dispara quando a IA demora', async () => {
    const { router, ai, fillers } = build()
    vi.spyOn(ai, 'converse').mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                value: { reply: 'demorei', action: null },
                provider: 'ollama',
                latencyMs: 100,
              }),
            80,
          ),
        ),
    )

    const result = await router.route('me explica o universo inteiro', snapshot)

    expect(fillers).toHaveLength(1)
    expect(fillers[0]).toBeTruthy()
    expect(result.reply).toBe('demorei')
  })

  it('não dispara quando a IA responde rápido', async () => {
    const { router, ai, fillers } = build()
    vi.spyOn(ai, 'converse').mockResolvedValue({
      value: { reply: 'rapidinho', action: null },
      provider: 'ollama',
      latencyMs: 5,
    })

    await router.route('me explica o universo inteiro', snapshot)
    expect(fillers).toHaveLength(0)
  })

  it('não dispara para mensagem resolvida localmente', async () => {
    const { router, fillers } = build()
    await router.route('oi', snapshot)
    expect(fillers).toHaveLength(0)
  })
})

describe('ação junto com a fala', () => {
  it('a IA propõe ação e ela chega no resultado, junto da fala', async () => {
    const { router, ai } = build()
    vi.spyOn(ai, 'converse').mockResolvedValue({
      value: {
        reply: 'Já vou pegar!',
        action: { type: 'COLLECT_BLOCK', params: { block: 'oak_log', count: 4 } },
      },
      provider: 'ollama',
      latencyMs: 500,
    })

    const result = await router.route('será que dava pra juntar umas madeirinhas?', snapshot)

    expect(result.source).toBe('llm')
    expect(result.reply).toBe('Já vou pegar!')
    expect(result.action?.type).toBe('COLLECT_BLOCK')
  })

  it('conversa pura não traz ação', async () => {
    const { router, ai } = build()
    vi.spyOn(ai, 'converse').mockResolvedValue({
      value: { reply: 'Adoro! Brilha muito!', action: null },
      provider: 'ollama',
      latencyMs: 500,
    })

    const result = await router.route('você gosta de diamante?', snapshot)

    expect(result.reply).toBe('Adoro! Brilha muito!')
    expect(result.action).toBeNull()
  })

  it('níveis 1 e 2 nunca trazem ação de IA', async () => {
    const { router } = build()
    expect((await router.route('dudu, me segue', snapshot)).action).toBeNull()
    expect((await router.route('dudu, oi', snapshot)).action).toBeNull()
  })

  it('sem IA, nada vira ação — o repertório responde sozinho', async () => {
    const { router } = build({ llmProvider: 'none' })

    // Pedido que o parser cobre: vira ação de verdade, sem passar pela IA.
    const coberto = await router.route('pega madeira pra mim', snapshot)
    expect(coberto.source).toBe('command')
    expect(coberto.intent?.type).toBe('COLLECT_BLOCK')
    // `action` é o campo da IA — o comando do nível 1 não usa esse caminho.
    expect(coberto.action).toBeNull()

    // Pedido que ninguém cobre: cai no `nao_entendi`, e mesmo assim sem ação.
    const solto = await router.route('será que dava pra juntar umas madeirinhas?', snapshot)
    expect(solto.entryId).toBe('nao_entendi')
    expect(solto.action).toBeNull()
  })
})
