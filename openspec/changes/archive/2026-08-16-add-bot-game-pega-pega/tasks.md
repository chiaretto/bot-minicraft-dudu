# Implementation Tasks: Segunda Brincadeira — Pega-Pega

**Change ID:** `add-bot-game-pega-pega`

> Mesma adaptação da estrutura padrão usada no change do esconde-esconde: o bot
> é headless, então "User Interface" é a camada de conversa — a interface real
> com o jogador é o chat do jogo.
>
> **Ordem das fases segue a regra de dependência entre camadas**: domínio e
> config primeiro, depois a regra pura (escolha de ponto de fuga), a sessão do
> jogo, e só então o wiring no `app/`. Cada fase é testável sozinha, sem
> servidor Minecraft.
>
> Convenção de nomes: `Dudu` é o **bot**, `Miguel` é o **jogador dono**.
>
> Itens marcados com ⏸ **exigem servidor Minecraft real** e só podem ser
> verificados manualmente, no mundo aberto para LAN na 1.21.11.

---

## Phase 1: Foundation (Domínio e Configuração)

- [x] 1.1 `src/domain/games.ts`: `'pega_pega'` em `GAME_NAMES`; `'bot_pega'` e
      `'bot_foge'` em `GAME_ROLES`; fases `'perseguindo'`, `'fugindo'` e
      `'entregue'` em `GAME_PHASES` ✓ 2026-08-16
- [x] 1.2 `DEFAULT_ROLE` (constante única) vira `DEFAULT_ROLE_BY_GAME`:
      `esconde_esconde → bot_esconde`, `pega_pega → bot_pega` ✓ 2026-08-16
- [x] 1.3 `ROLES_BY_GAME` + `isRoleValidForGame(game, role)`: papel de um jogo
      aplicado a outro é recusado antes de virar sessão ✓ 2026-08-16
- [x] 1.4 Bloco `games.tag` no schema de config: `countTo` (5),
      `countIntervalMs` (1000), `chaseTimeoutMs` (60000), `fleeTimeoutMs`
      (60000), `surrenderTimeoutMs` (30000), `touchDistance` (2),
      `chaseFollowDistance` (1), `chaseSprint` (true), `fleeSprint` (false),
      `fleeStepMin` (8), `fleeStepMax` (16), `fleeMaxDistanceFromOwner` (40),
      `fleeCandidateSamples` (16), `roundTimeoutMs` (180000) ✓ 2026-08-16
- [x] 1.5 `superRefine` do bloco `tag`: `fleeStepMin ≤ fleeStepMax`,
      `fleeStepMax ≤ fleeMaxDistanceFromOwner`, `touchDistance < fleeStepMin`,
      e `countTo × countIntervalMs + max(chaseTimeoutMs, fleeTimeoutMs) +
      surrenderTimeoutMs ≤ roundTimeoutMs` — senão a rede de segurança dispara
      antes da regra do jogo e o bot morre no meio da frase ✓ 2026-08-16
- [x] 1.6 `config.example.yaml` com o bloco `games.tag` comentado, explicando o
      equilíbrio dos dois sprints ✓ 2026-08-16
- [x] 1.7 Exemplos de `PLAY_GAME{game: "pega_pega"}` (nos dois papéis) no prompt
      de interpretação em `src/ai/prompt.ts` ✓ 2026-08-16
- [x] 1.8 Testes de config: defaults aplicados sem bloco `games`; cada validação
      cruzada recusando com mensagem legível ✓ 2026-08-16

**Quality Gate:** PASSED
- [x] `npm run lint` e `npx tsc --noEmit` limpos (não existe script `typecheck`;
      a checagem de tipos do projeto é o `tsc` do `npm run build`)
- [x] `npm test` passando
- [x] Nenhum jogo novo exigiu mudança no `intentSchema`

---

## Phase 2: Regra Pura (Escolha de Ponto de Fuga)

- [x] 2.1 `pickFleePoint(owner, bot, opts, random)` em
      `src/behaviors/games/spots.ts`: amostra pontos entre `fleeStepMin` e
      `fleeStepMax` do **bot**, pontua por distância ao jogador e devolve o
      melhor alcançável ✓ 2026-08-16
- [x] 2.2 Descartar candidato acima de `fleeMaxDistanceFromOwner` do jogador —
      fugir mundo afora tira o bot do campo de visão da criança ✓ 2026-08-16
- [x] 2.3 Candidato sem chão conhecido (`groundAt` nulo) descartado, como já é
      feito na escolha de esconderijo ✓ 2026-08-16
- [x] 2.4 Empate resolvido pelo ponto que mais **aumenta** a distância atual, e
      não pelo mais distante em absoluto: fugir "para trás do jogador" é pior
      que fugir dois blocos na direção certa ✓ 2026-08-16
  - Faltava um caso que só apareceu escrevendo o código: **no teto** de
    `fleeMaxDistanceFromOwner`, todo ponto que aumenta a distância está fora do
    limite, e exigir ganho positivo deixava o bot parado esperando ser pego.
    Entrou uma reserva de corrida lateral, e o cenário
    "Fuga no teto de distância" foi acrescentado ao `bot_games_delta.md`.
- [x] 2.5 Testes puros em `test/games-spots.test.ts`: fuga se afasta, respeita o
      teto, ignora ponto sem chão, e é determinística com `random` fixo
      ✓ 2026-08-16

**Quality Gate:** PASSED
- [x] Nenhuma dependência de `mineflayer` no módulo de pontos
- [x] Testes cobrindo fuga encurralada (nenhum candidato válido → `null`)

---

## Phase 3: Sessão do Jogo

- [x] 3.1 `src/behaviors/games/tag.ts` com `TagSession` implementando
      `GameSession` (`run`, `requestReveal`, `currentPhase`)
- [x] 3.2 `GameWorld` ganha `chaseOwner(distance: number): void` (objetivo
      dinâmico, **não bloqueante**) e `setSprinting(on: boolean): void`
- [x] 3.3 Papel `bot_pega`: aceita, conta 1..`countTo` com `sayRaw`, avisa o fim
      da contagem, e só então começa a perseguir
- [x] 3.4 Papel `bot_pega`: laço de perseguição a cada `POLL_MS`, encostou
      (`≤ touchDistance`) → fala `pega_te_peguei` e desfecho `ganhou`
- [x] 3.5 Papel `bot_pega`: `chaseTimeoutMs` esgotado → `stopMoving()`, sprint
      desligado, fala `pega_cansei_pegando`, desfecho `perdeu`
- [x] 3.6 Papel `bot_foge`: sai correndo na hora (sem contagem), reescolhendo
      ponto de fuga quando chega ao ponto ou quando o jogador entra em
      `fleeStepMin`
- [x] 3.7 Papel `bot_foge`: jogador encostou → fala `pega_fui_pego`, desfecho
      `perdeu`
- [x] 3.8 Papel `bot_foge`: `fleeTimeoutMs` esgotado → fase `entregue`, para de
      correr, fala `pega_cansei_fugindo` e espera parado até ser tocado ou até
      `surrenderTimeoutMs`; nos dois casos, desfecho `perdeu`
- [x] 3.9 `requestReveal()` com sentido por papel: fugindo → entrega imediata;
      pegando → o jogador parou, o bot alcança e ganha
- [x] 3.10 `guard()` em toda transição de fase e `stopMoving()` + sprint
      desligado em **todo** caminho de saída, inclusive `GameAborted`
- [x] 3.11 Jogador sumiu (`ownerPosition()` nulo: saiu do servidor ou trocou de
      dimensão) → desfecho `cancelado` em qualquer fase
- [x] 3.12 `roundTimeoutMs` como rede de segurança: desfecho `tempo_esgotado`,
      distinto do `perdeu` por cansaço
- [x] 3.13 `createSession` com o segundo `case` e recusa de papel incompatível
      com o jogo
- [x] 3.14 `test/games-tag.test.ts`: rodada completa nos dois papéis com mundo e
      relógio falsos — vitória, cansaço, entrega, cancelamento, jogador sumido

**Quality Gate:** PASSED
- [x] Rodada inteira testável sem servidor Minecraft (35 testes em
      `test/games-tag.test.ts`)
- [x] Nenhuma chamada de IA em nenhuma fase
- [x] Nenhum caminho de saída deixa o bot correndo ou com sprint ligado

> **Defeito achado escrevendo o teste, e que valia para o jogo real:** com a
> caminhada de fuga falhando na hora (pathfinder estourando), o laço girava sem
> o relógio andar e sem ceder o processador — no teste travava para sempre, e em
> jogo teria virado 100% de CPU. `runHop` passou a esperar ANTES de avaliar as
> condições de parada, garantindo que todo trecho de fuga faça o tempo passar, e
> a falha da caminhada sobe em vez de ser engolida.

---

## Phase 4: Conversa (Comandos e Repertório)

- [x] 4.1 Convites de `pega_pega` papel `bot_pega` em
      `src/behaviors/commands.ts`: `vamos brincar de pega pega`, `pega pega`,
      `pique pega`, `pira pega`, `me pega`, `vem me pegar`, `corre atras de
      mim`, `tenta me pegar`, `voce pega`, `vamos de pega pega`, `bora de pega
      pega`
- [x] 4.2 Convites papel `bot_foge`: `eu vou te pegar`, `eu te pego`, `eu pego
      voce`, `voce corre`, `voce foge`, `corre que eu vou te pegar`, `sai
      correndo`
- [x] 4.3 Padrões nomeando o jogo **antes** dos genéricos, como já é feito com
      `eu vou me esconder`, senão o papel sai trocado
- [x] 4.4 Convite genérico (`vamos brincar`, `vamos jogar`, `bora brincar`,
      `quer brincar`) vira `jogo_qual_brincadeira`: pergunta, sem rodada e sem
      estado pendente
- [x] 4.5 Entradas novas no repertório (≥ 4 variações cada, linguagem de criança
      de 7 anos): `pega_aceito_pego`, `pega_aceito_fujo`, `pega_vou_pegar`,
      `pega_te_peguei`, `pega_cansei_pegando`, `pega_fui_pego`,
      `pega_cansei_fugindo`, `pega_me_entrego`, `jogo_qual_brincadeira`
- [x] 4.6 Reescrever `jogo_desconhecido` e `jogo_desligado`: a primeira oferece
      **as duas** brincadeiras; a segunda continua não oferecendo nenhuma
- [x] 4.7 Varrer o repertório atrás de fala que ainda trate esconde-esconde como
      a única brincadeira (`project.md` → "nunca prometer o que o bot não faz",
      e o inverso: nunca esconder o que ele passou a fazer)
- [x] 4.8 Cada entrada nova com comentário datado (`# 2026-08-16`), como manda o
      `CLAUDE.md`
- [x] 4.9 Testes de parser em `test/behaviors.test.ts`: cada convite devolve o
      papel certo; convite genérico **não** devolve `PLAY_GAME`

**Quality Gate:** PASSED
- [x] Nenhuma entrada abaixo de `MIN_VARIATIONS_WARN` (4) — o load do catálogo
      devolve 55 entradas e **0 avisos**
- [x] Nenhum termo técnico em fala de chat
- [x] `commandPatternCount()` conferido no teste

> O convite genérico precisou de uma intenção nova, `ASK_WHICH_GAME`, em vez de
> virar entrada de repertório com padrões próprios: só o wiring sabe se
> `games.enabled` está ligado, e perguntar "esconde-esconde ou pega-pega?" com as
> brincadeiras desligadas seria oferecer o que o bot não pode fazer.

---

## Phase 5: Wiring e Integração

- [x] 5.1 `gameWorld()` em `src/app/bot.ts` implementa `chaseOwner` com
      `GoalFollow` dinâmico e `setSprinting` com o controle do mineflayer
- [x] 5.2 `games.tag` passa para `createSession`, ao lado de `hideAndSeek`
- [x] 5.3 Sprint desligado no `finally` de `startGame`, junto com `stopMoving` —
      rodada cancelada não pode deixar o bot correndo pelo mundo
- [x] 5.4 Sincronizar as **duas** cópias do repertório:
      `cp data/repertoire.yaml src/dialogue/default-repertoire.yaml`
- [x] 5.5 README: seção das brincadeiras com as frases que funcionam para as
      duas, e o bloco `games.tag` documentado
- [ ] 5.6 ⏸ Teste manual no mundo real, papel `bot_pega`: contagem sai no chat,
      o bot corre, encosta e declara vitória
- [ ] 5.7 ⏸ Teste manual, papel `bot_foge`: o bot foge de verdade, é alcançável
      por uma criança correndo, e não cai em ravina nem entra na água
- [ ] 5.8 ⏸ Teste manual de interrupção: `dudu, para` e um zumbi chegando param
      o bot na hora, com fala
- [ ] 5.9 ⏸ Rodada com a criança de verdade — o equilíbrio dos sprints é o único
      item que nenhum teste automatizado decide

**Quality Gate:** PASSED (menos os ⏸)
- [x] `npm test` (441 testes), `npx tsc --noEmit` e `npx eslint src test` limpos
- [x] As duas cópias do repertório idênticas (`diff` limpo)
- [x] README e `config.example.yaml` refletindo o estado real

> **Duas ressalvas de ambiente, ambas anteriores a este change:**
>
> 1. `npm run lint` falha na etapa do Prettier em **48 arquivos**, inclusive os
>    que este change não toca. Causa: o working tree inteiro está em CRLF e o
>    Prettier espera LF. Confirmado rodando o mesmo comando com a árvore limpa.
>    Os arquivos deste change passam com `prettier --end-of-line auto --check`.
>    Corrigir isso reescreveria o repositório inteiro e não cabe aqui.
> 2. `test/dialogue.test.ts` → "três saudações seguidas dão três respostas
>    diferentes" é **intermitente** (falhou 1 vez em 6 na árvore limpa, sem
>    nenhuma alteração aplicada). O sorteio só evita repetir a resposta
>    imediatamente anterior, então a 3ª pode repetir a 1ª.

---

## Completion Checklist

- [x] Todas as fases completas, menos os itens ⏸
- [x] Todos os quality gates automatizados passados
- [ ] Itens ⏸ verificados manualmente no servidor 1.21.11 — **pendente**: exigem
      o mundo aberto para LAN e a criança jogando
- [x] Documentação sincronizada (README, `config.example.yaml`, repertório)
- [ ] Pronto para `/openspec-archive add-bot-game-pega-pega` — só depois dos ⏸
