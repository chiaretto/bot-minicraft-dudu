# Implementation Tasks: Escolher a voz

**Change ID:** `add-voice-picker`
**Implementado:** 2026-08-30 — falta prova com a janela aberta

---

## Fase 1: A política, pura

- [x] 1.1 `vozesEmPortugues`, `escolherVoz`, `normalizarAjustes`
- [x] 1.2 `AJUSTES_PADRAO`, `LIMITES`, `FALA_DE_TESTE`
- [x] 1.3 12 testes, incluindo voz sumida e lixo vindo do armazenamento

**Quality Gate: PASSOU** — 100 testes no launcher

---

## Fase 2: A ponte

- [x] 2.1 `window.dudu.voz` no `preload`, emprestando a política à janela
      - É o único caminho sem duplicar: o renderer não tem `require`, e só ele
        enxerga `speechSynthesis.getVoices()`.

**Quality Gate: PASSOU** — `tsc` limpo

---

## Fase 3: A janela

- [x] 3.1 Lista de vozes, velocidade, tom e botão Ouvir em "Coisas de adulto"
- [x] 3.2 Escolha lembrada no `localStorage`, com `try/catch`
- [x] 3.3 Redesenho no evento `voiceschanged`
- [x] 3.4 Fala ao trocar de voz e ao soltar o controle, nunca a cada pixel

**Quality Gate: PASSOU** — sintaxe do `renderer.js` conferida

---

## Fase 4: Validação

- [x] 4.1 `launcher: vitest` (100) e `tsc` limpos
- [ ] 4.2 Com a janela aberta: ver a lista com as vozes da máquina
- [ ] 4.3 Trocar de voz e ouvir a diferença
- [ ] 4.4 Ajustar velocidade e tom e confirmar que ficam guardados

**Quality Gate: PENDENTE** — 4.2 a 4.4 exigem abrir a janela do Electron.

> A 4.2 é a única que descobre uma coisa que nenhum teste alcança: **quais vozes
> existem nesta máquina**. Pode não haver nenhuma em português.
