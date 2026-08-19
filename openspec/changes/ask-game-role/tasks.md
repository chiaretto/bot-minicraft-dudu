# Implementation Tasks: O bot pergunta quem faz cada papel

**Change ID:** `ask-game-role`

---

## Fase 1: Domínio (papéis e respostas)

- [x] 1.1 Em `src/domain/games.ts`, remover `DEFAULT_ROLE_BY_GAME`
- [x] 1.2 Criar o mapa resposta → papel por jogo (`eu` / `voce` para cada jogo),
      com o nome deixando claro que o papel é o **do bot**
- [x] 1.3 Ajustar `resolveRole` em `src/behaviors/games/index.ts` para exigir
      papel — sem papel não existe sessão, existe pergunta
- [x] 1.4 Testes do mapa: `eu` no esconde-esconde é `bot_procura` e no pega-pega
      é `bot_pega`; `voce` é `bot_esconde` e `bot_foge`

**Quality Gate:** APROVADO
- [x] `npx eslint src test` limpo
- [x] Nenhuma referência sobrando a `DEFAULT_ROLE_BY_GAME`

---

## Fase 2: Comandos (convite e resposta)

- [x] 2.1 Em `src/behaviors/commands.ts`, tirar `role` dos convites pelo **nome
      do jogo** (`pega pega`, `esconde esconde` e variantes)
- [x] 2.2 Manter intactos os convites com papel explícito (`me pega`,
      `eu vou me esconder`, `se esconde`, `voce corre`, …)
- [x] 2.3 Criar `parseRoleAnswer(game, texto)`, com as respostas de cada jogo
- [x] 2.4 Padrões normalizados: minúsculas, sem acento, sem pontuação —
      conferir com `prepare()` de `dialogue/normalize.ts`
- [x] 2.5 Testes: cada resposta aceita, e `eu` devolvendo papel diferente em
      cada jogo

**Quality Gate:** APROVADO
- [x] `npm test` passa
- [x] Nenhum convite com papel explícito mudou de papel

---

## Fase 3: Fluxo no bot (pergunta, resposta, prazo)

- [x] 3.1 Adicionar `games.roleQuestionTimeoutMs` (padrão 45000) em
      `src/config/schema.ts` e em `config.example.yaml`
- [x] 3.2 Em `src/app/bot.ts`, guardar a escolha pendente `{ game, expiresAt }`
- [x] 3.3 `startGame()` com papel ausente: pergunta e **não** cria sessão nem
      entra em `GAME`
- [x] 3.4 Ler a resposta no topo do `onChat`, ao lado do `isGiveUp`, só com
      pendência viva
- [x] 3.5 Descartar a pendência quando: a rodada começa, chega qualquer comando
      reconhecido, ou o prazo estoura
- [x] 3.6 Reperguntar **uma vez** se a mensagem não responder e não for comando;
      depois deixar expirar em silêncio
- [x] 3.7 Verificar que a pendência não bloqueia `para`, `me segue` nem a defesa

**Quality Gate:** APROVADO
- [x] `npm test` passa
- [x] Bot segue em `IDLE` enquanto espera — nenhum estado novo na máquina

---

## Fase 4: Repertório (as duas cópias)

- [x] 4.1 Entrada `jogo_quem_esconde` em `data/repertoire.yaml`, com **4+**
      variações de `Quem se esconde: eu ou você?`
- [x] 4.2 Entrada `jogo_quem_corre`, com **4+** variações de
      `Quem corre: eu ou você?`
- [x] 4.3 Toda variação nomeia **as duas** opções — pergunta que esconde uma das
      escolhas não resolve o problema que originou este change
- [x] 4.4 Comentário com a data de origem (2026-08-19) nas duas entradas
- [x] 4.5 `cp data/repertoire.yaml src/dialogue/default-repertoire.yaml`

**Quality Gate:** APROVADO
- [x] Os dois arquivos de repertório idênticos (`diff` vazio)
- [x] Nenhum aviso de `MIN_VARIATIONS_WARN` no startup

---

## Fase 5: Verificação e documentação

- [x] 5.1 Teste dos quatro caminhos (convite sem papel nos dois jogos, e convite
      com papel explícito nos dois), em `test/game-role-question.test.ts`
- [x] 5.2 Teste de que `eu` sem pergunta pendente volta a ser conversa
- [x] 5.3 Atualizar o README onde ele descreve como escolher o papel
- [x] 5.4 `npm test` + `npx eslint src test` finais

**Quality Gate:** APROVADO
- [x] Todos os testes passam
- [x] Lint limpo
- [x] Documentação sincronizada

---

## Completion Checklist

- [x] Todas as fases completas
- [x] Todos os quality gates aprovados
- [x] Repertório sincronizado nas duas cópias
- [x] Pronto para `/openspec-archive ask-game-role`
