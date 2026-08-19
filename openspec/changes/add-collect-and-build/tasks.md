# Implementation Tasks: Pegar bloco de verdade e construir coisa simples

**Change ID:** `add-collect-and-build`

---

## Fase 1: Domínio (materiais e plantas)

- [x] 1.1 `src/domain/materials.ts`: grupos de bloco e resolução de candidatos
- [x] 1.2 `src/domain/blueprints.ts`: catálogo fechado, `planStructure`, footprint
- [x] 1.3 Ordem de colocação: de baixo para cima, de fora para dentro
- [x] 1.4 Intenção `BUILD` em `src/domain/intent.ts`, com `structure` fechado
- [x] 1.5 Teste do **invariante de apoio**: nenhum bloco fica no ar na vez dele
- [x] 1.6 Testes de geometria: porta, janelas, telhado fechado, obra oca

**Quality Gate:** APROVADO
- [x] `npx eslint src test` limpo
- [x] Nenhuma dependência de `mineflayer` no domínio

---

## Fase 2: A obra

- [x] 2.1 `src/behaviors/actions/build.ts` sobre a interface estreita `BuildWorld`
- [x] 2.2 Escolha de âncora, fugindo de onde o jogador está
- [x] 2.3 Escolha de material, respeitando a allowlist de obra
- [x] 2.4 Colocação em passadas, com bloco sem apoio adiado
- [x] 2.5 Posição ocupada é pulada — nunca derrubar o que já existe
- [x] 2.6 Busca automática de material quando falta
- [x] 2.7 Cancelamento por `AbortSignal` no meio da obra
- [x] 2.8 Testes com mundo falso, incluindo falha de colocação e cancelamento

**Quality Gate:** APROVADO
- [x] `npm test` passa
- [x] Obra nunca fica travada em laço

---

## Fase 3: Ligação com o mundo real

- [x] 3.1 `buildWorldFrom()`: adaptador `mineflayer` → `BuildWorld`
- [x] 3.2 `build()` traduzindo erros para `ActionAborted` / `ActionRefused`
- [x] 3.3 `runIntent` despacha `BUILD`
- [x] 3.4 `collectBlock` passa a procurar pelo GRUPO do material
- [x] 3.5 Config: `buildAllowlist`, `buildMaxBlocks`, `buildAutoGather`
- [x] 3.6 `config.example.yaml` documentado

**Quality Gate:** APROVADO
- [x] `npx tsc --noEmit` limpo
- [x] Só o adaptador encosta em `mineflayer`

---

## Fase 4: Chegar até a criança

- [x] 4.1 Comandos de nível 1 para pegar madeira, pedra, terra e areia
- [x] 4.2 Comandos de nível 1 para `casa` e `torre`
- [x] 4.3 `BUILD` no catálogo de ações do prompt, com exemplos
- [x] 4.4 `identityFacts` não nega mais construir
- [x] 4.5 Exemplo do prompt que dizia "não sei construir casa" trocado por um
      pedido que ele de fato não faz (poção)

**Quality Gate:** APROVADO
- [x] `npm test` passa
- [x] Toda ação do catálogo aparece no prompt

---

## Fase 5: Repertório (as duas cópias)

- [x] 5.1 `recusa_escopo`: tirar `constroi uma casa` e `faz uma casa`
- [x] 5.2 `pedido_coleta`: tirar `pega madeira` e `pega pedra`; deixar minério
- [x] 5.3 `capacidades`: passar a citar pegar bloco e construir
- [x] 5.4 Comentário com a data de origem (2026-08-19) nas entradas mexidas
- [x] 5.5 Teste que varre as recusas atrás de promessa desatualizada
- [x] 5.6 `cp data/repertoire.yaml src/dialogue/default-repertoire.yaml`

**Quality Gate:** APROVADO
- [x] Os dois arquivos de repertório idênticos (`diff` vazio)
- [x] Nenhuma fala nega capacidade que o bot tem

---

## Fase 6: Verificação e documentação

- [x] 6.1 Testes de ponta a ponta dos comandos novos
- [x] 6.2 Atualizar o README
- [ ] 6.3 **Construir em jogo de verdade**: a casa fica de pé em terreno real?
- [ ] 6.4 **Coletar em jogo de verdade**: ele acha e cava a madeira?
- [x] 6.5 `npm test` + `npx eslint src test` finais

**Quality Gate:**
- [x] Todos os testes passam
- [x] Lint limpo
- [ ] Obra conferida em jogo, não só com mundo falso (PENDENTE — ver 6.3/6.4)
- [x] Documentação sincronizada

---

## Completion Checklist

- [x] Fases 1 a 5 completas; da 6, só a verificação em jogo ficou aberta
- [x] Repertório sincronizado nas duas cópias
- [ ] Pronto para `/openspec-archive add-collect-and-build` **depois** do teste
      em jogo
