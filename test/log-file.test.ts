import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DailyFileStream, localDateKey, logFilePath } from '../src/logging/file-stream.js'
import { createLogger, REDACT_PATHS } from '../src/logging/logger.js'
import { configSchema } from '../src/config/schema.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dudu-log-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** Espera o stream esvaziar: escrita em arquivo é assíncrona. */
function flush(stream: DailyFileStream): Promise<void> {
  return new Promise((resolve) => stream.end(resolve))
}

/**
 * Espera o arquivo do dia ter conteúdo.
 *
 * Dormir um tanto fixo (50 ms) parecia bastar e falhava com a suíte inteira
 * rodando junto: o `multistream` do pino escreve quando o laço de eventos
 * deixa, e numa máquina ocupada isso demora mais. Espera ativa com prazo é
 * rápida quando dá certo e honesta quando não dá.
 */
async function esperarConteudo(caminho: string, prazoMs = 3_000): Promise<string> {
  const limite = Date.now() + prazoMs
  while (Date.now() < limite) {
    if (existsSync(caminho)) {
      const conteudo = readFileSync(caminho, 'utf8')
      if (conteudo.length > 0) return conteudo
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return existsSync(caminho) ? readFileSync(caminho, 'utf8') : ''
}

/**
 * Log da aplicação em arquivo.
 *
 * O log ia só para o stdout: quando o bot sobe pelo aplicativo de desktop,
 * esse stdout aparece em "Coisas de adulto" — e some quando a janela fecha.
 * Ver: startup_console_delta.md → "Log da aplicação em arquivo".
 */
describe('nome do arquivo', () => {
  it('é o dia local, como no histórico de conversa', () => {
    expect(localDateKey(new Date(2026, 7, 30, 23, 59))).toBe('2026-08-30')
    expect(localDateKey(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })

  it('mora na pasta pedida, com extensão de log', () => {
    expect(logFilePath('/tmp/logs', new Date(2026, 7, 30))).toContain('2026-08-30.log')
  })
})

describe('escrita', () => {
  it('cria a pasta e grava', async () => {
    const alvo = join(dir, 'logs')
    const stream = new DailyFileStream({ dir: alvo })
    stream.write('primeira linha\n')
    await flush(stream)

    const arquivos = readdirSync(alvo)
    expect(arquivos).toHaveLength(1)
    expect(readFileSync(join(alvo, arquivos[0]!), 'utf8')).toContain('primeira linha')
  })

  /**
   * Uma sessão que começa às 23h50 e vai até de madrugada precisa trocar de
   * arquivo sozinha. Por isso o dia é decidido a cada escrita, não na abertura.
   */
  it('troca de arquivo à meia-noite, no meio da sessão', async () => {
    let agora = new Date(2026, 7, 30, 23, 59)
    const stream = new DailyFileStream({ dir, now: () => agora })

    stream.write('antes da meia-noite\n')
    agora = new Date(2026, 7, 31, 0, 1)
    stream.write('depois da meia-noite\n')
    await flush(stream)

    expect(existsSync(join(dir, '2026-08-30.log'))).toBe(true)
    expect(existsSync(join(dir, '2026-08-31.log'))).toBe(true)
    expect(readFileSync(join(dir, '2026-08-31.log'), 'utf8')).toContain('depois')
  })

  it('continua o arquivo do dia em vez de sobrescrever', async () => {
    const primeira = new DailyFileStream({ dir })
    primeira.write('linha 1\n')
    await flush(primeira)

    const segunda = new DailyFileStream({ dir })
    segunda.write('linha 2\n')
    await flush(segunda)

    const conteudo = readFileSync(logFilePath(dir, new Date()), 'utf8')
    expect(conteudo).toContain('linha 1')
    expect(conteudo).toContain('linha 2')
  })

  /**
   * Disco cheio, pasta sem permissão ou arquivo travado não podem derrubar um
   * bot que está no meio de uma brincadeira.
   */
  it('falha de escrita não derruba nada', async () => {
    const erros: Error[] = []
    // Um caminho impossível: o "diretório" é um arquivo de verdade.
    const arquivo = join(dir, 'nao-sou-pasta')
    writeFileSync(arquivo, 'sou arquivo, nao pasta', 'utf8')
    const stream = new DailyFileStream({
      dir: join(arquivo, 'dentro'),
      onError: (e) => erros.push(e),
    })

    expect(() => stream.write('qualquer coisa\n')).not.toThrow()
    await flush(stream)
    // A falha é avisada por callback, não lançada: quem cuida do bot fica
    // sabendo, e a brincadeira não para.
    expect(erros.length).toBeGreaterThan(0)
  })
})

describe('o logger', () => {
  it('sem pasta, é só o terminal — como era antes', () => {
    expect(() => createLogger({ level: 'info', fileDir: null })).not.toThrow()
  })

  it('a assinatura antiga continua valendo', () => {
    // `createLogger('debug')` é como o resto do projeto chamava.
    expect(() => createLogger('debug')).not.toThrow()
  })

  it('com pasta, escreve no arquivo do dia', async () => {
    const logger = createLogger({ level: 'info', fileDir: dir })
    logger.info({ teste: true }, 'mensagem de teste')

    const conteudo = await esperarConteudo(logFilePath(dir, new Date()))
    expect(conteudo).toContain('mensagem de teste')
  })

  /** Segredo que não pode aparecer no terminal também não pode ficar em disco. */
  it('o redact vale para o arquivo também', async () => {
    const logger = createLogger({ level: 'info', fileDir: dir })
    logger.info({ apiKey: 'segredo-que-nao-pode-vazar' }, 'conectando')

    const conteudo = await esperarConteudo(logFilePath(dir, new Date()))
    expect(conteudo).not.toContain('segredo-que-nao-pode-vazar')
    expect(conteudo).toContain('[REDACTED]')
    expect(REDACT_PATHS).toContain('apiKey')
  })
})

describe('configuração', () => {
  it('o padrão fica dentro de data/, que está no .gitignore', () => {
    // Log de bot tem fala de criança: o lugar dele é junto das conversas.
    const config = configSchema.parse({ ownerPlayer: 'Miguel', server: { version: '1.21.11' } })
    expect(config.logDir).toBe('data/logs')
  })

  it('dá para desligar sem mexer em código', () => {
    const config = configSchema.parse({
      ownerPlayer: 'Miguel',
      server: { version: '1.21.11' },
      logDir: null,
    })
    expect(config.logDir).toBeNull()
  })
})
