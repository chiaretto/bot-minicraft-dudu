# Implementation Tasks: Dormir na cama

**Change ID:** `add-sleep`
**Implementado:** 2026-08-30 — falta prova em jogo

---

## Fase 1: A regra, pura

- [x] 1.1 `domain/sleeping.ts`: `isBedName`, `sleepRefusal`, `BED_SEARCH_RADIUS`
- [x] 1.2 `SLEEP_REFUSAL_LINES` como `Record` sobre o tipo da recusa — motivo
      novo sem fala não compila
- [x] 1.3 Testes das três recusas e das 16 cores de cama

**Quality Gate: PASSOU**

---

## Fase 2: A ação

- [x] 2.1 `sleepInBed()`: acha, recusa cedo, anda, deita
- [x] 2.2 Tradução do "não" do servidor (monstro, cama ocupada, hora errada)
- [x] 2.3 `wakeUp()`, que nunca lança
- [x] 2.4 `stopEverything` acorda

**Quality Gate: PASSOU** — `tsc` e `eslint` limpos

---

## Fase 3: Comandos e fala

- [x] 3.1 `SLEEP` no catálogo, schema, aprendíveis e prompt
- [x] 3.2 12 padrões, **sem** `boa noite`
- [x] 3.3 `pedido_dormir` → `pergunta_dormir`, com resposta nova
- [x] 3.4 `boa noite` para `despedida` — erro antigo achado na varredura
- [x] 3.5 `repertoire:sync -- --check` diz `iguais`

**Quality Gate: PASSOU**
- [x] `boa noite` → `despedida`; `vou dormir` → `despedida`
- [x] `vamos dormir` → comando; `voce sabe dormir` → repertório

---

## Fase 4: Validação

- [x] 4.1 `npm test` (915 testes) e `npx eslint src test` limpos
- [ ] 4.2 Em jogo: dormir de noite e ver a noite passar
- [ ] 4.3 Em jogo: pedir de dia e ouvir a recusa
- [ ] 4.4 Em jogo: pedir com zumbi por perto e ouvir a tradução

**Quality Gate: PENDENTE** — 4.2 a 4.4 não observados; o bot não subiu.
