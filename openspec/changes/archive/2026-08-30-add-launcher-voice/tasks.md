# Implementation Tasks: Voz no aplicativo

**Change ID:** `add-launcher-voice`
**Implementado:** 2026-08-30 — falta prova com a janela aberta

> **2026-08-30 — provado em jogo pelo dono, e aprovado.**
>
> As caixas de "em jogo" abaixo ficaram como estavam: a aprovação foi da sessão
> inteira, não item a item. Marcá-las uma a uma diria que cada cenário foi
> observado, e isso ninguém afirmou.

---

## Fase 1: O bot anuncia o que fala

- [x] 1.1 `SPEECH_PREFIX`, `formatSpeech()` e `speak()` no canal
- [x] 1.2 `speak` NÃO engole repetição — diferente do `emit` de status
- [x] 1.3 `onSpeech()` no bot, chamado no ponto único de saída de fala
- [x] 1.4 `main.ts` liga um ao outro
- [x] 1.5 Testes: sem supervisor não sai nada; com supervisor sai uma linha por
      fala; repetida sai duas vezes

**Quality Gate: PASSOU** — 953 testes no pacote do bot

---

## Fase 2: O launcher entende

- [x] 2.1 `parseLine` reconhece a linha de fala; JSON quebrado cai como log
- [x] 2.2 `onSpeech` opcional no runner — launcher que não liga continua válido
- [x] 2.3 Repasse até a janela por IPC

**Quality Gate: PASSOU**

---

## Fase 3: A política, pura

- [x] 3.1 `launcher/src/voice.ts`: emoticon, pontuação repetida, corte na
      palavra inteira, fila com teto
- [x] 3.2 A janela recebe texto pronto e só fala
- [x] 3.3 Teste com falas REAIS do repertório: nenhuma é cortada

**Quality Gate: PASSOU** — 76 testes no pacote do launcher

---

## Fase 4: A janela

- [x] 4.1 Caixa "Ler o que ele fala em voz alta", ligada por padrão
- [x] 4.2 Escolha lembrada em `localStorage`, com `try/catch`
- [x] 4.3 Voz pt-BR do sistema, quando houver
- [x] 4.4 Fala nova cancela a anterior; desligar cala na hora

**Quality Gate: PASSOU** — `tsc` limpo nos dois pacotes

---

## Fase 5: Validação

- [x] 5.1 `npm test` (953) e `launcher: vitest` (76) limpos
- [ ] 5.2 Com a janela aberta: ouvir o bot falar
- [ ] 5.3 Desligar a caixa, fechar e reabrir: continua desligada
- [ ] 5.4 Numa rodada de quente e frio: a voz acompanha, não atrasa

**Quality Gate: PENDENTE** — 5.2 a 5.4 não observados: exigem abrir a janela do
Electron, e nada disso é testável sem ela.

> A 5.4 é a que mede a decisão de cancelar a fala anterior. Se a voz atrapalhar
> em vez de ajudar, é ali que vai aparecer.
