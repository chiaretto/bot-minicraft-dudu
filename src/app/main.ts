import 'dotenv/config'
import { loadConfig, ConfigError } from '../config/load.js'
import { RepertoireError } from '../dialogue/loader.js'
import { createLogger } from '../logging/logger.js'
import { renderStartupBanner, shouldShowBanner } from './startup-banner.js'
import { createStatusChannel, listenForStop } from './status-channel.js'
import { CompanionBot } from './bot.js'

async function main(): Promise<void> {
  // Antes de tudo: se a configuração nem carregar, o supervisor precisa saber
  // que houve uma tentativa, senão a janela fica em "parado" sem explicação.
  const status = createStatusChannel()
  status.emit('ligando')

  let loaded
  try {
    loaded = loadConfig(process.env.DUDU_CONFIG ?? 'config.yaml')
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`\n${err.message}\n`)
      process.exit(1)
    }
    throw err
  }

  const { config, secrets } = loaded

  const logger = createLogger({ level: config.logLevel, fileDir: config.logDir })
  logger.info(
    { owner: config.ownerPlayer, bot: config.persona.name, log: config.logDir ?? 'só no terminal' },
    'iniciando',
  )

  let bot: CompanionBot
  try {
    bot = new CompanionBot(config, secrets, logger)
  } catch (err) {
    if (err instanceof RepertoireError) {
      console.error(`\n${err.message}\n`)
      process.exit(1)
    }
    throw err
  }

  // Depois de montar o bot e ANTES de qualquer tentativa de conexão: quem subiu
  // o processo precisa ler a instrução do LAN antes de ver o backoff falhando, e
  // o cartão mostra quantos comandos o bot já sabe repetir — o que só se sabe
  // depois de carregar o histórico. Fora do `pino` de propósito: moldura dentro
  // de log estruturado vira uma linha JSON ilegível.
  if (shouldShowBanner()) {
    console.log(renderStartupBanner(config, { learned: bot.learnedSummary }))
  }

  bot.onLifecycle((state) => status.emit(state))

  // Encerramento gracioso: desconecta limpo e fecha o arquivo do dia.
  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, 'encerrando')
    bot.stop()
    // Dá um instante para o quit chegar ao servidor antes de sair.
    setTimeout(() => process.exit(0), 500)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  // No Windows, `SIGTERM` mandado a um processo filho não é sinal de verdade: o
  // Node o traduz para `TerminateProcess` e o handler acima NÃO roda — o bot
  // sairia sem desconectar e ficaria de fantasma no mundo. Por isso o
  // supervisor pede a parada por uma linha no `stdin`.
  listenForStop(() => shutdown('parar'))

  await bot.start()
}

main().catch((err) => {
  console.error('falha fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
