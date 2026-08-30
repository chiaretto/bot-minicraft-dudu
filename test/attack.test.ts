import { describe, it, expect } from 'vitest'
import { parseCommand } from '../src/behaviors/commands.js'
import { selectAttackTarget } from '../src/behaviors/defense/threat-watcher.js'
import {
  mobFromSpokenName,
  canFightUnarmed,
  UNARMED_OK,
  NEVER_ATTACK,
} from '../src/domain/mobs.js'
import { AI_PROPOSABLE_INTENTS, INTENT_JSON_SCHEMA, isLearnable } from '../src/domain/intent.js'
import type { NearbyEntity, WorldSnapshot } from '../src/domain/types.js'

const cmd = (text: string) => parseCommand(text, 'Odraude')

// ── Catálogo de nomes ────────────────────────────────────────────────────────

describe('catálogo de nomes de criatura em português', () => {
  it('traduz hostil pelo nome falado', () => {
    expect(mobFromSpokenName('zumbi')).toBe('zombie')
    expect(mobFromSpokenName('aranha')).toBe('spider')
    expect(mobFromSpokenName('esqueleto')).toBe('skeleton')
  })

  it('traduz pacífico também — é o que faz a recusa funcionar', () => {
    // Sem `vaca` mapeada, "ataca a vaca" viraria ataque genérico ao monstro
    // mais perto: um pedido que a criança não fez.
    expect(mobFromSpokenName('vaca')).toBe('cow')
    expect(mobFromSpokenName('porco')).toBe('pig')
  })

  it('nome desconhecido devolve null', () => {
    expect(mobFromSpokenName('dragao')).toBeNull()
    expect(mobFromSpokenName('saudade')).toBeNull()
  })
})

describe('catálogo de alvos enfrentáveis desarmado', () => {
  const como = (name: string): Pick<NearbyEntity, 'name' | 'type' | 'isTamed'> => ({
    name,
    type: 'hostile',
    isTamed: false,
  })

  it('encara alvo fraco', () => {
    expect(canFightUnarmed(como('zombie'))).toBe(true)
    expect(canFightUnarmed(como('spider'))).toBe(true)
  })

  it('não encara alvo forte', () => {
    expect(canFightUnarmed(como('ravager'))).toBe(false)
    expect(canFightUnarmed(como('witch'))).toBe(false)
    expect(canFightUnarmed(como('blaze'))).toBe(false)
  })

  it('o catálogo não abre exceção na denylist', () => {
    for (const proibido of NEVER_ATTACK) {
      expect(UNARMED_OK.has(proibido), proibido).toBe(false)
    }
  })

  it('creeper nunca é enfrentável de mão', () => {
    expect(UNARMED_OK.has('creeper')).toBe(false)
  })
})

// ── Comando ──────────────────────────────────────────────────────────────────

describe('comando de ataque', () => {
  it('formas genéricas viram ataque sem alvo', () => {
    for (const f of ['ataca', 'ataca ele', 'mata ele', 'bate nele', 'pega ele']) {
      expect(cmd(f)?.intent, f).toEqual({ type: 'ATTACK', params: {} })
    }
  })

  it('forma nomeada traduz o alvo', () => {
    expect(cmd('ataca o zumbi')?.intent).toEqual({
      type: 'ATTACK',
      params: { target: 'zombie' },
    })
    expect(cmd('mata a aranha')?.intent).toEqual({
      type: 'ATTACK',
      params: { target: 'spider' },
    })
  })

  it('CAPS, acento e pontuação repetida não atrapalham', () => {
    expect(cmd('ATACA O ZUMBI!!!')?.intent).toMatchObject({ params: { target: 'zombie' } })
  })

  it('bicho pacífico nomeado vira ataque — para a recusa ser sobre ELE', () => {
    // O comando reconhece; quem recusa é a seleção de alvo, com fala própria.
    expect(cmd('ataca a vaca')?.intent).toEqual({ type: 'ATTACK', params: { target: 'cow' } })
  })

  it('nome fora do catálogo NÃO vira comando', () => {
    // Corrigido na implementação: virar ataque genérico faria "mata a saudade"
    // sair batendo em alguma coisa. Atacar errado é pior que não atacar.
    expect(cmd('mata a saudade')).toBeNull()
    expect(cmd('mata o tempo')).toBeNull()
    expect(cmd('ataca o dragao')).toBeNull()
  })

  it('controle da defesa continua sendo controle da defesa', () => {
    expect(cmd('pode atacar')?.intent.type).toBe('DEFENSE_ON')
    expect(cmd('nao ataca')?.intent.type).toBe('DEFENSE_OFF')
  })
})

// ── A IA não propõe ataque ───────────────────────────────────────────────────

describe('combate continua determinístico', () => {
  it('ATTACK está fora do que a IA pode propor', () => {
    expect(AI_PROPOSABLE_INTENTS).not.toContain('ATTACK')
  })

  it('o schema entregue ao provider não aceita ATTACK', () => {
    const tipos = INTENT_JSON_SCHEMA.properties.type.enum as readonly string[]
    expect(tipos).not.toContain('ATTACK')
    expect(tipos).toContain('FOLLOW')
  })

  it('ATTACK não é decorado no histórico de comandos aprendidos', () => {
    // Mesma regra do GOTO_COORDS: o alvo é um bicho daquele momento, não
    // vocabulário.
    expect(isLearnable({ type: 'ATTACK', params: { target: 'zombie' } })).toBe(false)
    expect(isLearnable({ type: 'ATTACK', params: {} })).toBe(false)
  })
})

// ── Seleção de alvo ──────────────────────────────────────────────────────────

const bicho = (over: Partial<NearbyEntity> = {}): NearbyEntity =>
  ({
    id: 1,
    name: 'zombie',
    type: 'hostile',
    position: { x: 0, y: 64, z: 0 },
    distanceToBot: 3,
    distanceToOwner: 3,
    targetName: null,
    isTamed: false,
    ...over,
  }) as NearbyEntity

const mundo = (entities: NearbyEntity[]): WorldSnapshot =>
  ({ nearbyEntities: entities }) as WorldSnapshot

const escolher = (entities: NearbyEntity[], target?: string) =>
  selectAttackTarget(mundo(entities), { target, protectRadius: 16 })

describe('seleção de alvo pedido pela criança', () => {
  it('sem nome, mira o mais perto do dono', () => {
    const perto = bicho({ id: 1, distanceToOwner: 3 })
    const longe = bicho({ id: 2, distanceToOwner: 9 })
    const r = escolher([longe, perto])
    expect(r.ok && r.entity.id).toBe(1)
  })

  it('com nome, mira o tipo pedido mesmo com outro mais perto', () => {
    const zumbiPerto = bicho({ id: 1, name: 'zombie', distanceToOwner: 2 })
    const esqueletoLonge = bicho({ id: 2, name: 'skeleton', distanceToOwner: 8 })
    const r = escolher([zumbiPerto, esqueletoLonge], 'skeleton')
    expect(r.ok && r.entity.id).toBe(2)
  })

  it('tipo pedido ausente NÃO mira outro bicho', () => {
    const r = escolher([bicho({ name: 'zombie' })], 'skeleton')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('nao-achei')
  })

  it('bicho protegido recebe recusa sobre ELE, não um "não achei"', () => {
    const vaca = bicho({ name: 'cow', type: 'passive' })
    const r = escolher([vaca], 'cow')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('protegido')
  })

  it('jogador nunca é alvo, nem nomeado', () => {
    const jogador = bicho({ name: 'Miguel', type: 'player' })
    const r = escolher([jogador])
    expect(r.ok).toBe(false)
  })

  it('domesticado nunca é alvo', () => {
    const lobo = bicho({ name: 'wolf', isTamed: true })
    const r = escolher([lobo], 'wolf')
    expect(r.ok).toBe(false)
  })

  it('nada por perto tem recusa própria', () => {
    const r = escolher([])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('nada-perto')
  })

  it('fora do raio de proteção o bot não vai — ele defende, não caça', () => {
    const r = escolher([bicho({ distanceToOwner: 40 })])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('longe-demais')
  })

  it('pedir não afrouxa proteção nenhuma', () => {
    // Mesma entidade, pedida explicitamente pelo nome: continua proibida.
    const vaca = bicho({ name: 'cow', type: 'passive', distanceToOwner: 1 })
    expect(escolher([vaca], 'cow').ok).toBe(false)
    expect(escolher([vaca]).ok).toBe(false)
  })
})
