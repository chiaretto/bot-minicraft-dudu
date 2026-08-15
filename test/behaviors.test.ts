import { describe, it, expect } from 'vitest'
import { parseCommand, commandPatternCount } from '../src/behaviors/commands.js'
import { StateMachine } from '../src/behaviors/state-machine.js'
import {
  classifyThreats,
  prioritize,
  planDefense,
  canStrike,
} from '../src/behaviors/defense/threat-watcher.js'
import { isAttackable, bestWeapon, isCreeper } from '../src/domain/mobs.js'
import { defenseSchema } from '../src/config/schema.js'
import { STATE_PRIORITY, type NearbyEntity, type WorldSnapshot } from '../src/domain/types.js'

const defense = defenseSchema.parse({})

function entity(over: Partial<NearbyEntity> = {}): NearbyEntity {
  return {
    id: 1,
    name: 'zombie',
    type: 'hostile',
    position: { x: 5, y: 64, z: 0 },
    distanceToBot: 5,
    distanceToOwner: 3,
    targetName: null,
    ...over,
  }
}

function snapshot(over: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
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
    ...over,
  }
}

// ─────────────────────────── PARSER DE COMANDOS ───────────────────────────

describe('parser de comandos', () => {
  it('reconhece as variações de seguir', () => {
    for (const text of ['vem', 'dudu, vem', 'me segue', 'vem comigo', 'me acompanha']) {
      expect(parseCommand(text, 'Dudu')?.intent.type, text).toBe('FOLLOW')
    }
  })

  it('reconhece as variações de ficar', () => {
    for (const text of ['fica aqui', 'dudu, fica aqui', 'fique aqui', 'me espera']) {
      expect(parseCommand(text, 'Dudu')?.intent.type, text).toBe('STAY')
    }
  })

  it('reconhece parar', () => {
    for (const text of ['para', 'dudu, para', 'chega', 'cancela']) {
      expect(parseCommand(text, 'Dudu')?.intent.type, text).toBe('STOP')
    }
  })

  it('reconhece os comandos de defesa sem chamar IA', () => {
    expect(parseCommand('dudu, não briga', 'Dudu')?.intent.type).toBe('DEFENSE_OFF')
    expect(parseCommand('dudu, pode brigar', 'Dudu')?.intent.type).toBe('DEFENSE_ON')
  })

  it('tolera acento, caixa e pontuação', () => {
    expect(parseCommand('DUDU, NÃO BRIGA!!!', 'Dudu')?.intent.type).toBe('DEFENSE_OFF')
  })

  it('devolve null para conversa', () => {
    expect(parseCommand('você gosta de diamante?', 'Dudu')).toBeNull()
    expect(parseCommand('oi', 'Dudu')).toBeNull()
  })

  it('não confunde comando com frase que apenas o contém', () => {
    expect(parseCommand('não para de chover aqui', 'Dudu')).toBeNull()
  })

  it('cobre um conjunto razoável de padrões', () => {
    expect(commandPatternCount()).toBeGreaterThanOrEqual(25)
  })
})

// ────────────────────────── MÁQUINA DE ESTADOS ────────────────────────────

describe('prioridade de estados', () => {
  it('respeita a ordem declarada', () => {
    expect(STATE_PRIORITY.EMERGENCY).toBeGreaterThan(STATE_PRIORITY.DEFEND)
    expect(STATE_PRIORITY.DEFEND).toBeGreaterThan(STATE_PRIORITY.ACTION)
    expect(STATE_PRIORITY.ACTION).toBeGreaterThan(STATE_PRIORITY.FOLLOW)
    expect(STATE_PRIORITY.FOLLOW).toBeGreaterThan(STATE_PRIORITY.IDLE)
  })
})

describe('máquina de estados', () => {
  it('começa em IDLE', () => {
    expect(new StateMachine().state).toBe('IDLE')
  })

  it('defesa interrompe ação e empilha para retomada', () => {
    const sm = new StateMachine()
    sm.command('ACTION', { actionLabel: 'coletar madeira', actionProgress: 2 })

    const result = sm.interrupt('DEFEND', { targets: [1] })
    expect(result).not.toBeNull()
    expect(result!.stacked).toBe(true)
    expect(sm.state).toBe('DEFEND')
    expect(sm.stackDepth).toBe(1)
  })

  it('retoma a ação de onde parou', () => {
    const sm = new StateMachine()
    sm.command('ACTION', { actionLabel: 'coletar madeira', actionProgress: 2 })
    sm.interrupt('DEFEND')
    sm.resume()

    expect(sm.state).toBe('ACTION')
    expect(sm.ctx.actionProgress).toBe(2)
  })

  it('volta ao ponto memorizado do STAY', () => {
    const sm = new StateMachine()
    const point = { x: 10, y: 64, z: 20 }
    sm.command('STAY', { stayPoint: point })
    sm.interrupt('DEFEND')
    sm.resume()

    expect(sm.state).toBe('STAY')
    expect(sm.ctx.stayPoint).toEqual(point)
  })

  it('emergência interrompe a defesa', () => {
    const sm = new StateMachine()
    sm.command('FOLLOW')
    sm.interrupt('DEFEND')
    const result = sm.interrupt('EMERGENCY')

    expect(result).not.toBeNull()
    expect(sm.state).toBe('EMERGENCY')
    expect(sm.stackDepth).toBe(2)
  })

  it('defesa não interrompe defesa', () => {
    const sm = new StateMachine()
    sm.command('FOLLOW')
    sm.interrupt('DEFEND')
    expect(sm.interrupt('DEFEND')).toBeNull()
    expect(sm.stackDepth).toBe(1)
  })

  it('estado de prioridade menor não interrompe o maior', () => {
    const sm = new StateMachine()
    sm.command('DEFEND')
    expect(sm.interrupt('FOLLOW')).toBeNull()
    expect(sm.state).toBe('DEFEND')
  })

  it('IDLE não é empilhado', () => {
    const sm = new StateMachine()
    sm.interrupt('DEFEND')
    expect(sm.stackDepth).toBe(0)
    sm.resume()
    expect(sm.state).toBe('IDLE')
  })

  it('ordem do jogador vence a prioridade e limpa a pilha', () => {
    const sm = new StateMachine()
    sm.command('ACTION')
    sm.interrupt('DEFEND')
    expect(sm.stackDepth).toBe(1)

    sm.command('IDLE')
    expect(sm.state).toBe('IDLE')
    expect(sm.stackDepth).toBe(0)
  })

  it('cancela a ação em curso via AbortSignal', () => {
    const sm = new StateMachine()
    sm.command('ACTION')
    const signal = sm.signal
    expect(signal!.aborted).toBe(false)

    sm.command('IDLE')
    expect(signal!.aborted).toBe(true)
  })

  it('interrupção também cancela o sinal anterior', () => {
    const sm = new StateMachine()
    sm.command('ACTION')
    const signal = sm.signal
    sm.interrupt('DEFEND')
    expect(signal!.aborted).toBe(true)
  })

  it('resume sem pilha volta para IDLE', () => {
    const sm = new StateMachine()
    sm.command('DEFEND')
    sm.resume()
    expect(sm.state).toBe('IDLE')
  })

  it('patchContext atualiza sem trocar de estado', () => {
    const sm = new StateMachine()
    sm.command('ACTION', { actionProgress: 1 })
    sm.patchContext({ actionProgress: 3 })
    expect(sm.state).toBe('ACTION')
    expect(sm.ctx.actionProgress).toBe(3)
  })
})

// ───────────────────────────── ALVOS PROIBIDOS ────────────────────────────

describe('alvos proibidos', () => {
  it('nunca ataca jogador', () => {
    expect(isAttackable({ name: 'Fulano', type: 'player' })).toBe(false)
  })

  it('nunca ataca mob passivo', () => {
    expect(isAttackable({ name: 'cow', type: 'passive' })).toBe(false)
    expect(isAttackable({ name: 'villager', type: 'passive' })).toBe(false)
  })

  it('nunca ataca mob domesticado', () => {
    expect(isAttackable({ name: 'wolf', type: 'hostile', isTamed: true })).toBe(false)
    // Lobo selvagem hostil também está na denylist por segurança.
    expect(isAttackable({ name: 'wolf', type: 'hostile' })).toBe(false)
  })

  it('aceita hostil da allowlist', () => {
    expect(isAttackable({ name: 'zombie', type: 'hostile' })).toBe(true)
    expect(isAttackable({ name: 'skeleton', type: 'hostile' })).toBe(true)
  })

  it('recusa mob desconhecido que não está na allowlist', () => {
    expect(isAttackable({ name: 'ender_dragon', type: 'hostile' })).toBe(false)
  })

  it('canStrike recusa creeper mesmo sendo hostil', () => {
    expect(canStrike(entity({ name: 'creeper' }))).toBe(false)
    expect(canStrike(entity({ name: 'zombie' }))).toBe(true)
  })

  it('canStrike recusa alvo que virou inválido depois da seleção', () => {
    expect(canStrike(entity({ name: 'wolf', isTamed: true }))).toBe(false)
  })
})

describe('seleção de arma', () => {
  it('escolhe a melhor do inventário', () => {
    const best = bestWeapon([{ name: 'stone_sword' }, { name: 'iron_sword' }])
    expect(best?.name).toBe('iron_sword')
  })

  it('devolve null quando desarmado', () => {
    expect(bestWeapon([{ name: 'oak_log' }, { name: 'dirt' }])).toBeNull()
  })

  it('prefere espada a machado do mesmo material', () => {
    expect(bestWeapon([{ name: 'iron_axe' }, { name: 'iron_sword' }])?.name).toBe('iron_sword')
  })
})

// ────────────────────────── DETECÇÃO DE AMEAÇA ────────────────────────────

describe('detecção de ameaça', () => {
  it('hostil que atacou o dono vira ameaça', () => {
    const threats = classifyThreats(snapshot({ nearbyEntities: [entity()] }), {
      defense,
      ownerName: 'Miguel',
      recentAttackers: new Set([1]),
    })
    expect(threats).toHaveLength(1)
    expect(threats[0]!.targetingOwner).toBe(true)
  })

  it('hostil mirando o dono vira ameaça antes do primeiro dano', () => {
    const threats = classifyThreats(
      snapshot({
        nearbyEntities: [entity({ name: 'skeleton', targetName: 'Miguel', distanceToOwner: 10 })],
      }),
      { defense, ownerName: 'Miguel' },
    )
    expect(threats).toHaveLength(1)
    expect(threats[0]!.targetingOwner).toBe(true)
  })

  it('hostil distante é ignorado — o bot não caça', () => {
    const threats = classifyThreats(
      snapshot({ nearbyEntities: [entity({ distanceToOwner: 40 })] }),
      { defense, ownerName: 'Miguel' },
    )
    expect(threats).toHaveLength(0)
  })

  it('hostil atacando o bot dentro do perímetro do dono conta', () => {
    const threats = classifyThreats(
      snapshot({
        nearbyEntities: [entity({ name: 'spider', targetName: 'Dudu', distanceToOwner: 5 })],
      }),
      { defense, ownerName: 'Miguel' },
    )
    expect(threats).toHaveLength(1)
    expect(threats[0]!.targetingOwner).toBe(false)
  })

  it('defesa desligada não produz ameaça nenhuma', () => {
    const threats = classifyThreats(snapshot({ nearbyEntities: [entity()] }), {
      defense: { ...defense, enabled: false },
      ownerName: 'Miguel',
    })
    expect(threats).toHaveLength(0)
  })

  it('sem o dono visível não há perímetro a defender', () => {
    const threats = classifyThreats(
      snapshot({ ownerVisible: false, ownerPosition: null, nearbyEntities: [entity()] }),
      { defense, ownerName: 'Miguel' },
    )
    expect(threats).toHaveLength(0)
  })

  it('jogador hostil nunca vira ameaça atacável', () => {
    const threats = classifyThreats(
      snapshot({ nearbyEntities: [entity({ name: 'Fulano', type: 'player' })] }),
      { defense, ownerName: 'Miguel' },
    )
    expect(threats).toHaveLength(0)
  })

  it('vaca encostada no dono não é ameaça', () => {
    const threats = classifyThreats(
      snapshot({ nearbyEntities: [entity({ name: 'cow', type: 'passive', distanceToOwner: 1 })] }),
      { defense, ownerName: 'Miguel' },
    )
    expect(threats).toHaveLength(0)
  })
})

describe('seleção de alvo', () => {
  it('prioriza quem está machucando o dono', () => {
    const attacking = {
      entity: entity({ id: 1 }),
      targetingOwner: true,
      isCreeper: false,
      distanceToOwner: 9,
    }
    const idle = {
      entity: entity({ id: 2 }),
      targetingOwner: false,
      isCreeper: false,
      distanceToOwner: 2,
    }
    expect(prioritize([idle, attacking], 3)[0]!.entity.id).toBe(1)
  })

  it('desempata por proximidade do dono', () => {
    const far = {
      entity: entity({ id: 1 }),
      targetingOwner: true,
      isCreeper: false,
      distanceToOwner: 9,
    }
    const near = {
      entity: entity({ id: 2 }),
      targetingOwner: true,
      isCreeper: false,
      distanceToOwner: 3,
    }
    expect(prioritize([far, near], 3)[0]!.entity.id).toBe(2)
  })

  it('respeita o limite de alvos simultâneos', () => {
    const many = [1, 2, 3, 4, 5].map((id) => ({
      entity: entity({ id }),
      targetingOwner: true,
      isCreeper: false,
      distanceToOwner: id,
    }))
    expect(prioritize(many, 3)).toHaveLength(3)
  })
})

// ─────────────────────────── PLANO DE DEFESA ──────────────────────────────

describe('plano de defesa', () => {
  const plan = (
    snap: WorldSnapshot,
    threats: Parameters<typeof planDefense>[1],
    weapon: string | null = 'iron_sword',
  ) => planDefense(snap, threats, { defense, ownerName: 'Miguel', weapon })

  const zombie = { entity: entity(), targetingOwner: true, isCreeper: false, distanceToOwner: 3 }
  const creeper = {
    entity: entity({ id: 9, name: 'creeper' }),
    targetingOwner: false,
    isCreeper: true,
    distanceToOwner: 6,
  }

  it('sem ameaça, não faz nada', () => {
    expect(plan(snapshot(), []).kind).toBe('none')
  })

  it('engaja o zumbi com a melhor arma', () => {
    const result = plan(snapshot(), [zombie])
    expect(result.kind).toBe('engage')
    if (result.kind === 'engage') expect(result.weapon).toBe('iron_sword')
  })

  it('vida crítica recua mesmo com ameaça presente', () => {
    const result = plan(snapshot({ health: 5 }), [zombie])
    expect(result.kind).toBe('retreat')
  })

  it('vida crítica vence até a regra do creeper', () => {
    const result = plan(snapshot({ health: 3 }), [creeper])
    expect(result.kind).toBe('retreat')
  })

  it('NUNCA vai para corpo a corpo com creeper perto do dono', () => {
    const result = plan(snapshot(), [creeper])
    expect(result.kind).toBe('flee-creeper')
  })

  it('creeper tem precedência sobre o zumbi', () => {
    const result = plan(snapshot(), [zombie, creeper])
    expect(result.kind).toBe('flee-creeper')
  })

  it('creeper longe do dono é ignorado', () => {
    const distant = {
      ...creeper,
      distanceToOwner: 14,
      entity: entity({ id: 9, name: 'creeper', distanceToOwner: 14 }),
    }
    expect(plan(snapshot(), [distant]).kind).toBe('none')
  })

  it('creeper longe não impede engajar o zumbi', () => {
    const distant = { ...creeper, distanceToOwner: 14 }
    const result = plan(snapshot(), [zombie, distant])
    expect(result.kind).toBe('engage')
  })

  it('desarmado não engaja', () => {
    const result = plan(snapshot(), [zombie], null)
    expect(result.kind).toBe('unarmed')
  })

  it('vida crítica vence o desarmado', () => {
    const result = plan(snapshot({ health: 2 }), [zombie], null)
    expect(result.kind).toBe('retreat')
  })
})

describe('regra do creeper: detecção', () => {
  it('identifica creeper por nome', () => {
    expect(isCreeper({ name: 'creeper' })).toBe(true)
    expect(isCreeper({ name: 'Creeper' })).toBe(true)
    expect(isCreeper({ name: 'zombie' })).toBe(false)
  })
})
