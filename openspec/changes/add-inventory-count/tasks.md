# Implementation Tasks: Contar a mochila

**Change ID:** `add-inventory-count`
**Implementado:** 2026-08-30 — falta prova em jogo

---

## Fase 1: Vocabulário e intenção

- [x] 1.1 `materialFromSpokenName()` em `domain/materials.ts`, catálogo fechado
      com plurais, apelidos (`tronco`, `pau`, `pedregulho`) e nomes técnicos
- [x] 1.2 `COUNT_ITEM` no catálogo, schema e aprendíveis
- [x] 1.3 `countItem()` em `actions/index.ts`, somando o **grupo** inteiro
- [x] 1.4 Descrição no prompt

**Quality Gate: PASSOU** — `tsc` e `eslint` limpos

---

## Fase 2: A captura, no molde do ataque nomeado

- [x] 2.1 `COUNT_PATTERNS` com captura e `parseCount()`
- [x] 2.2 Entra depois do ataque e antes do `stripFillers`, e roda de novo sobre
      o texto sem enfeite
- [x] 2.3 Testes: as seis formas de perguntar, e as quatro que **não** podem
      virar comando

**Quality Gate: PASSOU**
- [x] `quantos amigos voce tem`, `quantos anos voce tem`, `quantas vidas voce
      tem` e `quanto de saudade voce tem` continuam descendo na cascata
- [x] `o que voce tem ai` continua no repertório (`inventario_social`)

---

## Fase 3: A IA para de responder no escuro

- [x] 3.1 `inventoryLine()` e a mochila no `worldContext()`
- [x] 3.2 Só os cinco maiores; vazio vira `nada`
- [x] 3.3 Testes do prompt com mochila cheia e vazia

**Quality Gate: PASSOU**

---

## Fase 4: Validação

- [x] 4.1 `npm test` (865 testes) e `npx eslint src test` limpos
- [x] 4.2 `repertoire:check` com as perguntas boas e as que não são de item
- [ ] 4.3 Em jogo: perguntar com a mochila cheia e com ela vazia

**Quality Gate: PENDENTE** — 4.3 não observado; o bot não subiu nesta sessão.

### Sobrou anotado

`quantos anos voce tem` desce para a IA — é pergunta de criança, não tem entrada
no repertório e não é item. Candidata a entrada nova na próxima rodada de
`/upgrade-repertoire`.
