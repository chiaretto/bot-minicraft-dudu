import { describe, it, expect } from 'vitest'
import { parseCommand, commandPatternCount, isGiveUp } from '../src/behaviors/commands.js'
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

  it('reconhece o convite de brincar sem chamar a IA', () => {
    for (const text of [
      'dudu, vamos brincar de esconde esconde',
      'vamos jogar esconde esconde',
      'esconde esconde',
      'quer brincar de esconde esconde',
    ]) {
      const parsed = parseCommand(text, 'Dudu')
      expect(parsed?.intent.type, text).toBe('PLAY_GAME')
      expect(parsed?.intent.type === 'PLAY_GAME' && parsed.intent.params.game, text).toBe(
        'esconde_esconde',
      )
      // O nome do jogo não diz quem faz o quê: sem papel, o bot pergunta.
      expect(parsed?.intent.type === 'PLAY_GAME' && parsed.intent.params.role, text).toBeUndefined()
    }
  })

  // Com duas brincadeiras no registro, começar uma delas seria escolher pela
  // criança. Ele pergunta — e o nome de cada jogo já é um convite sozinho.
  it('o convite genérico pergunta qual brincadeira, sem começar rodada', () => {
    for (const text of ['dudu, vamos brincar', 'bora brincar', 'vamos jogar', 'quer brincar']) {
      const parsed = parseCommand(text, 'Dudu')
      expect(parsed?.intent.type, text).toBe('ASK_WHICH_GAME')
    }
  })

  it('reconhece o convite de pega-pega, com as variantes do nome', () => {
    for (const text of [
      'dudu, vamos brincar de pega pega',
      'pega pega',
      'pique pega',
      'pira pega',
      'bora de pega pega',
      'quer jogar pega pega',
    ]) {
      const parsed = parseCommand(text, 'Dudu')
      expect(parsed?.intent.type, text).toBe('PLAY_GAME')
      expect(parsed?.intent.type === 'PLAY_GAME' && parsed.intent.params.game, text).toBe(
        'pega_pega',
      )
      // O nome do jogo não diz quem faz o quê: sem papel, o bot pergunta.
      expect(parsed?.intent.type === 'PLAY_GAME' && parsed.intent.params.role, text).toBeUndefined()
    }
  })

  it('mandar correr atrás põe o bot no papel de quem pega', () => {
    for (const text of ['me pega', 'dudu, vem me pegar', 'corre atras de mim', 'tenta me pegar']) {
      const parsed = parseCommand(text, 'Dudu')
      expect(parsed?.intent.type === 'PLAY_GAME' && parsed.intent.params.role, text).toBe(
        'bot_pega',
      )
    }
  })

  it('avisar que vai pegar põe o bot no papel de quem foge', () => {
    for (const text of ['eu vou te pegar', 'dudu, eu te pego', 'voce corre', 'sai correndo']) {
      const parsed = parseCommand(text, 'Dudu')
      expect(parsed?.intent.type, text).toBe('PLAY_GAME')
      expect(parsed?.intent.type === 'PLAY_GAME' && parsed.intent.params.game, text).toBe(
        'pega_pega',
      )
      expect(parsed?.intent.type === 'PLAY_GAME' && parsed.intent.params.role, text).toBe(
        'bot_foge',
      )
    }
  })

  it('reconhece o papel de quem procura', () => {
    for (const text of [
      'eu vou me esconder',
      'dudu, conta ate 10',
      'me procura',
      'vem me achar',
      'fecha o olho e conta',
    ]) {
      const parsed = parseCommand(text, 'Dudu')
      expect(parsed?.intent.type, text).toBe('PLAY_GAME')
      expect(parsed?.intent.type === 'PLAY_GAME' && parsed.intent.params.role, text).toBe(
        'bot_procura',
      )
    }
  })

  it('mandar se esconder põe o bot no papel de quem esconde', () => {
    for (const text of ['se esconde', 'dudu, vai se esconder', 'voce se esconde']) {
      const parsed = parseCommand(text, 'Dudu')
      expect(parsed?.intent.type === 'PLAY_GAME' && parsed.intent.params.role, text).toBe(
        'bot_esconde',
      )
    }
  })

  it('tolera caixa, acento e pontuação no convite', () => {
    const parsed = parseCommand('DUDU, VAMOS BRINCAR DE ESCONDE-ESCONDE!!!', 'Dudu')
    expect(parsed?.intent.type).toBe('PLAY_GAME')
    expect(parseCommand('DUDU, CONTA ATÉ 10', 'Dudu')?.intent.type).toBe('PLAY_GAME')
  })

  it('remove enfeite no fim do convite', () => {
    expect(parseCommand('vamos brincar agora', 'Dudu')?.intent.type).toBe('ASK_WHICH_GAME')
    expect(parseCommand('se esconde vai', 'Dudu')?.intent.type).toBe('PLAY_GAME')
    expect(parseCommand('me pega ai', 'Dudu')?.intent.type).toBe('PLAY_GAME')
  })

  it('tolera caixa e pontuação no convite de pega-pega', () => {
    const parsed = parseCommand('DUDU, VAMOS BRINCAR DE PEGA-PEGA!!!', 'Dudu')
    expect(parsed?.intent.type === 'PLAY_GAME' && parsed.intent.params.game).toBe('pega_pega')
  })

  it('não confunde "vamos" sozinho com convite de brincadeira', () => {
    expect(parseCommand('vamos', 'Dudu')?.intent.type).toBe('FOLLOW')
    expect(parseCommand('vamos embora', 'Dudu')?.intent.type).toBe('FOLLOW')
  })
})

describe('desistência no jogo', () => {
  it('reconhece que o jogador desistiu', () => {
    for (const text of ['desisto', 'dudu, desisto', 'cade voce', 'me entrego', 'nao acho voce']) {
      expect(isGiveUp(text, 'Dudu'), text).toBe(true)
    }
  })

  it('reconhece a desistência do pega-pega', () => {
    for (const text of ['nao te pego', 'cansei', 'dudu, para de correr', 'nao consigo te pegar']) {
      expect(isGiveUp(text, 'Dudu'), text).toBe(true)
    }
  })

  it('tolera acento e pontuação', () => {
    expect(isGiveUp('CADÊ VOCÊ???', 'Dudu')).toBe(true)
  })

  it('não é comando: continua descendo na cascata fora do jogo', () => {
    // `cade voce` só vira desistência com uma rodada em andamento; o parser de
    // comandos não pode reivindicá-la.
    expect(parseCommand('cade voce', 'Dudu')).toBeNull()
    expect(parseCommand('desisto', 'Dudu')).toBeNull()
  })

  it('não confunde conversa comum com desistência', () => {
    for (const text of ['oi', 'vamos brincar', 'voce ta bem', 'para']) {
      expect(isGiveUp(text, 'Dudu'), text).toBe(false)
    }
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

  it('põe o jogo no mesmo degrau da ação, abaixo da defesa', () => {
    expect(STATE_PRIORITY.GAME).toBe(STATE_PRIORITY.ACTION)
    expect(STATE_PRIORITY.DEFEND).toBeGreaterThan(STATE_PRIORITY.GAME)
    expect(STATE_PRIORITY.GAME).toBeGreaterThan(STATE_PRIORITY.FOLLOW)
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

  it('não empilha o jogo: rodada interrompida é descartada', () => {
    const sm = new StateMachine()
    sm.command('GAME', { actionLabel: 'esconde_esconde' })

    const result = sm.interrupt('DEFEND', { targets: [1] })
    expect(result).not.toBeNull()
    expect(result!.stacked).toBe(false)
    expect(sm.stackDepth).toBe(0)

    // Fim do combate cai em IDLE, e não de volta no jogo.
    sm.resume()
    expect(sm.state).toBe('IDLE')
  })

  it('cancela a sessão do jogo ao ser interrompido', () => {
    const sm = new StateMachine()
    sm.command('GAME')
    const signal = sm.signal
    expect(signal?.aborted).toBe(false)

    sm.interrupt('DEFEND')
    expect(signal?.aborted).toBe(true)
  })

  it('jogo e ação não se interrompem: prioridades iguais', () => {
    const sm = new StateMachine()
    sm.command('ACTION')
    expect(sm.interrupt('GAME')).toBeNull()
    expect(sm.state).toBe('ACTION')

    sm.command('GAME')
    expect(sm.interrupt('ACTION')).toBeNull()
    expect(sm.state).toBe('GAME')
  })

  it('ordem do jogador troca ação por jogo mesmo com prioridade igual', () => {
    const sm = new StateMachine()
    sm.command('ACTION', { actionLabel: 'coletar madeira' })
    const signal = sm.signal

    sm.command('GAME')
    expect(sm.state).toBe('GAME')
    expect(signal?.aborted).toBe(true)
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

  it('desarmado ENGAJA alvo fraco', () => {
    // Regra mudou em 2026-08-29. A antiga ("desarmado nunca engaja") deixava o
    // bot sem atacar NADA, porque ele entra no mundo sem inventário e não sabe
    // craftar. Ver: player_defense_delta.md → "Engajamento corpo a corpo".
    const result = plan(snapshot(), [zombie], null)
    expect(result.kind).toBe('engage')
    if (result.kind === 'engage') expect(result.weapon).toBeNull()
  })

  it('desarmado recusa alvo forte demais', () => {
    const ravager = {
      entity: entity({ id: 7, name: 'ravager' }),
      targetingOwner: true,
      isCreeper: false,
      distanceToOwner: 3,
    }
    const result = plan(snapshot(), [ravager], null)
    expect(result.kind).toBe('unarmed')
  })

  it('com arma, alvo forte é engajado normalmente', () => {
    const ravager = {
      entity: entity({ id: 7, name: 'ravager' }),
      targetingOwner: true,
      isCreeper: false,
      distanceToOwner: 3,
    }
    const result = plan(snapshot(), [ravager], 'iron_sword')
    expect(result.kind).toBe('engage')
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
