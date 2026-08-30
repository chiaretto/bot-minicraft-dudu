# Delta: Comandos do jogador

**Change ID:** `add-sleep`
**Affects:** `domain/sleeping.ts`, `behaviors/actions/index.ts`,
`behaviors/commands.ts`, `app/bot.ts`

---

## ADDED

### Requirement: Dormir na cama

`SLEEP` leva o bot até a cama mais próxima (até `BED_SEARCH_RADIUS`) e o faz
dormir. O valor da ação é **pular a noite**: a parte do jogo que mais assusta
uma criança de 7 anos passa em dois segundos.

#### Scenario: Dorme de noite com cama perto
- **GIVEN** é noite e há uma cama a menos de 24 blocos
- **WHEN** a criança digita `dudu, vamos dormir`
- **THEN** o parser resolve no nível 1, sem IA
- **AND** o bot anda até a cama e deita
- **AND** fala uma boa-noite curta

#### Scenario: De dia ele recusa antes de andar
- **GIVEN** é dia
- **WHEN** o pedido chega
- **THEN** o bot **não** sai do lugar
- **AND** diz que só dá para dormir de noite e pede para ser chamado quando
  escurecer
- **AND** a razão de recusar cedo é que atravessar o mundo até a cama para levar
  um "não" do servidor seria pior do que não tentar

#### Scenario: Sem cama, ele pede uma
- **GIVEN** não há cama por perto
- **THEN** ele diz que não achou nenhuma e pede que ponham uma
- **AND** pedir uma cama é pedir uma coisa que a criança sabe fazer

#### Scenario: O "não" do servidor chega em português
- **GIVEN** há monstro por perto e o servidor recusa o descanso
- **WHEN** a recusa volta
- **THEN** o bot diz "Tem monstro por perto! Não dá pra dormir assim."
- **AND** nenhuma palavra em inglês chega ao chat

#### Scenario: Toda recusa tem fala
- **GIVEN** qualquer motivo de recusa
- **WHEN** ele recusa
- **THEN** existe uma fala para aquele motivo
- **AND** motivo novo sem fala não compila: as falas são um `Record` sobre o
  tipo da recusa

#### Scenario: `para` tira ele da cama
- **GIVEN** o bot está dormindo
- **WHEN** a criança digita `dudu, para`
- **THEN** ele acorda
- **AND** a razão é que o abort não acorda ninguém sozinho

---

### Requirement: "boa noite" é despedida, não ordem

`boa noite` **não** manda o bot dormir. Na boca de uma criança é despedida, e
obedecer isso como ordem seria obedecer a coisa errada.

#### Scenario: A despedida continua despedida
- **WHEN** a criança digita `boa noite`
- **THEN** nenhum comando é reconhecido
- **AND** a mensagem cai na entrada `despedida`

#### Scenario: "vou dormir" é sobre a criança, não sobre o bot
- **WHEN** a criança digita `vou dormir`
- **THEN** nenhum comando é reconhecido
- **AND** quem vai dormir é ela

---

## REMOVED

(None — a entrada `pedido_dormir` virou `pergunta_dormir`, registrada no
`local_dialogue_delta.md` deste change.)
