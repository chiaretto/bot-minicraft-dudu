# Implementation Tasks: Pôr um bloco e cavar

**Change ID:** `add-place-and-dig`
**Implementado:** 2026-08-30 — falta prova em jogo

---

## Fase 1: Geometria e guardas, puras

- [x] 1.1 `domain/digging.ts`: `DIG_SHAPES`, `facingFromYaw`, `planDig`,
      `isUnderBot`, `NEVER_DIG`, `dangerNear`
- [x] 1.2 Planta do buraco de cima para baixo (o bloco de baixo é inalcançável
      enquanto o de cima está lá)
- [x] 1.3 Planta do túnel abrindo cabeça e pé no mesmo passo, antes de andar
- [x] 1.4 23 testes, incluindo a prova de que **nenhuma planta toca a coluna do
      bot em nenhuma das quatro direções**

**Quality Gate: PASSOU**

---

## Fase 2: A escavação

- [x] 2.1 `behaviors/actions/dig.ts` com `DigWorld` estreito
- [x] 2.2 As três recusas antes do primeiro golpe
- [x] 2.3 Bloco que ele não leva é pulado em silêncio
- [x] 2.4 `digWorldFrom()` e `dig()` no `index.ts`

**Quality Gate: PASSOU** — `tsc` e `eslint` limpos

---

## Fase 3: Pôr bloco

- [x] 3.1 `placeBlockAhead()`, reusando o adaptador da obra
- [x] 3.2 Recusa sem apoio e em lugar ocupado

---

## Fase 4: Catálogo, comandos e fala

- [x] 4.1 `PLACE_BLOCK` e `DIG` no catálogo, schema, aprendíveis e prompt
- [x] 4.2 `shape` no JSON Schema entregue ao provider
- [x] 4.3 25 padrões em `commands.ts`
- [x] 4.4 `pedido_cavar` removida; `pedido_soltar_item` reescrita
- [x] 4.5 `digMaxBlocks` na configuração
- [x] 4.6 `repertoire:sync -- --check` diz `iguais`

**Quality Gate: PASSOU**
- [x] `cava`, `cava um tunel`, `poe um bloco aqui` caem em comando
- [x] `joga no chao` continua no repertório

---

## Fase 5: Validação

- [x] 5.1 `npm test` (905 testes) e `npx eslint src test` limpos
- [ ] 5.2 Em jogo: buraco, túnel e bloco
- [ ] 5.3 Em jogo: pedir buraco perto de lava e confirmar a recusa
- [ ] 5.4 Em jogo: confirmar que ele **não** cai no próprio buraco

**Quality Gate: PENDENTE** — 5.2 a 5.4 não observados; o bot não subiu.

> A 5.4 é a que justifica o desenho inteiro. Se ele cair, a planta está errada,
> não o mundo.
