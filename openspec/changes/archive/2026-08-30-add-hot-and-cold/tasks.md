# Implementation Tasks: Quente e frio

**Change ID:** `add-hot-and-cold`
**Implementado:** 2026-08-30 — falta prova em jogo

> **2026-08-30 — provado em jogo pelo dono, e aprovado.**
>
> As caixas de "em jogo" abaixo ficaram como estavam: a aprovação foi da sessão
> inteira, não item a item. Marcá-las uma a uma diria que cada cenário foi
> observado, e isso ninguém afirmou.

---

## Fase 1: A regra, pura

- [x] 1.1 `domain/hot-cold.ts`: seis temperaturas, `temperature()` e o `Record`
      de falas
- [x] 1.2 "Morno" para quem parou; "pelando" por distância absoluta
- [x] 1.3 Testes da regra, incluindo o primeiro passo (sem anterior)

**Quality Gate: PASSOU**

---

## Fase 2: A rodada

- [x] 2.1 `HotColdSession` no contrato `GameWorld` — **sem mudar o contrato**
- [x] 2.2 Escolha do ponto com chão e alcançável; recusa honesta sem lugar
- [x] 2.3 Repetição espaçada por `repeatEvery`
- [x] 2.4 Revelação no fim: desistência, tempo esgotado
- [x] 2.5 Registro em `createSession`

**Quality Gate: PASSOU** — `tsc` e `eslint` limpos

---

## Fase 3: Um papel só

- [x] 3.1 `quente_frio` com `bot_esconde_ponto` em `ROLES_BY_GAME`
- [x] 3.2 `startGame` escolhe sozinho quando a lista tem um item
- [x] 3.3 `ROLE_QUESTION_ENTRY` vira `string | null`
- [x] 3.4 Teste de papel atualizado
      - O teste "as duas escolhas dão papéis diferentes" era verdadeiro para
        jogo de dois papéis e virou falso com um jogo de um. Agora ele cobre os
        de dois, e um teste novo cobre os de um.

**Quality Gate: PASSOU**

---

## Fase 4: Falas e configuração

- [x] 4.1 Nove entradas, 5 variações nas temperaturas, nas duas cópias
- [x] 4.2 Três falas atualizadas de "duas brincadeiras" para três
- [x] 4.3 Bloco `hotCold` no schema e no `config.example.yaml`
- [x] 4.4 `repertoire:sync -- --check` diz `iguais`
- [x] 4.5 README com a seção do jogo

**Quality Gate: PASSOU**
- [x] Teste trava que nenhuma fala do jogo tem coordenada

---

## Fase 5: Validação

- [x] 5.1 `npm test` (935 testes) e `npx eslint src test` limpos
- [ ] 5.2 Em jogo: uma rodada inteira até achar
- [ ] 5.3 Em jogo: parar no lugar e ouvir "morno"
- [ ] 5.4 Em jogo: desistir e ser levado até o ponto

**Quality Gate: PENDENTE** — 5.2 a 5.4 não observados; o bot não subiu.

> A 5.2 é a que mede se a brincadeira é **divertida**, que é a única coisa que
> teste nenhum mede.
