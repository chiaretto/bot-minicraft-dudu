# Delta: Jogos do Bot

**Change ID:** `ask-game-role`
**Affects:** `src/domain/games.ts`, `src/behaviors/commands.ts`,
`src/behaviors/games/index.ts`, `src/app/bot.ts`

---

## ADDED

### Requirement: Papel ausente é pergunta, não padrão

Convite sem papel nunca inicia rodada: o bot pergunta quem faz o quê e espera a
escolha do jogador. Convite **com** papel explícito começa direto — perguntar
ali seria repetir o que a criança acabou de falar.

| Jogo | Pergunta | `eu` → papel do bot | `você` → papel do bot |
|---|---|---|---|
| esconde-esconde | `Quem se esconde: eu ou você?` | `bot_procura` | `bot_esconde` |
| pega-pega | `Quem corre: eu ou você?` | `bot_pega` | `bot_foge` |

> A **mesma palavra significa papéis opostos** nos dois jogos. Por isso a
> escolha pendente guarda o jogo, e o parser de resposta recebe o jogo como
> parâmetro.

#### Scenario: A resposta só usa o verbo que a pergunta citou
- **GIVEN** o bot perguntou `Quem corre: eu ou você?`
- **WHEN** o jogador responde `voce pega`
- **THEN** isso **não** é lido como resposta da pergunta
- **AND** vale como convite com papel explícito: a rodada começa em `bot_pega`
- **AND** o mesmo vale para `voce procura` respondendo `Quem se esconde?`

> Ler `voce pega` como resposta inverteria o papel: `voce` na pergunta "quem
> corre" significa o bot correndo (`bot_foge`), mas `voce pega` significa o bot
> pegando. Frase com o verbo do outro papel é comando, não resposta.

#### Scenario: Convite pelo nome do jogo pergunta o papel
- **GIVEN** `games.enabled` é `true` e nenhuma rodada está em andamento
- **WHEN** `FresherRobin90` digita `dudu, pega pega`
- **THEN** nenhuma rodada começa e o bot **não** entra em `GAME`
- **AND** o bot pergunta no chat `Quem corre: eu ou você?`
- **AND** a pergunta nomeia **as duas** opções

#### Scenario: A resposta inicia a rodada no papel escolhido
- **GIVEN** o bot acabou de perguntar quem corre, no pega-pega
- **WHEN** `FresherRobin90` responde `eu`
- **THEN** a rodada começa no papel `bot_pega` — quem corre é a criança
- **AND** o bot entra em `GAME` e conta antes de sair

#### Scenario: A mesma resposta no outro jogo dá o papel oposto
- **GIVEN** o bot acabou de perguntar quem se esconde, no esconde-esconde
- **WHEN** `FresherRobin90` responde `eu`
- **THEN** a rodada começa no papel `bot_procura` — quem se esconde é a criança
- **AND** o bot conta até `countTo` antes de procurar

#### Scenario: Escolher o bot para o papel
- **GIVEN** o bot perguntou quem se esconde
- **WHEN** `FresherRobin90` responde `voce`
- **THEN** a rodada começa no papel `bot_esconde`

#### Scenario: Convite com papel explícito não pergunta
- **GIVEN** `games.enabled` é `true`
- **WHEN** `FresherRobin90` digita `dudu, me pega`
- **THEN** a rodada começa direto no papel `bot_pega`
- **AND** nenhuma pergunta de papel é feita
- **AND** o mesmo vale para `eu vou me esconder`, `se esconde`, `voce corre` e
  as demais frases que já dizem o papel

#### Scenario: Convite genérico encadeia as duas perguntas
- **GIVEN** o registro tem dois jogos
- **WHEN** `FresherRobin90` digita `dudu, vamos brincar`
- **THEN** o bot pergunta qual das duas brincadeiras
- **AND** ao ela responder `pega pega`, o bot pergunta quem corre
- **AND** só depois da segunda resposta a rodada começa

#### Scenario: `PLAY_GAME` sem papel vindo da IA
- **GIVEN** a IA devolveu `PLAY_GAME{game: "esconde_esconde"}` sem papel
- **WHEN** a intenção é validada e despachada
- **THEN** o bot pergunta o papel, igual ao convite pelo nome do jogo
- **AND** nenhum papel é escolhido pelo código

---

### Requirement: Escolha de papel pendente

A pergunta de papel deixa uma escolha pendente — jogo e prazo. Ela **não** é
estado da máquina de estados: o bot continua em `IDLE` (ou no que estava),
livre para seguir, parar, conversar e se defender.

#### Scenario: Esperar sem travar o bot
- **GIVEN** o bot perguntou quem corre e ninguém respondeu ainda
- **WHEN** `FresherRobin90` digita `dudu, me segue`
- **THEN** o bot entra em `FOLLOW` normalmente
- **AND** a escolha pendente é descartada
- **AND** nenhuma rodada começa depois disso sozinha

#### Scenario: Parada e defesa durante a espera
- **GIVEN** existe uma escolha de papel pendente
- **WHEN** chega `dudu, para`, ou a defesa assume por causa de um hostil
- **THEN** o comportamento é o normal de cada um
- **AND** a escolha pendente é descartada

#### Scenario: Resposta fora da lista repergunta uma vez
- **GIVEN** o bot perguntou quem se esconde
- **WHEN** `FresherRobin90` responde algo que não é resposta nem comando
- **THEN** a mensagem desce a cascata normal e é respondida
- **AND** o bot repergunta **uma** vez, de forma mais simples
- **AND** não repergunta uma terceira vez

#### Scenario: Ninguém responde
- **GIVEN** o bot perguntou o papel
- **WHEN** `games.roleQuestionTimeoutMs` (padrão 45 s) passa sem resposta
- **THEN** a escolha pendente expira em silêncio
- **AND** nenhuma rodada começa
- **AND** o bot não fica preso esperando

#### Scenario: `eu` sem pergunta pendente é conversa
- **GIVEN** nenhuma escolha de papel está pendente
- **WHEN** `FresherRobin90` digita `eu`
- **THEN** nenhuma rodada começa
- **AND** a mensagem desce a cascata normal — parser, repertório, IA

#### Scenario: Pendência não sobrevive à rodada
- **GIVEN** a criança respondeu e a rodada começou
- **WHEN** a rodada termina, por qualquer desfecho
- **THEN** não existe escolha pendente nenhuma
- **AND** um `eu` depois disso volta a ser conversa

#### Scenario: Convite novo durante a espera
- **GIVEN** o bot perguntou quem corre, no pega-pega
- **WHEN** `FresherRobin90` digita `dudu, esconde esconde`
- **THEN** a pendência anterior é substituída pela nova
- **AND** o bot pergunta quem se esconde
- **AND** responder `eu` aí inicia o esconde-esconde, nunca o pega-pega

---

## MODIFIED

### Requirement: Convite genérico escolhe entre as brincadeiras

Com duas brincadeiras no registro, `vamos brincar` sem nome de jogo não escolhe
pela criança.

#### Scenario: Convite sem nomear o jogo
- **GIVEN** `games.enabled` é `true` e o registro tem dois jogos
- **WHEN** `FresherRobin90` digita `dudu, vamos brincar`
- **THEN** nenhuma rodada começa e o estado não muda
- **AND** o bot pergunta qual das duas ela quer, nomeando as duas
- **AND** **não** fica escolha pendente para esta pergunta — o nome de cada jogo
  já é um convite válido sozinho

#### Scenario: Convite genérico com os jogos desligados
- **GIVEN** `games.enabled` é `false`
- **WHEN** `FresherRobin90` digita `dudu, vamos brincar`
- **THEN** o bot responde que agora não dá para brincar
- **AND** **não** nomeia nenhuma das brincadeiras

#### Scenario: Resposta à pergunta leva à pergunta do papel
- **GIVEN** o bot acabou de perguntar qual brincadeira
- **WHEN** `FresherRobin90` digita `pega pega`
- **THEN** o bot pergunta quem corre, pelo parser de comandos
- **AND** nenhuma chamada de IA acontece no caminho

> Duas perguntas seguidas são o preço de não escolher pela criança. A alternativa
> — adivinhar o papel — é exatamente o defeito que originou este change.

---

## REMOVED

### Requirement: Papel padrão por jogo

O mapa `jogo → papel padrão` (`DEFAULT_ROLE_BY_GAME`) deixa de existir, com os
dois cenários que ele sustentava:

- **Convite sem papel no pega-pega** — o padrão era `bot_pega`; agora é pergunta.
- **Papel de outro jogo** — continua recusado, mas isso já é garantido por
  `isRoleValidForGame` e não depende do padrão.

**Motivo:** o padrão era uma escolha do código no lugar da criança, e era
inalcançável de outro jeito — quem digitava o nome do jogo levava sempre o mesmo
papel, sem saber que existia outro. Com "papel ausente é pergunta", nenhum
caminho precisa mais de um valor padrão.

A recusa de papel inválido para o jogo **permanece** e não muda de
comportamento.
