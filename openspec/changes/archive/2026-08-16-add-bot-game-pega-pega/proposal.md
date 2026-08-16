# Proposal: Segunda Brincadeira — Pega-Pega

**Change ID:** `add-bot-game-pega-pega`
**Created:** 2026-08-16
**Status:** Archived
**Implementado:** 2026-08-16
**Arquivado:** 2026-08-16

---

## Problem Statement

### Que problema estamos resolvendo?

O bot sabe **uma** brincadeira: esconde-esconde. Uma brincadeira só cansa rápido
numa criança de 7 anos — depois de algumas rodadas ela já sabe onde ele costuma
se esconder, e a graça acaba. Além disso, esconde-esconde é uma brincadeira
**parada**: quem se esconde fica imóvel, quem procura anda devagar. Falta a
brincadeira de correr.

Pega-pega é a brincadeira mais universal dessa idade, tem regra de uma frase
("quem encostar, pega") e é a que melhor aproveita o que o Minecraft já dá de
graça: um mundo aberto e dois corpos que se movem.

### Quem é afetado?

O jogador dono (`ownerPlayer`) — a criança de 7 anos. E, por tabela, toda fala
que **oferece** o que o bot sabe fazer: hoje `jogo_desconhecido` e `jogo_desligado`
prometem "esconde-esconde" como se fosse a única coisa que ele sabe brincar.

### Qual é a dor atual?

Digitar `dudu, vamos brincar de pega pega` hoje não casa com nenhum padrão de
comando. Cai na cascata, o repertório não tem entrada para isso e — com
`llm.provider: 'none'`, que é a configuração real — a resposta é `nao_entendi`.
A criança teve a ideia certa, escreveu certo, e o bot não acompanhou.

Pior ainda: `me pega`, `corre atras de mim` e `vem me pegar` são as frases que
ela usa naturalmente no meio do jogo, e todas caem no mesmo buraco.

---

## Proposed Solution

Registrar `pega_pega` como o **segundo** jogo do catálogo fechado, com dois
papéis simétricos, reaproveitando integralmente a estrutura que o
esconde-esconde já montou: estado `GAME`, `AbortSignal` da rodada, `GameSession`,
falas do repertório local e cancelamento por defesa/`dudu, para`.

### Os dois papéis do pega-pega

```
  ┌───────────────────────── BOT PEGA (bot_pega) ──────────────────────────┐
  │                                                                        │
  │  "vamos brincar de pega pega" / "me pega" / "corre atras de mim"        │
  │        │                                                               │
  │        ▼                                                               │
  │  aceita e conta 1..5 no chat (um número por segundo — a vantagem       │
  │  de saída da criança)                                                  │
  │        │                                                               │
  │        ▼                                                               │
  │  corre atrás do jogador, recalculando o alvo enquanto ele foge          │
  │        │                                                               │
  │        ├── encostou (≤ touchDistance) ──► "te peguei!"      → ganhou    │
  │        └── 60 s sem pegar ─────────────► "cansei, você ganhou" → perdeu │
  └────────────────────────────────────────────────────────────────────────┘

  ┌───────────────────────── BOT FOGE (bot_foge) ──────────────────────────┐
  │                                                                        │
  │  "eu vou te pegar" / "voce corre" / "eu pego voce"                      │
  │        │                                                               │
  │        ▼                                                               │
  │  sai correndo na hora, escolhendo ponto longe do jogador e             │
  │  trocando de ponto sempre que ele chega perto                          │
  │        │                                                               │
  │        ├── jogador encostou ──────────► "me pegou!"          → perdeu   │
  │        └── 60 s correndo ─────────────► "cansei" e PARA, deixando ser  │
  │                                          pego                → perdeu   │
  └────────────────────────────────────────────────────────────────────────┘
```

### Decisões de regra (e por que elas são assim)

**1. Contagem de 5 segundos só no papel de quem pega.** Quem foge sai correndo
na hora — é a criança que conta, se quiser. Cinco segundos são a vantagem de
saída, o equivalente ao "conta até 10" do esconde-esconde, encurtado porque em
pega-pega esperar parado é tédio.

**2. Desistir é falar, nunca sumir.** Nos dois papéis, o fim por cansaço tem
fala no chat e o bot **para de se mover**. Rodada que acaba em silêncio, com o
bot ainda correndo, é indistinguível de bug para uma criança.

**3. Quem cansa, perde — e diz isso.** O desfecho dos dois "cansei" é `perdeu`,
não `tempo_esgotado`. `tempo_esgotado` fica reservado para a rede de segurança
do `roundTimeoutMs`, que existe para nenhuma rodada ficar pendurada. Perder por
cansaço é regra do jogo; estourar `roundTimeoutMs` é a rodada dando errado.

**4. Correr fugindo é sem sprint; correr atrás é com sprint.** É o único jeito
de os dois lados terem chance:

| Papel | Sprint do bot | Consequência para a criança |
|---|---|---|
| `bot_pega` | **ligado** | andando ela é alcançada; correndo, escapa |
| `bot_foge` | **desligado** | correndo ela alcança; andando, não |

Com sprint nos dois lados o bot ganha sempre e a criança desiste de brincar. Sem
sprint em nenhum, o bot nunca pega ninguém e todo jogo acaba em "cansei". Os dois
são configuráveis para o pai ajustar se a criança achar fácil ou impossível.

**5. Quem foge não foge para sempre.** O ponto de fuga fica dentro de
`fleeMaxDistanceFromOwner` (40 blocos): fugir mundo afora tira o bot do campo de
visão da criança e a brincadeira vira caminhada solitária.

**6. `desisto` continua funcionando, com sentido novo.** Com o bot fugindo,
`desisto` faz ele parar e se deixar pegar. Com o bot pegando, `desisto` é a
criança parando de correr — ele encosta e ganha. O mesmo `requestReveal()` da
`GameSession` serve aos dois; o que muda é o que cada jogo entende por isso.

### Convite genérico com dois jogos no catálogo

Hoje `dudu, vamos brincar` (sem nomear o jogo) inicia esconde-esconde direto.
Com duas brincadeiras isso passa a **escolher pela criança**. A proposta é o
convite genérico virar uma pergunta curta ("eu sei esconde-esconde e pega-pega,
qual você quer?"), sem iniciar rodada e sem estado pendente: o nome de cada jogo
já é, sozinho, um convite válido — responder `pega pega` inicia a rodada na
mensagem seguinte.

> Esta é a única mudança de comportamento **já existente** neste change. Se a
> preferência for manter o convite genérico caindo em esconde-esconde, basta
> remover o requisito `MODIFIED: Convite genérico` dos deltas — o resto do change
> não depende dele.

---

## Scope

### In Scope

- `pega_pega` no catálogo fechado de jogos, com os papéis `bot_pega` e `bot_foge`
- Sessão `TagSession` com os dois papéis, contagem de 5 s, perseguição e fuga
- Bloco `games.tag` na configuração, com defaults que funcionam sem ajuste
- Padrões de convite no parser determinístico (funciona com `provider: 'none'`)
- Entradas `pega_*` no repertório local, com no mínimo 4 variações cada
- Atualização das falas que **ofertam** jogo (`jogo_desconhecido`,
  `jogo_desligado`) para citar as duas brincadeiras
- Convite genérico virando pergunta de escolha
- Perseguição a alvo móvel e escolha de ponto de fuga no `GameWorld`

### Out of Scope

- Terceira brincadeira (quente-e-frio, siga-o-mestre)
- Pega-pega com mais de um jogador, pega-corrente, pique-esconde
- Placar entre rodadas ou memória de quem ganhou mais vezes
- Pega-pega com nome de variante regional configurável ("pique-pega", "pira-pega"
  entram como **padrão de convite**, não como jogo separado)
- Bot pulando, nadando ou usando poção para correr mais

---

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| Domínio (`domain/games.ts`) | Sim | `GAME_NAMES` ganha `pega_pega`; `GAME_ROLES` ganha `bot_pega` e `bot_foge`; novas fases `perseguindo`, `fugindo`, `entregue`; papel padrão passa a ser **por jogo** |
| Configuração | Sim | Bloco `games.tag` + validações cruzadas |
| Sessão de jogo | Sim | Novo `behaviors/games/tag.ts`; `createSession` ganha o segundo `case` |
| Regra pura de pontos | Sim | `pickFleePoint` em `behaviors/games/spots.ts` |
| `GameWorld` | Sim | `chaseOwner(distance)` (alvo móvel) e `setSprinting(on)`; o resto é reaproveitado |
| Wiring (`app/bot.ts`) | Sim | Adapta os dois métodos novos; `games.tag` passa para o registro |
| Parser de comandos | Sim | Convites de pega-pega; convite genérico vira pergunta |
| Repertório local | Sim | Entradas `pega_*` novas; `jogo_desconhecido` e `jogo_desligado` reescritas |
| Intenção `PLAY_GAME` | Não* | O schema já aceita `game` livre; só o enum `GAME_ROLES` cresce |
| Catálogo de intenções | Sim | Entra `ASK_WHICH_GAME` para o convite genérico — só o wiring sabe se `games.enabled` está ligado, e a pergunta não pode oferecer o que está desligado |
| Máquina de estados | Não | `GAME` já existe, com a prioridade certa |
| Defesa / emergência | Não | Cancelamento por `AbortSignal` já cobre qualquer jogo |
| Memória de conversa | Não | Rodada não muda o formato do JSONL |

\* Exemplos de `PLAY_GAME{game: "pega_pega"}` entram no prompt de interpretação —
sem exemplo, o modelo não sabe quando usar, foi o que aconteceu no change anterior.

---

## Architecture Considerations

**Encaixa na estrutura existente sem redesenho.** O change do esconde-esconde
deixou pronto: estado `GAME` não-empilhável, `AbortSignal` por rodada,
`GameSession` com `run()`/`requestReveal()`/`currentPhase`, `createSession` como
ponto único de criação, e o `GameWorld` como interface estreita que permite
testar a brincadeira inteira com mundo e relógio falsos. Nada disso muda.

**Duas coisas novas de verdade:**

1. **Alvo móvel.** Todo o esconde-esconde caminha até pontos parados
   (`goto(ponto)` e espera chegar). Perseguir exige objetivo dinâmico —
   `GoalFollow` do pathfinder, que recalcula sozinho enquanto a entidade se move.
   Por isso `chaseOwner(distance)` é **não bloqueante**: quem decide quando parar
   é o laço da sessão, conferindo distância a cada `POLL_MS`.

2. **Papel padrão por jogo.** `DEFAULT_ROLE` é hoje uma constante única
   (`bot_esconde`). Com dois jogos ela vira um mapa `jogo → papel padrão`
   (`esconde_esconde → bot_esconde`, `pega_pega → bot_pega`), e um papel de um
   jogo aplicado a outro é recusado — `PLAY_GAME{game: "pega_pega", role:
   "bot_esconde"}` não pode virar rodada.

**Padrão que se confirma:** um jogo novo = um módulo em `behaviors/games/`, um
`case` no registro, um bloco de config, um conjunto de entradas no repertório.
Nenhuma camada de baixo precisou saber que existe um segundo jogo.

---

## Success Criteria

- [ ] `dudu, vamos brincar de pega pega` inicia a rodada com `llm.provider: 'none'`
- [ ] No papel de quem pega: conta 1..5 no chat, corre atrás, e encostar no
      jogador termina em `ganhou` com fala em menos de 1 s
- [ ] No papel de quem pega: 60 s sem pegar termina em `perdeu`, com fala de
      cansaço e o bot **parado**
- [ ] No papel de quem foge: o jogador encostar termina em `perdeu` com fala
- [ ] No papel de quem foge: 60 s correndo faz o bot parar, avisar e se deixar
      pegar sem voltar a correr
- [ ] `dudu, para`, defesa e vida crítica cancelam a rodada em menos de 1 s, em
      qualquer fase, com o bot parando de correr
- [ ] Nenhuma fala da rodada depende de IA; catálogo com ≥ 4 variações por entrada
- [ ] `jogo_desconhecido` e `jogo_desligado` não citam mais só o esconde-esconde
- [ ] Rodada inteira testada com mundo e relógio falsos, sem servidor
- [ ] `npm test`, `npm run lint` e `npm run typecheck` limpos

---

## Risks & Mitigations

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Bot com sprint pega sempre e a criança desiste de brincar | Alta | Alto | Sprint só no papel de perseguir; `chaseSprint`/`fleeSprint` configuráveis; teste manual com a criança antes de arquivar |
| Bot fugindo cai em ravina, lava ou água | Média | Alto | Ponto de fuga só em chão resolvido por `groundAt`; `canDig` continua desligado; ponto irreal descartado antes de virar destino |
| Pathfinder emperra em alvo móvel e o bot fica parado "correndo" | Média | Médio | Teto por trecho igual ao `gameGoto`; se a distância não cai em `noProgressMs`, reescolhe ponto (fuga) ou reemite o objetivo (perseguição) |
| Perseguição a 500 ms de repath pesa no servidor local | Baixa | Médio | `GoalFollow` dinâmico recalcula sozinho; nada de raycast na perseguição — a posição vem do protocolo |
| Bot foge para longe demais e a criança o perde de vista | Média | Médio | `fleeMaxDistanceFromOwner` (40) limita o ponto de fuga |
| Criança acha que "cansei" é o bot com defeito | Média | Baixo | Fala explícita de derrota, animada, convidando a jogar de novo |
| Convite genérico virar pergunta irrita quem já se acostumou | Média | Baixo | Mudança isolada num requisito só, removível sem tocar no resto |
| `bot_esconde` chegando em `pega_pega` pela IA | Baixa | Médio | Papel validado contra o jogo no registro; combinação inválida vira recusa falada, nunca rodada torta |

---

## Informação de Arquivamento

**Arquivado:** 2026-08-16
**Duração:** mesmo dia (proposta, implementação e arquivamento)
**Desfecho:** implementado — **com uma pendência declarada**

### Pendência que sai daqui em aberto

Os quatro itens ⏸ da fase 5 (5.6 a 5.9) **não foram verificados no mundo real**:
exigem o servidor 1.21.11 aberto para LAN e a criança jogando. O equilíbrio dos
dois sprints — o único parâmetro que decide se a brincadeira é divertida — é
justamente o que nenhum teste automatizado resolve. Se em jogo o bot pegar
sempre, baixe `chaseSprint`; se nunca pegar, suba `chaseTimeoutMs` ou ligue
`fleeSprint`.

### Arquivos alterados

| Arquivo | O quê |
|---|---|
| `src/behaviors/games/tag.ts` | **novo** — a sessão do pega-pega, nos dois papéis |
| `src/behaviors/games/world.ts` | **novo** — `GameWorld` e `GameAborted` extraídos, agora compartilhados; `chaseOwner` e `setSprinting` |
| `src/behaviors/games/spots.ts` | `pickFleePoint`, com a reserva de corrida lateral |
| `src/behaviors/games/index.ts` | segundo `case` no registro; `resolveRole` por jogo |
| `src/behaviors/games/hide-and-seek.ts` | passa a importar o contrato de mundo em vez de defini-lo |
| `src/domain/games.ts` | `pega_pega`, papéis, fases, `ROLES_BY_GAME`, `DEFAULT_ROLE_BY_GAME` |
| `src/domain/intent.ts` | intenção `ASK_WHICH_GAME` |
| `src/config/schema.ts` | `tagSchema` e `games.tag`, com quatro validações cruzadas |
| `src/behaviors/commands.ts` | convites de pega-pega, convite genérico, desistências novas |
| `src/app/bot.ts` | wiring de `chaseOwner`/`setSprinting`, `ASK_WHICH_GAME`, sprint desligado no fim |
| `src/minecraft/client.ts` | `setSprinting` mexendo em `movements.allowSprinting` |
| `src/ai/prompt.ts` | exemplos de `PLAY_GAME{game: "pega_pega"}` |
| `src/dialogue/default-repertoire.yaml` + `data/repertoire.yaml` | 8 entradas `pega_*`, `jogo_qual_brincadeira`, reescrita de `jogo_desconhecido` e `capacidades` |
| `config.example.yaml`, `README.md` | bloco `games.tag` e a seção das duas brincadeiras |
| `test/games-tag.test.ts` | **novo** — 35 testes, rodada completa nos dois papéis |
| `test/{games-spots,games-hide-and-seek,config,dialogue,behaviors,ai}.test.ts` | cobertura nova e ajuste ao contrato novo |

### Specs atualizadas

- `openspec/specs/bot_games.md` — dois requisitos novos de pega-pega, papel
  padrão por jogo, convite genérico, e `## Descontinuado` do papel padrão global
- `openspec/specs/configuration.md` — sub-bloco `games.tag` e suas validações
- `openspec/specs/local_dialogue.md` — entradas `pega_*`, `jogo_qual_brincadeira`
  e a regra de não esconder capacidade nova
- `openspec/specs/player_commands.md` — `ASK_WHICH_GAME`, papel validado contra o
  jogo, convites de pega-pega, desistência com sentido por jogo

### O que a implementação ensinou

**Um laço que espera precisa fazer o relógio andar.** O trecho de fuga saía cedo
por três condições diferentes, e uma delas disparava antes de qualquer espera.
Com a caminhada falhando na hora, o laço girava sem tempo passar e sem ceder o
processador: o teste travou para sempre em vez de estourar timeout — porque o
timeout do vitest é um timer, e um laço de microtasks nunca deixa timer nenhum
rodar. Em jogo teria sido 100% de CPU. A correção foi esperar **antes** de
avaliar as condições de parada.

**Honestidade obrigou uma intenção nova.** O convite genérico ia virar entrada de
repertório, o que era mais barato. Mas só o wiring sabe se `games.enabled` está
ligado, e perguntar "esconde-esconde ou pega-pega?" com as brincadeiras
desligadas é oferecer o que o bot não pode fazer. Virou `ASK_WHICH_GAME`.

**Segundo jogo, zero redesenho.** Estado `GAME`, `AbortSignal`, `GameSession`,
`createSession` e o repertório absorveram o pega-pega sem mudança estrutural. O
que teve de sair de dentro do esconde-esconde foi só o `GameWorld`, que nunca foi
dele — era o contrato de qualquer rodada com o mundo.
