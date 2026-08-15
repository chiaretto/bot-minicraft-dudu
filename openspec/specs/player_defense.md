# Especificação: Defesa do Jogador

**Componente:** `player_defense`
**Origem:** `add-minecraft-companion-bot` (2026-08-15)
**Atualizado por:** `add-bot-games-hide-and-seek` (2026-08-15)

> Todo o comportamento descrito aqui é **determinístico**. Nenhum cenário deste
> arquivo depende de uma chamada de IA.

---

## Requisitos

### Requirement: Prioridade entre estados

Os estados têm ordem de prioridade fixa. Um estado de prioridade maior interrompe
o menor, e o interrompido é empilhado para retomada.

**Ordem:** `EMERGENCY` > `DEFEND` > `ACTION` = `GAME` > `FOLLOW` / `STAY` > `IDLE`

`GAME` é a exceção à regra de empilhar: ao ser interrompido ele é **descartado**,
nunca retomado. Ver `bot_games.md` → "Estado `GAME` e prioridade".

#### Scenario: Defesa interrompe uma ação
- **GIVEN** o bot está em `ACTION` coletando madeira
- **WHEN** um zumbi começa a atacar o dono
- **THEN** a ação é cancelada via `AbortSignal`
- **AND** `ACTION` é empilhado com seu contexto
- **AND** o bot transiciona para `DEFEND`

#### Scenario: Emergência interrompe a defesa
- **GIVEN** o bot está em `DEFEND` lutando contra um zumbi
- **WHEN** a vida do bot cai abaixo do limite crítico
- **THEN** o bot transiciona para `EMERGENCY`
- **AND** para de atacar e recua
- **AND** avisa no chat que está muito machucado para continuar

#### Scenario: Defesa não interrompe defesa
- **GIVEN** o bot já está em `DEFEND` contra um zumbi
- **WHEN** um segundo zumbi ataca o dono
- **THEN** o bot permanece em `DEFEND`
- **AND** o novo hostil entra na lista de alvos, sem reiniciar o estado

#### Scenario: Defesa interrompe uma brincadeira, sem empilhá-la
- **GIVEN** o bot está em `GAME`, escondido
- **WHEN** um hostil entra no raio de proteção do dono
- **THEN** a sessão do jogo é cancelada via `AbortSignal`
- **AND** `GAME` **não** é empilhado
- **AND** terminado o combate o bot cai em `IDLE`, sem retomar a rodada

---

### Requirement: Detecção de ameaça ao dono

Um vigia roda a cada tick e classifica ameaças ao dono, independente do chat.

#### Scenario: Hostil ataca o dono diretamente
- **GIVEN** o bot está em `FOLLOW` e `defense.enabled` é `true`
- **WHEN** um zumbi causa dano ao dono
- **THEN** o vigia registra o zumbi como ameaça
- **AND** o bot transiciona para `DEFEND` em menos de 1 segundo

#### Scenario: Hostil se aproxima mirando o dono
- **GIVEN** um esqueleto está a 10 blocos do dono, dentro do raio de proteção
- **AND** o alvo do esqueleto é o dono
- **WHEN** o vigia avalia as ameaças
- **THEN** o esqueleto é classificado como ameaça
- **AND** o bot transiciona para `DEFEND` antes mesmo do primeiro dano

#### Scenario: Hostil distante é ignorado
- **GIVEN** o raio de proteção é 16 blocos
- **AND** um zumbi está a 40 blocos do dono, sem alvo
- **WHEN** o vigia avalia as ameaças
- **THEN** o zumbi não é classificado como ameaça
- **AND** o bot permanece no estado atual (não sai caçando)

#### Scenario: Hostil ataca o bot, não o dono
- **GIVEN** uma aranha ataca o bot dentro do raio de proteção do dono
- **WHEN** o vigia avalia as ameaças
- **THEN** a aranha é classificada como ameaça (está no perímetro do dono)
- **AND** o bot entra em `DEFEND`

#### Scenario: Defesa desligada por configuração
- **GIVEN** `defense.enabled` é `false`
- **WHEN** um zumbi ataca o dono
- **THEN** o bot não transiciona para `DEFEND`
- **AND** permanece no estado atual

---

### Requirement: Seleção de alvo

Havendo várias ameaças, o bot ataca uma por vez, na ordem de prioridade definida.

#### Scenario: Prioridade para quem está machucando o dono
- **GIVEN** há um zumbi atacando o dono e um esqueleto parado a 12 blocos
- **WHEN** o bot escolhe o alvo
- **THEN** o zumbi é escolhido primeiro

#### Scenario: Desempate por proximidade do dono
- **GIVEN** dois zumbis estão atacando o dono, a 3 e a 9 blocos dele
- **WHEN** o bot escolhe o alvo
- **THEN** o zumbi a 3 blocos é escolhido

#### Scenario: Alvo trocado quando o atual se afasta
- **GIVEN** o bot está atacando um zumbi que fugiu para fora do raio de proteção
- **AND** outro hostil continua atacando o dono
- **WHEN** o vigia reavalia
- **THEN** o bot desengaja do primeiro e passa para o segundo

---

### Requirement: Alvos proibidos

Existe uma denylist absoluta de alvos, verificada no momento do ataque.

#### Scenario: Nunca atacar um jogador
- **GIVEN** outro jogador está batendo no dono
- **WHEN** o vigia avalia a situação
- **THEN** o jogador **não** é classificado como ameaça atacável
- **AND** o bot não ataca
- **AND** o bot pode avisar no chat, mas não parte para PvP

#### Scenario: Nunca atacar mob passivo
- **GIVEN** uma vaca está encostada no dono
- **WHEN** o vigia avalia as ameaças
- **THEN** a vaca não é classificada como ameaça

#### Scenario: Nunca atacar mob domesticado
- **GIVEN** um lobo domesticado pelo dono está por perto e ficou hostil por engano
- **WHEN** o vigia avalia as ameaças
- **THEN** o lobo domesticado é excluído por estar na denylist

#### Scenario: Guarda verificada no momento do ataque
- **GIVEN** um alvo foi selecionado como hostil válido
- **WHEN** o golpe vai ser desferido
- **THEN** a denylist é checada de novo contra a entidade atual
- **AND** o golpe é abortado se a entidade já não for um alvo válido

---

### Requirement: Regra do creeper

Creeper nunca é engajado em corpo a corpo perto do dono — a explosão machucaria
justamente quem o bot deveria proteger.

#### Scenario: Creeper se aproximando do dono
- **GIVEN** um creeper está a 6 blocos do dono
- **WHEN** o vigia classifica a ameaça
- **THEN** o bot **não** parte para corpo a corpo
- **AND** avisa no chat de forma explícita (ex.: `creeper atrás de você, corre!`)
- **AND** se posiciona longe da linha entre o creeper e o dono

#### Scenario: Creeper prestes a explodir
- **GIVEN** um creeper começou a inflar a menos de 3 blocos do bot
- **WHEN** o bot detecta o estado de ignição
- **THEN** o bot se afasta imediatamente do creeper e do dono
- **AND** não desfere nenhum golpe

#### Scenario: Creeper longe do dono
- **GIVEN** um creeper está a 20 blocos do dono, fora do raio de proteção
- **WHEN** o vigia avalia
- **THEN** o creeper é ignorado por completo

---

### Requirement: Engajamento corpo a corpo

Ao defender, o bot equipa a melhor arma que tiver e ataca respeitando o cooldown.

#### Scenario: Equipar a melhor arma disponível
- **GIVEN** o inventário do bot tem uma espada de pedra e uma de ferro
- **WHEN** o bot entra em `DEFEND`
- **THEN** a espada de ferro é equipada na mão antes do primeiro golpe

#### Scenario: Bot sem arma nenhuma
- **GIVEN** o inventário do bot não tem arma
- **WHEN** um zumbi ataca o dono
- **THEN** o bot **não** engaja em corpo a corpo
- **AND** avisa no chat que está desarmado
- **AND** recua junto com o dono

#### Scenario: Ataque respeitando o cooldown
- **GIVEN** o bot está engajado com uma espada de ferro
- **WHEN** ele ataca
- **THEN** os golpes respeitam o cooldown da arma, sem spam de clique

#### Scenario: Perseguir o alvo dentro do raio
- **GIVEN** o alvo está a 8 blocos, dentro do raio de proteção
- **WHEN** o bot está em `DEFEND`
- **THEN** o pathfinder aproxima o bot até a distância de golpe
- **AND** o bot não persegue para além do raio de proteção

---

### Requirement: Desengajamento e retomada

O combate termina por condições explícitas, e o bot volta ao que estava fazendo.

#### Scenario: Alvo eliminado, volta a seguir
- **GIVEN** o bot estava em `FOLLOW` e foi para `DEFEND`
- **WHEN** o último hostil é eliminado
- **THEN** o bot desempilha e volta para `FOLLOW`
- **AND** comenta no chat que o perigo passou

#### Scenario: Volta ao ponto do STAY
- **GIVEN** o bot estava em `STAY` numa coordenada e foi para `DEFEND`
- **AND** o combate o afastou 10 blocos do ponto
- **WHEN** o combate termina
- **THEN** o bot caminha de volta para a coordenada memorizada
- **AND** volta para `STAY`

#### Scenario: Ação interrompida é retomada
- **GIVEN** o bot estava em `ACTION` coletando 4 blocos e tinha coletado 2
- **WHEN** o combate termina
- **THEN** o bot retoma a ação de onde parou

#### Scenario: Timeout de engajamento
- **GIVEN** o bot está em `DEFEND` contra um alvo inalcançável há mais que o
  tempo máximo de engajamento
- **WHEN** o timeout dispara
- **THEN** o bot desengaja, avisa no chat e desempilha o estado anterior

#### Scenario: Dono manda parar durante o combate
- **GIVEN** o bot está em `DEFEND`
- **WHEN** o dono digita `dudu, para`
- **THEN** o bot desengaja e vai para `IDLE`
- **AND** a pilha de retomada é descartada

---

### Requirement: Controle da defesa pelo jogador

O dono liga e desliga a defesa automática em runtime, por comando de chat.

#### Scenario: Desligar a defesa
- **GIVEN** `defense.enabled` é `true`
- **WHEN** o dono digita `dudu, não briga`
- **THEN** `defense.enabled` passa a `false` para a sessão
- **AND** o bot desengaja de qualquer combate em andamento
- **AND** confirma no chat

#### Scenario: Religar a defesa
- **GIVEN** a defesa está desligada
- **WHEN** o dono digita `dudu, pode brigar`
- **THEN** `defense.enabled` volta a `true`
- **AND** o bot confirma no chat

#### Scenario: Só o dono controla a defesa
- **GIVEN** `ownerPlayer` é `"Miguel"`
- **WHEN** o jogador `Fulano` digita `dudu, não briga`
- **THEN** o comando é ignorado e a defesa continua ligada

---

### Requirement: Defesa independente da IA

O loop de defesa nunca espera por uma resposta da IA.

#### Scenario: IA fora do ar durante um ataque
- **GIVEN** o circuit breaker do provider está aberto
- **WHEN** um zumbi ataca o dono
- **THEN** o bot entra em `DEFEND` e combate normalmente
- **AND** usa uma mensagem de alerta pré-definida no chat

#### Scenario: Narração acontece depois, sem bloquear
- **GIVEN** o bot acabou de eliminar um hostil
- **WHEN** a narração pela IA é solicitada
- **THEN** a chamada é assíncrona
- **AND** um novo ataque durante essa chamada dispara `DEFEND` imediatamente,
  sem esperar a resposta da IA

---

### Requirement: Configuração da defesa

O bloco `defense` da configuração parametriza o comportamento.

#### Scenario: Valores padrão
- **GIVEN** `config.yaml` não traz o bloco `defense`
- **WHEN** o bot inicializa
- **THEN** vale o padrão: `enabled: true`, `protectRadius: 16`,
  `criticalHealth: 6`, `engagementTimeoutMs: 30000`, `maxSimultaneousTargets: 3`

#### Scenario: Raio de proteção customizado
- **GIVEN** `defense.protectRadius: 8`
- **WHEN** um hostil ataca o dono a 12 blocos do bot
- **THEN** a ameaça é avaliada contra o raio de 8 blocos configurado

---

## Descontinuado

### Requirement: Fuga por proximidade de hostil (removido: 2026-08-15)

O gatilho de `EMERGENCY` por proximidade de mob hostil com o bot em vida normal
foi substituído pelo estado `DEFEND`. A fuga permanece apenas para vida crítica
e para o caso específico do creeper.

Removido pelo change `add-minecraft-companion-bot`.
