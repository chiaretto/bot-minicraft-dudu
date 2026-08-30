# Especificação: Comandos do Jogador e Comportamentos

**Componente:** `player_commands`
**Origem:** `add-minecraft-companion-bot` (2026-08-15)
**Atualizado por:** `add-collect-and-build`, `add-escape-hole`, `add-open-door`, `fix-harvest-and-gather` (2026-08-19),
`add-bot-games-hide-and-seek` (2026-08-15),
`add-bot-game-pega-pega` (2026-08-16), `fix-attack-on-command` (2026-08-29)

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

Desde `add-escape-hole`, um chamado que não consegue ser cumprido **não termina
mais em silêncio**.

> `GoalFollow` não avisa quando não existe caminho — o pathfinder simplesmente
> não anda. Com `movements.canDig = false` (proposital, para o esconde-esconde),
> o bot também não abre caminho sozinho. O resultado era o bot parado e mudo no
> fundo da ravina depois de a criança mandar `vem`.

#### Scenario: Chamado sem caminho possível
- **GIVEN** o bot está preso num buraco fundo
- **WHEN** o chamado chega e ele não consegue andar
- **THEN** ele avisa no chat e tenta subir
- **AND** **não** fica parado sem dizer nada

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

`ATTACK` é a única ação executável que a IA **não pode propor**, e a diferença é
deliberada: combate é determinístico e nunca depende de uma chamada de IA
(`project.md`), então escolher em quem bater fica com o parser do nível 1.

A IA precisa **saber que o comando existe** — sem isso ela improvisa promessa
("já tô indo te ajudar!") quando a criança pede para atacar, e nada acontece. Ela
recebe a informação de que o caminho é o comando; não recebe a ação.

`ATTACK` também fica fora das intenções aprendíveis, pela mesma regra que mantém
`GOTO_COORDS` fora: o parâmetro é um bicho daquele momento, não vocabulário.

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

### Requirement: Comando de ataque

A criança pode mandar o bot atacar um monstro. O comando mora no **nível 1** da
cascata — parser determinístico — e a IA não recebe a intenção correspondente.

Antes de `fix-attack-on-command` não existia nenhum caminho para atacar sob
comando, e o sintoma era o pior possível: a IA, sem ação para propor, **prometia**
("já tô indo te ajudar!") e nada acontecia. Prometer e não fazer é pior que
recusar — a criança não conclui que a capacidade não existe, conclui que o amigo
dela mentiu.

#### Scenario: Atacar o que está mais perto
- **GIVEN** um zumbi ameaça o dono
- **WHEN** a criança diz "ataca"
- **THEN** o parser resolve como ataque, sem consultar a IA
- **AND** o bot engaja o zumbi

#### Scenario: Atacar um tipo nomeado
- **GIVEN** há um zumbi a 3 blocos e um esqueleto a 8
- **WHEN** a criança diz "ataca o esqueleto"
- **THEN** o bot mira o **esqueleto**, não o zumbi mais perto

#### Scenario: O tipo pedido não está por perto
- **GIVEN** há um zumbi perto, mas nenhum esqueleto
- **WHEN** a criança diz "ataca o esqueleto"
- **THEN** o bot **não** mira o zumbi
- **AND** diz que não está vendo aquele bicho

> Mirar outro alvo seria atender um pedido que a criança não fez.

#### Scenario: Nada por perto
- **GIVEN** não há nenhuma criatura atacável por perto
- **WHEN** a criança manda atacar
- **THEN** o bot diz que não está vendo monstro nenhum
- **AND** não promete nada

#### Scenario: Nome de bicho fora do catálogo
- **GIVEN** a criança nomeia um bicho que o catálogo em português não conhece
- **WHEN** o comando é interpretado
- **THEN** **não** vira comando de ataque
- **AND** a frase desce na cascata como qualquer outra

#### Scenario: Frase que não é pedido de ataque continua sendo conversa
- **GIVEN** a criança diz "mata a saudade"
- **WHEN** o comando é interpretado
- **THEN** nenhum ataque acontece
- **AND** a frase desce para o repertório ou para a IA

> Frases assim são comuns. Um padrão aberto (`mata (.*)`) faria o bot sair
> batendo em alguma coisa — atacar errado é pior que não atacar.

#### Scenario: Comandos de controle da defesa não viram ataque
- **GIVEN** a criança diz "pode atacar" ou "nao ataca"
- **WHEN** o comando é interpretado
- **THEN** eles continuam ligando e desligando a **defesa automática**
- **AND** nenhum ataque é disparado

---

### Requirement: Catálogo de nomes de criatura em português

O comando de ataque traduz o nome falado pela criança para o nome do mob por um
**catálogo fechado** — a quinta lista fechada do projeto, junto de intenções,
plantas, jogos e intenções aprendíveis. Existe pelo mesmo motivo: limitar o que o
bot decide sozinho.

O catálogo cobre **hostis e pacíficos**. Incluir os pacíficos não é sobrecarga: é
o que faz a recusa funcionar. Sem `vaca` mapeada, "ataca a vaca" cairia no padrão
genérico e o bot bateria num zumbi qualquer.

#### Scenario: Hostil reconhecido pelo nome em português
- **GIVEN** a criança diz "ataca a aranha"
- **WHEN** o comando é interpretado
- **THEN** o alvo pedido é a aranha

#### Scenario: Escrita errada e sem acento continua funcionando
- **GIVEN** a criança escreve sem acento, em maiúscula ou com pontuação repetida
- **WHEN** o comando é interpretado
- **THEN** o nome é reconhecido do mesmo jeito

> Escrita errada é o caso **normal** de entrada, não a exceção.

---

### Requirement: Recusa honesta de alvo proibido

Pedido de ataque a criatura protegida é recusado com frase **escrita à mão**, com
o mínimo de variações do repertório — nunca improviso da IA, nunca silêncio.

Isto não afrouxa nenhuma proteção: a denylist absoluta continua idêntica. O que
muda é a criança passar a **entender** a recusa, em vez de depender de a IA
improvisar bem.

#### Scenario: Bicho pacífico
- **GIVEN** há uma vaca por perto
- **WHEN** a criança diz "ataca a vaca"
- **THEN** o bot recusa com frase de criança, explicando que não machuca bichinho
- **AND** a vaca não recebe nenhum golpe

#### Scenario: Jogador nunca é alvo
- **GIVEN** a criança nomeia um jogador
- **WHEN** o comando é interpretado
- **THEN** nenhum ataque acontece, em nenhuma circunstância

#### Scenario: Bicho domesticado
- **GIVEN** há um lobo domesticado por perto
- **WHEN** a criança manda atacar ele
- **THEN** o bot recusa
- **AND** a guarda de domesticado é conferida de novo no instante do golpe

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

---

### Requirement: Pegar bloco de verdade

Pedido de bloco comum é comando de **nível 1**: resolve sem IA, sem espera e com
`llm.provider: 'none'`. O bot vai até o bloco, cava e avisa o que trouxe.

A busca é sempre pelo **grupo** do material, nunca por um bloco só: "madeira"
vale por qualquer tronco.

| A criança fala | Grupo procurado |
|---|---|
| `pega madeira`, `pega tronco` | qualquer tronco |
| `pega pedra` | pedra e pedregulho |
| `pega terra` | terra |
| `pega areia` | areia |

#### Scenario: Pedido de madeira numa floresta
- **GIVEN** `games`/IA irrelevantes e há árvores por perto
- **WHEN** `FresherRobin90` digita `dudu, pega madeira`
- **THEN** o parser resolve no nível 1, sem chamar a IA
- **AND** o bot caminha até o tronco, cava e avisa quanto pegou

#### Scenario: Floresta sem o tronco exato pedido
- **GIVEN** o lugar só tem bétula
- **WHEN** o pedido chega como `oak_log`
- **THEN** a busca cobre o grupo inteiro e a bétula serve
- **AND** o bot **não** responde "não achei" num lugar cheio de árvore

#### Scenario: Bloco fora da allowlist de coleta
- **GIVEN** `diamond_ore` não está em `collectAllowlist`
- **WHEN** a coleta é pedida
- **THEN** o bot recusa sem cavar nada
- **AND** a recusa usa o nome que a criança entende, nunca o técnico

#### Scenario: Não há o bloco por perto
- **GIVEN** não existe nenhum bloco do grupo em 32 blocos
- **WHEN** a coleta roda
- **THEN** o bot avisa que não achou
- **AND** volta para `IDLE` sem ficar preso

---

### Requirement: Construir coisa simples

O bot levanta estruturas de um **catálogo fechado**. Pedido fora da lista nunca
vira obra.

| Estrutura | Forma |
|---|---|
| `casa` | 5x5, paredes de 2, porta na frente, 3 janelas, telhado plano |
| `torre` | 3x3, paredes de 4, porta, topo fechado |

#### Scenario: Pedir uma casa
- **GIVEN** o bot tem material suficiente, ou sabe buscar
- **WHEN** `FresherRobin90` digita `dudu, faz uma casa`
- **THEN** o parser resolve no nível 1, sem chamar a IA
- **AND** o bot levanta a casa ao lado de onde está
- **AND** avisa no chat quando termina

#### Scenario: A casa é habitável
- **GIVEN** uma casa recém-construída
- **WHEN** a criança chega nela
- **THEN** existe um vão de porta da altura da parede
- **AND** o interior é oco
- **AND** o telhado é fechado, sem buraco

#### Scenario: Estrutura fora do catálogo
- **GIVEN** o pedido é `castelo`
- **WHEN** a construção é avaliada
- **THEN** nenhuma obra começa e nenhum bloco é colocado
- **AND** o bot responde que essa ele não sabe fazer

#### Scenario: Obra grande demais
- **GIVEN** a planta pedida passa de `behavior.buildMaxBlocks`
- **WHEN** a construção é avaliada
- **THEN** ela é recusada **antes** de colocar o primeiro bloco

---

### Requirement: A obra nunca destrói o que já existe

Construir só acrescenta. Posição que já tem bloco é pulada, e conta como
pronta.

#### Scenario: Bloco do jogador no caminho da parede
- **GIVEN** existe um bloco do jogador onde a parede passaria
- **WHEN** a obra chega naquela posição
- **THEN** o bloco é preservado
- **AND** a obra segue e termina normalmente

#### Scenario: Material fora da allowlist de obra
- **GIVEN** o pedido é construir com `tnt`
- **WHEN** o material é escolhido
- **THEN** a obra é recusada
- **AND** `buildAllowlist` é a única fonte do que pode virar parede

---

### Requirement: Ordem de colocação com apoio

Todo bloco é colocado encostado em algo que já existe: no chão, no bloco de
baixo ou num vizinho já posto. A planta sai ordenada de baixo para cima e, em
cada camada, de fora para dentro.

> Sem isso o telhado não fecha: bloco no ar não pode ser colocado, e a obra
> terminaria pela metade com a criança olhando.

#### Scenario: Telhado fecha do anel de fora para o meio
- **GIVEN** as paredes estão de pé
- **WHEN** o telhado é colocado
- **THEN** o anel externo se apoia na parede
- **AND** cada anel seguinte se apoia no anterior, até o centro

#### Scenario: Bloco sem apoio na vez dele
- **GIVEN** um bloco cujo apoio ainda não existe
- **WHEN** a passada chega nele
- **THEN** ele é adiado para a passada seguinte
- **AND** a obra não trava esperando por ele

#### Scenario: Passada que não avança encerra a obra
- **GIVEN** uma passada inteira sem colocar nada
- **WHEN** ela termina
- **THEN** a obra é encerrada
- **AND** o bot fala que faltaram pedaços, em vez de fingir que terminou

---

### Requirement: Material da obra

Uma obra usa **um** material. Sem pedido explícito, vence o que o bot tem em
maior quantidade. Faltando material, ele busca antes de começar.

#### Scenario: Constrói com o que tem
- **GIVEN** o bot tem 90 de pedregulho e 10 de tronco
- **WHEN** a casa é pedida sem dizer o material
- **THEN** a obra inteira sai de pedregulho

#### Scenario: Material pedido pelo jogador
- **GIVEN** a criança pede uma torre de pedra
- **WHEN** o material é escolhido
- **THEN** a obra usa pedra, se estiver na allowlist de obra

#### Scenario: Falta material e ele busca
- **GIVEN** falta material e `behavior.buildAutoGather` é `true`
- **WHEN** a obra vai começar
- **THEN** o bot coleta o que falta primeiro
- **AND** só então levanta a estrutura

#### Scenario: Falta material e não dá para buscar
- **GIVEN** a busca não trouxe o suficiente
- **WHEN** a obra vai começar
- **THEN** ela é recusada **antes** de levantar meia parede
- **AND** o bot diz quantos blocos faltam e pede ajuda

#### Scenario: Mochila vazia
- **GIVEN** o bot não tem bloco nenhum e não sabe buscar
- **WHEN** a obra é pedida
- **THEN** ele recusa sem sair do lugar

Desde `fix-harvest-and-gather`, **com a mochila vazia e a busca ligada ele
escolhe o que vai buscar em vez de recusar antes de tentar.**

#### Scenario: Mochila vazia com busca ligada
- **GIVEN** o bot não tem bloco nenhum e `behavior.buildAutoGather` é `true`
- **WHEN** a obra é pedida
- **THEN** ele sai para buscar material
- **AND** **não** responde "não tenho bloco nenhum" sem tentar

#### Scenario: Mochila vazia sem busca
- **GIVEN** `behavior.buildAutoGather` é `false`
- **WHEN** a obra é pedida com a mochila vazia
- **THEN** a recusa continua sendo a resposta certa

#### Scenario: Material da obra precisa ser alcançável
- **GIVEN** o bot não tem picareta
- **WHEN** o material da obra é escolhido
- **THEN** pedra não entra na lista de candidatos
- **AND** ele prefere o que consegue colher de verdade

---

### Requirement: A obra é interrompível

Construir é ação como qualquer outra: para na hora que mandarem parar.

#### Scenario: `dudu, para` no meio da obra
- **GIVEN** a casa está pela metade
- **WHEN** `FresherRobin90` digita `dudu, para`
- **THEN** a obra para em menos de 1 s
- **AND** o que já foi construído permanece
- **AND** o bot volta para `IDLE`

#### Scenario: Ameaça durante a obra
- **GIVEN** a obra está em andamento
- **WHEN** um hostil entra no raio de proteção do dono
- **THEN** a defesa interrompe a obra
- **AND** a obra **não** recomeça sozinha quando o combate acaba

---

### Requirement: Sair de buraco

Chamado quando está preso no fundo de um buraco, o bot empilha blocos embaixo
de si até alcançar o nível do dono e então volta a seguir. Um chamado nunca
termina em silêncio.

#### Scenario: Chamado no fundo de uma ravina
- **GIVEN** o bot está em `FOLLOW` e o dono está 14 blocos acima
- **AND** o bot não sai do lugar há `behavior.escapeStuckMs`
- **WHEN** o vigia avalia a situação
- **THEN** o bot avisa no chat que caiu num buraco, **antes** de começar
- **AND** empilha blocos embaixo de si até o nível do dono
- **AND** volta a seguir sem precisar de comando novo

#### Scenario: Pedido explícito
- **GIVEN** o bot está num buraco
- **WHEN** `FresherRobin90` digita `dudu, sai do buraco` ou `dudu, sobe`
- **THEN** o parser resolve no nível 1, sem chamar a IA
- **AND** a subida começa

#### Scenario: Não está em buraco nenhum
- **GIVEN** o dono está no mesmo nível do bot, ou abaixo
- **WHEN** a subida é pedida
- **THEN** o bot recusa dizendo que não está num buraco
- **AND** nenhum bloco é colocado

#### Scenario: Desnível pequeno
- **GIVEN** o dono está menos de `behavior.escapeMinDrop` acima
- **WHEN** o vigia avalia
- **THEN** nada acontece — o pulo do pathfinder resolve

#### Scenario: Dono fora de vista
- **GIVEN** o bot está fundo e o dono não está visível
- **WHEN** a subida é avaliada
- **THEN** ele **não** sobe
- **AND** a razão é que uma torre no meio do nada não leva a lugar nenhum

#### Scenario: Teto de altura
- **GIVEN** o dono está 300 blocos acima, voando de criativo
- **WHEN** a subida roda
- **THEN** ela para em `behavior.escapeMaxHeight` degraus
- **AND** o bot fala que subiu mas ainda está fundo

---

### Requirement: Material do degrau

Faltando bloco, o bot cava as paredes em volta. Nunca o chão, e nunca o que não
pode cavar.

#### Scenario: Mochila vazia dentro do buraco
- **GIVEN** o bot não tem nenhum bloco e as paredes são de terra
- **WHEN** a subida vai começar
- **THEN** ele cava as paredes até ter degrau suficiente
- **AND** só então começa a subir

#### Scenario: Nunca cavar embaixo dos pés
- **GIVEN** o bot está escolhendo o que cavar
- **WHEN** os candidatos são listados
- **THEN** nenhum deles está abaixo dos pés
- **AND** a razão é que cavar o chão aprofunda o buraco

#### Scenario: Só o que ele pode cavar E usar
- **GIVEN** um bloco só está em `collectAllowlist`, ou só em `buildAllowlist`
- **WHEN** o material é escolhido
- **THEN** esse bloco **não** é cavado
- **AND** vale apenas a interseção das duas listas

#### Scenario: Nada para cavar e nada na mochila
- **GIVEN** o bot está num buraco de rocha que ele não pode cavar
- **WHEN** a subida é tentada
- **THEN** ele pede ajuda no chat
- **AND** não fica preso tentando

#### Scenario: Teto de escavação
- **GIVEN** cavar não está rendendo material
- **WHEN** `behavior.escapeMaxDigs` blocos foram cavados
- **THEN** ele para de cavar
- **AND** a subida não vira uma escavação sem fim

---

### Requirement: A subida respeita as prioridades

Subir é ação como qualquer outra: cede a lugar para o que é mais urgente.

#### Scenario: `dudu, para` no meio da subida
- **GIVEN** o bot está empilhando blocos
- **WHEN** `FresherRobin90` digita `dudu, para`
- **THEN** a subida para
- **AND** os degraus já colocados permanecem

#### Scenario: Monstro durante a subida
- **GIVEN** a subida está em andamento
- **WHEN** um hostil entra no raio de proteção do dono
- **THEN** a defesa interrompe a subida

#### Scenario: Brincadeira em andamento
- **GIVEN** uma rodada de esconde-esconde ou pega-pega está valendo
- **WHEN** o vigia roda
- **THEN** ele não faz nada
- **AND** a razão é que um bot empilhando blocos estragaria a brincadeira

#### Scenario: Parado por outro motivo
- **GIVEN** o bot está parado, mas o dono está no mesmo nível
- **WHEN** o vigia avalia
- **THEN** nenhuma subida começa

---

### Requirement: Abrir porta

O bot abre porta, portão de cerca e alçapão de madeira, clicando neles como o
jogador faria. Porta de ferro **não**: essa só abre com botão, alavanca ou placa
de pressão, e ele diz isso em vez de tentar.

#### Scenario: Pedido explícito
- **GIVEN** existe uma porta de madeira fechada por perto
- **WHEN** `FresherRobin90` digita `dudu, abre a porta`
- **THEN** o parser resolve no nível 1, sem chamar a IA
- **AND** o bot caminha até a porta e a abre
- **AND** avisa no chat que abriu

#### Scenario: Portão e alçapão
- **GIVEN** o bloco mais próximo é um portão de cerca ou um alçapão
- **WHEN** a abertura acontece
- **THEN** o bot chama o bloco pelo nome que a criança usa — `portão`, `alçapão`
- **AND** nunca pelo nome técnico

#### Scenario: Porta de ferro
- **GIVEN** a porta mais próxima é de ferro
- **WHEN** a abertura é pedida
- **THEN** o bot **não** clica nela
- **AND** explica que ela só abre com botão ou alavanca

> Ficar clicando numa porta que não vai abrir pareceria bot quebrado. A recusa
> honesta é a regra do público (`openspec/project.md`).

#### Scenario: Nenhuma porta por perto
- **GIVEN** não há porta em `behavior.doorSearchRadius`
- **WHEN** a abertura é pedida
- **THEN** o bot diz que não está vendo porta nenhuma

#### Scenario: Porta já aberta
- **GIVEN** a única porta por perto já está aberta
- **WHEN** a abertura é pedida
- **THEN** o bot avisa que ela já está aberta
- **AND** **não** clica nela — clicar de novo a fecharia

#### Scenario: As duas metades da porta
- **GIVEN** uma porta ocupa dois blocos e os dois aparecem na busca
- **WHEN** o alvo é escolhido
- **THEN** só a metade de baixo é considerada
- **AND** o bot não trata as duas metades como portas diferentes

#### Scenario: O clique não surtiu efeito
- **GIVEN** o bot clicou na porta
- **WHEN** ela continua fechada
- **THEN** ele fala que tentou e não abriu
- **AND** **não** anuncia que abriu

---

### Requirement: Porta fechada não trava o chamado

Porta fechada é parede para o pathfinder. Um chamado nunca pode terminar com o
bot parado do lado de fora, calado.

#### Scenario: Chamado com a porta fechada no caminho
- **GIVEN** o dono entrou em casa e fechou a porta
- **AND** o bot está em `FOLLOW` e não sai do lugar há `behavior.escapeStuckMs`
- **WHEN** o vigia avalia
- **THEN** o bot avisa que tem porta no caminho
- **AND** abre a porta
- **AND** volta a seguir sem precisar de comando novo

#### Scenario: Porta vem antes de buraco
- **GIVEN** o bot está travado
- **AND** existe porta fechada por perto
- **WHEN** o vigia escolhe o que fazer
- **THEN** ele tenta a porta primeiro
- **AND** a razão é que porta é mais comum, mais barata de resolver, e acontece
  no mesmo nível — onde a regra do buraco nem se aplica

#### Scenario: Porta de ferro não conta como causa
- **GIVEN** o bot está travado e a única porta por perto é de ferro
- **WHEN** o vigia avalia
- **THEN** a porta **não** é tratada como causa
- **AND** o vigia segue para a avaliação de buraco

#### Scenario: Brincadeira em andamento
- **GIVEN** uma rodada de esconde-esconde ou pega-pega está valendo
- **WHEN** o vigia roda
- **THEN** ele não abre porta nenhuma

> A garantia de "quem se lacrou não é achado" vem de o pathfinder não conseguir
> entrar. A sessão de jogo não abre portas, e o vigia não roda durante rodada:
> abrir porta continua sendo decisão do jogador.

Desde `fix-harvest-and-gather` há um limite novo: **depois de uma tentativa que
não deu certo, ele espera antes de tentar de novo.**

#### Scenario: Tentativa falha não vira repetição
- **GIVEN** o bot tentou destravar e não conseguiu
- **WHEN** o vigia roda de novo no ciclo seguinte
- **THEN** ele não tenta nem fala de novo
- **AND** a criança não recebe a mesma frustração várias vezes seguidas

#### Scenario: Chamado novo zera a espera
- **GIVEN** o vigia está esperando depois de uma falha
- **WHEN** o dono manda seguir de novo
- **THEN** a espera é zerada
- **AND** a razão é que ele pode ter jogado blocos para o bot, ou aberto a porta

---

### Requirement: A abertura respeita as prioridades

#### Scenario: `dudu, para` durante a abertura
- **GIVEN** o bot está indo até a porta
- **WHEN** `FresherRobin90` digita `dudu, para`
- **THEN** ele para e não clica na porta

#### Scenario: Monstro durante a abertura
- **GIVEN** a abertura está em andamento
- **WHEN** um hostil entra no raio de proteção do dono
- **THEN** a defesa interrompe a abertura

---

### Requirement: Só cava o que consegue levar

Cavar não é o mesmo que conseguir o bloco. Pedra quebrada sem picareta some sem
dropar nada: o bot gasta o tempo, abre o buraco e volta de mãos vazias.

#### Scenario: Pedra sem picareta
- **GIVEN** o bot não tem nenhuma picareta
- **WHEN** a coleta de pedra é pedida
- **THEN** ele **não** cava nenhuma pedra
- **AND** responde que precisa de uma picareta

#### Scenario: Pedra com picareta
- **GIVEN** o bot tem uma picareta na mochila
- **WHEN** a coleta de pedra roda
- **THEN** ele equipa a picareta antes de cavar

#### Scenario: Bloco que cai na mão
- **GIVEN** o alvo é terra, areia ou tronco
- **WHEN** a coleta roda
- **THEN** ele cava normalmente, sem exigir ferramenta

#### Scenario: Buraco de pedra sem picareta
- **GIVEN** o bot está num buraco de paredes de pedra e sem picareta
- **WHEN** ele procura material para o degrau
- **THEN** ele **não** cava as paredes
- **AND** pede uma picareta — não blocos

> `me joga uns blocos` e `preciso de uma picareta` pedem coisas opostas da
> criança. Dar a mesma frase para as duas situações a deixa sem saber o que fazer.

---

### Requirement: O número que ele fala é o que entrou na mochila

O resultado da coleta é medido pelo inventário, antes e depois — nunca por
quantos blocos foram quebrados.

#### Scenario: Coleta que não rendeu
- **GIVEN** os blocos quebrados não renderam item
- **WHEN** a coleta termina
- **THEN** o bot diz que **não conseguiu** pegar
- **AND** nunca anuncia um número que não está na mochila

#### Scenario: Recolher o que caiu
- **GIVEN** o bot acabou de quebrar um bloco a 2 de distância
- **WHEN** o item cai no chão
- **THEN** ele anda em cima do lugar para recolher
- **AND** falhar em recolher não derruba a coleta inteira
