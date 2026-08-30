import { readFileSync, existsSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { configSchema, FORBIDDEN_YAML_KEYS, type Config, type Secrets } from './schema.js'

export class ConfigError extends Error {
  override name = 'ConfigError'
}

export interface LoadedConfig {
  config: Config
  secrets: Secrets
}

/** Procura chaves de segredo em qualquer profundidade do YAML. */
function findForbiddenKeys(node: unknown, path: string[] = []): string[] {
  if (node === null || typeof node !== 'object') return []
  if (Array.isArray(node)) {
    return node.flatMap((item, i) => findForbiddenKeys(item, [...path, String(i)]))
  }
  const found: string[] = []
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if ((FORBIDDEN_YAML_KEYS as readonly string[]).includes(key)) {
      found.push([...path, key].join('.'))
    }
    found.push(...findForbiddenKeys(value, [...path, key]))
  }
  return found
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const where = issue.path.length > 0 ? issue.path.join('.') : '(raiz)'
      return `  - ${where}: ${issue.message}`
    })
    .join('\n')
}

export function readSecrets(env: NodeJS.ProcessEnv = process.env): Secrets {
  const secrets: Secrets = {}
  if (env.GEMINI_API_KEY) secrets.geminiApiKey = env.GEMINI_API_KEY
  if (env.CLAUDE_CODE_OAUTH_TOKEN) secrets.claudeOauthToken = env.CLAUDE_CODE_OAUTH_TOKEN
  if (env.MINECRAFT_PASSWORD) secrets.minecraftPassword = env.MINECRAFT_PASSWORD
  return secrets
}

/**
 * Valida que os segredos exigidos pelo provider ativo estão presentes.
 * A exigência é CONDICIONAL: com provider local o bot sobe sem segredo nenhum.
 * Ver: llm_provider_delta.md → "Chave exigida só quando o provider é Gemini".
 */
export function assertSecretsForProvider(config: Config, secrets: Secrets): void {
  const usesGemini = config.llm.provider === 'gemini' || config.llm.fallbackProvider === 'gemini'
  if (usesGemini && !secrets.geminiApiKey) {
    throw new ConfigError(
      "provider 'gemini' exige a variável de ambiente GEMINI_API_KEY\n" +
        '  variável de ambiente obrigatória ausente: GEMINI_API_KEY',
    )
  }

  // O Claude Code também aceita o login já feito na máquina, e nesse caso não há
  // variável nenhuma para conferir — então aqui NÃO é erro, é aviso com o comando
  // que resolve. Falhar seria recusar uma configuração que funciona.
  const usesClaude = config.llm.provider === 'claude' || config.llm.fallbackProvider === 'claude'
  if (usesClaude && !secrets.claudeOauthToken) {
    console.warn(
      "\naviso: provider 'claude' sem CLAUDE_CODE_OAUTH_TOKEN no ambiente.\n" +
        '  O bot vai tentar o login do Claude Code já feito nesta máquina.\n' +
        '  Para gerar uma credencial própria: claude setup-token\n',
    )
  }
}

export function parseConfig(raw: unknown, secrets: Secrets = {}): Config {
  const forbidden = findForbiddenKeys(raw)
  if (forbidden.length > 0) {
    throw new ConfigError(
      `segredos não são permitidos em config.yaml; use variável de ambiente\n` +
        forbidden.map((k) => `  - ${k}`).join('\n'),
    )
  }

  const result = configSchema.safeParse(raw ?? {})
  if (!result.success) {
    throw new ConfigError(`configuração inválida:\n${formatZodError(result.error)}`)
  }

  assertSecretsForProvider(result.data, secrets)
  return result.data
}

export function loadConfig(
  path = 'config.yaml',
  env: NodeJS.ProcessEnv = process.env,
): LoadedConfig {
  if (!existsSync(path)) {
    throw new ConfigError(
      `arquivo de configuração não encontrado: ${path}\n` +
        '  copie config.example.yaml para config.yaml e ajuste os valores',
    )
  }

  let raw: unknown
  try {
    raw = parseYaml(readFileSync(path, 'utf8'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new ConfigError(`erro de sintaxe em ${path}:\n  ${message}`)
  }

  const secrets = readSecrets(env)
  return { config: parseConfig(raw, secrets), secrets }
}
