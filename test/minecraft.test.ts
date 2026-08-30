import { describe, it, expect } from 'vitest'
import {
  splitMessage,
  ChatSender,
  isSystemEcho,
  ADMIN_TRANSLATE,
  MAX_CHAT_LENGTH,
} from '../src/minecraft/chat.js'
import { Backoff, shouldReconnect } from '../src/minecraft/reconnect.js'
import {
  buildSnapshot,
  toTimeOfDay,
  isNight,
  distance,
  detectIgnited,
  type SnapshotSource,
} from '../src/minecraft/snapshot.js'

describe('hora do dia', () => {
  it('mapeia ticks para período', () => {
    expect(toTimeOfDay(0)).toBe('dia')
    expect(toTimeOfDay(6000)).toBe('dia')
    expect(toTimeOfDay(10000)).toBe('tarde')
    expect(toTimeOfDay(13500)).toBe('noite')
    expect(isNight(18000)).toBe(true)
    expect(isNight(1000)).toBe(false)
  })

  it('normaliza ticks fora do ciclo', () => {
    expect(toTimeOfDay(24000 * 3 + 14000)).toBe('noite')
    expect(toTimeOfDay(-1000)).toBe('noite')
  })
})

describe('quebra de mensagem', () => {
  it('mensagem curta vai inteira', () => {
    expect(splitMessage('oi amigo')).toEqual(['oi amigo'])
  })

  it('quebra mensagem de 400 caracteres em partes dentro do limite', () => {
    const long = 'palavra '.repeat(60).trim()
    const parts = splitMessage(long)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(MAX_CHAT_LENGTH)
    // Nenhuma palavra foi cortada ao meio.
    expect(parts.join(' ')).toBe(long)
  })

  it('parte palavra maior que o limite inteiro', () => {
    const parts = splitMessage('x'.repeat(300))
    expect(parts).toHaveLength(2)
  })

  it('mensagem vazia não gera parte nenhuma', () => {
    expect(splitMessage('   ')).toEqual([])
  })
})

describe('throttle de chat', () => {
  it('espaça a rajada sem perder mensagem', () => {
    const sent: string[] = []
    const pending: Array<[() => void, number]> = []
    let now = 0

    const sender = new ChatSender({
      send: (t) => sent.push(t),
      minIntervalMs: 1000,
      now: () => now,
      schedule: (fn, ms) => pending.push([fn, ms]),
    })

    for (let i = 1; i <= 5; i++) sender.say(`msg ${i}`)

    // A primeira sai na hora; as outras ficam na fila.
    expect(sent).toEqual(['msg 1'])
    expect(sender.pending).toBe(4)

    // Avança o relógio e roda os timers agendados.
    for (let i = 0; i < 10 && pending.length > 0; i++) {
      const [fn, ms] = pending.shift()!
      now += ms
      fn()
    }

    expect(sent).toHaveLength(5)
    expect(sent[4]).toBe('msg 5')
  })
})

describe('backoff de reconexão', () => {
  it('cresce exponencialmente até o teto', () => {
    const backoff = new Backoff({ initialDelayMs: 1000, maxDelayMs: 8000, maxAttempts: 10 })
    expect(backoff.next()).toBe(1000)
    expect(backoff.next()).toBe(2000)
    expect(backoff.next()).toBe(4000)
    expect(backoff.next()).toBe(8000)
    expect(backoff.next()).toBe(8000)
  })

  it('desiste após o teto de tentativas', () => {
    const backoff = new Backoff({ initialDelayMs: 10, maxDelayMs: 100, maxAttempts: 2 })
    expect(backoff.next()).not.toBeNull()
    expect(backoff.next()).not.toBeNull()
    expect(backoff.next()).toBeNull()
    expect(backoff.exhausted).toBe(true)
  })

  it('reconexão bem-sucedida zera o contador', () => {
    const backoff = new Backoff({ initialDelayMs: 10, maxDelayMs: 100, maxAttempts: 3 })
    backoff.next()
    backoff.next()
    backoff.reset()
    expect(backoff.next()).toBe(10)
  })

  it('não reconecta após expulsão', () => {
    expect(shouldReconnect('kicked', true)).toBe(false)
    expect(shouldReconnect('end', true)).toBe(true)
    expect(shouldReconnect('end', false)).toBe(false)
  })
})

describe('snapshot do mundo', () => {
  const fakeBot = (over: Partial<SnapshotSource> = {}): SnapshotSource => ({
    entity: { position: { x: 0, y: 64, z: 0 } },
    health: 20,
    food: 18,
    time: { timeOfDay: 1000 },
    game: { dimension: 'overworld' },
    inventory: { items: () => [{ name: 'oak_log', count: 3 }] },
    players: { Miguel: { entity: { position: { x: 5, y: 64, z: 0 } } } },
    entities: {},
    ...over,
  })

  it('monta os campos exigidos pela spec', () => {
    const snap = buildSnapshot(fakeBot(), { ownerName: 'Miguel', state: 'IDLE' })
    expect(snap.health).toBe(20)
    expect(snap.food).toBe(18)
    expect(snap.timeOfDay).toBe('dia')
    expect(snap.inventory).toEqual([{ name: 'oak_log', count: 3 }])
    expect(snap.ownerVisible).toBe(true)
    expect(snap.ownerPosition).toEqual({ x: 5, y: 64, z: 0 })
    expect(snap.dimension).toBe('overworld')
    expect(snap.state).toBe('IDLE')
  })

  it('dono fora do chunk carregado fica invisível', () => {
    const snap = buildSnapshot(fakeBot({ players: {} }), { ownerName: 'Miguel', state: 'IDLE' })
    expect(snap.ownerVisible).toBe(false)
    expect(snap.ownerPosition).toBeNull()
  })

  it('classifica hostil, passivo e jogador', () => {
    const snap = buildSnapshot(
      fakeBot({
        entities: {
          '1': { id: 1, name: 'zombie', position: { x: 3, y: 64, z: 0 } },
          '2': { id: 2, name: 'cow', position: { x: 4, y: 64, z: 0 } },
          '3': { id: 3, username: 'Fulano', type: 'player', position: { x: 6, y: 64, z: 0 } },
        },
      }),
      { ownerName: 'Miguel', state: 'IDLE' },
    )

    const byName = new Map(snap.nearbyEntities.map((e) => [e.name, e]))
    expect(byName.get('zombie')?.type).toBe('hostile')
    expect(byName.get('cow')?.type).toBe('passive')
    expect(byName.get('Fulano')?.type).toBe('player')
  })

  it('calcula distância até o bot e até o dono', () => {
    const snap = buildSnapshot(
      fakeBot({
        entities: { '1': { id: 1, name: 'zombie', position: { x: 3, y: 64, z: 0 } } },
      }),
      { ownerName: 'Miguel', state: 'IDLE' },
    )
    const zombie = snap.nearbyEntities[0]!
    expect(zombie.distanceToBot).toBe(3)
    expect(zombie.distanceToOwner).toBe(2)
  })

  it('ignora entidade muito distante', () => {
    const snap = buildSnapshot(
      fakeBot({
        entities: { '1': { id: 1, name: 'zombie', position: { x: 200, y: 64, z: 0 } } },
      }),
      { ownerName: 'Miguel', state: 'IDLE' },
    )
    expect(snap.nearbyEntities).toHaveLength(0)
  })

  it('ignora entidade já inválida', () => {
    const snap = buildSnapshot(
      fakeBot({
        entities: {
          '1': { id: 1, name: 'zombie', position: { x: 2, y: 64, z: 0 }, isValid: false },
        },
      }),
      { ownerName: 'Miguel', state: 'IDLE' },
    )
    expect(snap.nearbyEntities).toHaveLength(0)
  })

  it('propaga o alvo do mob quando conhecido', () => {
    const targets = new Map([[1, 'Miguel']])
    const snap = buildSnapshot(
      fakeBot({ entities: { '1': { id: 1, name: 'skeleton', position: { x: 5, y: 64, z: 0 } } } }),
      { ownerName: 'Miguel', state: 'IDLE', entityTargets: targets },
    )
    expect(snap.nearbyEntities[0]!.targetName).toBe('Miguel')
  })

  it('detecta creeper inflado', () => {
    expect(
      detectIgnited({ id: 1, name: 'creeper', position: { x: 0, y: 0, z: 0 }, metadata: [true] }),
    ).toBe(true)
    expect(
      detectIgnited({ id: 1, name: 'creeper', position: { x: 0, y: 0, z: 0 }, metadata: [] }),
    ).toBe(false)
    expect(
      detectIgnited({ id: 1, name: 'zombie', position: { x: 0, y: 0, z: 0 }, metadata: [true] }),
    ).toBe(false)
  })

  it('usa padrões quando o bot ainda não spawnou', () => {
    const snap = buildSnapshot({}, { ownerName: 'Miguel', state: 'IDLE' })
    expect(snap.health).toBe(20)
    expect(snap.position).toEqual({ x: 0, y: 0, z: 0 })
    expect(snap.ownerVisible).toBe(false)
  })
})

describe('distância euclidiana', () => {
  it('calcula em 3 eixos', () => {
    expect(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5)
  })
})

/**
 * Retorno de comando do jogo não é fala de jogador.
 * Ver: minecraft_connection_delta.md → "Retorno de comando do jogo não é fala".
 */
describe('eco do sistema', () => {
  // As cinco formas que apareceram no log de 15 a 29 de agosto de 2026.
  const ECOS = [
    'Teleported Odraude to FresherRobin90]',
    'Teleported FresherRobin90 to Odraude]',
    'Set own game mode to Creative Mode]',
    'Killed FresherRobin90]',
    'Removed 3 item(s) from player FresherRobin90]',
    'Set the time to 1000]',
  ]

  it('reconhece o retorno de comando pelo colchete que sobrou', () => {
    for (const eco of ECOS) expect(isSystemEcho(eco)).toBe(true)
  })

  it('a chave de tradução decide sozinha', () => {
    // Sem o colchete, só a chave — é o sinal que o protocolo realmente dá.
    expect(isSystemEcho('Teleported Odraude to FresherRobin90', ADMIN_TRANSLATE)).toBe(true)
  })

  it('fala de verdade da criança nunca é eco', () => {
    // Todas tiradas do histórico real.
    const falas = [
      'vem auqi',
      'me conta um segredo do minecraft',
      'voce gosta de diamante?',
      'dudu, pega madeira',
      'construa uma piscina',
      'te peguei',
      'oi',
    ]
    for (const fala of falas) expect(isSystemEcho(fala)).toBe(false)
    for (const fala of falas) expect(isSystemEcho(fala, 'chat.type.text')).toBe(false)
  })

  it('colchete emparelhado é texto, não eco', () => {
    // Alguém escrevendo com colchete continua sendo alguém escrevendo.
    expect(isSystemEcho('[dudu]')).toBe(false)
    expect(isSystemEcho('olha o [bau]')).toBe(false)
  })
})
