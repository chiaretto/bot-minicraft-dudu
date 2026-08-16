# Proposal: Esconder de Verdade — Correção do Esconde-Esconde

**Change ID:** `fix-hide-and-seek-cover`
**Created:** 2026-08-16
**Status:** Archived
**Implementado:** 2026-08-16
**Arquivado:** 2026-08-16

> **Change de correção, nascido de uso real.** O esconde-esconde entrou no
> mundo em `add-bot-games-hide-and-seek` com 343 testes passando — e não
> funcionou na primeira partida. Este arquivo registra por quê.

---

## Problem Statement

Dois relatos do dono do projeto, jogando com a criança:

1. *"Ele não está se escondendo bem, está apenas ficando de costas para o
   jogador."*
2. *"Ele ainda está contando só até 10, e ainda está ficando no meu campo de
   visão."*

O segundo veio **depois** da primeira correção. Ou seja: a primeira rodada de
conserto não resolveu, e o defeito sobreviveu a uma suíte de testes que
supostamente cobria exatamente esse comportamento.

### Por que os testes não pegaram

Todos os testes de esconderijo usavam um mundo falso em que `ownerCanSee` era um
predicado dado pelo próprio teste. Isso exercita a **regra** ("não escolher ponto
visível") e nunca a **medição** ("o que conta como visível"). Os três defeitos
abaixo moravam todos na medição.

É a lição do change: quando a regra depende de uma medida do mundo, testar a
regra com a medida mockada prova pouco.

---

## Proposed Solution

Três defeitos distintos, todos no caminho entre "escolher um ponto" e "estar
realmente escondido".

### Defeito 1 — distância fingindo oclusão

`ownerCanSee` fazia o raycast com alcance `seeDistance` (20), enquanto os
candidatos eram sorteados até `hideMaxDistance` (30). O `hasLineOfSight` devolve
"não vê" assim que a distância passa do alcance — então **todo ponto entre 20 e
30 blocos era declarado escondido por aritmética, sem parede nenhuma no meio**.

Como o desempate preferia o ponto mais distante, ele caía sempre nessa faixa, no
descampado. O desempate seguinte, por campo de visão, o deixava atrás da criança.
Daí o relato: "só fica de costas para o jogador".

**Correção:** o alcance do raycast passa a cobrir toda a faixa de esconderijo,
com folga. Só bloco de verdade esconde.

### Defeito 2 — reserva aceitando campo aberto

Introduzido pela própria correção do defeito 1. Terminada a busca sem achar
cobertura, o bot aceitava o primeiro ponto do ranking — que podia ter cobertura
**zero**: campo aberto que só estava fora da linha de visão *naquele instante*.
O jogador virava a cabeça e acabou.

Em mundo aberto essa reserva disparava quase sempre, o que fez a correção do
defeito 1 quase não aparecer na prática.

**Correção:** piso absoluto de cobertura. Sem bloco sólido em volta não é
esconderijo, e o bot recusa a rodada dizendo isso.

### Defeito 3 — medição na altura errada

Os candidatos eram sorteados em volta do jogador herdando o `y` **dele**. Num
morro, a medição acontecia dentro da terra: cobertura 8, raio bloqueado,
esconderijo perfeito no papel. O pathfinder então largava o bot no ponto
alcançável mais próximo — o **topo** do morro, à vista de todos.

**Correção:** cada candidato desce (ou sobe) até o chão de verdade antes de ser
medido. Candidato sem chão conhecido é descartado.

### O que mudou junto

- **Procurar leva tempo.** O bot anda pelo entorno por até `hideSearchMs`
  (20 s), trocando de ponto de observação a cada volta. Não é enfeite: o raycast
  só enxerga chunk carregado, então procurar parado devolve sempre a mesma
  resposta.
- **A chegada é conferida.** Visão *e* cobertura são medidas na posição **real**
  onde o bot parou, não na que ele pediu — o pathfinder entrega "perto o
  suficiente", e perto o suficiente pode ser descampado.
- **Teto por caminhada** (8 s). Sem ele, um pathfinder emperrado seguraria a
  busca muito além dos 20 s prometidos, já que o prazo só é conferido *entre* as
  caminhadas.
- **A contagem vai até 20**, um número por segundo. Pedido direto do dono. Os
  20 segundos batem com o tempo que o bot leva procurando esconderijo, então os
  dois lados da brincadeira têm a mesma folga.

---

## Scope

### In Scope

- Alcance do raycast de esconderijo cobrindo toda a faixa de candidatos.
- Cobertura sólida obrigatória, medida com `blockAt` nas duas alturas do corpo.
- Resolução de chão por candidato (`resolveGround`).
- Busca com orçamento de tempo, andando entre pontos de observação.
- Conferência de visão e cobertura na posição real de chegada.
- Teto de tempo por caminhada dentro da rodada.
- `countTo: 20`, `countIntervalMs: 1000`.
- `hideSearchMs` no bloco `games` da configuração.

### Out of Scope

- **Esconderijo esperto** (cavar, fechar porta, subir em árvore) — segue fora,
  como no change original.
- **Caminhada furtiva** — o bot continua indo pelo caminho normal do pathfinder.
- **Escolher bioma ou construção específica.** Ele avalia cobertura local, não
  reconhece "casa" nem "caverna".
- **Ajuste automático em mundo aberto.** Em deserto ou planície ele vai recusar
  mais; afrouxar isso é decisão de configuração (`hideSearchMs`), não de código.

---

## Impact Analysis

| Component | Change Required | Details |
|-----------|-----------------|---------|
| Minecraft | Sim | `coverAround`, `resolveGround`, `blockSourceFrom` |
| Behaviors | Sim | `rankHidingSpots`, `pickScoutPoint`, busca com orçamento |
| Config | Sim | `hideSearchMs` novo; `countTo` e `countIntervalMs` mudados |
| State | Não | Nada na máquina de estados |
| Dados | Não | Repertório intocado |
| API | Não | Nenhuma chamada de IA no caminho |

---

## Success Criteria

- [x] Ponto além de `seeDistance` em campo aberto **não** conta como escondido.
- [x] Ponto sem bloco sólido em volta nunca é aceito, nem como último recurso.
- [x] Candidato é medido na altura em que o bot ficaria de pé, não na do jogador.
- [x] Candidato sem chão conhecido é descartado.
- [x] O bot anda procurando por até `hideSearchMs` e então para.
- [x] Chegada exposta ou descoberta recusa a rodada em vez de começar errada.
- [x] Nenhuma caminhada da rodada passa de 8 s.
- [x] A contagem vai de 1 a 20, um número por segundo.
- [x] `countTo * countIntervalMs` bate com `hideSearchMs`.
- [ ] ⏸ Rodada real: ele se esconde atrás de construção, árvore ou barranco.
- [ ] ⏸ Rodada real em mundo aberto: ele recusa com fala honesta.

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Recusar demais em mundo aberto** (deserto, planície) | Alta | Médio | Reserva aceita cobertura fraca (1 direção); `hideSearchMs` configurável; README diz para brincar perto de construções |
| Custo de `blockAt` na busca | Média | Baixo | Só nas transições de fase, nunca no laço de defesa de 250 ms; consulta é lookup em memória |
| `resolveGround` achando telhado em vez do chão | Média | Baixo | Varre de cima para baixo e exige 2 blocos de ar: acha a superfície que alguém andando alcançaria |
| 20 mensagens de contagem virando flood | Média | Baixo | `ChatSender` já espaça em 900 ms; 1 s por número fica acima do piso |
| **Regra certa com medida mockada voltar a esconder defeito** | Alta | Alto | Teste de integração com raycast real sobre parede sintética; testes de `coverAround` e `resolveGround` sem mock de regra |

---

## Archive Information

**Arquivado:** 2026-08-16
**Duração:** mesmo dia, em duas rodadas de relato do dono
**Desfecho:** corrigido; 2 verificações em mundo real pendentes

### Código

| Arquivo | O que mudou |
|---|---|
| `src/minecraft/visibility.ts` | `coverAround`, `resolveGround`, `blockSourceFrom`, `isSolid` |
| `src/behaviors/games/spots.ts` | `rankHidingSpots` (cobertura primeiro), `pickScoutPoint` |
| `src/behaviors/games/hide-and-seek.ts` | busca com orçamento, piso de cobertura, chão resolvido |
| `src/app/bot.ts` | alcance do raycast, `coverAt`, `groundAt`, teto por caminhada |
| `src/config/schema.ts` | `hideSearchMs`; `countTo: 20`; `countIntervalMs: 1000` |
| `config.example.yaml`, `README.md` | documentação |

Testes: **380** ao fim (343 antes do change).

### Specs atualizadas

- `openspec/specs/bot_games.md` — cobertura obrigatória, chão resolvido, busca
  com orçamento, cobertura zero recusada, conferência de chegada, contagem até 20
- `openspec/specs/configuration.md` — `hideSearchMs`, `countTo`, `countIntervalMs`
