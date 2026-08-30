# Implementation Tasks: Sair de buraco fazendo escadinha

**Change ID:** `add-escape-hole`

---

## Fase 1: Domínio (quando e quanto subir)

- [x] 1.1 `src/domain/escape.ts`: `needsEscape`, `pillarHeight`,
      `reachedOwnerLevel`, `diggableNeighbors`
- [x] 1.2 Nunca listar o bloco de baixo como cavável — cavar o chão aprofunda
      o buraco
- [x] 1.3 Intenção `ESCAPE_HOLE` em `src/domain/intent.ts`
- [x] 1.4 Testes das regras puras, incluindo dono ausente e teto de altura

**Quality Gate:** APROVADO
- [x] `npx eslint src test` limpo
- [x] Nenhuma dependência de `mineflayer` no domínio

---

## Fase 2: A subida

- [x] 2.1 `src/behaviors/actions/escape.ts` sobre a interface `EscapeWorld`
- [x] 2.2 Cavar as paredes para arranjar degrau, com teto de escavação
- [x] 2.3 Parar assim que alcançar o nível do dono
- [x] 2.4 Cancelamento por `AbortSignal` no meio da subida
- [x] 2.5 Falha ao colocar encerra falando, sem travar
- [x] 2.6 Testes com mundo falso: poço estreito, mochila vazia, cancelamento

**Quality Gate:** APROVADO
- [x] `npm test` passa
- [x] Subida parcial é reportada com honestidade

---

## Fase 3: Ligação com o mundo real

- [x] 3.1 `escapeWorldFrom()`: adaptador `mineflayer` → `EscapeWorld`
- [x] 3.2 `pillarUp`: olhar para baixo, pular, esperar o ápice, colocar
- [x] 3.3 `escape()` traduzindo erros para `ActionAborted` / `ActionRefused`
- [x] 3.4 Material limitado à interseção de `collectAllowlist` e `buildAllowlist`
- [x] 3.5 `runIntent` despacha `ESCAPE_HOLE`
- [x] 3.6 Config: `escapeMinDrop`, `escapeMaxHeight`, `escapeMaxDigs`,
      `escapeStuckMs`, com `config.example.yaml` documentado

**Quality Gate:** APROVADO
- [x] `npx tsc --noEmit` limpo
- [x] Só o adaptador encosta em `mineflayer`

---

## Fase 4: O vigia

- [x] 4.1 `tickStuck()` no laço que já existe, síncrono
- [x] 4.2 Três condições juntas: `FOLLOW`, parado e dono acima
- [x] 4.3 Não roda com rodada de brincadeira em andamento
- [x] 4.4 Fala antes de subir
- [x] 4.5 Retomar o seguir depois de subir
- [x] 4.6 Guarda de reentrada, para não empilhar duas subidas

**Quality Gate:** APROVADO
- [x] `npm test` passa
- [x] O tick continua síncrono e sem IA

---

## Fase 5: Chegar até a criança

- [x] 5.1 Comandos de nível 1: `sai do buraco`, `sobe`, `faz uma escadinha`
- [x] 5.2 `ESCAPE_HOLE` no catálogo de ações do prompt
- [x] 5.3 `capacidades` cita a habilidade nova, nas duas cópias do repertório
- [x] 5.4 Teste de que os comandos de seguir não foram roubados
- [x] 5.5 `cp data/repertoire.yaml src/dialogue/default-repertoire.yaml`

**Quality Gate:** APROVADO
- [x] Os dois arquivos de repertório idênticos
- [x] `vem` e `me segue` continuam sendo `FOLLOW`

---

## Fase 6: Verificação e documentação

- [x] 6.1 Testes de ponta a ponta das regras e da subida
- [x] 6.2 Atualizar o README
- [x] 6.3 **Testar em jogo de verdade**: cair numa ravina, chamar, e ver se ele
      - Fechado por decisão do dono em 2026-08-29. **Não verificado nesta
        sessão** — a lógica está coberta por teste, mas o cenário em jogo não
        foi observado por mim.
      sobe. É aqui que o tempo do pulo se prova
- [x] 6.4 **Testar com lag**: servidor carregado ainda coloca o bloco no ápice?
- [x] 6.5 `npm test` + `npx eslint src test` finais

**Quality Gate:**
- [x] Todos os testes passam
- [x] Lint limpo
- [x] Subida conferida em jogo, não só com mundo falso (PENDENTE — 6.3/6.4)
      - Fechado por decisão do dono em 2026-08-29. **Não verificado nesta
        sessão** — a lógica está coberta por teste, mas o cenário em jogo não
        foi observado por mim.
- [x] Documentação sincronizada

---

## Completion Checklist

- [x] Fases 1 a 5 completas; da 6, só a verificação em jogo ficou aberta
- [x] Repertório sincronizado nas duas cópias
- [x] Pronto para `/openspec-archive add-escape-hole` **depois** do teste em jogo
      - Fechado por decisão do dono em 2026-08-29. **Não verificado nesta
        sessão** — a lógica está coberta por teste, mas o cenário em jogo não
        foi observado por mim.
