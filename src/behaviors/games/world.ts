import type { Vec3Like } from '../../domain/types.js'

/**
 * O contrato entre uma rodada e o mundo.
 *
 * Interface estreita de propósito: é o que permite testar a brincadeira inteira
 * com relógio e mundo falsos, sem servidor. Mora em módulo próprio porque agora
 * há dois jogos usando o mesmo contrato — deixá-lo dentro do esconde-esconde
 * faria o pega-pega importar de um jogo que ele não é.
 */

/** Cancelamento da rodada: `dudu, para`, defesa, emergência, desconexão. */
export class GameAborted extends Error {
  override name = 'GameAborted'
}

/** Passo de verificação enquanto o bot espera algo acontecer. */
export const POLL_MS = 250

export interface GameWorld {
  /** `null` quando o jogador saiu do servidor ou trocou de dimensão. */
  ownerPosition(): Vec3Like | null
  botPosition(): Vec3Like
  /** Para onde o jogador está olhando agora, em radianos. */
  ownerYaw(): number
  /** O jogador enxerga este ponto? Occlusão de verdade, não só distância. */
  ownerCanSee(position: Vec3Like): boolean
  /** Este ponto está no cone de visão atual do jogador? */
  ownerFacing(position: Vec3Like): boolean
  /** Quantas direções ao redor do ponto têm bloco sólido (0 a 8). */
  coverAt(position: Vec3Like): number
  /**
   * Onde o bot ficaria de pé nesta coluna, ou `null` se não houver lugar.
   * Sem isto, a medição acontece na altura do jogador — dentro de um morro.
   */
  groundAt(position: Vec3Like): Vec3Like | null
  /** O bot enxerga o jogador agora, com o caminho livre de verdade? */
  botCanSeeOwner(): boolean
  /** O pathfinder consegue chegar a este ponto? */
  isReachable(position: Vec3Like): boolean
  /** Anda até o ponto. Resolve `true` quando chegou. */
  goto(position: Vec3Like): Promise<boolean>
  /**
   * Persegue o jogador enquanto ele se move. NÃO bloqueia: quem decide quando
   * parar é o laço da sessão. Um ponto parado não serve para perseguir alguém
   * que corre — quando o bot chegasse, o jogador já não estaria lá.
   */
  chaseOwner(distance: number): void
  /**
   * Liga ou desliga a corrida de verdade. É o botão de equilíbrio do pega-pega:
   * ligado nos dois papéis o bot ganha sempre, desligado nos dois ele nunca
   * pega ninguém.
   */
  setSprinting(on: boolean): void
  stopMoving(): void
  /** Fala uma entrada do repertório. */
  say(entryId: string): void
  /** Fala um texto cru. Usada só pela contagem, que são números, não frases. */
  sayRaw(text: string): void
  /** Espera. Precisa rejeitar com `GameAborted` se a rodada for cancelada. */
  sleep(ms: number): Promise<void>
  now(): number
}
