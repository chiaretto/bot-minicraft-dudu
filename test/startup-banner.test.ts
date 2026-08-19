import { describe, it, expect } from 'vitest'
import { renderStartupBanner, shouldShowBanner, shouldUseColor } from '../src/app/startup-banner.js'
import { parseConfig } from '../src/config/load.js'

const ESC = '\u001b'

const config = parseConfig({
  ownerPlayer: 'FresherRobin90',
  server: { host: 'localhost', port: 55654, version: '1.21.11' },
  persona: { name: 'Odraude' },
})

describe('cartão de startup: conteúdo', () => {
  it('anuncia o bot pelo nome da persona', () => {
    expect(renderStartupBanner(config, { color: false })).toContain('Odraude está de pé!')
  })

  it('mostra o endereço que o bot está esperando', () => {
    expect(renderStartupBanner(config, { color: false })).toContain('localhost:55654')
  })

  it('mostra a versão em que o mundo deve ser aberto', () => {
    expect(renderStartupBanner(config, { color: false })).toContain('1.21.11')
  })

  it('ensina o caminho do LAN e cita o dono', () => {
    const banner = renderStartupBanner(config, { color: false })
    expect(banner).toContain('Abrir para LAN')
    expect(banner).toContain('FresherRobin90')
  })

  it('avisa que a porta do LAN muda e onde corrigir', () => {
    const banner = renderStartupBanner(config, { color: false })
    expect(banner).toMatch(/porta do LAN muda/i)
    expect(banner).toContain('server.port')
    expect(banner).toContain('config.yaml')
  })

  it('acompanha a configuração, não constante no código', () => {
    const outro = parseConfig({
      ownerPlayer: 'Ana',
      server: { host: '192.168.0.9', port: 25565, version: '1.21.4' },
      persona: { name: 'Robô' },
    })
    const banner = renderStartupBanner(outro, { color: false })
    expect(banner).toContain('192.168.0.9:25565')
    expect(banner).toContain('1.21.4')
    expect(banner).toContain('Robô está de pé!')
    expect(banner).not.toContain('55654')
  })
})

describe('cartão de startup: apresentação', () => {
  it('sem cor não emite nenhum escape ANSI', () => {
    expect(renderStartupBanner(config, { color: false })).not.toContain(ESC)
  })

  it('com cor emite escape ANSI', () => {
    expect(renderStartupBanner(config, { color: true })).toContain(ESC)
  })

  it('alinha a moldura: toda linha com borda tem o mesmo comprimento', () => {
    const framed = renderStartupBanner(config, { color: false })
      .split('\n')
      .filter((line) => line.trimStart().startsWith('│'))

    expect(framed.length).toBeGreaterThan(0)
    const widths = new Set(framed.map((line) => line.length))
    expect(widths.size).toBe(1)
  })

  it('moldura fechada: topo e base do mesmo comprimento das laterais', () => {
    const box = renderStartupBanner(config, { color: false })
      .split('\n')
      .filter((line) => /^[╭╰│]/.test(line.trimStart()))

    expect(box.length).toBeGreaterThanOrEqual(3)
    const widths = new Set(box.map((line) => line.length))
    expect(widths.size).toBe(1)
  })
})

describe('cartão de startup: quando aparece', () => {
  it('aparece em desenvolvimento', () => {
    expect(shouldShowBanner({})).toBe(true)
    expect(shouldShowBanner({ NODE_ENV: 'development' })).toBe(true)
  })

  it('some em produção', () => {
    expect(shouldShowBanner({ NODE_ENV: 'production' })).toBe(false)
  })
})

describe('cartão de startup: quando usa cor', () => {
  it('usa cor em terminal interativo', () => {
    expect(shouldUseColor({}, { isTTY: true })).toBe(true)
  })

  it('não usa cor com saída redirecionada', () => {
    expect(shouldUseColor({}, { isTTY: false })).toBe(false)
    expect(shouldUseColor({}, {})).toBe(false)
  })

  it('respeita NO_COLOR mesmo em TTY', () => {
    expect(shouldUseColor({ NO_COLOR: '1' }, { isTTY: true })).toBe(false)
    expect(shouldUseColor({ NO_COLOR: '' }, { isTTY: true })).toBe(false)
  })
})

describe('cartão de startup: segredos', () => {
  it('não vaza segredo do ambiente', () => {
    const banner = renderStartupBanner(config, { color: false })
    expect(banner).not.toMatch(/geminiApiKey|apiKey|password|senha/i)
  })
})
