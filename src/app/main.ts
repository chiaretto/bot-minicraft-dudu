import 'dotenv/config'
import { loadConfig, ConfigError } from '../config/load.js'
import { RepertoireError } from '../dialogue/loader.js'
import { createLogger } from '../logging/logger.js'
import { CompanionBot } from './bot.js'

async function main(): Promise<void> {
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
  const logger = createLogger(config.logLevel)
  logger.info({ owner: config.ownerPlayer, bot: config.persona.name }, 'iniciando')

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

  await bot.start()
}

main().catch((err) => {
  console.error('falha fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
