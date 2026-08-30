# Implementation Tasks: Voltar onde o dono morreu

**Change ID:** `add-death-spot`
**Implementado:** 2026-08-30 — falta prova em jogo

---

## Fase 1: Ver a morte

- [x] 1.1 Evento `ownerDied` no `MinecraftClient`, a partir do `entityDead`
- [x] 1.2 Só o dono dispara — morte de outro jogador não é assunto do bot
- [x] 1.3 O bot guarda `{ pos, at }` e loga a coordenada arredondada

**Quality Gate: PASSOU** — `tsc` e `eslint` limpos

---

## Fase 2: Levar de volta

- [x] 2.1 `GO_TO_DEATH_SPOT` no catálogo, schema, aprendíveis e prompt
- [x] 2.2 `goToDeathSpot()` com o aviso de cinco minutos
- [x] 2.3 `sayFrom()`, que faltava como método reusável
- [x] 2.4 12 padrões em `commands.ts`
- [x] 2.5 Teste de que a intenção **não carrega coordenada**

**Quality Gate: PASSOU**

---

## Fase 3: As falas

- [x] 3.1 `lugar_morte_desconhecido`, 4 variações, nas duas cópias
- [x] 3.2 `evento_dono_morreu` passa a ser dita — estava morta no catálogo desde
      15/08, prometendo em silêncio
- [x] 3.3 `repertoire:sync -- --check` diz `iguais`

**Quality Gate: PASSOU**

---

## Fase 4: Validação

- [x] 4.1 `npm test` (917 testes) e `npx eslint src test` limpos
- [ ] 4.2 Em jogo: morrer perto do bot e confirmar que ele fala
- [ ] 4.3 Em jogo: pedir para ser levado e chegar no lugar certo
- [ ] 4.4 Em jogo: pedir sem morte nenhuma e ouvir a recusa honesta

**Quality Gate: PENDENTE** — 4.2 a 4.4 não observados; o bot não subiu.

> A 4.2 é a que depende de mundo de verdade: `entityDead` é evento de protocolo,
> e nenhum teste unitário prova que ele chega.
