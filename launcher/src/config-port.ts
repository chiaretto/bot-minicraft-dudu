/**
 * Leitura e escrita da porta do LAN no `config.yaml`.
 *
 * A porta muda TODA vez que o mundo é aberto para LAN, então isto não é ajuste
 * de instalação — é rotina de toda sessão de jogo. Por isso ganhou campo
 * próprio na janela.
 *
 * A regra que domina o arquivo inteiro: **comentário sobrevive**. O
 * `config.yaml` é documentado linha a linha, e `parse()` + `stringify()`
 * devolveria um YAML limpo e mudo, com toda a explicação apagada. Por isso aqui
 * se usa a API de documento do `yaml`, que edita o nó preservando o resto do
 * arquivo byte a byte.
 *
 * As funções de transformação são puras; o I/O fica no fim do arquivo, separado.
 */

import { parseDocument } from 'yaml'
import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'

export const MIN_PORT = 1
export const MAX_PORT = 65535

export function isValidPort(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_PORT &&
    value <= MAX_PORT
  )
}

export class PortError extends Error {
  override name = 'PortError'
}

/** Lê `server.port`, ou `null` se o arquivo não tiver o campo. */
export function readPort(yamlText: string): number | null {
  const doc = parseDocument(yamlText)
  const value: unknown = doc.getIn(['server', 'port'])
  return isValidPort(value) ? (value as number) : null
}

/** Lê `persona.name` — é o nome com que a janela chama o bot. */
export function readPersonaName(yamlText: string): string | null {
  const doc = parseDocument(yamlText)
  const value: unknown = doc.getIn(['persona', 'name'])
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Devolve o YAML com a porta trocada, preservando comentário e formatação.
 *
 * A validação de verdade continua sendo o `configSchema` do bot: aqui só a
 * guarda rasa, para não gravar lixo no arquivo.
 */
export function applyPort(yamlText: string, port: number): string {
  if (!isValidPort(port)) {
    throw new PortError(`porta precisa ser um número inteiro entre ${MIN_PORT} e ${MAX_PORT}`)
  }
  const doc = parseDocument(yamlText)
  if (doc.errors.length > 0) {
    throw new PortError('config.yaml não está legível')
  }
  doc.setIn(['server', 'port'], port)
  return doc.toString()
}

// ── I/O ──────────────────────────────────────────────────────────────────────

export function readConfigFile(file: string): string {
  return readFileSync(file, 'utf8')
}

/**
 * Grava a porta com escrita atômica — temporário e `rename`, como o
 * `learned-store.ts` do bot faz. Crash no meio da gravação não pode deixar o
 * bot sem configuração legível: o histórico de comandos é cache e pode nascer
 * vazio, mas isto aqui é a única fonte de como o bot conecta.
 */
export function savePort(file: string, port: number): void {
  const updated = applyPort(readConfigFile(file), port)
  const temp = `${file}.tmp`
  try {
    writeFileSync(temp, updated, 'utf8')
    renameSync(temp, file)
  } catch (err) {
    try {
      unlinkSync(temp)
    } catch {
      // O temporário pode nem ter sido criado; a falha original é a que importa.
    }
    throw err
  }
}
