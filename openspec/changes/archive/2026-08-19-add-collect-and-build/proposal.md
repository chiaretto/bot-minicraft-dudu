# Proposal: Pegar bloco de verdade e construir coisa simples

**Change ID:** `add-collect-and-build`
**Created:** 2026-08-19
**Status:** Implementation Complete
**Completed:** 2026-08-19

---

## Problem Statement

O dono pediu duas coisas: **pegar blocos** e **construir coisas simples, como
uma casa**. Investigando, os dois casos estavam em estados bem diferentes.

### Pegar bloco: o código existia, o caminho até ele não

`collectBlock()` está implementado em `behaviors/actions/index.ts` desde o
começo do projeto — anda até o bloco, cava, respeita allowlist e cancelamento.
Mas a criança nunca chegava nele:

| Onde | O que acontecia |
|---|---|
| Nível 1 (parser) | não tinha padrão nenhum para "pega madeira" |
| Nível 2 (repertório) | `pedido_coleta` capturava `pega madeira` e respondia **"Buscar coisa eu ainda não aprendi"** |
| Nível 3 (IA) | nunca era alcançado — o nível 2 resolveu antes |

Ou seja: o bot **negava por escrito** uma capacidade que tinha no código.

### Construir: não existia

`recusa_escopo` capturava `constroi uma casa` e `faz uma casa` e respondia que
não sabia — dessa vez com razão. Nenhuma ação de construção existia.

## Proposed Solution

### 1. Pegar bloco chega ao jogador

- **Comandos no nível 1** para os pedidos mais comuns: `pega madeira`,
  `pega pedra`, `pega terra`, `pega areia`. Nível 1 de propósito — funciona com
  `llm.provider: 'none'` e sem esperar o modelo.
- **Grupos de material** (`src/domain/materials.ts`): "madeira" vale por
  qualquer tronco. Numa floresta de bétula, procurar só `oak_log` devolveria
  "não achei" num lugar cheio de árvore.
- **Repertório corrigido**: `pedido_coleta` cobre agora só o que ele realmente
  não traz — minério — e ensina o que funciona.

### 2. Construir coisa simples

Catálogo **fechado** de plantas, no mesmo espírito do catálogo de jogos e do de
intenções:

| Estrutura | Forma | Blocos |
|---|---|---|
| `casa` | 5x5, paredes de 2, porta, 3 janelas, telhado plano | 52 |
| `torre` | 3x3, paredes de 4, porta, topo fechado | 39 |

Pequenas de propósito: obra grande demora demais para uma criança de 7 anos
assistir, e cada bloco a mais é uma chance a mais de dar errado.

**A ordem de colocação é a parte que decide se a obra fica de pé.** No Minecraft
só dá para colocar bloco encostado em algo que já existe. A planta sai ordenada
de baixo para cima e, dentro de cada camada, de fora para dentro — é assim que o
telhado fecha: o anel externo se apoia na parede, o seguinte no anterior, até o
meio. Um teste trava esse invariante bloco a bloco.

### Como fica no código

```
domain/materials.ts   grupos de bloco (puro)
domain/blueprints.ts  plantas e ordem de colocação (puro)
domain/intent.ts      intenção BUILD
behaviors/actions/build.ts   a obra, sobre uma interface estreita de mundo
behaviors/actions/index.ts   adaptador para mineflayer + coleta por grupo
behaviors/commands.ts        comandos de nível 1
ai/prompt.ts                 a IA passa a conhecer BUILD
```

`build.ts` recebe o mundo por uma interface estreita (`BuildWorld`), como o
`GameWorld` das brincadeiras: a regra da obra é testável sem servidor, e o que
encosta em `mineflayer` fica num adaptador só.

### Material da obra

Uma obra, um material. Sem pedido explícito, vence o que o bot tem em maior
quantidade na mochila; faltando material e com `buildAutoGather` ligado, ele vai
buscar sozinho antes de começar. Faltando mesmo, recusa **antes de levantar meia
parede**, dizendo quanto falta.

> Um material só evita crafting por completo — o bot não sabe craftar, então
> tábua não existe para ele. Casa de tronco ou de pedregulho é o que dá para
> fazer com o que ele consegue cavar.

## Scope

### In Scope

- Grupos de material e coleta por grupo.
- Comandos de nível 1 para pegar e para construir.
- Estruturas `casa` e `torre`, com planta, ordem e teto de segurança.
- Intenção `BUILD`, com a IA sabendo propor.
- Busca automática de material quando falta.
- Correção das promessas desatualizadas no repertório e no prompt.
- Testes.

### Out of Scope

- **Craftar.** Sem tábua, sem porta de verdade, sem vidro na janela.
- Estrutura sob medida ("faz uma casa de 10 por 10").
- Escolher onde construir por pedido do jogador ("faz ali").
- Terraplanagem: terreno muito acidentado sai torto.
- Desfazer a obra.
- Minério: `pega diamante` continua sendo recusa honesta.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| Domínio | Sim | `materials.ts` e `blueprints.ts` novos; `BUILD` em `intent.ts` |
| Ações (`behaviors/actions/`) | Sim | `build.ts` novo; coleta por grupo; adaptador `BuildWorld` |
| Comandos | Sim | Padrões de pegar e de construir no nível 1 |
| Prompt da IA | Sim | `BUILD` no catálogo; identidade não nega mais construir |
| Repertório (as **duas** cópias) | Sim | `recusa_escopo`, `pedido_coleta` e `capacidades` |
| Configuração | Sim | `buildAllowlist`, `buildMaxBlocks`, `buildAutoGather` |
| Defesa, jogos, conexão | Não | — |

## Architecture Considerations

- **Catálogo fechado**, como em jogos e intenções: a IA não inventa estrutura, e
  `castelo` é recusado antes de virar obra.
- **Geometria pura, efeito na borda**: a planta é uma função sem mundo; só o
  adaptador toca `mineflayer`.
- **Nada é destruído para construir**: posição já ocupada é pulada. É o que
  impede uma casa nascer em cima da casa do jogador.
- **Allowlist de obra separada da de coleta**: o que ele pode cavar não é
  necessariamente o que faz uma casa decente, e um dia uma pode mudar sem a outra.
- **Cancelamento é de primeira classe**: `dudu, para` interrompe no meio da obra,
  como em qualquer ação.

## Success Criteria

- [x] `pega madeira` faz o bot ir pegar madeira, sem IA ligada
- [x] `faz uma casa` levanta uma casa com porta, janelas e telhado
- [x] Bloco existente no caminho é preservado, não derrubado
- [x] Faltando material, ele busca; não conseguindo, recusa dizendo quanto falta
- [x] `dudu, para` interrompe a obra no meio
- [x] Estrutura fora do catálogo é recusada sem colocar bloco nenhum
- [x] Nenhuma fala do bot nega mais uma capacidade que ele tem
- [x] `npm test` e `npx eslint src test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Terreno acidentado deixa a obra torta ou enterrada | **Alta** | Médio | Posição ocupada é pulada em vez de derrubada; obra pequena reduz o estrago. Terraplanagem ficou fora de escopo |
| Pathfinder não alcança algum bloco e a obra sai incompleta | Média | Médio | Até 4 passadas; bloco que falhou volta depois; no fim ele **fala** que faltaram pedaços em vez de fingir que terminou |
| Bot se enterra dentro da própria obra | Média | Médio | A âncora nasce ao lado do bot e foge do jogador; a obra é oca e tem porta |
| Coleta automática demora e a criança acha que travou | Média | Médio | A busca acontece **antes** de colocar bloco, e a fala vem antes da ação |
| Obra grande travar o servidor | Baixa | Alto | `buildMaxBlocks` (120) recusa antes de começar |
| Sobrar promessa desatualizada em outro canto do repertório | Média | Alto | Teste varre as falas de recusa procurando negação do que ele sabe fazer |

---

## Archive Information

**Archived:** 2026-08-29
**Outcome:** implementado; ver a ressalva de verificação abaixo

### Ressalva de verificação

Os cenários de **prova em jogo** do `tasks.md` **não foram verificados na sessão
que arquivou**. O arquivamento foi decisão do dono do projeto, em lote com os
outros changes de 2026-08-19.

A lógica está coberta por teste unitário; o que falta é a observação no mundo
aberto. Quem for mexer nesta área deve tratar esses cenários como não
confirmados.

### Nota sobre o merge

As seções `MODIFIED` foram mescladas **à mão**, requisito por requisito, com
conferência de cenários perdidos arquivo por arquivo. Neste projeto `MODIFIED` de
delta é **acréscimo**, não substituição — mesclar por script apaga cenário.
