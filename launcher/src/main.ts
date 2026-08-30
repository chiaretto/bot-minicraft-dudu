/**
 * Processo principal do Electron: janela, IPC e ciclo de vida.
 *
 * Fica fino de propósito. Toda regra que dá para testar sem abrir janela mora
 * nos módulos puros ao lado (`supervisor`, `status`, `phrases`, `config-port`,
 * `repo-path`); aqui só a fiação.
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { BotRunner, BotNotFoundError } from './runner'
import { next, canStart, canStop, canRestart, INITIAL, type UiState } from './supervisor'
import { phraseFor, buttonLabels, NOME_PADRAO, RECADO_SEM_BOT } from './phrases'
import { readConfigFile, readPort, readPersonaName, savePort, isValidPort } from './config-port'
import { resolveRepoRoot, readSavedRoot, saveRoot, looksLikeBotRepo } from './repo-path'
import { prepareSpeech } from './voice'
import { montarPainel } from './inventory'

/** Teto de linhas de log guardadas. Sessão longa não pode comer a memória. */
const MAX_LOG_LINES = 500

let window: BrowserWindow | null = null
let runner: BotRunner | null = null
let repoRoot: string | null = null
let state: UiState = INITIAL
let botName = NOME_PADRAO
const logLines: string[] = []

function settingsFile(): string {
  return join(app.getPath('userData'), 'launcher.json')
}

/**
 * Caminho gravado no empacotamento (`scripts/pack.mjs` põe `duduHome` no
 * `package.json` do pacote). É o que faz o aplicativo instalado funcionar no
 * primeiro duplo clique, sem ninguém ter que apontar a pasta.
 */
function bakedRoot(): string | null {
  try {
    const meta: unknown = require(join(app.getAppPath(), 'package.json'))
    const home = (meta as { duduHome?: unknown }).duduHome
    return typeof home === 'string' && home.length > 0 ? home : null
  } catch {
    return null
  }
}

function configFile(): string | null {
  return repoRoot ? join(repoRoot, 'config.yaml') : null
}

// ── Envio para a janela ──────────────────────────────────────────────────────

function pushState(): void {
  if (!window || window.isDestroyed()) return
  window.webContents.send('estado', {
    state,
    phrase: phraseFor(state, botName),
    labels: buttonLabels(botName),
    canStart: canStart(state) && repoRoot !== null,
    canStop: canStop(state),
    canRestart: canRestart(state) && repoRoot !== null,
    repoRoot,
    aviso: repoRoot === null ? RECADO_SEM_BOT : null,
  })
}

function apply(event: Parameters<typeof next>[1]): void {
  const before = state
  state = next(state, event)
  if (state !== before) pushState()
}

function pushLog(line: string): void {
  logLines.push(line)
  if (logLines.length > MAX_LOG_LINES) logLines.splice(0, logLines.length - MAX_LOG_LINES)
  if (window && !window.isDestroyed()) window.webContents.send('log', line)
}

// ── Configuração ─────────────────────────────────────────────────────────────

/** Relê o `config.yaml`. Falha aqui não derruba a janela: ela só mostra menos. */
function refreshConfig(): void {
  const file = configFile()
  if (!file) {
    botName = NOME_PADRAO
    return
  }
  try {
    const text = readConfigFile(file)
    botName = readPersonaName(text) ?? NOME_PADRAO
  } catch {
    botName = NOME_PADRAO
  }
}

function currentPort(): number | null {
  const file = configFile()
  if (!file) return null
  try {
    return readPort(readConfigFile(file))
  } catch {
    return null
  }
}

// ── Processo do bot ──────────────────────────────────────────────────────────

function ensureRunner(): BotRunner | null {
  if (runner) return runner
  if (!repoRoot) return null
  runner = new BotRunner(repoRoot, {
    onStatus: (status) => apply({ type: 'status', status }),
    onLog: (line) => pushLog(line),
    onInventory: (itens) => {
      // A POLÍTICA de tela (quantos cabem, o que dizer do resto) mora no módulo
      // puro; a janela só desenha o que chega pronto.
      window?.webContents.send('mochila', montarPainel(itens))
    },
    onSpeech: (text) => {
      // A POLÍTICA (o que vale a pena ouvir, cortado onde) mora no módulo puro;
      // a janela só fala, porque `speechSynthesis` é coisa de navegador e o
      // processo principal não tem um.
      const fala = prepareSpeech(text)
      if (fala) window?.webContents.send('fala', fala)
    },
    onExit: () => {
      // Mochila de fantasma é pior que painel vazio: a criança pediria um bloco
      // que ninguém está carregando.
      window?.webContents.send('mochila', null)
      apply({ type: 'saiu' })
    },
    onSpawnError: (message) => {
      pushLog(`falha ao iniciar o bot: ${message}`)
      apply({ type: 'falhou_ao_subir' })
    },
  })
  return runner
}

function startBot(): void {
  const r = ensureRunner()
  if (!r || !canStart(state)) return
  try {
    r.start()
    apply({ type: 'chamou' })
  } catch (err) {
    pushLog(err instanceof BotNotFoundError ? err.message : String(err))
    apply({ type: 'falhou_ao_subir' })
  }
}

async function stopBot(): Promise<void> {
  if (!runner || !canStop(state)) return
  apply({ type: 'pediu_parada' })
  await runner.stop()
}

async function restartBot(): Promise<void> {
  if (!canRestart(state)) return
  if (runner?.running) {
    apply({ type: 'pediu_parada' })
    await runner.stop()
  }
  startBot()
}

// ── Janela ───────────────────────────────────────────────────────────────────

function createWindow(): void {
  window = new BrowserWindow({
    width: 520,
    height: 700,
    minWidth: 460,
    minHeight: 560,
    title: 'Odraude',
    autoHideMenuBar: true,
    icon: join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  void window.loadFile(join(__dirname, '..', 'ui', 'index.html'))
  window.webContents.on('did-finish-load', () => {
    pushState()
    for (const line of logLines) window!.webContents.send('log', line)
  })
}

// ── IPC ──────────────────────────────────────────────────────────────────────

function registerIpc(): void {
  ipcMain.handle('chamar', () => startBot())
  ipcMain.handle('parar', () => stopBot())
  ipcMain.handle('reiniciar', () => restartBot())
  ipcMain.handle('estado', () => pushState())
  ipcMain.handle('ler-porta', () => currentPort())

  ipcMain.handle('gravar-porta', (_event, porta: unknown) => {
    const file = configFile()
    if (!file) return { ok: false, erro: RECADO_SEM_BOT }
    if (!isValidPort(porta)) {
      return { ok: false, erro: 'A porta precisa ser um número inteiro entre 1 e 65535.' }
    }
    try {
      savePort(file, porta as number)
      return { ok: true, precisaReiniciar: runner?.running === true }
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('escolher-pasta', async () => {
    const chosen = await dialog.showOpenDialog({
      title: 'Onde está a pasta do bot?',
      properties: ['openDirectory'],
    })
    const dir = chosen.filePaths[0]
    if (chosen.canceled || !dir) return { ok: false }
    if (!looksLikeBotRepo(dir)) {
      return { ok: false, erro: 'Essa pasta não parece a do bot.' }
    }
    repoRoot = dir
    saveRoot(settingsFile(), dir)
    runner = null
    refreshConfig()
    pushState()
    return { ok: true }
  })
}

// ── Ciclo de vida do aplicativo ──────────────────────────────────────────────

/**
 * Uma instância só: duas janelas seriam dois supervisores do mesmo bot, e a
 * segunda subiria um processo que a primeira não conhece.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  void app.whenReady().then(() => {
    repoRoot = resolveRepoRoot({
      saved: readSavedRoot(settingsFile()),
      baked: bakedRoot(),
      appDir: app.getAppPath(),
    })
    refreshConfig()
    registerIpc()
    createWindow()
  })
}

/**
 * Fechar a janela desliga o bot: o aplicativo é o supervisor dele, e um bot sem
 * supervisor viraria processo órfão que ninguém sabe parar.
 */
app.on('window-all-closed', () => {
  app.quit()
})

let quitting = false
app.on('before-quit', (event) => {
  if (quitting || !runner?.running) return
  // Segura a saída até o bot sair do mundo de verdade — matar o processo aqui
  // é justamente o que deixaria o fantasma parado no mundo.
  event.preventDefault()
  quitting = true
  void runner.stop().finally(() => app.quit())
})
