# Especificação: Comandos do Jogador e Comportamentos

**Componente:** `player_commands`
**Origem:** `add-minecraft-companion-bot` (2026-08-15)
**Atualizado por:** `add-bot-games-hide-and-seek` (2026-08-15),
`add-bot-game-pega-pega` (2026-08-16)

---

## Requisitos

### Requirement: Autorização de comandos

Apenas o `ownerPlayer` configurado comanda o bot. Outros jogadores podem
conversar, mas não dão ordens.

#### Scenario: Comando vindo do dono
- **GIVEN** `ownerPlayer` é `"Miguel"`
- **WHEN** `Miguel` digita `dudu, me segue`
- **THEN** o comando é aceito e o bot entra em `FOLLOW`

#### Scenario: Comando vindo de outro jogador
- **GIVEN** `ownerPlayer` é `"Miguel"`
- **WHEN** o jogador `Fulano` digita `dudu, me segue`
- **THEN** o comando é ignorado e o estado não muda
- **AND** o bot responde educadamente que só obedece ao Miguel

---

### Requirement: Seguir o jogador

O bot acompanha o dono pelo mundo, mantendo uma distância confortável.

#### Scenario: Começar a seguir
- **GIVEN** o bot está em `IDLE` e o dono está visível
- **WHEN** o dono digita `dudu, me segue` (ou `vem`, ou `vem comigo`)
- **THEN** o bot transiciona para `FOLLOW`
- **AND** o pathfinder persegue o dono com a distância configurada (padrão 3 blocos)
- **AND** o bot confirma no chat

#### Scenario: Seguir por terreno irregular
- **GIVEN** o bot está em `FOLLOW`
- **WHEN** o dono sobe uma montanha e atravessa um rio
- **THEN** o bot recalcula a rota e continua acompanhando
- **AND** permanece em `FOLLOW`

#### Scenario: Dono fica fora de alcance
- **GIVEN** o bot está em `FOLLOW`
- **WHEN** o dono teleporta para longe e sai do alcance
- **THEN** o bot avisa no chat que perdeu o dono
- **AND** volta para `IDLE`

#### Scenario: Comando de seguir com o dono já ausente
- **GIVEN** o bot está em `IDLE` e o dono não está no alcance de visão
- **WHEN** o dono digita `dudu, me segue`
- **THEN** o bot responde que não está enxergando o dono
- **AND** permanece em `IDLE`

---

### Requirement: Ficar parado em um lugar

O bot guarda uma posição e permanece nela até receber outra ordem.

#### Scenario: Ficar na posição atual
- **GIVEN** o bot está em `FOLLOW`
- **WHEN** o dono digita `dudu, fica aqui`
- **THEN** o bot memoriza a coordenada atual e transiciona para `STAY`
- **AND** para de perseguir o dono
- **AND** confirma no chat

#### Scenario: Permanecer enquanto o dono se afasta
- **GIVEN** o bot está em `STAY` na coordenada memorizada
- **WHEN** o dono anda 100 blocos para longe
- **THEN** o bot continua na coordenada memorizada
- **AND** permanece em `STAY`

#### Scenario: Voltar ao ponto depois de ser empurrado
- **GIVEN** o bot está em `STAY`
- **WHEN** água ou um mob empurra o bot para mais de 2 blocos do ponto
- **THEN** o bot caminha de volta para a coordenada memorizada

---

### Requirement: Parar e cancelar

Uma ordem de parada interrompe imediatamente qualquer coisa que o bot esteja fazendo.

#### Scenario: Cancelar uma ação em andamento
- **GIVEN** o bot está em `ACTION` coletando blocos
- **WHEN** o dono digita `dudu, para`
- **THEN** o `AbortSignal` da ação é disparado
- **AND** o bot para em menos de 1 segundo
- **AND** transiciona para `IDLE` e confirma no chat

#### Scenario: Parar enquanto segue
- **GIVEN** o bot está em `FOLLOW`
- **WHEN** o dono digita `dudu, para`
- **THEN** o pathfinder é interrompido e o bot vai para `IDLE`

#### Scenario: Cancelar uma rodada de jogo em andamento
- **GIVEN** o bot está em `GAME`, em qualquer fase
- **WHEN** o dono digita `dudu, para`
- **THEN** o `AbortSignal` da sessão é disparado
- **AND** o bot para em menos de 1 s, confirma no chat e vai para `IDLE`
- **AND** a contagem, se estava em curso, para de sair no chat

---

### Requirement: Catálogo de ações executáveis

O bot executa um conjunto fechado de ações no mundo. Toda ação tem timeout e é
cancelável.

#### Scenario: Coletar um bloco permitido
- **GIVEN** a allowlist de coleta inclui `oak_log`
- **WHEN** a intenção `COLLECT_BLOCK{block: "oak_log", count: 4}` é executada
- **THEN** o bot vai até os blocos, quebra até 4 e os recolhe
- **AND** informa no chat quando termina
- **AND** volta para `IDLE`

#### Scenario: Bloco fora da allowlist
- **GIVEN** a allowlist não inclui `diamond_block`
- **WHEN** a intenção `COLLECT_BLOCK{block: "diamond_block"}` chega
- **THEN** a ação é recusada e nenhum bloco é quebrado
- **AND** o bot explica no chat que não pode mexer nesse bloco

#### Scenario: Entregar item ao dono
- **GIVEN** o bot tem `oak_log` no inventário e o dono está a 5 blocos
- **WHEN** a intenção `DROP_ITEM_TO_OWNER{item: "oak_log"}` é executada
- **THEN** o bot caminha até o dono e larga o item perto dele

#### Scenario: Ir até uma coordenada
- **GIVEN** o bot está em `IDLE`
- **WHEN** a intenção `GOTO_COORDS{x: 100, y: 64, z: -200}` é executada
- **THEN** o bot navega até lá e avisa na chegada

#### Scenario: Ação sem progresso
- **GIVEN** o bot está executando `GOTO_COORDS` para um alvo inalcançável
- **WHEN** não há progresso de posição pelo período configurado
- **THEN** a ação é abortada
- **AND** o bot avisa no chat que não conseguiu chegar
- **AND** volta para `IDLE`

#### Scenario: Ação estourando o timeout
- **GIVEN** uma ação passa do seu tempo máximo
- **WHEN** o timeout dispara
- **THEN** a ação é cancelada e o bot volta para `IDLE` avisando no chat

Ao catálogo de ações se soma a categoria **jogo**, que não é uma ação avulsa e
sim uma sessão com fases. A diferença de tratamento é deliberada.

#### Scenario: Jogo não é despachado como ação avulsa
- **WHEN** a intenção `PLAY_GAME` é executada
- **THEN** ela **não** passa pelo despacho de `runIntent`
- **AND** vai para o registro de jogos, que cria a sessão e o estado `GAME`

---

### Requirement: Comportamento de emergência

Vida crítica do próprio bot tem prioridade sobre qualquer ordem e sobre a defesa
do jogador.

> A defesa do jogador e a reação a hostis estão especificadas em
> `player_defense.md`. Aqui fica só o que diz respeito ao roteamento de
> comandos durante a emergência.

O gatilho de emergência é **apenas a vida crítica do próprio bot**. Proximidade
de hostil não dispara fuga: dispara `DEFEND` (ver `player_defense.md` →
"Detecção de ameaça ao dono"). `EMERGENCY` é o estado de maior prioridade e
sempre vence a defesa.

#### Scenario: Vida crítica
- **GIVEN** o bot está em `ACTION` coletando blocos
- **WHEN** a vida cai abaixo do limite configurado (padrão 6 de 20)
- **THEN** o bot transiciona para `EMERGENCY`, cancela a ação
- **AND** recua na direção do dono, avisando no chat

#### Scenario: Vida crítica em combate
- **GIVEN** o bot está em `DEFEND` e `defense.criticalHealth` é 6
- **WHEN** a vida do bot cai para 5
- **THEN** o bot entra em `EMERGENCY`, para de atacar e recua na direção do dono
- **AND** avisa no chat

#### Scenario: Hostil próximo já não dispara fuga
- **GIVEN** o bot está em `STAY` com vida cheia
- **WHEN** um zumbi chega a 4 blocos do dono
- **THEN** o bot **não** entra em `EMERGENCY`
- **AND** entra em `DEFEND`

#### Scenario: Emergência ignora comando concorrente
- **GIVEN** o bot está em `EMERGENCY` com vida crítica
- **WHEN** o dono digita `dudu, pega madeira`
- **THEN** o comando é recusado com explicação no chat
- **AND** o bot permanece em `EMERGENCY` até estar seguro

#### Scenario: Vida crítica durante uma rodada de jogo
- **GIVEN** o bot está em `GAME`, escondido
- **WHEN** a vida cai abaixo do limite configurado
- **THEN** o bot transiciona para `EMERGENCY` e a rodada é cancelada
- **AND** recua na direção do dono, avisando no chat
- **AND** não volta a brincar quando estiver seguro

---

### Requirement: Comandos de controle da defesa

O dono liga e desliga a defesa automática por chat. Comportamento detalhado em
`player_defense.md`.

#### Scenario: Parser reconhece os comandos de defesa
- **GIVEN** o bot está conectado
- **WHEN** o dono digita `dudu, não briga` ou `dudu, pode brigar`
- **THEN** o parser determinístico reconhece o comando sem chamar a IA
- **AND** a flag de defesa é alternada com confirmação no chat

#### Scenario: Morte do bot
- **GIVEN** o bot morre apesar do comportamento de emergência
- **WHEN** o evento de respawn acontece
- **THEN** o bot volta para `IDLE`, avisa no chat que morreu
- **AND** não tenta automaticamente recuperar os itens dropados

---

### Requirement: Intenção `PLAY_GAME`

O catálogo fechado de intenções tem `PLAY_GAME`, com o nome do jogo obrigatório
e o papel opcional. `GAME_ROLES` cobre os papéis dos dois jogos, e o papel é
validado **contra o jogo pedido**. Continua valendo a regra de ouro: intenção
fora do catálogo, ou com params inválidos, vira `UNKNOWN` e nenhuma ação de mundo
acontece.

#### Scenario: Intenção válida com papel explícito
- **GIVEN** o registro conhece `pega_pega`
- **WHEN** chega `PLAY_GAME{game: "pega_pega", role: "bot_foge"}`
- **THEN** a intenção é aceita e a rodada começa no papel de quem foge

#### Scenario: Intenção válida sem papel
- **WHEN** chega `PLAY_GAME{game: "esconde_esconde"}`
- **THEN** o papel padrão do jogo é aplicado: `bot_esconde`
- **AND** para `PLAY_GAME{game: "pega_pega"}`, o padrão é `bot_pega`

#### Scenario: Papel de outro jogo
- **WHEN** chega `PLAY_GAME{game: "pega_pega", role: "bot_procura"}`
- **THEN** o schema aceita a forma, mas o registro recusa a combinação
- **AND** nenhuma rodada começa e o bot responde no chat

#### Scenario: Papel inválido
- **WHEN** chega `PLAY_GAME{game: "esconde_esconde", role: "juiz"}`
- **THEN** a validação recusa e a intenção vira `UNKNOWN`
- **AND** nenhuma rodada começa

#### Scenario: Jogo fora do registro vindo da IA
- **WHEN** a IA devolve `PLAY_GAME{game: "poquer"}`
- **THEN** o schema aceita a forma, mas o registro recusa o jogo
- **AND** o bot responde que ainda não aprendeu esse jogo

---

### Requirement: Intenção `ASK_WHICH_GAME`

O catálogo fechado de intenções tem `ASK_WHICH_GAME`, sem params: o convite que
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

### Requirement: Convites de brincadeira no parser determinístico

Convidar para brincar é reconhecido por regex, antes de qualquer chamada de rede.
Com `llm.provider: 'none'` a brincadeira funciona igual.

#### Scenario: Convite genérico
- **WHEN** `Miguel` digita `dudu, vamos brincar` (ou `bora brincar`, `vamos
  jogar`, `quer brincar`)
- **THEN** o parser devolve `ASK_WHICH_GAME`, **não** `PLAY_GAME`
- **AND** o bot pergunta qual das duas brincadeiras ela quer
- **AND** nenhuma chamada de IA acontece

#### Scenario: Convite nomeando o jogo
- **WHEN** `Miguel` digita `dudu, vamos brincar de esconde esconde`
- **THEN** o parser devolve `PLAY_GAME{game: "esconde_esconde", role: "bot_esconde"}`
- **AND** com `de pega pega` no lugar, devolve `PLAY_GAME{game: "pega_pega",
  role: "bot_pega"}`

#### Scenario: Variantes regionais do nome do pega-pega
- **WHEN** `Miguel` digita `pique pega`, `pira pega` ou `bora de pega pega`
- **THEN** todas casam com o mesmo jogo `pega_pega`
- **AND** nenhuma delas vira jogo separado no registro

#### Scenario: Mandar o bot se esconder
- **WHEN** `Miguel` digita `dudu, se esconde` (ou `vai se esconder`, `voce se esconde`)
- **THEN** o parser devolve `PLAY_GAME` com o papel de quem se esconde

#### Scenario: Mandar o bot procurar
- **WHEN** `Miguel` digita `dudu, eu vou me esconder` (ou `conta ate 10`,
  `me procura`, `vem me achar`)
- **THEN** o parser devolve `PLAY_GAME` com o papel de quem procura

#### Scenario: Mandar o bot correr atrás
- **WHEN** `Miguel` digita `dudu, me pega` (ou `vem me pegar`, `corre atras de
  mim`, `tenta me pegar`, `voce pega`)
- **THEN** o parser devolve `PLAY_GAME` com o papel de quem pega

#### Scenario: Avisar que vai pegar
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
- **WHEN** `Miguel` digita `DUDU, VAMOS BRINCAR DE ESCONDE-ESCONDE!!!`
- **THEN** a normalização entrega `vamos brincar de esconde esconde`
- **AND** o comando casa normalmente
- **AND** o mesmo vale para `DUDU, VAMOS BRINCAR DE PEGA-PEGA!!!`

#### Scenario: Enfeite no fim da frase
- **WHEN** `Miguel` digita `dudu, vamos brincar agora` ou `dudu, me pega ai`
- **THEN** o filler final é removido na segunda passada e o comando casa

---

### Requirement: Desistência com sentido por jogo

`desisto` e suas variantes são reconhecidas fora do catálogo de intenções: só
fazem sentido com uma rodada em andamento. Cada jogo entende a desistência do
seu jeito.

#### Scenario: Desistir com o bot fugindo
- **GIVEN** uma rodada de pega-pega com o bot no papel `bot_foge`
- **WHEN** `Miguel` digita `dudu, desisto` (ou `nao te pego`, `cansei`)
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
