# Implementation Tasks: Pular e fazer graça

**Change ID:** `add-jump-and-trick`
**Implementado:** 2026-08-30 — falta prova em jogo

> **2026-08-30 — provado em jogo pelo dono, e aprovado.**
>
> As caixas de "em jogo" abaixo ficaram como estavam: a aprovação foi da sessão
> inteira, não item a item. Marcá-las uma a uma diria que cada cenário foi
> observado, e isso ninguém afirmou.

---

## Fase 1: Catálogo e ação

- [x] 1.1 `JUMP` e `TRICK` em `INTENT_TYPES`, no schema (params vazios) e em
      `LEARNABLE_INTENTS`
- [x] 1.2 `jump()`: três pulos, controle desligado no `finally`
      - O `finally` não é enfeite: controle preso ligado deixa o bot pulando
        para sempre, inclusive depois de um `para`.
- [x] 1.3 `trick()`: giro em 8 passos de 45° e um pulo no fim
- [x] 1.4 `sleep(ms, signal)` que rejeita no abort — pausa que ignora o `para`
      faz o `para` parecer quebrado
- [x] 1.5 Casos no `runIntent`
- [x] 1.6 Descrição das duas em `ACTION_DESCRIPTIONS` (o teste de cobertura do
      catálogo exige)

**Quality Gate: PASSOU**
- [x] `tsc` e `eslint` limpos

---

## Fase 2: Como a criança pede

- [x] 2.1 27 padrões em `commands.ts` (11 de `JUMP`, 16 de `TRICK`)
- [x] 2.2 `da um pulo` migrou de `habilidade_fisica` para `JUMP`: é ordem, não
      pergunta, e estava na entrada errada desde o começo
- [x] 2.3 Testes do parser, incluindo a prova de que **pergunta** sobre pular
      continua sendo conversa

**Quality Gate: PASSOU**
- [x] `voce sabe pular` e `sabe voar` continuam no repertório
- [x] `para` continua `STOP`

---

## Fase 3: As duas recusas somem

- [x] 3.1 `pedido_pular` removida das duas cópias
- [x] 3.2 `pedido_truque` removida das duas cópias
- [x] 3.3 `habilidade_fisica` ganhou duas variações que dizem que ele pula e
      dança a pedido
- [x] 3.4 `repertoire:sync -- --check` diz `iguais`

**Quality Gate: PASSOU**
- [x] 77 entradas (eram 79; duas viraram comando)
- [x] Nenhuma fala diz mais que ele não sabe pular ou girar

---

## Fase 4: Validação

- [x] 4.1 `npm test` (856 testes) e `npx eslint src test` limpos
- [x] 4.2 `repertoire:check` com as frases das duas ações e com as perguntas
- [x] 4.3 README: duas linhas na tabela de comandos
- [ ] 4.4 Em jogo: `pula`, `faz uma dancinha`, e `para` no meio da graça

**Quality Gate: PENDENTE**
- [x] Cenários de parser cobertos por teste
- [ ] 4.4 observado no mundo aberto — o bot não subiu nesta sessão

> A ação em si não tem teste unitário: ela é três linhas de `setControlState` e
> um `look`, e um teste com bot falso provaria só que o falso foi chamado. O que
> importa (o pulo acontecer, o `para` cortar) só a prova em jogo mostra.
