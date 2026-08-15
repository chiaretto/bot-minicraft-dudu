# Proposal: Jogos com o Bot — Esconde-Esconde

**Change ID:** `add-bot-games-hide-and-seek`
**Created:** 2026-08-15
**Status:** Archived
**Implementado:** 2026-08-15
**Arquivado:** 2026-08-15

---

## Problem Statement

### Que problema estamos resolvendo?

Hoje o bot **acompanha** o jogo da criança, mas não **brinca** com ela. O que
existe é reativo: ele responde no chat, segue, fica parado, coleta bloco e
defende. Toda a iniciativa é do jogador — a brincadeira, quando existe, é a
criança inventando sozinha e o bot obedecendo.

Falta a categoria que um amigo de verdade traz: uma **brincadeira com regras**,
com vez de cada um, com começo e fim, em que o bot também tem um papel ativo.

### Quem é afetado?

O jogador dono (`ownerPlayer`) — uma criança de 7 anos. Esconde-esconde é
exatamente o tipo de brincadeira que funciona nessa idade: regra simples, dois
papéis, e a graça está na expectativa, não na dificuldade.

### Qual é a dor atual?

Perguntar *"dudu, vamos brincar de esconde-esconde?"* hoje cai no repertório
como conversa fiada ou desce para a IA, que responde algo simpático e **não faz
nada**. O bot promete companhia e entrega só chat.

Pior: como não existe o conceito de jogo, a criança tenta improvisar (*"se
esconde"*, *"conta até 10"*) e cada tentativa cai em `nao_entendi`. É a falha
mais frustrante possível — a criança teve a ideia certa e o bot não acompanhou.

---

## Proposed Solution

Introduzir a noção de **jogo** como um comportamento de primeira classe do bot:
uma sessão com fases, regras e fim, dirigida por uma máquina de fases própria,
sob um novo estado `GAME` da máquina de estados.

Este change entrega **um** jogo — esconde-esconde — mas monta a estrutura para os
próximos (pega-pega, quente-e-frio, siga-o-mestre) entrarem sem redesenho.

### Os dois papéis do esconde-esconde

```
  ┌──────────────────────── BOT SE ESCONDE ────────────────────────┐
  │                                                                 │
  │  "vamos brincar de esconde-esconde"                             │
  │        │                                                        │
  │        ▼                                                        │
  │  aceita e manda contar ──► escolhe esconderijo SEM linha de     │
  │                            visão do jogador (raycast)           │
  │        │                                                        │
  │        ▼                                                        │
  │  caminha até lá ──► CHEGOU ──► "pode procurar!"                 │
  │        │                        (só fala depois de escondido)   │
  │        ▼                                                        │
  │  fica parado ──► jogador encosta (≤2 blocos) ──► "perdi!"       │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘

  ┌──────────────────────── BOT PROCURA ───────────────────────────┐
  │                                                                 │
  │  "eu vou me esconder, conta até 10"                             │
  │        │                                                        │
  │        ▼                                                        │
  │  conta 1..10 no chat (1 número por mensagem, ~1s)               │
  │        │                                                        │
  │        ▼                                                        │
  │  BUSCA FALSA 1 ──► "será que tá aqui atrás?"  (longe do jogador)│
  │        │                                                        │
  │        ▼                                                        │
  │  BUSCA FALSA 2 ──► "aqui também não..."                         │
  │        │                                                        │
  │        ▼                                                        │
  │  busca de verdade ──► vê o jogador ──► vai até ele ──► "achei!" │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘
```

### A decisão de arquitetura que sustenta tudo: o bot já sabe onde você está

O `mineflayer` recebe a posição de todos os jogadores pelo protocolo. **O bot
tem informação perfeita e não há como tirar isso dele.** Fingir que ele
"descobre" o esconderijo é impossível; o que dá para fazer é um **teatro com
regras justas**, e o valor da brincadeira mora inteiro nessas regras:

1. **Buscas falsas obrigatórias.** Antes de qualquer aproximação real, o bot
   erra duas vezes de propósito, em pontos deliberadamente longe do jogador.
   É isso que compra o tempo e a expectativa da brincadeira.
2. **"Ver" é linha de visão de verdade.** O bot só declara que achou quando o
   raycast do olho dele até o jogador chega limpo e dentro do alcance
   configurado. Se a criança está atrás de uma parede, o bot não acha — mesmo
   sabendo a coordenada.
3. **Enquanto finge, ele é cego.** Durante as duas buscas falsas o bot ignora a
   visão do jogador. Sem essa regra, esbarrar no jogador no primeiro passo
   acabaria a brincadeira em 3 segundos.

Estar explícito aqui importa: um dia alguém vai olhar o código e achar que
`fakeSearches` é enfeite removível. Não é — é a única coisa que torna o jogo um
jogo.

### Componentes principais

1. **`domain/games.ts`** — tipos do jogo: nome, papel (`bot_esconde` /
   `bot_procura`), fases, e o resultado da rodada. Sem dependência de
   `mineflayer`.

2. **`minecraft/visibility.ts`** — linha de visão por raycast, sobre uma
   interface mínima de mundo (mesmo padrão de `SnapshotSource`), para dar para
   testar sem servidor. Duas perguntas: *o jogador enxerga este ponto?* e *o bot
   enxerga o jogador?*

3. **`behaviors/games/spots.ts`** — escolha de esconderijo e dos pontos de busca
   falsa. **Funções puras**: recebem posições candidatas mais um predicado de
   visibilidade e devolvem a escolha. É onde mora a regra e é o que os testes
   cobrem de verdade.

4. **`behaviors/games/hide-and-seek.ts`** — a sessão: máquina de fases, contagem
   no chat, falas por fase, detecção de toque, timeout da rodada. Recebe relógio
   e `AbortSignal` por injeção.

5. **`behaviors/games/index.ts`** — registro de jogos conhecidos e despacho por
   nome. Jogo não conhecido tem resposta honesta ("essa eu ainda não aprendi,
   mas eu sei brincar de esconde-esconde!").

6. **Estado `GAME`** na máquina de estados, prioridade 2 (a mesma de `ACTION`).
   Defesa e emergência continuam vencendo — e **cancelam a rodada**, sem
   retomada.

### Por que o jogo não é retomado depois de um combate

`ACTION` empilha e retoma: coletar 4 blocos e ser interrompido no terceiro tem
retomada óbvia. Jogo não tem. Se um zumbi apareceu, o esconderijo já foi
queimado, a contagem já não vale e a criança já saiu do lugar. Retomar seria
mais confuso que recomeçar.

Então: ameaça cancela a rodada, o bot avisa no chat com palavra de criança
("Peraí! Tem monstro. A gente joga de novo depois?") e volta para `IDLE`.

### Resultados esperados

| Jogador digita / faz | Bot faz | Nível |
|---|---|---|
| `dudu, vamos brincar de esconde esconde` | aceita, manda contar, some de vista | comando → jogo |
| `dudu, se esconde` | mesma coisa, papel explícito | comando → jogo |
| *(chega perto do bot escondido)* | `Ahh, você me achou! Perdi!` | jogo |
| `dudu, eu vou me esconder` | conta 1..10 no chat e sai procurando | comando → jogo |
| *(bot erra 2 esconderijos de propósito)* | `Será que tá aqui atrás?` | jogo |
| *(bot ganha linha de visão do jogador)* | vai até ele e fala `Achei você!` | jogo |
| `dudu, para` no meio da rodada | cancela o jogo e volta para `IDLE` | comando |
| *(zumbi aparece no meio da rodada)* | cancela o jogo e defende | reflexo |
| `dudu, vamos jogar xadrez` | diz que não aprendeu e oferece esconde-esconde | repertório |

---

## Scope

### In Scope

- **Estado `GAME`** na máquina de estados, com prioridade 2 e sem retomada
  após interrupção.
- **Intenção `PLAY_GAME`** no catálogo fechado, com `game` e `role` validados.
- **Parser determinístico** dos convites de brincadeira, nos dois papéis, sem
  passar pela IA — a brincadeira precisa funcionar com `llm.provider: 'none'`.
- **Esconde-esconde com o bot se escondendo**: escolha de esconderijo sem linha
  de visão do jogador, caminhada até lá, aviso `pode procurar` **só depois de
  chegar**, imobilidade enquanto escondido, e derrota declarada quando o jogador
  encosta (distância ≤ `touchDistance`).
- **Esconde-esconde com o bot procurando**: contagem de 1 a 10 no chat, duas
  buscas falsas obrigatórias em pontos longe do jogador, busca real depois
  disso, e vitória declarada ao ganhar linha de visão e chegar perto.
- **Linha de visão por raycast**, testável sem servidor.
- **Timeout de rodada** nos dois papéis, com desfecho amigável (o bot se
  entrega, ou pede dica) — nunca uma rodada pendurada para sempre.
- **Cancelamento**: `dudu, para`, defesa, emergência, morte do bot e saída do
  jogador terminam a rodada com fala no chat.
- **Bloco `games` na configuração**, com distâncias, contagem, número de buscas
  falsas e timeouts.
- **Entradas novas de repertório** para todas as falas do jogo (≥4 variações
  cada), nas **duas** cópias do catálogo — `data/repertoire.yaml` e
  `src/dialogue/default-repertoire.yaml`.
- **Registro de jogos** preparado para o segundo jogo, com recusa honesta para
  jogo desconhecido.

### Out of Scope

- **Outros jogos** (pega-pega, quente-e-frio, corrida, esconde-esconde com
  vários jogadores). A estrutura fica pronta; os jogos ficam para changes
  próprios.
- **Placar entre rodadas / memória de "quem ganhou mais"**. Cada rodada começa
  do zero. Persistir placar é change próprio.
- **Caminhada furtiva.** O bot vai até o esconderijo pelo caminho normal do
  pathfinder; se a criança espiar em vez de contar, ela vai ver. A regra da
  brincadeira é humana ("fecha o olho e conta"), não técnica.
- **Esconderijo esperto** (cavar buraco, fechar porta, subir em árvore, usar
  poção de invisibilidade). O bot escolhe um ponto alcançável e sem linha de
  visão, e só.
- **Quebrar ou colocar blocos durante o jogo.** `canDig` continua desligado.
- **Jogar com quem não é o dono.** Outros jogadores continuam sem comandar; um
  convite deles é recusado com educação.
- **Jogo entre dimensões.** Rodada é cancelada se o jogador troca de dimensão.
- **Interpretação por IA do convite.** O convite é reconhecido por regex; a IA
  pode chegar a `PLAY_GAME` como qualquer outra intenção, mas nada no jogo
  depende dela.
- **Narração do jogo pela IA.** Toda fala do jogo sai do repertório local, para
  ser instantânea — o mesmo motivo das falas de combate.

---

## Impact Analysis

| Component | Change Required | Details |
|-----------|-----------------|---------|
| Database | Não | Nada persistido além das falas, que já entram no histórico normal |
| Dados | Sim | Entradas novas no catálogo de repertório (as duas cópias) |
| API | Não | Nenhum provider novo; nenhuma chamada de IA no caminho do jogo |
| State | Sim | Novo estado `GAME` (prioridade 2), sem retomada; `whenSchema` do repertório acompanha |
| Domínio | Sim | `PLAY_GAME` no catálogo fechado de intenções + tipos de jogo |
| Behaviors | Sim | Novo diretório `behaviors/games/` com registro, sessão e escolha de pontos |
| Minecraft | Sim | `visibility.ts` (raycast) — primeira consulta de mundo fora do snapshot |
| Combate | Sim | Defesa passa a cancelar rodada em vez de empilhar |
| Config | Sim | Bloco `games` no schema e no `config.example.yaml` |
| UI | Não | Só chat do jogo |
| Segurança | Não | Nenhum segredo novo, nenhuma saída de rede |

---

## Architecture Considerations

### Encaixe com padrões existentes

O jogo **respeita** os padrões que já valem no projeto:

- **Nada de IA no caminho crítico.** Toda fala do jogo vem do repertório, como
  as de combate. Uma pausa de 4 segundos esperando modelo no meio de um
  esconde-esconde estraga a brincadeira.
- **Efeito de mundo isolado.** Movimento durante o jogo passa por
  `MinecraftClient` / `behaviors/actions`, nunca por `bot.pathfinder` direto
  dentro da sessão.
- **Camada de baixo não importa de cima.** `behaviors/games/` fala com
  `minecraft/` por interface, e o wiring é no `app/`.
- **Regra em função pura, efeito na borda.** A escolha do esconderijo e das
  buscas falsas são funções puras; a sessão só orquestra.

### Padrões introduzidos

1. **Sessão de jogo como máquina de fases própria.** A máquina de estados global
   diz *que o bot está jogando*; a sessão diz *em que ponto da brincadeira ele
   está*. Misturar as duas coisas encheria `BotState` de estados que só um jogo
   entende.

2. **Estado sem retomada.** `GAME` é o primeiro estado que, ao ser interrompido,
   é descartado em vez de empilhado. A máquina de estados hoje sempre empilha o
   estado interrompido — a sessão precisa cancelar a si mesma no `abort` e o
   `resume()` para `GAME` precisa cair direto em `IDLE`.

3. **Teatro com regra justa.** Onde o bot tem informação que o jogador não tem, a
   regra de fairness fica **explícita, configurável e testada** — não escondida
   num `if` no meio do loop.

4. **Consulta de mundo fora do snapshot.** Raycast é caro demais para entrar no
   snapshot que roda a cada 250 ms na defesa. Fica como consulta sob demanda,
   chamada só nas transições de fase do jogo.

### Dependências externas

Nenhuma nova. `mineflayer` já expõe raycast de mundo e posição/orientação dos
jogadores; `mineflayer-pathfinder` já faz o deslocamento.

### Pontos de atenção conhecidos

- **Throttle do chat.** `ChatSender` espaça mensagens em 900 ms. Contar até 10
  em mensagens separadas leva ~9 s de qualquer forma — o intervalo configurado
  é o piso desejado, não uma garantia de ficar abaixo disso.
- **Teto de versão do Minecraft** (1.21.11) continua valendo; nada aqui muda
  isso.
- **Rodada precisa de espaço.** Em túnel ou casa pequena pode não existir ponto
  alcançável sem linha de visão. O bot precisa falhar com fala honesta ("aqui
  não tem lugar bom pra esconder, vamos pra fora?"), nunca ficar mudo.

---

## Success Criteria

Marcados `[x]` os cobertos por teste automatizado; `⏸` os que exigem servidor
Minecraft real e ficam para verificação manual.

- [x] `dudu, vamos brincar de esconde esconde` inicia a rodada sem nenhuma
      chamada de IA, com `llm.provider: 'none'`.
- [x] O bot só fala `pode procurar` **depois** de chegar ao esconderijo.
- [x] O esconderijo escolhido não tem linha de visão a partir dos olhos do
      jogador no momento da escolha.
- [x] O esconderijo fica dentro da faixa de distância configurada do jogador.
- [x] Enquanto escondido, o bot não se move sozinho.
- [x] Chegar a ≤ `touchDistance` do bot escondido faz ele declarar derrota em
      menos de 1 s. *(a checagem roda a cada 250 ms)*
- [x] `dudu, eu vou me esconder` faz o bot contar de 1 a 10 no chat, um número
      por mensagem.
- [x] O bot visita **exatamente 2** pontos errados antes de qualquer
      aproximação real do jogador.
- [x] Nenhum ponto de busca falsa fica a menos de
      `fakeSearchMinDistanceFromOwner` do jogador.
- [x] Durante as buscas falsas o bot não declara ter achado, mesmo com o jogador
      à vista.
- [x] Depois das buscas falsas, o bot declara `achei` só com linha de visão
      limpa e dentro de `seeDistance`.
- [x] Achando o jogador, o bot caminha até ele antes de falar.
- [x] Jogador escondido atrás de parede sólida não é "achado" por linha de
      visão. *(depende de `canDig: false` — ver a nota em `bot_games_delta.md`)*
- [x] `dudu, para` cancela a rodada em menos de 1 s, com fala no chat.
- [x] Um hostil aparecendo cancela a rodada, o bot avisa e passa a defender.
      *(⏸ o combate de ponta a ponta exige mundo real)*
- [x] Terminado o combate, o bot **não** retoma a rodada cancelada.
- [x] Rodada que estoura o timeout termina com fala amigável, nunca em silêncio.
- [x] Jogador desconectar ou trocar de dimensão termina a rodada.
- [x] Convite de jogador que não é o dono é recusado com educação.
- [x] Convite para jogo desconhecido responde honestamente e oferece
      esconde-esconde.
- [x] Cenário sem esconderijo válido produz fala honesta, não silêncio.
- [x] Todas as falas novas do jogo têm ≥ 4 variações e passam no load sem aviso.
- [x] `data/repertoire.yaml` e `src/dialogue/default-repertoire.yaml` estão
      idênticos ao fim do change.
- [x] Testes cobrindo: escolha de esconderijo, escolha de busca falsa, máquina
      de fases nos dois papéis, contagem, cancelamento por defesa e timeout.
- [x] `vitest run` (343 testes) e `npm run build` limpos.
- [ ] `npm run lint` limpo — **bloqueado por questão de ambiente anterior a este
      change** (CRLF × `endOfLine: lf` do prettier reprova os 42 arquivos do
      projeto). `eslint src test` está limpo. Ver "Notas do ambiente" em
      `tasks.md`.

### Critério acrescentado durante a implementação

- [x] Com `games.enabled: false`, a recusa **não** oferece o esconde-esconde.
      Reusar `jogo_desconhecido` faria o bot prometer o que acabou de recusar —
      violação direta da regra número um do `CLAUDE.md`. Entrada
      `jogo_desligado` criada para isso.

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Bot "acha" o jogador na hora, porque sabe a coordenada** | Alta | Alto | Buscas falsas obrigatórias + `achei` só com raycast limpo + cegueira deliberada durante o fingimento. Regra testada, não implícita |
| **Bot passa na frente do jogador indo se esconder** | Alta | Médio | Preferência por ponto fora do cone de visão atual do jogador; a regra social ("fecha o olho e conta") é dita no chat pelo próprio bot. Caminhada furtiva declarada fora de escopo |
| **Não existe esconderijo válido no lugar (túnel, casa pequena)** | Média | Médio | Após N amostras sem candidato válido, o bot recusa com fala honesta e sugere ir para fora. Nunca fica mudo nem trava em `GAME` |
| **Pathfinder trava indo ao esconderijo** | Alta | Médio | Timeout por deslocamento, igual às outras ações; ao estourar, o bot se esconde onde está ou cancela avisando |
| **Rodada pendurada para sempre** (jogador saiu do jogo, esqueceu) | Alta | Médio | `roundTimeoutMs` obrigatório nos dois papéis + fim por desconexão, morte e troca de dimensão |
| **Jogo brigando com a defesa pelo pathfinder** | Alta | Alto | `GAME` na máquina de estados com prioridade declarada; defesa interrompe, cancela a sessão e assume o pathfinder |
| **Retomada de jogo após combate confundindo a criança** | Média | Médio | Decisão explícita: jogo não é retomado. `resume()` para `GAME` cai em `IDLE` |
| **Contagem virando flood e levando kick** | Média | Médio | `ChatSender` já espaça em 900 ms; `countIntervalMs` respeita esse piso |
| **Criança achando que o bot trapaceou** | Média | Alto | Falas do bot admitem o erro com graça ("achei que tava aqui!") e ele sempre declara derrota quando é tocado. Nunca discute com a criança |
| **Bot escondido levando dano parado** (afogamento, queda, mob) | Média | Médio | Emergência continua tendo prioridade máxima; vida crítica cancela a rodada e recua |
| **Falas do jogo saindo pela IA e chegando lentas** | Média | Médio | Todas as falas do jogo vêm do repertório local, como as de combate |
| **Escopo inflando para "bot que joga tudo"** | Alta | Médio | Um jogo só neste change; o registro existe, mas jogo novo é change novo |
| **Esquecer de sincronizar as duas cópias do repertório** | Alta | Médio | Task explícita de sincronização na fase final, com verificação de diff |

---

## Archive Information

**Arquivado:** 2026-08-15
**Duração:** mesmo dia (proposta → implementação → arquivamento)
**Desfecho:** implementado; 4 verificações manuais pendentes (exigem servidor)

### Código

| Arquivo | O que é |
|---|---|
| `src/domain/games.ts` | novo — tipos, papéis, fases, desfecho |
| `src/minecraft/visibility.ts` | novo — linha de visão por raycast |
| `src/behaviors/games/spots.ts` | novo — escolha de esconderijo e buscas falsas (puro) |
| `src/behaviors/games/hide-and-seek.ts` | novo — a sessão, com relógio e `AbortSignal` injetados |
| `src/behaviors/games/index.ts` | novo — registro de jogos |
| `src/domain/types.ts` | estado `GAME` + `NON_RESUMABLE_STATES` |
| `src/domain/intent.ts` | intenção `PLAY_GAME` |
| `src/behaviors/state-machine.ts` | `GAME` nunca é empilhado |
| `src/behaviors/commands.ts` | convites de brincadeira + `isGiveUp()` |
| `src/config/schema.ts` | bloco `games` com validação cruzada |
| `src/app/bot.ts` | wiring, `gameWorld()`, cancelamento por defesa |
| `src/ai/prompt.ts` | exemplos de `PLAY_GAME` na interpretação |
| `src/dialogue/schema.ts` | `when` aceita `GAME` |
| `src/dialogue/default-repertoire.yaml` | 15 entradas novas + `capacidades` atualizada |
| `config.example.yaml`, `README.md` | documentação |
| `package.json` | `vec3` promovida a dependência direta |

Testes: `test/games-hide-and-seek.test.ts`, `test/games-spots.test.ts`,
`test/visibility.test.ts` (novos) e ampliações em `ai`, `behaviors`, `config`,
`dialogue`, `module-loading`. **343 testes** ao fim (222 antes).

### Specs atualizadas

| Spec | O que mudou |
|---|---|
| `openspec/specs/bot_games.md` | **nova** — 7 requisitos, 36 cenários |
| `openspec/specs/player_commands.md` | `PLAY_GAME`, convites, estado `GAME`, `para` cancela rodada |
| `openspec/specs/player_defense.md` | prioridade com `GAME`; jogo não é empilhado |
| `openspec/specs/local_dialogue.md` | falas do jogo, contagem, `when: GAME`, `capacidades` |
| `openspec/specs/configuration.md` | bloco `games` |

### Nota sobre o arquivamento

`openspec/specs/` **não existia** antes deste arquivamento: o change
`add-minecraft-companion-bot` foi arquivado sem consolidar seus deltas, embora
`project.md` declare essa pasta como fonte da verdade.

Este arquivamento fez o backfill dos 8 deltas daquele change, aplicando também
os merges internos que ele nunca aplicou (`llm_provider` tornando o segredo
condicional; `player_defense` restringindo o gatilho de emergência à vida
crítica) e registrando os dois requisitos removidos em `## Descontinuado`.

A partir daqui, `openspec/specs/` descreve o sistema inteiro.
