# Delta: Brincadeiras

**Change ID:** `add-hot-and-cold`
**Affects:** `domain/hot-cold.ts`, `domain/games.ts`,
`behaviors/games/hot-cold.ts`, `behaviors/games/index.ts`, `app/bot.ts`

---

## ADDED

### Requirement: Quente e frio

O terceiro jogo. O bot escolhe um ponto secreto perto do jogador e vai dizendo,
a cada `tickMs`, se ele está esquentando ou esfriando.

É o primeiro jogo do registro que **não** é de correr: ninguém persegue ninguém,
não há linha de visão nem esconderijo a avaliar. O que ele entrega é conversa.

#### Scenario: A rodada começa sem pergunta de papel
- **WHEN** a criança digita `dudu, quente e frio`
- **THEN** a rodada começa direto
- **AND** nenhuma pergunta de papel é feita
- **AND** a razão é que o jogo tem um papel só: perguntar seria uma pergunta de
  uma resposta só

#### Scenario: Aproximou, esquentou
- **GIVEN** a rodada está em andamento
- **WHEN** o jogador anda na direção do ponto
- **THEN** o bot diz que está esquentando

#### Scenario: Afastou, esfriou
- **WHEN** o jogador anda para longe do ponto
- **THEN** o bot diz que esfriou
- **AND** longe demais vira "gelado"

#### Scenario: Parada no lugar é "morno", não "frio"
- **GIVEN** o jogador parou para pensar
- **WHEN** o passo é avaliado
- **THEN** o bot diz "morno" e pede que ela ande
- **AND** a razão é que dizer "frio" seria mentira: ela não se afastou

#### Scenario: Pertinho é "pelando", mesmo tendo se afastado
- **GIVEN** o jogador está a menos de duas vezes e meia o raio de acerto
- **WHEN** ele dá um passo para trás
- **THEN** o bot continua dizendo "pelando"
- **AND** a razão é que essa dica faz a criança olhar em volta, que é o que
  resolve

#### Scenario: Achou
- **GIVEN** o jogador chegou a `foundRadius` do ponto
- **THEN** o bot comemora
- **AND** a rodada termina

#### Scenario: A mesma palavra não sai toda vez
- **GIVEN** a temperatura continua a mesma por vários passos
- **WHEN** o bot fala
- **THEN** a repetição sai a cada `repeatEvery` passos, não a cada passo
- **AND** mudança de temperatura sai sempre
- **AND** a razão é que repetir "frio" oito vezes seguidas faz a criança parar
  de ler

#### Scenario: Desistiu ou acabou o tempo: ele mostra onde era
- **WHEN** o jogador desiste, ou o `roundTimeoutMs` estoura
- **THEN** o bot fala que vai mostrar
- **AND** anda até o ponto
- **AND** a razão é que rodada de esconder sem revelação deixa a criança sem
  fecho — e sem saber se havia mesmo um lugar

#### Scenario: O ponto nunca é dito
- **GIVEN** qualquer fala do jogo
- **WHEN** ela é lida
- **THEN** nenhuma contém coordenada
- **AND** contar onde é acabaria com a brincadeira

#### Scenario: Sem lugar para esconder, recusa honesta
- **GIVEN** não há nenhum ponto com chão e alcançável por perto
- **WHEN** a rodada tenta começar
- **THEN** o bot diz que não achou lugar bom e sugere mudar de canto
- **AND** nenhuma rodada começa

---

### Requirement: Jogo de um papel só não pergunta

Quando `ROLES_BY_GAME` tem um único papel para o jogo, o `app/` escolhe esse
papel em vez de perguntar.

#### Scenario: A pergunta é pulada
- **GIVEN** o jogo pedido tem um papel só
- **WHEN** o convite chega sem papel
- **THEN** a rodada começa com o único papel possível
- **AND** nenhuma pendência de pergunta é criada

#### Scenario: Jogo de dois papéis continua perguntando
- **GIVEN** o jogo pedido tem dois papéis
- **WHEN** o convite chega sem papel
- **THEN** a pergunta é feita, como sempre foi

---

## MODIFIED

### Requirement: Registro de jogos conhecidos

O registro passa a ter **três** jogos. `GAME_ROLES` ganha `bot_esconde_ponto`, e
`GAME_PHASES` ganha `escondendo_tesouro` e `esquentando`.

#### Scenario: O registro cresceu sem mexer nos outros dois
- **GIVEN** o jogo novo entrou
- **WHEN** o esconde-esconde e o pega-pega rodam
- **THEN** eles se comportam exatamente como antes
- **AND** o `GameWorld` não mudou: a rodada nova usa o contrato que já existia
