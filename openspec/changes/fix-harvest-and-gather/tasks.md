# Implementation Tasks: Cavar não é o mesmo que conseguir o bloco

**Change ID:** `fix-harvest-and-gather`

---

## Fase 1: Diagnóstico

- [x] 1.1 Ler `data/conversations/2026-08-19.jsonl` e isolar a sequência
- [x] 1.2 Confirmar no registro que `stone`/`cobblestone` exigem picareta
- [x] 1.3 Mapear os cinco defeitos encadeados

**Quality Gate:** APROVADO
- [x] Causa raiz confirmada com dado, não com suposição

---

## Fase 2: A regra que faltava

- [x] 2.1 `canHarvestWith` em `src/domain/materials.ts` (puro)
- [x] 2.2 `canHarvestNow` no adaptador, lendo o registro e o inventário
- [x] 2.3 `EscapeWorld.canHarvest(pos)`
- [x] 2.4 Testes da regra pura

**Quality Gate:** APROVADO
- [x] `npx eslint src test` limpo

---

## Fase 3: Coleta honesta

- [x] 3.1 Filtrar a busca pelo que ele consegue colher
- [x] 3.2 Equipar a melhor ferramenta antes de cavar
- [x] 3.3 Andar em cima do drop para recolher
- [x] 3.4 Contar inventário antes/depois em vez de blocos quebrados
- [x] 3.5 Recusa específica: "preciso de uma picareta"

**Quality Gate:** APROVADO
- [x] O número falado é o que entrou na mochila

---

## Fase 4: Obra e saída de buraco

- [x] 4.1 `buildStructure` busca material com a mochila vazia
- [x] 4.2 `build()` só oferece material que ele tem ou consegue colher
- [x] 4.3 `arranjarMaterial` não cava o que não consegue levar
- [x] 4.4 Falas diferentes para "me joga blocos" e "preciso de picareta"

**Quality Gate:** APROVADO
- [x] `npm test` passa

---

## Fase 5: Parar de repetir a falha

- [x] 5.1 Espera do vigia depois de uma tentativa falha
- [x] 5.2 Chamado novo do jogador zera a espera

**Quality Gate:** APROVADO
- [x] A mesma falha não aparece seis vezes no chat

---

## Fase 6: Repertório e verificação

- [x] 6.1 `pedido_coleta` e `capacidades` sem promessa de pegar pedra na mão
- [x] 6.2 `cp data/repertoire.yaml src/dialogue/default-repertoire.yaml`
- [x] 6.3 Testes de regressão dos cinco defeitos
- [ ] 6.4 **Testar em jogo**: cair num buraco de terra sem ferramenta e chamar
- [ ] 6.5 **Testar em jogo**: buraco de pedra sem picareta dá a recusa certa
- [ ] 6.6 **Testar em jogo**: `pega madeira` traz madeira de verdade
- [x] 6.7 `npm test` + `npx eslint src test` finais

**Quality Gate:**
- [x] Todos os testes passam
- [x] Lint limpo
- [ ] Correção conferida em jogo (PENDENTE — 6.4 a 6.6)
- [x] Repertório sincronizado nas duas cópias

---

## Completion Checklist

- [x] Fases 1 a 5 completas; da 6, só a verificação em jogo ficou aberta
- [ ] Pronto para `/openspec-archive fix-harvest-and-gather` **depois** do teste
      em jogo
