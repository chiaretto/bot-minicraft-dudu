import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readPort,
  readPersonaName,
  applyPort,
  isValidPort,
  savePort,
  PortError,
} from '../src/config-port'

/** Um `config.yaml` com a documentação que o arquivo de verdade tem. */
const CONFIG = `# ─────────────────────────────────────────────────────────────
# bot-minicraft-dudu — configuração
# Segredos NÃO entram aqui: use \`.env\`.
# ─────────────────────────────────────────────────────────────

# OBRIGATÓRIO: nome de usuário Minecraft do jogador dono.
ownerPlayer: 'Miguel'

server:
  host: 'localhost'
  port: 25565
  # Precisa bater com a versão do servidor.
  version: '1.21.11'
  auth: 'offline'
  reconnect:
    enabled: true
    maxAttempts: 10

persona:
  name: 'Odraude'
  description: 'Um amigo animado.'
`

describe('ler a configuração', () => {
  it('acha a porta', () => {
    expect(readPort(CONFIG)).toBe(25565)
  })

  it('acha o nome do bot', () => {
    expect(readPersonaName(CONFIG)).toBe('Odraude')
  })

  it('devolve null quando o campo não existe', () => {
    expect(readPort('ownerPlayer: Miguel\n')).toBeNull()
    expect(readPersonaName('ownerPlayer: Miguel\n')).toBeNull()
  })
})

describe('trocar a porta preserva o arquivo', () => {
  it('grava o valor novo', () => {
    expect(readPort(applyPort(CONFIG, 55654))).toBe(55654)
  })

  it('TODOS os comentários continuam onde estavam', () => {
    const antes = CONFIG.split('\n').filter((l) => l.trim().startsWith('#'))
    const depois = applyPort(CONFIG, 55654)
      .split('\n')
      .filter((l) => l.trim().startsWith('#'))

    expect(depois).toEqual(antes)
    expect(antes.length).toBeGreaterThan(0)
  })

  it('o comentário logo abaixo da porta não é engolido', () => {
    // É o vizinho mais exposto: fica entre a linha editada e a seguinte.
    expect(applyPort(CONFIG, 55654)).toContain('# Precisa bater com a versão do servidor.')
  })

  it('nenhum outro valor muda', () => {
    const depois = applyPort(CONFIG, 55654)
    expect(depois).toContain("ownerPlayer: 'Miguel'")
    expect(depois).toContain("host: 'localhost'")
    expect(depois).toContain("version: '1.21.11'")
    expect(depois).toContain("name: 'Odraude'")
    expect(depois).toContain('maxAttempts: 10')
  })

  it('só a linha da porta muda', () => {
    const antes = CONFIG.split('\n')
    const depois = applyPort(CONFIG, 55654).split('\n')
    const diferentes = antes.filter((linha, i) => linha !== depois[i])
    expect(diferentes).toEqual(['  port: 25565'])
  })
})

describe('guarda rasa da porta', () => {
  it('aceita a faixa válida', () => {
    expect(isValidPort(1)).toBe(true)
    expect(isValidPort(25565)).toBe(true)
    expect(isValidPort(65535)).toBe(true)
  })

  it('recusa o que não é porta', () => {
    expect(isValidPort(0)).toBe(false)
    expect(isValidPort(65536)).toBe(false)
    expect(isValidPort(-1)).toBe(false)
    expect(isValidPort(1.5)).toBe(false)
    expect(isValidPort('25565')).toBe(false)
    expect(isValidPort(null)).toBe(false)
    expect(isValidPort(NaN)).toBe(false)
  })

  it('não grava valor inválido', () => {
    expect(() => applyPort(CONFIG, 0)).toThrow(PortError)
    expect(() => applyPort(CONFIG, 70000)).toThrow(PortError)
    expect(() => applyPort(CONFIG, 1.5)).toThrow(PortError)
  })

  it('recusa YAML ilegível em vez de reescrever por cima', () => {
    expect(() => applyPort('server:\n  port: [::\n', 25565)).toThrow(PortError)
  })
})

describe('gravação em disco', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dudu-port-'))
    file = join(dir, 'config.yaml')
    writeFileSync(file, CONFIG, 'utf8')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('grava a porta e mantém o arquivo legível', () => {
    savePort(file, 55654)
    const depois = readFileSync(file, 'utf8')
    expect(readPort(depois)).toBe(55654)
    expect(depois).toContain('# Precisa bater com a versão do servidor.')
  })

  it('não deixa arquivo temporário para trás', () => {
    savePort(file, 55654)
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })

  it('valor inválido não chega a tocar no arquivo', () => {
    expect(() => savePort(file, 0)).toThrow(PortError)
    expect(readFileSync(file, 'utf8')).toBe(CONFIG)
  })
})
