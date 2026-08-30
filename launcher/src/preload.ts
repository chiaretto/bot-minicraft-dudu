/**
 * Ponte entre o processo principal e a janela.
 *
 * Superfície mínima de propósito: a janela não cria processo, não escreve
 * arquivo e não conhece caminho nenhum. Ela pede e escuta — o resto é do
 * processo principal. Por isso `contextIsolation` fica ligado e
 * `nodeIntegration` desligado.
 */

import { contextBridge, ipcRenderer } from 'electron'

export interface EstadoDaJanela {
  state: string
  phrase: { text: string; tone: string }
  labels: { chamar: string; parar: string; reiniciar: string }
  canStart: boolean
  canStop: boolean
  canRestart: boolean
  repoRoot: string | null
  aviso: string | null
}

contextBridge.exposeInMainWorld('dudu', {
  chamar: () => ipcRenderer.invoke('chamar'),
  parar: () => ipcRenderer.invoke('parar'),
  reiniciar: () => ipcRenderer.invoke('reiniciar'),
  pedirEstado: () => ipcRenderer.invoke('estado'),
  lerPorta: () => ipcRenderer.invoke('ler-porta'),
  gravarPorta: (porta: number) => ipcRenderer.invoke('gravar-porta', porta),
  escolherPasta: () => ipcRenderer.invoke('escolher-pasta'),
  aoMudarEstado: (fn: (estado: EstadoDaJanela) => void) => {
    ipcRenderer.on('estado', (_event, estado: EstadoDaJanela) => fn(estado))
  },
  aoReceberLog: (fn: (linha: string) => void) => {
    ipcRenderer.on('log', (_event, linha: string) => fn(linha))
  },
  aoReceberFala: (fn: (texto: string) => void) => {
    ipcRenderer.on('fala', (_event, texto: string) => fn(texto))
  },
  aoReceberMochila: (fn: (painel: unknown) => void) => {
    ipcRenderer.on('mochila', (_event, painel: unknown) => fn(painel))
  },
})
