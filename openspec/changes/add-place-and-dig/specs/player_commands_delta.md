# Delta: Comandos do jogador

**Change ID:** `add-place-and-dig`
**Affects:** `domain/digging.ts`, `behaviors/actions/dig.ts`,
`behaviors/actions/index.ts`, `behaviors/commands.ts`

---

## ADDED

### Requirement: Cavar buraco e túnel

`DIG` abre uma escavação à frente do bot. `shape` é catálogo fechado: `buraco`
(poço 2x2 e 2 de fundo) ou `tunel` (1 de largura, 2 de altura, 4 de
comprimento).

#### Scenario: Poço a pedido
- **WHEN** a criança digita `dudu, cava um buraco`
- **THEN** o parser resolve no nível 1, sem IA
- **AND** um poço de 2x2 e 2 de fundo é aberto à frente do bot
- **AND** o bot continua em pé, fora do buraco

#### Scenario: Túnel a pedido
- **WHEN** a criança digita `cava um tunel`
- **THEN** a passagem tem dois blocos de altura
- **AND** o bot consegue atravessar de pé

#### Scenario: Cavar para baixo vira o poço à frente
- **WHEN** a criança digita `cava pra baixo`
- **THEN** o poço é aberto à frente, não sob os pés dele
- **AND** a razão é que cavar sob os próprios pés derruba o bot no buraco que
  ele acabou de abrir, e sair de lá depende de outro comando

#### Scenario: Bloco duro é pulado, não trava a obra
- **GIVEN** um dos alvos é pedra e o bot não tem picareta
- **WHEN** a escavação roda
- **THEN** aquele bloco é pulado
- **AND** o buraco sai menor
- **AND** a fala diz que teve bloco que ele não conseguiu quebrar

---

### Requirement: Ele nunca cava embaixo dos próprios pés

Nenhuma posição de nenhuma planta pode ser a coluna do bot — apoio, pés ou
cabeça. A planta já nasce à frente; a checagem é a rede de segurança, e roda
antes do primeiro golpe.

#### Scenario: A planta é conferida nas quatro direções
- **GIVEN** qualquer forma do catálogo e qualquer direção cardeal
- **WHEN** a planta é gerada
- **THEN** nenhuma posição cai na coluna do bot

#### Scenario: Direção sempre cardeal
- **GIVEN** o bot está virado numa diagonal qualquer
- **WHEN** a direção é resolvida
- **THEN** ela é arredondada para um dos quatro lados
- **AND** a razão é que buraco em diagonal fica torto e a criança não entende o
  que ele fez

---

### Requirement: Recusa antes do primeiro golpe

Lava ou água encostada em qualquer alvo, obra maior que `digMaxBlocks`, ou a
coluna do bot na planta: os três recusam **antes** de cavar.

#### Scenario: Lava do lado
- **GIVEN** há lava encostada num dos alvos
- **WHEN** a criança pede o buraco
- **THEN** nada é cavado
- **AND** o bot diz que tem lava ali do lado e que é perigoso
- **AND** a razão é que um buraco meio aberto ao lado de lava é o pior dos dois
  mundos

#### Scenario: Água também barra
- **GIVEN** há água encostada num dos alvos
- **THEN** a escavação é recusada, pelo mesmo motivo

---

### Requirement: O que nunca é cavado

Além da allowlist de coleta, existe `NEVER_DIG`: bedrock, obsidiana, baú,
fornalha, bancada, cama, spawner.

São duas trancas de propósito — a allowlist diz o que ele **pode** quebrar e
pode ser afrouxada por configuração; esta lista é sobre não estragar o que a
criança construiu.

#### Scenario: A casa da criança sobrevive
- **GIVEN** há um baú dentro da área do buraco
- **WHEN** a escavação roda
- **THEN** o baú é pulado
- **AND** nada dentro dele é perdido

---

### Requirement: Pôr um bloco

`PLACE_BLOCK` põe **um** bloco no chão à frente do bot. `material` é opcional,
como na obra.

#### Scenario: Um bloco, à frente
- **WHEN** a criança digita `poe um bloco aqui`
- **THEN** um bloco aparece à frente do bot
- **AND** apenas um: ela pediu um bloco, não a mochila inteira

#### Scenario: Sem apoio ele avisa
- **GIVEN** não há bloco sólido embaixo do lugar
- **WHEN** o pedido chega
- **THEN** nada é posto
- **AND** o bot diz que não tem em que encostar o bloco

#### Scenario: Lugar ocupado
- **GIVEN** já existe bloco no lugar
- **THEN** o bot diz que já tem bloco ali, e não derruba nada

---

## REMOVED

(None — a entrada `pedido_cavar` removida está registrada no
`local_dialogue_delta.md` deste change.)
