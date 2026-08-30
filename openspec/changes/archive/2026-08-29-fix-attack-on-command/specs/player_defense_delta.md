# Delta: Defesa do jogador (`player_defense`)

**Change ID:** `fix-attack-on-command`
**Affects:** `src/behaviors/defense/threat-watcher.ts`, `src/domain/mobs.ts`

---

## MODIFIED

### Requirement: Engajamento corpo a corpo

O cenário "Bot sem arma nenhuma" muda. A regra antiga — **desarmado nunca
engaja** — foi escrita para o bot não morrer à toa, e o raciocínio está certo.
O resultado é que está errado.

Na prática o bot **entra no mundo com o inventário vazio**, não sabe craftar e
nada o faz buscar uma arma. Com a regra antiga isso significa um bot que pode
passar a partida inteira sem atacar nada — nem o zumbi que está batendo no dono.
Para a criança, o amigo dela simplesmente nunca defende.

Um bot que nunca briga é pior que um bot que tenta e às vezes apanha. A regra
passa a distinguir **contra o quê**:

| Desarmado, contra | Decisão |
|---|---|
| alvo do catálogo de enfrentáveis de mão | engaja |
| creeper | foge — regra do creeper, inalterada |
| qualquer outro hostil | recusa, e diz por quê |

Isto só é seguro porque a rede que já existe continua valendo: **vida crítica
vence tudo** e faz o bot recuar antes de morrer. Com arma, nada muda.

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

> Pedir a espada é o que ensina o passo seguinte, e é o caminho que tira o bot
> do estado desarmado de verdade.

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
- **THEN** o comportamento é idêntico ao de antes desta mudança

---

### Requirement: Seleção de alvo

A seleção continua determinística e passa a atender **duas** origens: a ameaça
detectada pelo laço de defesa, como sempre, e agora também um pedido explícito da
criança pelo comando de ataque.

A origem muda quem escolhe o alvo; **não** muda nenhuma guarda. A denylist
absoluta, a allowlist e a checagem de domesticado valem igual nos dois caminhos,
e continuam sendo conferidas duas vezes — na seleção e no instante do golpe.

#### Scenario: Alvo pedido pela criança
- **GIVEN** a criança mandou atacar um tipo de bicho
- **WHEN** o alvo é escolhido
- **THEN** é o bicho daquele tipo mais perto
- **AND** ele passa pelas mesmas guardas de um alvo detectado pela defesa

#### Scenario: Pedido não afrouxa proteção nenhuma
- **GIVEN** a criança pediu um alvo que a denylist proíbe
- **WHEN** o alvo é avaliado
- **THEN** ele é recusado
- **AND** o pedido explícito não vale como autorização

---

### Requirement: Defesa independente da IA

Continua valendo inteira, e esta mudança a reforça: o comando de ataque também é
resolvido **sem** consultar a IA, no nível 1 da cascata.

Havia um caminho mais confortável — dar a intenção de atacar à IA e deixá-la
interpretar o pedido em linguagem livre. Foi recusado de propósito: escolher em
quem bater é decisão de combate, e combate não depende de rede.

#### Scenario: Ataque sob comando não chama a IA
- **GIVEN** a criança manda atacar
- **WHEN** o comando é resolvido
- **THEN** nenhuma chamada de inferência acontece
- **AND** o ataque funciona com a IA desligada, fora do ar ou com o circuito
  aberto

#### Scenario: A IA continua só narrando
- **GIVEN** um combate aconteceu
- **WHEN** a IA participa
- **THEN** é apenas para narrar o que já aconteceu, de forma assíncrona

---

## ADDED

### Requirement: Catálogo de alvos enfrentáveis desarmado

Quais hostis o bot encara de mão é um **catálogo fechado**, não um cálculo de
dano. Lista fechada é auditável e não surpreende: dá para ler e saber exatamente
o que o bot vai encarar.

#### Scenario: Alvo fora do catálogo é sempre recusado desarmado
- **GIVEN** o bot está sem arma
- **AND** o alvo não está no catálogo de enfrentáveis
- **WHEN** a defesa decide
- **THEN** ele não engaja, independentemente de distância ou de quem pediu

#### Scenario: O catálogo não abre exceção na denylist
- **GIVEN** uma criatura está na denylist absoluta
- **WHEN** ela é avaliada para engajamento desarmado
- **THEN** ela continua proibida

---

## REMOVED

(Nenhum requisito removido. O cenário "Bot sem arma nenhuma" do requisito
*Engajamento corpo a corpo* foi **substituído** pelos cenários de desarmado
acima — o comportamento antigo, de nunca engajar sem arma, deixa de valer.)
