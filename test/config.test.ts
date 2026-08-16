import { describe, it, expect } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { readFileSync } from 'node:fs'
import {
  parseConfig,
  ConfigError,
  readSecrets,
  assertSecretsForProvider,
} from '../src/config/load.js'
import { REDACT_PATHS, scrubSecrets } from '../src/logging/logger.js'
import { FORBIDDEN_YAML_KEYS } from '../src/config/schema.js'

const minimal = { ownerPlayer: 'Miguel', server: { version: '1.21.4' } }

describe('config: jogador dono', () => {
  it('carrega o dono configurado', () => {
    const config = parseConfig(minimal)
    expect(config.ownerPlayer).toBe('Miguel')
  })

  it('recusa iniciar sem ownerPlayer', () => {
    expect(() => parseConfig({ server: { version: '1.21.4' } })).toThrow(ConfigError)
    expect(() => parseConfig({ server: { version: '1.21.4' } })).toThrow(
      /ownerPlayer é obrigatório/,
    )
  })

  it('recusa ownerPlayer vazio', () => {
    expect(() => parseConfig({ ...minimal, ownerPlayer: '' })).toThrow(/ownerPlayer é obrigatório/)
  })
})

describe('config: servidor', () => {
  it('aplica host e porta padrão', () => {
    const config = parseConfig(minimal)
    expect(config.server.host).toBe('localhost')
    expect(config.server.port).toBe(25565)
  })

  it('exige a versão do servidor', () => {
    expect(() => parseConfig({ ownerPlayer: 'Miguel', server: {} })).toThrow(ConfigError)
  })

  it('respeita host e porta customizados', () => {
    const config = parseConfig({
      ...minimal,
      server: { version: '1.21.4', host: '192.168.0.10', port: 25566 },
    })
    expect(config.server.host).toBe('192.168.0.10')
    expect(config.server.port).toBe(25566)
  })
})

describe('config: persona', () => {
  it('usa a persona padrão quando ausente e mantém a frase de origem', () => {
    const config = parseConfig(minimal)
    expect(config.persona.name).toBe('Dudu')
    expect(config.persona.originStory).toBe('Seu pai me criou pra jogar com você!')
  })

  it('aceita persona customizada', () => {
    const config = parseConfig({
      ...minimal,
      persona: { name: 'Bolinha', description: 'Um amigo calmo', originStory: 'Nasci do código.' },
    })
    expect(config.persona.name).toBe('Bolinha')
    expect(config.persona.originStory).toBe('Nasci do código.')
  })
})

describe('config: segredos', () => {
  it('recusa segredo colocado no YAML', () => {
    expect(() => parseConfig({ ...minimal, geminiApiKey: 'abc123' })).toThrow(
      /segredos não são permitidos em config.yaml/,
    )
  })

  it('detecta segredo aninhado no YAML', () => {
    expect(() => parseConfig({ ...minimal, llm: { gemini: { apiKey: 'abc123' } } })).toThrow(
      /segredos não são permitidos/,
    )
  })

  it('lê segredos do ambiente', () => {
    const secrets = readSecrets({ GEMINI_API_KEY: 'k-123', MINECRAFT_PASSWORD: 'p-456' })
    expect(secrets.geminiApiKey).toBe('k-123')
    expect(secrets.minecraftPassword).toBe('p-456')
  })

  it('provider local não exige chave nenhuma', () => {
    const config = parseConfig({ ...minimal, llm: { provider: 'ollama' } }, {})
    expect(config.llm.provider).toBe('ollama')
  })

  it('provider gemini sem chave recusa iniciar', () => {
    expect(() => parseConfig({ ...minimal, llm: { provider: 'gemini' } }, {})).toThrow(
      /GEMINI_API_KEY/,
    )
  })

  it('provider gemini com chave inicia', () => {
    const config = parseConfig({ ...minimal, llm: { provider: 'gemini' } }, { geminiApiKey: 'k' })
    expect(config.llm.provider).toBe('gemini')
  })

  it('fallback gemini também exige a chave', () => {
    const config = parseConfig(
      { ...minimal, llm: { provider: 'ollama', fallbackProvider: 'gemini' } },
      { geminiApiKey: 'k' },
    )
    expect(() => assertSecretsForProvider(config, {})).toThrow(/GEMINI_API_KEY/)
  })
})

describe('config: padrões dos blocos novos', () => {
  it('aplica os padrões de llm, defense, dialogue e memory', () => {
    const c = parseConfig(minimal)
    expect(c.llm.provider).toBe('ollama')
    expect(c.llm.ollama.model).toBe('qwen3:4b')
    expect(c.llm.ollama.timeoutMs).toBe(12_000)
    expect(c.llm.gemini.timeoutMs).toBe(5_000)
    expect(c.llm.fallbackProvider).toBeNull()
    expect(c.llm.warmUpOnStart).toBe(true)
    expect(c.llm.fillerAfterMs).toBe(2_000)
    expect(c.llm.queueBehavior).toBe('repertoire')

    expect(c.defense.enabled).toBe(true)
    expect(c.defense.protectRadius).toBe(16)
    expect(c.defense.criticalHealth).toBe(6)
    expect(c.defense.engagementTimeoutMs).toBe(30_000)
    expect(c.defense.maxSimultaneousTargets).toBe(3)

    expect(c.dialogue.enabled).toBe(true)
    expect(c.dialogue.minConfidence).toBe(0.7)
    expect(c.dialogue.catalogPath).toBe('data/repertoire.yaml')
    expect(c.dialogue.spontaneous).toBe(true)
    expect(c.dialogue.spontaneousCooldownMs).toBe(60_000)

    expect(c.memory.dir).toBe('data/conversations')
    expect(c.memory.shortTermWindow).toBe(10)
    expect(c.memory.retentionDays).toBeNull()
    expect(c.memory.resumeToday).toBe(true)
  })

  it('recusa provider desconhecido listando os suportados', () => {
    expect(() => parseConfig({ ...minimal, llm: { provider: 'chatgpt' } })).toThrow(ConfigError)
  })
})

describe('config: jogos', () => {
  it('aplica os defaults quando o bloco está ausente', () => {
    const c = parseConfig(minimal)
    expect(c.games.enabled).toBe(true)
    expect(c.games.hideAndSeek.countTo).toBe(20)
    expect(c.games.hideAndSeek.fakeSearches).toBe(2)
    expect(c.games.hideAndSeek.touchDistance).toBe(2)
    expect(c.games.hideAndSeek.roundTimeoutMs).toBe(180_000)
    expect(c.games.hideAndSeek.hideSearchMs).toBe(20_000)
  })

  it('conta até 20, e a contagem leva 20 segundos', () => {
    const { countTo, countIntervalMs, hideSearchMs } = parseConfig(minimal).games.hideAndSeek
    expect(countTo).toBe(20)
    expect(countTo * countIntervalMs).toBe(20_000)
    // Os dois lados da brincadeira têm a mesma folga para se esconder.
    expect(countTo * countIntervalMs).toBe(hideSearchMs)
  })

  it('permite ajustar o tempo de busca por esconderijo', () => {
    const c = parseConfig({ ...minimal, games: { hideAndSeek: { hideSearchMs: 45_000 } } })
    expect(c.games.hideAndSeek.hideSearchMs).toBe(45_000)
    expect(() => parseConfig({ ...minimal, games: { hideAndSeek: { hideSearchMs: 0 } } })).toThrow(
      ConfigError,
    )
  })

  it('permite desligar os jogos', () => {
    const c = parseConfig({ ...minimal, games: { enabled: false } })
    expect(c.games.enabled).toBe(false)
    // Mesmo desligado, os parâmetros continuam válidos e com default.
    expect(c.games.hideAndSeek.countTo).toBe(20)
  })

  it('recusa faixa de distância invertida apontando o campo', () => {
    const raw = { ...minimal, games: { hideAndSeek: { hideMinDistance: 40, hideMaxDistance: 20 } } }
    expect(() => parseConfig(raw)).toThrow(ConfigError)
    expect(() => parseConfig(raw)).toThrow(/hideMinDistance/)
  })

  it('recusa busca falsa mais perto que a distância de toque', () => {
    const raw = {
      ...minimal,
      games: { hideAndSeek: { touchDistance: 10, fakeSearchMinDistanceFromOwner: 3 } },
    }
    expect(() => parseConfig(raw)).toThrow(ConfigError)
    expect(() => parseConfig(raw)).toThrow(/fakeSearchMinDistanceFromOwner/)
  })

  it('recusa valores fora de faixa', () => {
    for (const hideAndSeek of [
      { fakeSearches: -1 },
      { countTo: 0 },
      { roundTimeoutMs: 0 },
      { seeDistance: -5 },
      { hideCandidateSamples: 0 },
    ]) {
      expect(
        () => parseConfig({ ...minimal, games: { hideAndSeek } }),
        JSON.stringify(hideAndSeek),
      ).toThrow(ConfigError)
    }
  })

  it('aceita zero buscas falsas — desliga o teatro sem quebrar o jogo', () => {
    const c = parseConfig({ ...minimal, games: { hideAndSeek: { fakeSearches: 0 } } })
    expect(c.games.hideAndSeek.fakeSearches).toBe(0)
  })

  it('não introduz nenhuma chave de segredo', () => {
    const c = parseConfig({ ...minimal, games: { enabled: true } })
    for (const key of Object.keys(c.games.hideAndSeek)) {
      expect(FORBIDDEN_YAML_KEYS as readonly string[]).not.toContain(key)
    }
  })
})

describe('config.example.yaml', () => {
  it('é um YAML válido que passa no schema', () => {
    const raw = parseYaml(readFileSync('config.example.yaml', 'utf8'))
    const config = parseConfig(raw)
    expect(config.ownerPlayer).toBe('Miguel')
    expect(config.persona.name).toBe('Dudu')
    // O bot e o dono são pessoas diferentes — conferido para não regredir.
    expect(config.persona.name).not.toBe(config.ownerPlayer)
  })
})

describe('logging: redaction', () => {
  it('cobre os caminhos de segredo conhecidos', () => {
    expect(REDACT_PATHS).toContain('geminiApiKey')
    expect(REDACT_PATHS).toContain('secrets.minecraftPassword')
  })

  it('remove ocorrência literal de segredo em texto livre', () => {
    const out = scrubSecrets('falhou com key=AIzaSyTOPSECRET123', ['AIzaSyTOPSECRET123'])
    expect(out).not.toContain('AIzaSyTOPSECRET123')
    expect(out).toContain('[REDACTED]')
  })

  it('ignora valores curtos demais para serem segredo', () => {
    expect(scrubSecrets('abc', ['abc'])).toBe('abc')
  })
})
