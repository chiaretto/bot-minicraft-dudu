# Proposal: Cavar não é o mesmo que conseguir o bloco

**Change ID:** `fix-harvest-and-gather`
**Created:** 2026-08-19
**Status:** Implementation Complete
**Completed:** 2026-08-19

---

## Problem Statement

Relatado em jogo: *"ele fala que vai construir uma escada, mas fala que não tem
blocos, mas deveria retirar os blocos para subir"*.

O log de `data/conversations/2026-08-19.jsonl` mostra a sequência inteira:

```
100  FresherRobin90  Construa uma casa
101  Odraude         Ahh, não tenho bloco nenhum pra construir.
102  FresherRobin90  colete 52 blocos
103  Odraude         Já vou pegar os blocos pra você!
104  Odraude         Peguei 52 de pedra pra você!
...
121  Odraude         Peraí, caí num buraco! Vou fazer uma escadinha.
122  Odraude         Ahh, não tenho bloco pra fazer degrau e não achei o que cavar aqui.
     (repetido SEIS vezes, linhas 121–132)
```

Ele anunciou 52 blocos e, minutos depois, estava de mãos vazias. **Os 52 nunca
existiram.**

## Causa raiz

`stone` e `cobblestone` têm `harvestTools` no registro do Minecraft: exigem
picareta. Quebrados com a mão, **somem sem dropar nada**. O bot não tinha
ferramenta nenhuma (linha 79 do log: *"Eu tô sem arma"*).

Disso saíram cinco defeitos encadeados, todos introduzidos por mim nos changes
`add-collect-and-build` e `add-escape-hole`:

| # | Defeito | Efeito |
|---|---|---|
| 1 | `collectBlock` contava blocos **quebrados**, não itens obtidos | o bot mentiu: "Peguei 52 de pedra" |
| 2 | Nada checava se ele **consegue colher** o bloco | cavou 52 pedras à toa, sem picareta |
| 3 | O drop caía fora do alcance e ninguém ia buscar | mesmo bloco colhível ficava no chão |
| 4 | `buildStructure` escolhia material **antes** de buscar | mochila vazia recusava sem tentar (linha 101) |
| 5 | O vigia repetia a falha a cada ciclo | a mesma frustração seis vezes no chat |

## Proposed Solution

**A regra que faltava: cavar não é o mesmo que conseguir.**

1. **Só cava o que consegue levar.** `canHarvestWith` (puro) compara o
   `harvestTools` do bloco com o que o bot tem. Sem picareta, pedra nem entra na
   busca — e a recusa diz *"preciso de uma picareta"*, não *"não achei"*.
2. **Equipa a melhor ferramenta** antes de cavar, quando tem alguma.
3. **Vai buscar o drop**: anda em cima de onde o bloco caiu.
4. **Conta o inventário de verdade**, antes e depois. O número que ele fala é o
   que entrou na mochila.
5. **A obra busca material** quando a mochila está vazia, em vez de recusar
   antes de tentar.
6. **O vigia espera** `UNSTICK_RETRY_MS` depois de falhar. Um chamado novo zera
   a espera — a criança pode ter jogado blocos para ele.

### Falas diferentes para problemas diferentes

*"me joga uns blocos"* e *"preciso de uma picareta"* pedem coisas opostas da
criança. Antes as duas situações davam a mesma frase.

## Scope

### In Scope

- Checagem de colheita na coleta, na obra e na saída de buraco.
- Equipar ferramenta antes de cavar.
- Recolher o drop.
- Contagem real de inventário.
- Busca de material com mochila vazia na obra.
- Espera do vigia depois de falhar.
- Repertório: tirar a promessa de pegar pedra na mão.
- Testes de regressão dos cinco defeitos.

### Out of Scope

- **Fabricar picareta.** Craftar continua fora do escopo do bot.
- Procurar picareta em baú.
- Pedir ferramenta ao jogador de forma proativa.
- Minerar minério.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| Domínio | Sim | `canHarvestWith` em `materials.ts` |
| Ações | Sim | `collectBlock` reescrito; `build` e `escape` filtram por colheita |
| `EscapeWorld` | Sim | Ganha `canHarvest(pos)` |
| App (`bot.ts`) | Sim | Espera do vigia; chamado novo zera |
| Repertório | Sim | `pedido_coleta` e `capacidades` sem promessa de pedra na mão |
| Configuração | Não | — |

## Success Criteria

- [x] Sem picareta, ele **não** cava pedra e diz que precisa de picareta
- [x] O número que ele fala é o que entrou na mochila
- [x] Com picareta, equipa antes de cavar
- [x] Depois de cavar, vai buscar o drop
- [x] Mochila vazia com `buildAutoGather`: busca em vez de recusar
- [x] A falha não é repetida a cada ciclo
- [x] `npm test` e `npx eslint src test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Ir buscar o drop atrasa cada bloco coletado | Alta | Baixo | Timeout curto (5 s) e falha não derruba a coleta |
| Bot sem ferramenta nenhuma fica sem material em caverna de pedra | **Alta** | Médio | Recusa honesta pedindo picareta ou blocos — não há como cavar pedra sem picareta |
| A espera do vigia deixar o bot preso por um minuto | Média | Baixo | Qualquer chamado novo zera a espera |
| `bestHarvestTool` não existir em versão futura do pathfinder | Baixa | Médio | Uso isolado no adaptador |
