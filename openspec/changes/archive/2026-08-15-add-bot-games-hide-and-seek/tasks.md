# Implementation Tasks: Jogos com o Bot — Esconde-Esconde

**Change ID:** `add-bot-games-hide-and-seek`

> Adaptação da estrutura padrão de fases: o bot é headless, então "User
> Interface" é substituída pelas camadas de conversa — a interface real com o
> jogador é o chat do jogo.
>
> **Ordem das fases segue a cascata de resolução e a regra de dependência entre
> camadas**: domínio e config primeiro, depois a percepção (linha de visão), a
> regra pura (escolha de pontos), a sessão do jogo, e só então o wiring no
> `app/`. Assim cada fase é testável sozinha, sem servidor Minecraft.
>
> Convenção de nomes em toda a spec: `Dudu` é o **bot**, `Miguel` é o **jogador
> dono**.
>
> Itens marcados com ⏸ **exigem servidor Minecraft real** e só podem ser
> verificados manualmente, no mundo aberto para LAN na 1.21.11.

---

## Phase 1: Foundation (Domínio e Configuração)

- [x] 1.1 `src/domain/games.ts`: `GameName` (`'esconde_esconde'`), `GameRole`
      (`'bot_esconde' | 'bot_procura'`), fases da rodada e `GameOutcome`
      (`'ganhou' | 'perdeu' | 'cancelado' | 'tempo_esgotado'`) ✓ 2026-08-15
- [x] 1.2 Estado `GAME` em `BotState` e em `STATE_PRIORITY` (prioridade 2, a
      mesma de `ACTION`) ✓ 2026-08-15
  - Implementado como `NON_RESUMABLE_STATES` em `domain/types.ts`, consultado
    pelo `interrupt()`: `GAME` **nunca é empilhado**, em vez de ser empilhado e
    descartado no `resume()`. Mesmo resultado observável, um lugar só para a
    regra morar.
- [x] 1.3 `whenSchema` de `dialogue/schema.ts` aceitando `GAME` no enum de
      estado ✓ 2026-08-15
- [x] 1.4 Intenção `PLAY_GAME` em `INTENT_TYPES`, no `intentSchema` (params
      `game` obrigatório, `role` opcional) e em `INTENT_JSON_SCHEMA` ✓ 2026-08-15
  - Exemplos de `PLAY_GAME` acrescentados ao prompt de interpretação: o schema
    já entrava sozinho por `INTENT_TYPES`, mas sem exemplo o modelo não sabia
    quando usar.
- [x] 1.5 Bloco `games` no schema de config: `enabled` + `hideAndSeek`
      (`hideMinDistance`, `hideMaxDistance`, `hideCandidateSamples`,
      `touchDistance`, `seeDistance`, `countTo`, `countIntervalMs`,
      `fakeSearches`, `fakeSearchMinDistanceFromOwner`, `roundTimeoutMs`)
      ✓ 2026-08-15
- [x] 1.6 `config.example.yaml` com o bloco `games` comentado, explicando o que
      cada distância significa na prática da brincadeira ✓ 2026-08-15
- [x] 1.7 Testes de config: defaults aplicados, valores inválidos recusados com
      mensagem acionável ✓ 2026-08-15

**Quality Gate: PASSED**
- [x] `eslint src test` limpo — ver nota sobre `prettier` no fim do arquivo
- [x] `tsc --noEmit` limpo
- [x] `npm test` passa (config + intent + state machine)
- [x] Nenhum `switch` sobre `BotState` ficou sem o caso `GAME`

---

## Phase 2: Percepção — Linha de Visão

- [x] 2.1 `src/minecraft/visibility.ts` com interface mínima de mundo
      (mesmo padrão de `SnapshotSource`), para dar para testar sem servidor
      ✓ 2026-08-15
- [x] 2.2 `hasLineOfSight(world, from, to)`: raycast entre dois pontos, com os
      olhos a 1.62 de altura nas duas pontas ✓ 2026-08-15
  - **Falha fechada**: mundo ausente ou raycast que lança viram "não enxerga".
    O erro seguro é o bot demorar mais para achar, nunca declarar que achou sem
    ter visto.
- [x] 2.3 `isInFieldOfView(fromPos, yaw, target, halfAngle)`: função pura, para
      preferir esconderijo fora do cone de visão atual do jogador ✓ 2026-08-15
- [x] 2.4 Testes com mundo falso: caminho livre, caminho bloqueado, alvo além do
      alcance, alvo exatamente no limite, jogador de costas ✓ 2026-08-15

**Quality Gate: PASSED**
- [x] `eslint` limpo, `tsc --noEmit` limpo
- [x] 19 testes de visibilidade passam sem nenhum mock de `mineflayer`

### Desvio: dependência `vec3` declarada

`vec3` foi promovida de transitiva a **dependência direta** em `package.json`
(1 linha no `package-lock.json`, versão já instalada e compartilhada pelo
`mineflayer` e pelo `prismarine-world`).

Motivo: o `RaycastIterator` do `prismarine-world` chama `.minus()` na origem do
raio. Passar um objeto solto `{x,y,z}` faz a consulta **lançar** — e, com o
`try` de `hasLineOfSight`, isso viraria silenciosamente um bot que nunca acha
ninguém. A conversão para `Vec3` acontece em `raycastWorldFrom()`, na borda,
para o resto do módulo continuar puro e testável.

---

## Phase 3: Regra Pura — Escolha de Pontos

- [x] 3.1 `src/behaviors/games/spots.ts`: `sampleCandidates(center, min, max, n,
      random)` — amostragem de pontos num anel ao redor do jogador ✓ 2026-08-15
  - Ângulo varrido em passo regular com deslocamento aleatório, em vez de
    sorteado ponto a ponto: sorteio puro amontoa candidatos de um lado só e o
    bot se esconde sempre na mesma direção — coisa que criança percebe na
    terceira rodada.
- [x] 3.2 `pickHidingSpot(candidates, owner, isVisible, opts)`: descarta o que o
      jogador enxerga, prefere o que está fora do cone de visão dele, devolve
      `null` quando não sobra candidato válido ✓ 2026-08-15
- [x] 3.3 `pickFakeSearchSpots(owner, bot, opts, random)`: N pontos a **pelo
      menos** `fakeSearchMinDistanceFromOwner` do jogador, e distantes entre si
      ✓ 2026-08-15
  - A contagem é **garantia**, não tentativa: candidato descartado por
    espaçamento gira o ângulo e tenta de novo, em vez de virar uma busca falsa
    a menos. Coberto por varredura de 25 sementes.
- [x] 3.4 Testes: nenhum ponto escolhido é visível pelo jogador; nenhuma busca
      falsa cai perto do jogador; sem candidato válido devolve `null`;
      determinismo com `random` injetado ✓ 2026-08-15

**Quality Gate: PASSED**
- [x] `eslint` limpo, `tsc --noEmit` limpo
- [x] Módulo 100% puro — nenhum import de `mineflayer` nem de `node:*`
- [x] 21 testes, com varredura de sementes nas invariantes de distância

---

## Phase 4: Sessão do Jogo — Esconde-Esconde

- [x] 4.1 `src/behaviors/games/hide-and-seek.ts`: máquina de fases dos dois
      papéis, com relógio e `AbortSignal` injetados ✓ 2026-08-15
  - Todo o acoplamento com o mundo passa pela interface `GameWorld` (12
    métodos). É o que permite rodar a brincadeira inteira em milissegundos de
    teste, com relógio falso e sem servidor.
- [x] 4.2 Papel **bot se esconde**: aceitar → mandar contar → escolher ponto →
      caminhar → **chegar** → só então falar `pode procurar` → ficar imóvel
      ✓ 2026-08-15
- [x] 4.3 Detecção de toque: jogador a ≤ `touchDistance` do bot escondido
      encerra a rodada com `perdeu` ✓ 2026-08-15
- [x] 4.4 Papel **bot procura**: contagem 1..`countTo` no chat, um número por
      mensagem, respeitando `countIntervalMs` ✓ 2026-08-15
- [x] 4.5 Buscas falsas: exatamente `fakeSearches` (padrão 2) deslocamentos a
      pontos errados, com fala em cada um ✓ 2026-08-15
- [x] 4.6 **Cegueira deliberada** durante as buscas falsas: nenhuma checagem de
      visão do jogador conta enquanto o bot está fingindo ✓ 2026-08-15
  - Testado com o caso mais duro: `botCanSeeOwner()` devolvendo `true` desde o
    primeiro instante. O `jogo_achei` ainda sai depois das duas buscas erradas.
- [x] 4.7 Busca real: checagem periódica de linha de visão; ao enxergar, caminha
      até o jogador e só declara `achei` ao chegar perto ✓ 2026-08-15
  - Caminhada em passos de `seeDistance / 2` para o bot reavaliar a visão pelo
    caminho, em vez de só no fim da caminhada.
- [x] 4.8 Timeout de rodada nos dois papéis, com desfecho amigável ✓ 2026-08-15
- [x] 4.9 Cancelamento por `AbortSignal`: a sessão termina, fala no chat e não
      deixa nada pendurado ✓ 2026-08-15
  - `GameAborted` vira `outcome: 'cancelado'`; qualquer outro erro **sobe**, em
    vez de virar rodada cancelada em silêncio.
- [x] 4.10 Falha honesta quando não há esconderijo válido — recusa com fala, não
      silêncio nem `GAME` travado ✓ 2026-08-15
- [x] 4.11 `src/behaviors/games/index.ts`: registro de jogos por nome, despacho e
      recusa honesta para jogo desconhecido ✓ 2026-08-15
- [x] 4.12 Testes da máquina de fases com relógio falso e cliente falso: ordem
      das fases, `pode procurar` só após chegada, 2 buscas falsas antes de
      qualquer aproximação, `achei` só com visão limpa, timeout, abort
      ✓ 2026-08-15

**Quality Gate: PASSED**
- [x] `eslint` limpo, `tsc --noEmit` limpo
- [x] 33 testes cobrem os dois papéis fim a fim, sem servidor
- [x] Nenhuma chamada de IA no caminho do jogo

---

## Phase 5: Conversa — Comandos e Repertório

- [x] 5.1 Padrões de comando para **bot se esconde** ✓ 2026-08-15
- [x] 5.2 Padrões de comando para **bot procura** ✓ 2026-08-15
- [x] 5.3 Padrões de convite genérico (`vamos brincar`, `vamos jogar`) caindo no
      jogo padrão do change (esconde-esconde, bot se escondendo) ✓ 2026-08-15
  - O grupo de `bot_procura` vem **antes** no array: senão `eu vou me esconder`
    casaria com o convite genérico e o papel sairia trocado.
- [x] 5.4 Padrões já normalizados: minúsculas, sem acento, sem pontuação —
      conferidos com `prepare()` de `dialogue/normalize.ts` ✓ 2026-08-15
- [x] 5.5 Entradas novas no catálogo, **≥4 variações cada** ✓ 2026-08-15
  - **15 entradas**, não 12. A extra é `jogo_desligado`, exigida pela regra
    número um: com `games.enabled: false`, reusar `jogo_desconhecido` faria o
    bot **oferecer** o esconde-esconde que acabou de recusar. Ver o delta de
    `local_dialogue_delta.md`, atualizado junto.
  - `isGiveUp()` acrescentado a `commands.ts` para `desisto` / `cade voce`.
    **Não** virou intenção do catálogo: só faz sentido com rodada em andamento,
    e fora dela `cade voce` é conversa que o repertório responde.
- [x] 5.6 Toda fala revisada contra a regra número um (criança de 7 anos):
      frase curta, palavra simples, tom de amigo, sem termo técnico
      ✓ 2026-08-15
  - Coberto por teste, não só por revisão: limite de 120 caracteres e regex
    barrando termo técnico em toda variação nova.
- [x] 5.7 Entrada `capacidades` atualizada — o bot agora sabe brincar, e a
      resposta antiga promete menos do que ele faz ✓ 2026-08-15
- [x] 5.8 Testes de repertório: todas as entradas novas existem, casam pelos
      padrões esperados e nenhuma dispara aviso de variação insuficiente
      ✓ 2026-08-15

**Quality Gate: PASSED**
- [x] `eslint` limpo, `tsc --noEmit` limpo
- [x] Load do catálogo sem nenhum aviso — 46 entradas, 223 respostas
- [x] Nenhuma fala nova prometendo capacidade que o bot não tem (teste dedicado
      para o caso `games.enabled: false`)

---

## Phase 6: Integração & Polimento

- [x] 6.1 Wiring em `app/bot.ts`: `PLAY_GAME` → sessão de jogo, com o estado
      `GAME` entrando por `state.command()` ✓ 2026-08-15
  - O estado é criado **antes** da sessão: é dele que sai o `AbortSignal` que
    `dudu, para` e a defesa usam para cancelar de verdade.
- [x] 6.2 Defesa e emergência cancelando a rodada: `tickDefense` interrompe,
      a sessão aborta, o bot avisa no chat ✓ 2026-08-15
  - Centralizado em `interruptForDefense()`, usado nos 4 pontos de interrupção,
    para nenhum caminho de combate esquecer de avisar que o jogo acabou.
- [x] 6.3 `resume()` chegando em `GAME` cai direto em `IDLE` — jogo não é
      retomado ✓ 2026-08-15
- [x] 6.4 Fim de rodada por morte do bot, desconexão do jogador e troca de
      dimensão ✓ 2026-08-15
- [x] 6.5 Convite vindo de outro jogador recusado com educação, sem iniciar nada
      ✓ 2026-08-15 (já garantido pelo filtro de autorização em `onChat`)
- [x] 6.6 `README.md`: seção de como brincar, com as frases que funcionam
      ✓ 2026-08-15
- [x] 6.7 **Sincronizar as duas cópias do repertório** ✓ 2026-08-15
- [ ] 6.8 ⏸ Rodada real no mundo, bot se escondendo: ele some de vista, avisa só
      depois de chegar, e admite a derrota ao ser tocado
- [ ] 6.9 ⏸ Rodada real no mundo, bot procurando: conta no chat, erra duas
      vezes de propósito e depois acha
- [ ] 6.10 ⏸ Rodada real interrompida por zumbi: o bot larga o jogo, defende e
      não volta a brincar sozinho
- [ ] 6.11 ⏸ Rodada real em ambiente apertado (dentro de casa): a recusa honesta
      aparece no chat

**Quality Gate: PASSED** (exceto os ⏸, que exigem servidor)
- [x] `vitest run` — 343 testes passam (eram 222)
- [x] `eslint src test` e `npm run build` limpos
- [x] `git diff` mostra `src/dialogue/default-repertoire.yaml` atualizado e
      idêntico a `data/repertoire.yaml`
- [x] Documentação sincronizada (`README.md`, `config.example.yaml`)

---

## Completion Checklist

- [x] Todas as fases completas (⏸ registrados como verificação manual pendente)
- [x] Todos os quality gates passados
- [x] Success criteria da `proposal.md` conferidos um a um
- [x] Repertório sincronizado nas duas cópias
- [x] Documentação sincronizada
- [x] Pronto para `/openspec-archive add-bot-games-hide-and-seek`

---

## Notas do ambiente — coisas que NÃO são deste change

Duas coisas apareceram durante a implementação, as duas **anteriores** a ele.
Ficam registradas para não serem re-investigadas do zero.

### 1. `npm run lint` não passa nesta cópia (fim de linha)

`git config core.autocrlf` é `true`, então os arquivos ficam em CRLF no disco,
enquanto o `prettier` usa o padrão `endOfLine: "lf"`. Resultado: **os 42
arquivos** do projeto são reprovados, inclusive os que este change nunca tocou
(`src/domain/mobs.ts`, `src/memory/jsonl.ts`...).

O gate deste change foi feito com `eslint src test` (limpo) mais
`prettier --check --end-of-line auto` (limpo). Rodar `prettier --write` sem
`--end-of-line auto` reescreveria o repositório inteiro para LF — um diff
enorme e sem relação com jogos, por isso não foi feito.

Correção sugerida, em change próprio: fixar `"endOfLine": "auto"` no
`.prettierrc.json`, ou `* text=auto eol=lf` num `.gitattributes`.

### 2. Teste intermitente: `três saudações seguidas dão três respostas diferentes`

Em `test/dialogue.test.ts`. Falha em cerca de 1 a cada 4 execuções, **desde
antes deste change** (confirmado na linha de base, antes da primeira linha de
código).

Causa: o teste usa o `Math.random` real, e o `VariationSelector` garante apenas
*não repetir a resposta imediatamente anterior*. Com 8 variações de `saudacao`,
a 1ª e a 3ª coincidem de vez em quando — e o teste exige 3 textos distintos.

Isto é uma divergência real entre spec e implementação: o critério de sucesso do
change original (`add-minecraft-companion-bot`) diz "repetir a mesma saudação 3
vezes seguidas produz 3 respostas diferentes", e o seletor não promete isso.
Não foi mexido aqui porque a correção certa é **decidir qual dos dois está
errado** — apertar o seletor (afeta toda entrada do catálogo) ou corrigir o
critério —, e essa decisão é do dono do projeto.

Todos os testes escritos por este change usam sorteio semeado e são
determinísticos.
