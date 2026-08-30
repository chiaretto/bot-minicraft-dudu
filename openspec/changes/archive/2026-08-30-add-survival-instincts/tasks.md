# Implementation Tasks: Instintos de sobrevivência

**Change ID:** `add-survival-instincts`
**Implementado:** 2026-08-30 — falta prova em jogo

> **2026-08-30 — provado em jogo pelo dono, e aprovado.**
>
> As caixas de "em jogo" abaixo ficaram como estavam: a aprovação foi da sessão
> inteira, não item a item. Marcá-las uma a uma diria que cada cenário foi
> observado, e isso ninguém afirmou.

---

## Fase 1: As regras, puras

- [x] 1.1 `domain/survival.ts` com `FOOD_ITEMS`, `chooseFood`, `isCalm`,
      `shouldEat` e `shouldPlaceTorch`
- [x] 1.2 Catálogo sem maçã dourada, sem carne crua e sem carne podre
- [x] 1.3 `CALM_STATES` = `IDLE`, `FOLLOW`, `STAY`
- [x] 1.4 17 testes das regras

**Quality Gate: PASSOU** — as três guardas da tocha cobertas por teste

---

## Fase 2: Os efeitos, na borda

- [x] 2.1 `eatSomething()`: equipa, consome, devolve o nome ou `null`
- [x] 2.2 `placeTorch()`: tocha no chão de baixo, devolve `true`/`false`
- [x] 2.3 As duas **nunca lançam** — instinto não derruba a ação em curso

**Quality Gate: PASSOU** — `tsc` e `eslint` limpos

---

## Fase 3: O laço

- [x] 3.1 `tickSurvival()` com `survivalBusy`, uma coisa por passada
- [x] 3.2 Laço próprio, separado do vigia de ameaça (passo de 3 s)
- [x] 3.3 Parado junto com o vigia no `stopThreatWatcher`
- [x] 3.4 `saySpontaneous()`, que faltava como método reusável

**Quality Gate: PASSOU**

---

## Fase 4: Configuração e fala

- [x] 4.1 Sete chaves em `behaviorSchema`
- [x] 4.2 `config.example.yaml` com a seção comentada
- [x] 4.3 `evento_fome` e `evento_tocha`, 5 variações cada, nas duas cópias
- [x] 4.4 `repertoire:sync -- --check` diz `iguais`

**Quality Gate: PASSOU**

---

## Fase 5: Validação

- [x] 5.1 `npm test` (882 testes) e `npx eslint src test` limpos
- [ ] 5.2 Em jogo: passar fome com pão na mochila
- [ ] 5.3 Em jogo: entrar numa caverna escura com tocha na mochila
- [ ] 5.4 Em jogo: confirmar que ele NÃO come no meio de uma briga

**Quality Gate: PENDENTE** — 5.2 a 5.4 não observados; o bot não subiu.

> A 5.4 é a que mais importa: é a guarda que impede o instinto de atrapalhar
> justamente quando a criança precisa dele.
