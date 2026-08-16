# Implementation Tasks: Esconder de Verdade

**Change ID:** `fix-hide-and-seek-cover`

> Change de correção. As fases abaixo refletem as **duas rodadas** de relato do
> dono, na ordem em que aconteceram — a segunda existe porque a primeira não
> resolveu, e isso é a parte mais informativa deste arquivo.

---

## Rodada 1 — "só fica de costas para o jogador"

- [x] 1.1 Diagnóstico: `ownerCanSee` usava alcance `seeDistance` (20) com
      candidatos até `hideMaxDistance` (30) — distância virava oclusão
      ✓ 2026-08-16
- [x] 1.2 Alcance do raycast passa a cobrir toda a faixa de esconderijo
      ✓ 2026-08-16
- [x] 1.3 `coverAround`: cobertura sólida em 8 direções, nas duas alturas do
      corpo (degrau de 1 bloco não esconde um bot de 2) ✓ 2026-08-16
- [x] 1.4 `rankHidingSpots`: ordena por cobertura → fora do campo de visão →
      distância. Ordenar por distância era o que mandava o bot para o meio do
      nada ✓ 2026-08-16
- [x] 1.5 `pickScoutPoint` + busca com orçamento `hideSearchMs` (20 s)
      ✓ 2026-08-16
- [x] 1.6 Conferência da posição **real** de chegada ✓ 2026-08-16
- [x] 1.7 `blockSourceFrom`: adaptador de `Vec3` para `blockAt` ✓ 2026-08-16
  - Mesma armadilha do raycast: `getBlock` do prismarine chama `pos.floored()`.
    O typecheck **passava** (bivariância de método) e teria quebrado só em
    execução. Achado por leitura do pacote, não por teste.
- [x] 1.8 Teto de 8 s por caminhada ✓ 2026-08-16
  - O prazo da busca só é conferido *entre* as caminhadas; sem teto, um
    pathfinder emperrado furaria os 20 s prometidos.

**Quality Gate: PASSED** — 368 testes, `eslint`/`tsc`/`build` limpos.

**E mesmo assim não resolveu.** Ver rodada 2.

---

## Rodada 2 — "ainda está ficando no meu campo de visão"

- [x] 2.1 Diagnóstico A: a reserva do fim da busca aceitava cobertura **zero**
      ✓ 2026-08-16
  - Introduzido pela própria rodada 1. Em mundo aberto disparava quase sempre,
    o que fez a correção anterior quase não aparecer na prática.
- [x] 2.2 Piso absoluto de cobertura (`MIN_COVER`), com ideal em 2 direções
      ✓ 2026-08-16
- [x] 2.3 Diagnóstico B: candidato herdava o `y` do jogador ✓ 2026-08-16
  - Num morro a medição caía dentro da terra: cobertura 8, raio bloqueado,
    esconderijo perfeito no papel. O pathfinder largava o bot no topo, exposto.
- [x] 2.4 `resolveGround`: cada candidato desce até o chão de verdade antes de
      ser medido; sem chão conhecido, é descartado ✓ 2026-08-16
- [x] 2.5 Conferência de chegada passa a olhar cobertura, não só visão
      ✓ 2026-08-16
- [x] 2.6 `countTo: 20` com `countIntervalMs: 1000` ✓ 2026-08-16
  - Correção de leitura: "mude a contagem de tempo até 20 segundos" era **contar
    até 20**, não "10 números em 20 segundos".

**Quality Gate: PASSED** — 380 testes, `eslint`/`tsc`/`build` limpos.

---

## Verificação pendente

- [ ] ⏸ Rodada real: ele se esconde atrás de construção, árvore ou barranco
- [ ] ⏸ Rodada real em mundo aberto: recusa com fala honesta em vez de se
      esconder mal

---

## Por que a suíte não pegou nada disso

Vale registrar, porque custou duas rodadas.

Todos os testes de esconderijo davam `ownerCanSee` como predicado do próprio
teste (`() => false`, `(p) => p.x > 0`). Isso exercita a **regra** — "não
escolher ponto visível" — e nunca a **medição** — "o que conta como visível".
Os três defeitos moravam na medição:

| Defeito | Onde morava |
|---|---|
| Distância fingindo oclusão | alcance passado ao raycast |
| Reserva em campo aberto | ausência de piso de cobertura |
| Medição na altura errada | `y` do candidato |

O que passou a existir para fechar essa lacuna:

- teste de integração rodando a sessão contra o `hasLineOfSight` **real**, sobre
  uma parede sintética;
- testes de `coverAround` e `resolveGround` com terreno sintético (morro, buraco,
  fresta de um bloco, chunk que lança);
- testes de regressão nomeando o relato e a data.

**Regra que fica:** quando a regra depende de uma medida do mundo, testar a regra
com a medida mockada prova pouco. Alguma coisa tem que exercitar a medida.

---

## Completion Checklist

- [x] Todas as tarefas completas (⏸ registrados como verificação manual)
- [x] Quality gates passados nas duas rodadas
- [x] Specs consolidadas em `openspec/specs/`
- [x] Documentação sincronizada (`README.md`, `config.example.yaml`)
