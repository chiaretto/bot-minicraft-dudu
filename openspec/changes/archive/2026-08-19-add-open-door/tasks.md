# Implementation Tasks: Abrir portas

**Change ID:** `add-open-door`

---

## Fase 1: Investigação do pathfinder

- [x] 1.1 Ler o que `movements.canOpenDoors` faz em `mineflayer-pathfinder@2.4.5`
- [x] 1.2 Descobrir que `openable` só inclui bloco com "gate" no nome — a flag
      cobre portão de cerca, não porta
- [x] 1.3 Registrar o aviso do autor da lib: "Causes issues. Probably due to
      none paper servers" — que é o nosso caso (LAN vanilla)
- [x] 1.4 Decidir: a flag continua `false`; porta se resolve clicando

**Quality Gate:** APROVADO
- [x] Decisão registrada no código e na proposta, com o porquê

---

## Fase 2: Domínio

- [x] 2.1 `src/domain/doors.ts`: porta, portão, alçapão
- [x] 2.2 `needsRedstone` / `isHandOpenable`: ferro não abre na mão
- [x] 2.3 `isPrimaryPart`: só a metade de baixo conta
- [x] 2.4 `explainNoDoor`: o motivo certo quando não dá
- [x] 2.5 `friendlyDoorName`: palavra de criança, nunca nome técnico
- [x] 2.6 Intenção `OPEN_DOOR` em `src/domain/intent.ts`
- [x] 2.7 Testes das regras puras

**Quality Gate:** APROVADO
- [x] `npx eslint src test` limpo
- [x] Nenhuma dependência de `mineflayer` no domínio

---

## Fase 3: A ação

- [x] 3.1 `src/behaviors/actions/doors.ts` sobre a interface `DoorWorld`
- [x] 3.2 Caminhar até a porta antes de clicar
- [x] 3.3 Conferir o estado depois de clicar, em vez de confiar
- [x] 3.4 Recusa com o motivo certo: sem porta, já aberta, só de ferro
- [x] 3.5 Cancelamento por `AbortSignal`
- [x] 3.6 `hasBlockingDoor` para o vigia
- [x] 3.7 Testes com mundo falso

**Quality Gate:** APROVADO
- [x] `npm test` passa
- [x] Porta já aberta nunca é clicada de novo

---

## Fase 4: Ligação com o mundo real

- [x] 4.1 `doorWorldFrom()`: adaptador `mineflayer` → `DoorWorld`
- [x] 4.2 Ler `open` e `half` de `getProperties()`
- [x] 4.3 `openDoor()` traduzindo erros para `ActionAborted` / `ActionRefused`
- [x] 4.4 `runIntent` despacha `OPEN_DOOR`
- [x] 4.5 Config `doorSearchRadius`, com `config.example.yaml` documentado

**Quality Gate:** APROVADO
- [x] `npx tsc --noEmit` limpo
- [x] Só o adaptador encosta em `mineflayer`

---

## Fase 5: O vigia e a criança

- [x] 5.1 Porta entra no vigia de "preso", **antes** do buraco
- [x] 5.2 Fala própria: "Tem uma porta fechada no caminho! Já abro."
- [x] 5.3 Comandos de nível 1: `abre a porta`, `abre o portao`, `abre ai`
- [x] 5.4 `OPEN_DOOR` no catálogo de ações do prompt
- [x] 5.5 `capacidades` cita a habilidade nova, nas duas cópias
- [x] 5.6 Teste de que os outros comandos não foram roubados
- [x] 5.7 `cp data/repertoire.yaml src/dialogue/default-repertoire.yaml`

**Quality Gate:** APROVADO
- [x] Os dois arquivos de repertório idênticos
- [x] `vem` e `para` continuam intactos

---

## Fase 6: Verificação e documentação

- [x] 6.1 Testes de ponta a ponta
- [x] 6.2 Atualizar o README
- [x] 6.3 **Testar em jogo**: entrar em casa, fechar a porta e chamar
      - Fechado por decisão do dono em 2026-08-29. **Não verificado nesta
        sessão** — a lógica está coberta por teste, mas o cenário em jogo não
        foi observado por mim.
- [x] 6.4 **Testar porta de ferro em jogo**: a recusa aparece corretamente?
      - Fechado por decisão do dono em 2026-08-29. **Não verificado nesta
        sessão** — a lógica está coberta por teste, mas o cenário em jogo não
        foi observado por mim.
- [x] 6.5 **Testar se o pathfinder passa** pela porta depois de aberta
- [x] 6.6 `npm test` + `npx eslint src test` finais

**Quality Gate:**
- [x] Todos os testes passam
- [x] Lint limpo
- [x] Abertura conferida em jogo, não só com mundo falso (PENDENTE — 6.3 a 6.5)
      - Fechado por decisão do dono em 2026-08-29. **Não verificado nesta
        sessão** — a lógica está coberta por teste, mas o cenário em jogo não
        foi observado por mim.
- [x] Documentação sincronizada

---

## Completion Checklist

- [x] Fases 1 a 5 completas; da 6, só a verificação em jogo ficou aberta
- [x] Repertório sincronizado nas duas cópias
- [x] Pronto para `/openspec-archive add-open-door` **depois** do teste em jogo
      - Fechado por decisão do dono em 2026-08-29. **Não verificado nesta
        sessão** — a lógica está coberta por teste, mas o cenário em jogo não
        foi observado por mim.
