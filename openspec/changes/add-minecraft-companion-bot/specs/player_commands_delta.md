# Delta: Comandos do Jogador e Comportamentos

**Change ID:** `add-minecraft-companion-bot`
**Affects:** `src/behaviors/`

---

## ADDED

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

---

### Requirement: Comportamento de emergência

Vida crítica do próprio bot tem prioridade sobre qualquer ordem e sobre a defesa
do jogador.

> A defesa do jogador e a reação a hostis estão especificadas em
> `player_defense_delta.md`. Aqui fica só o que diz respeito ao roteamento de
> comandos durante a emergência.

#### Scenario: Vida crítica
- **GIVEN** o bot está em `ACTION` coletando blocos
- **WHEN** a vida cai abaixo do limite configurado (padrão 6 de 20)
- **THEN** o bot transiciona para `EMERGENCY`, cancela a ação
- **AND** recua na direção do dono, avisando no chat

#### Scenario: Emergência ignora comando concorrente
- **GIVEN** o bot está em `EMERGENCY` com vida crítica
- **WHEN** o dono digita `dudu, pega madeira`
- **THEN** o comando é recusado com explicação no chat
- **AND** o bot permanece em `EMERGENCY` até estar seguro

---

### Requirement: Comandos de controle da defesa

O dono liga e desliga a defesa automática por chat. Comportamento detalhado em
`player_defense_delta.md`.

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

## MODIFIED

(Nenhum — projeto novo.)

## REMOVED

(Nenhum)
