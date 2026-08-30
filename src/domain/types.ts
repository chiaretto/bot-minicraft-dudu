/** Estados da máquina de comportamento, em ordem crescente de prioridade. */
export type BotState = 'IDLE' | 'FOLLOW' | 'STAY' | 'ACTION' | 'GAME' | 'DEFEND' | 'EMERGENCY'

/**
 * Prioridade declarada. Um estado de prioridade maior sempre interrompe o menor,
 * e o interrompido vai para a pilha de retomada.
 * Ver: player_defense_delta.md → "Prioridade entre estados".
 *
 * `GAME` tem a mesma prioridade de `ACTION` — mas, ao contrário dela, **não é
 * retomado** depois de interrompido. Esconderijo queimado e contagem perdida
 * fazem de "voltar de onde parou" algo mais confuso que recomeçar.
 * Ver: bot_games_delta.md → "Estado `GAME` e prioridade".
 */
export const STATE_PRIORITY: Record<BotState, number> = {
  IDLE: 0,
  FOLLOW: 1,
  STAY: 1,
  ACTION: 2,
  GAME: 2,
  DEFEND: 3,
  EMERGENCY: 4,
}

/** Estados que, ao serem interrompidos, são descartados em vez de empilhados. */
export const NON_RESUMABLE_STATES: ReadonlySet<BotState> = new Set<BotState>(['GAME'])

export interface Vec3Like {
  x: number
  y: number
  z: number
}

export type TimeOfDay = 'dia' | 'tarde' | 'noite'

export interface InventoryItem {
  name: string
  count: number
}

export interface NearbyEntity {
  id: number
  name: string
  type: 'hostile' | 'passive' | 'player' | 'other'
  position: Vec3Like
  distanceToBot: number
  distanceToOwner: number | null
  /** Nome da entidade que este mob está perseguindo, quando o servidor informa. */
  targetName: string | null
  /** Creeper com o pavio aceso. */
  isIgnited?: boolean
  /** Mob domesticado — nunca é alvo válido. */
  isTamed?: boolean
}

/** Retrato do estado do bot e do mundo num instante. */
export interface WorldSnapshot {
  position: Vec3Like
  health: number
  food: number
  timeOfDay: TimeOfDay
  isNight: boolean
  inventory: InventoryItem[]
  ownerVisible: boolean
  ownerPosition: Vec3Like | null
  ownerHealth: number | null
  nearbyEntities: NearbyEntity[]
  dimension: string
  state: BotState
}

export interface ChatMessage {
  username: string
  text: string
  isOwner: boolean
}

/** Ameaça classificada pelo vigia de defesa. */
export interface Threat {
  entity: NearbyEntity
  /** `true` quando o hostil está atacando ou mirando o dono. */
  targetingOwner: boolean
  /** Creeper exige tratamento especial: nunca corpo a corpo perto do dono. */
  isCreeper: boolean
  distanceToOwner: number
}

/**
 * De onde saiu a fala. `learned` é comando replicado do histórico de comandos
 * aprendidos — sem chamada de rede, e por isso distinto de `llm`: é assim que a
 * rotina diária mede o que foi economizado.
 */
export type TurnSource = 'command' | 'repertoire' | 'learned' | 'llm' | 'spontaneous'

/** Uma linha do histórico de conversa. */
export interface ConversationTurn {
  ts: string
  speaker: string
  text: string
  source: TurnSource
  botState: BotState
  sessionId: string
  provider?: string
  entryId?: string
  latencyMs?: number
  botHealth?: number
  dimension?: string
}
