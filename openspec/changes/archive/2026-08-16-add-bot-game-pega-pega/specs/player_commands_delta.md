# Delta: Comandos do Jogador

**Change ID:** `add-bot-game-pega-pega`
**Affects:** convites de brincadeira no parser, intenção `PLAY_GAME`

---

## ADDED

### Requirement: Convites de pega-pega no parser determinístico

Convidar para pega-pega é reconhecido por regex, antes de qualquer chamada de
rede. Com `llm.provider: 'none'` a brincadeira funciona igual.

#### Scenario: Convite nomeando o pega-pega
- **WHEN** `Miguel` digita `dudu, vamos brincar de pega pega`
- **THEN** o parser devolve `PLAY_GAME{game: "pega_pega", role: "bot_pega"}`
- **AND** nenhuma chamada de IA acontece

#### Scenario: Variantes regionais do nome
- **WHEN** `Miguel` digita `pique pega`, `pega pega` ou `bora de pega pega`
- **THEN** todas casam com o mesmo jogo `pega_pega`
- **AND** nenhuma delas vira jogo separado no registro

#### Scenario: Mandar o bot pegar
- **WHEN** `Miguel` digita `dudu, me pega` (ou `vem me pegar`, `corre atras de
  mim`, `tenta me pegar`, `voce pega`)
- **THEN** o parser devolve `PLAY_GAME` com o papel de quem pega

#### Scenario: Mandar o bot correr
- **WHEN** `Miguel` digita `dudu, eu vou te pegar` (ou `eu te pego`, `voce
  corre`, `sai correndo`)
- **THEN** o parser devolve `PLAY_GAME{game: "pega_pega", role: "bot_foge"}`

#### Scenario: Padrão de papel vem antes do genérico
- **GIVEN** os padrões são avaliados em ordem
- **WHEN** `Miguel` digita `eu vou te pegar`
- **THEN** o papel resolvido é `bot_foge`, não o padrão do jogo
- **AND** a ordem segue a mesma regra já usada em `eu vou me esconder`

#### Scenario: Padrões normalizados
- **GIVEN** os padrões rodam sobre texto já normalizado
- **WHEN** `Miguel` digita `DUDU, VAMOS BRINCAR DE PEGA-PEGA!!!`
- **THEN** a normalização entrega `vamos brincar de pega pega`
- **AND** o comando casa normalmente

#### Scenario: Enfeite no fim da frase
- **WHEN** `Miguel` digita `dudu, me pega ai`
- **THEN** o filler final é removido na segunda passada e o comando casa

---

### Requirement: Intenção `ASK_WHICH_GAME`

O catálogo fechado de intenções ganha `ASK_WHICH_GAME`, sem params: o convite que
não nomeia o jogo. Ela **nunca** inicia rodada.

#### Scenario: Convite genérico com os jogos ligados
- **GIVEN** `games.enabled` é `true`
- **WHEN** a intenção `ASK_WHICH_GAME` é executada
- **THEN** o bot pergunta no chat qual das duas brincadeiras a criança quer
- **AND** o estado não muda e nenhuma sessão é criada

#### Scenario: Convite genérico com os jogos desligados
- **GIVEN** `games.enabled` é `false`
- **WHEN** a intenção `ASK_WHICH_GAME` é executada
- **THEN** o bot responde que agora não dá para brincar
- **AND** **não** nomeia nenhuma das brincadeiras — perguntar "qual você quer?"
  com tudo desligado é oferecer o que o bot não pode fazer

> É por causa deste segundo cenário que o convite genérico é intenção, e não uma
> entrada de repertório com padrões próprios: só o wiring conhece a configuração,
> e o repertório responderia igual nos dois casos.

---

### Requirement: Desistência com sentido por jogo

`desisto` e suas variantes já existentes continuam valendo, e passam a ter
sentido próprio em cada jogo. Fora de uma rodada, seguem sendo conversa comum.

#### Scenario: Desistir com o bot fugindo
- **GIVEN** uma rodada de pega-pega com o bot no papel `bot_foge`
- **WHEN** `Miguel` digita `dudu, desisto`
- **THEN** o bot para de fugir e se entrega
- **AND** a rodada termina com o bot perdendo

#### Scenario: Desistir com o bot pegando
- **GIVEN** uma rodada de pega-pega com o bot no papel `bot_pega`
- **WHEN** `Miguel` digita `dudu, desisto`
- **THEN** o bot entende que o jogador parou de correr
- **AND** encosta nele e declara que pegou

#### Scenario: Desistir fora de rodada
- **GIVEN** nenhuma rodada em andamento
- **WHEN** `Miguel` digita `desisto`
- **THEN** a mensagem desce na cascata normalmente, como conversa

---

## MODIFIED

### Requirement: Intenção `PLAY_GAME`

O catálogo fechado de intenções tem `PLAY_GAME`, com o nome do jogo obrigatório
e o papel opcional. `GAME_ROLES` passa a incluir `bot_pega` e `bot_foge`, e o
papel é validado **contra o jogo pedido**.

#### Scenario: Intenção válida com papel explícito
- **GIVEN** o registro conhece `pega_pega`
- **WHEN** chega `PLAY_GAME{game: "pega_pega", role: "bot_foge"}`
- **THEN** a intenção é aceita e a rodada começa no papel de quem foge

#### Scenario: Intenção válida sem papel
- **WHEN** chega `PLAY_GAME{game: "pega_pega"}`
- **THEN** o papel padrão do jogo é aplicado: `bot_pega`

#### Scenario: Papel de outro jogo
- **WHEN** chega `PLAY_GAME{game: "pega_pega", role: "bot_procura"}`
- **THEN** o schema aceita a forma, mas o registro recusa a combinação
- **AND** nenhuma rodada começa e o bot responde no chat

#### Scenario: Papel inválido
- **WHEN** chega `PLAY_GAME{game: "pega_pega", role: "juiz"}`
- **THEN** a validação recusa e a intenção vira `UNKNOWN`
- **AND** nenhuma rodada começa

#### Scenario: Jogo fora do registro vindo da IA
- **WHEN** a IA devolve `PLAY_GAME{game: "poquer"}`
- **THEN** o schema aceita a forma, mas o registro recusa o jogo
- **AND** o bot responde que ainda não aprendeu esse jogo

---

### Requirement: Convites de brincadeira no parser determinístico

Convidar para brincar é reconhecido por regex, antes de qualquer chamada de rede.
Com `llm.provider: 'none'` a brincadeira funciona igual.

O convite **genérico** deixa de escolher o jogo pela criança.

#### Scenario: Convite genérico
- **WHEN** `Miguel` digita `dudu, vamos brincar` (ou `bora brincar`, `vamos
  jogar`, `quer brincar`)
- **THEN** o parser devolve `ASK_WHICH_GAME`, **não** `PLAY_GAME`
- **AND** o bot pergunta qual das duas brincadeiras ela quer
- **AND** nenhuma chamada de IA acontece

#### Scenario: Convite nomeando o jogo
- **WHEN** `Miguel` digita `dudu, vamos brincar de esconde esconde`
- **THEN** o parser devolve `PLAY_GAME{game: "esconde_esconde", role:
  "bot_esconde"}`
- **AND** com `de pega pega` no lugar, devolve `PLAY_GAME{game: "pega_pega",
  role: "bot_pega"}`

---

## REMOVED

(None)
