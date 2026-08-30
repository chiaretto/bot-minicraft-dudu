# Delta: Comandos do jogador

**Change ID:** `fix-harvest-and-gather`
**Affects:** `src/domain/materials.ts`, `src/behaviors/actions/index.ts`,
`src/behaviors/actions/build.ts`, `src/behaviors/actions/escape.ts`,
`src/app/bot.ts`

---

## ADDED

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

---

## MODIFIED

### Requirement: Material da obra

Uma obra usa um material. Sem pedido explícito, vence o que o bot tem em maior
quantidade. **Com a mochila vazia e a busca ligada, ele escolhe o que vai
buscar em vez de recusar antes de tentar.**

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

### Requirement: Porta fechada não trava o chamado

O vigia continua igual, com um limite novo: **depois de uma tentativa que não
deu certo, ele espera antes de tentar de novo.**

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

## REMOVED

(Nenhum)
