import type { Config } from '../config/schema.js'

/**
 * Cartão de startup do terminal.
 *
 * Público diferente do resto do bot: quem lê aqui é o adulto que subiu o
 * processo, não a criança dona. Ainda assim vale o tom da casa — frase curta,
 * palavra simples — porque ela costuma estar do lado vendo a tela.
 *
 * Existe por um motivo prático: o bot só entra depois que o mundo está aberto
 * em LAN, e a porta do LAN muda a cada abertura. Sem este aviso, o sintoma é
 * uma sequência de reconexões em backoff que não ensina nada.
 *
 * Ver: `openspec/changes/add-startup-banner/specs/startup_console_delta.md`.
 */

export interface BannerOptions {
  /** Cor ANSI. Padrão: ligada só em TTY e sem `NO_COLOR`. */
  color?: boolean
}

/** Espaço entre a borda da moldura e o texto. */
const PAD = 3

/** Escape ANSI. Escrito como escape unicode para não virar byte de controle no fonte. */
const ESC = '\u001b'

interface Palette {
  border: (s: string) => string
  title: (s: string) => string
  address: (s: string) => string
  step: (s: string) => string
  warn: (s: string) => string
}

const plain: Palette = {
  border: (s) => s,
  title: (s) => s,
  address: (s) => s,
  step: (s) => s,
  warn: (s) => s,
}

const colored: Palette = {
  border: (s) => `${ESC}[36m${s}${ESC}[0m`,
  title: (s) => `${ESC}[1;92m${s}${ESC}[0m`,
  address: (s) => `${ESC}[1;93m${s}${ESC}[0m`,
  step: (s) => `${ESC}[96m${s}${ESC}[0m`,
  warn: (s) => `${ESC}[33m${s}${ESC}[0m`,
}

/**
 * Cor só quando alguém está olhando. Saída redirecionada para arquivo, pipe ou
 * CI recebe texto puro — o cartão precisa continuar legível em `saida.txt`.
 */
export function shouldUseColor(
  env: NodeJS.ProcessEnv = process.env,
  stream: { isTTY?: boolean } = process.stdout,
): boolean {
  if (env['NO_COLOR'] !== undefined) return false
  return stream.isTTY === true
}

/** O cartão é coisa de desenvolvimento. Em produção o stdout é log de máquina. */
export function shouldShowBanner(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['NODE_ENV'] !== 'production'
}

/**
 * Emoldura as linhas de título.
 *
 * A largura sai do texto SEM cor: o código ANSI ocupa bytes mas não colunas, e
 * medir a string já colorida desalinharia a borda direita. Pelo mesmo motivo
 * não entra emoji aqui — largura dupla quebra a moldura em vários terminais.
 */
function frame(lines: readonly string[], c: Palette): string[] {
  const inner = Math.max(...lines.map((line) => line.length)) + PAD * 2
  const rule = '─'.repeat(inner)
  const blank = c.border('│') + ' '.repeat(inner) + c.border('│')

  return [
    c.border(`╭${rule}╮`),
    blank,
    ...lines.map(
      (line) =>
        c.border('│') +
        ' '.repeat(PAD) +
        c.title(line) +
        ' '.repeat(inner - PAD - line.length) +
        c.border('│'),
    ),
    blank,
    c.border(`╰${rule}╯`),
  ]
}

/**
 * Monta o cartão de startup. Função pura: devolve a string, quem imprime é o
 * `main.ts`. Recebe `Config` e nunca `Secrets` — assim nenhum segredo chega
 * aqui nem por acidente.
 */
export function renderStartupBanner(config: Config, options: BannerOptions = {}): string {
  const c = (options.color ?? shouldUseColor()) ? colored : plain
  const { host, port, version } = config.server

  const steps = [
    `1.  Abra o Minecraft na versão ${version}`,
    `2.  Entre no mundo do ${config.ownerPlayer}`,
    '3.  Esc  ->  Abrir para LAN  ->  Iniciar mundo em LAN',
    '4.  Veja no chat a porta que o jogo mostrar',
  ]

  const lines = [
    '',
    ...frame([`${config.persona.name} está de pé!`, 'Só falta você abrir o mundo pra mim.'], c),
    '',
    ...steps.map((step) => `   ${c.step(step)}`),
    '',
    `   Estou esperando em  ${c.address(`${host}:${port}`)}`,
    '',
    c.warn('   A porta do LAN muda toda vez que você abre o mundo.'),
    c.warn(`   Se o jogo mostrar outra, troque server.port no config.yaml.`),
    '',
  ]

  return lines.join('\n')
}
