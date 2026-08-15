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
      value: 'Acho que sim! O universo é grandão.',
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
          setTimeout(() => resolve({ value: 'demorei', provider: 'ollama', latencyMs: 100 }), 80),
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
      value: 'rapidinho',
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

describe('interpretação de pedido livre', () => {
  it('devolve a intenção validada', async () => {
    const { router, ai } = build()
    vi.spyOn(ai, 'interpret').mockResolvedValue({
      value: { type: 'COLLECT_BLOCK', params: { block: 'oak_log', count: 4 } },
      provider: 'ollama',
      latencyMs: 500,
    })

    const intent = await router.interpret('pega umas madeiras pra mim', snapshot)
    expect(intent?.type).toBe('COLLECT_BLOCK')
  })

  it('UNKNOWN vira null — nenhuma ação de mundo acontece', async () => {
    const { router, ai } = build()
    vi.spyOn(ai, 'interpret').mockResolvedValue({
      value: { type: 'UNKNOWN', params: {} },
      provider: 'ollama',
      latencyMs: 500,
    })

    expect(await router.interpret('constrói uma casa', snapshot)).toBeNull()
  })

  it('sem IA não interpreta nada', async () => {
    const { router } = build({ llmProvider: 'none' })
    expect(await router.interpret('pega madeira', snapshot)).toBeNull()
  })
})
