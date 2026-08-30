# Especificação: Defesa do Jogador

**Componente:** `player_defense`
**Origem:** `add-minecraft-companion-bot` (2026-08-15)
**Atualizado por:** `add-bot-games-hide-and-seek` (2026-08-15),
`fix-attack-on-command` (2026-08-29) — regra do desarmado e ataque sob comando

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

A seleção atende **duas origens**: a ameaça detectada pelo laço de defesa, como
sempre, e um pedido explícito da criança pelo comando de ataque. A origem muda
quem escolhe o alvo; **não** muda nenhuma guarda — a denylist, a allowlist e a
checagem de domesticado valem igual nos dois caminhos, e continuam sendo
conferidas duas vezes.

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

#### Scenario: Alvo pedido pela criança
- **GIVEN** a criança mandou atacar um tipo de bicho
- **WHEN** o alvo é escolhido
- **THEN** é o bicho daquele tipo mais perto do dono
- **AND** ele passa pelas mesmas guardas de um alvo detectado pela defesa

#### Scenario: Pedido não afrouxa proteção nenhuma
- **GIVEN** a criança pediu um alvo que a denylist proíbe
- **WHEN** o alvo é avaliado
- **THEN** ele é recusado
- **AND** o pedido explícito não vale como autorização

#### Scenario: Alvo pedido fora do raio de proteção
- **GIVEN** a criança mandou atacar um bicho longe do dono
- **WHEN** o alvo é avaliado
- **THEN** o bot recusa e avisa que está longe demais

> Vale também para pedido explícito: o bot defende, não caça. Sem isso, "ataca"
> viraria licença para sair pelo mapa.

---

### Requirement: Catálogo de alvos enfrentáveis desarmado

Quais hostis o bot encara de mão é um **catálogo fechado**, não um cálculo de
dano. Lista fechada é auditável e não surpreende: dá para ler e saber exatamente
o que o bot vai encarar, e um mob novo no jogo não entra sozinho.

#### Scenario: Alvo fora do catálogo é sempre recusado desarmado
- **GIVEN** o bot está sem arma
- **AND** o alvo não está no catálogo de enfrentáveis
- **WHEN** a defesa decide
- **THEN** ele não engaja, independentemente de distância ou de quem pediu

#### Scenario: O catálogo não abre exceção na denylist
- **GIVEN** uma criatura está na denylist absoluta
- **WHEN** ela é avaliada para engajamento desarmado
- **THEN** ela continua proibida

#### Scenario: Creeper nunca é enfrentável de mão
- **GIVEN** o bot está sem arma e há um creeper
- **WHEN** a defesa decide
- **THEN** vale a regra do creeper, não o catálogo

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

> **Mudou em `fix-attack-on-command` (2026-08-29).** A regra antiga era
> **desarmado nunca engaja**, escrita para o bot não morrer à toa. O raciocínio
> estava certo e o resultado estava errado: o bot entra no mundo com o inventário
> vazio, não sabe craftar e nada o faz buscar arma — então ele podia passar a
> partida inteira sem atacar nada, nem o zumbi batendo no dono. Para a criança,
> um amigo que nunca defende.
>
> Um bot que nunca briga é pior que um bot que tenta e às vezes apanha. Só dá
> para afrouxar porque a regra de vida crítica já existe e o tira da briga antes
> de morrer.

Ao defender, o bot equipa a melhor arma que tiver e ataca respeitando o cooldown.

#### Scenario: Equipar a melhor arma disponível
- **GIVEN** o inventário do bot tem uma espada de pedra e uma de ferro
- **WHEN** o bot entra em `DEFEND`
- **THEN** a espada de ferro é equipada na mão antes do primeiro golpe

#### Scenario: Desarmado contra alvo que dá para enfrentar
- **GIVEN** o inventário do bot não tem arma
- **AND** um zumbi ataca o dono
- **WHEN** o laço de defesa decide
- **THEN** o bot **engaja** o zumbi de mão
- **AND** avisa no chat que vai encarar mesmo sem espada

#### Scenario: Desarmado contra alvo forte demais
- **GIVEN** o inventário do bot não tem arma
- **AND** um ravager ameaça o dono
- **WHEN** o laço de defesa decide
- **THEN** o bot **não** engaja
- **AND** explica que aquele é forte demais sem espada
- **AND** pede uma espada ao dono

#### Scenario: Desarmado e creeper
- **GIVEN** o inventário do bot não tem arma
- **AND** um creeper está perto do dono
- **WHEN** o laço de defesa decide
- **THEN** vale a regra do creeper: fuga, nunca corpo a corpo

#### Scenario: Vida crítica vence o engajamento desarmado
- **GIVEN** o bot está engajado de mão
- **WHEN** a vida dele cai abaixo do limite crítico
- **THEN** ele recua
- **AND** o combate termina

#### Scenario: Com arma, nada muda
- **GIVEN** o bot tem uma espada no inventário
- **WHEN** um hostil ameaça o dono
- **THEN** o comportamento é idêntico ao de antes de `fix-attack-on-command`

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

Vale também para o **ataque sob comando**, acrescentado em
`fix-attack-on-command`: ele é resolvido no nível 1 da cascata, sem consultar a
IA. Havia um caminho mais confortável — dar a intenção de atacar à IA e deixá-la
interpretar o pedido em linguagem livre. Foi recusado de propósito: escolher em
quem bater é decisão de combate, e combate não depende de rede.

#### Scenario: Ataque sob comando não chama a IA
- **GIVEN** a criança manda atacar
- **WHEN** o comando é resolvido
- **THEN** nenhuma chamada de inferência acontece
- **AND** o ataque funciona com a IA desligada, fora do ar ou com o circuito
  aberto

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
