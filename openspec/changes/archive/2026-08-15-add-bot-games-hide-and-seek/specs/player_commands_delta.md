# Delta: Comandos do Jogador e Máquina de Estados

**Change ID:** `add-bot-games-hide-and-seek`
**Affects:** `src/behaviors/commands.ts`, `src/behaviors/state-machine.ts`, `src/domain/types.ts`, `src/domain/intent.ts`

---

## ADDED

### Requirement: Intenção `PLAY_GAME`

O catálogo fechado de intenções ganha `PLAY_GAME`, com o nome do jogo obrigatório
e o papel opcional. Continua valendo a regra de ouro: intenção fora do catálogo,
ou com params inválidos, vira `UNKNOWN` e nenhuma ação de mundo acontece.

#### Scenario: Intenção válida com papel explícito
- **GIVEN** o registro conhece `esconde_esconde`
- **WHEN** chega `PLAY_GAME{game: "esconde_esconde", role: "bot_esconde"}`
- **THEN** a intenção é aceita e a rodada começa no papel de quem se esconde

#### Scenario: Intenção válida sem papel
- **WHEN** chega `PLAY_GAME{game: "esconde_esconde"}`
- **THEN** o papel padrão é `bot_esconde` — o bot é quem se esconde

#### Scenario: Papel inválido
- **WHEN** chega `PLAY_GAME{game: "esconde_esconde", role: "juiz"}`
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

#### Scenario: Convite genérico
- **WHEN** `Miguel` digita `dudu, vamos brincar` (ou `bora brincar`, `vamos jogar`)
- **THEN** o parser devolve `PLAY_GAME{game: "esconde_esconde", role: "bot_esconde"}`
- **AND** nenhuma chamada de IA acontece

#### Scenario: Convite nomeando o jogo
- **WHEN** `Miguel` digita `dudu, vamos brincar de esconde esconde`
- **THEN** o parser devolve `PLAY_GAME{game: "esconde_esconde", role: "bot_esconde"}`

#### Scenario: Mandar o bot se esconder
- **WHEN** `Miguel` digita `dudu, se esconde` (ou `vai se esconder`, `voce se esconde`)
- **THEN** o parser devolve `PLAY_GAME` com o papel de quem se esconde

#### Scenario: Mandar o bot procurar
- **WHEN** `Miguel` digita `dudu, eu vou me esconder` (ou `conta ate 10`,
  `me procura`, `vem me achar`)
- **THEN** o parser devolve `PLAY_GAME` com o papel de quem procura

#### Scenario: Padrões normalizados
- **GIVEN** os padrões rodam sobre texto já normalizado
- **WHEN** `Miguel` digita `DUDU, VAMOS BRINCAR DE ESCONDE-ESCONDE!!!`
- **THEN** a normalização entrega `vamos brincar de esconde esconde`
- **AND** o comando casa normalmente

#### Scenario: Enfeite no fim da frase
- **WHEN** `Miguel` digita `dudu, vamos brincar agora`
- **THEN** o filler final é removido na segunda passada e o comando casa

---

### Requirement: Estado `GAME`

`BotState` ganha `GAME`, com prioridade 2 — a mesma de `ACTION`.

#### Scenario: Prioridade entre estados
- **GIVEN** a ordem declarada é `EMERGENCY` > `DEFEND` > `ACTION` = `GAME` >
  `FOLLOW`/`STAY` > `IDLE`
- **WHEN** o bot está em `GAME` e a defesa precisa assumir
- **THEN** `DEFEND` interrompe `GAME`, porque tem prioridade maior

#### Scenario: Jogo não interrompe ação e ação não interrompe jogo
- **GIVEN** o bot está em `ACTION` coletando blocos
- **WHEN** uma interrupção por prioridade para `GAME` é tentada
- **THEN** a transição é recusada — prioridades iguais não interrompem
- **AND** o mesmo vale no sentido contrário

#### Scenario: Ordem do jogador sempre vale
- **GIVEN** o bot está em `ACTION` coletando blocos
- **WHEN** `Miguel` digita `dudu, vamos brincar`
- **THEN** a transição por ordem do jogador acontece mesmo com prioridade igual
- **AND** a ação em curso é cancelada pelo `AbortSignal`

#### Scenario: `GAME` nunca é retomado
- **GIVEN** `GAME` foi empilhado por uma interrupção de `DEFEND`
- **WHEN** o combate termina e o `resume()` desempilha
- **THEN** o bot cai em `IDLE`, e não volta para `GAME`
- **AND** a sessão de jogo já foi cancelada pelo `AbortSignal` da interrupção

#### Scenario: Emergência recusa convite
- **GIVEN** o bot está em `EMERGENCY` com vida crítica
- **WHEN** `Miguel` digita `dudu, vamos brincar`
- **THEN** o convite é recusado com explicação no chat
- **AND** o bot permanece em `EMERGENCY`

---

## MODIFIED

### Requirement: Catálogo de ações executáveis

Ao catálogo de ações se soma a categoria **jogo**, que não é uma ação avulsa e
sim uma sessão com fases. A diferença de tratamento é deliberada.

#### Scenario: Ação avulsa continua igual
- **WHEN** a intenção `COLLECT_BLOCK{block: "oak_log", count: 4}` é executada
- **THEN** o comportamento é exatamente o já especificado, sem mudança

#### Scenario: Jogo não é despachado como ação avulsa
- **WHEN** a intenção `PLAY_GAME` é executada
- **THEN** ela **não** passa pelo despacho de `runIntent`
- **AND** vai para o registro de jogos, que cria a sessão e o estado `GAME`

---

### Requirement: Comportamento de emergência

A emergência passa a cobrir também a rodada de jogo.

#### Scenario: Vida crítica durante uma rodada
- **GIVEN** o bot está em `GAME`, escondido
- **WHEN** a vida cai abaixo do limite configurado
- **THEN** o bot transiciona para `EMERGENCY` e a rodada é cancelada
- **AND** recua na direção do dono, avisando no chat
- **AND** não volta a brincar quando estiver seguro

---

### Requirement: Parar e cancelar

`dudu, para` passa a cancelar também a rodada de jogo.

#### Scenario: Cancelar uma rodada em andamento
- **GIVEN** o bot está em `GAME`, em qualquer fase
- **WHEN** `Miguel` digita `dudu, para`
- **THEN** o `AbortSignal` da sessão é disparado
- **AND** o bot para em menos de 1 s, confirma no chat e vai para `IDLE`
- **AND** a contagem, se estava em curso, para de sair no chat

---

## REMOVED

(Nenhum)
