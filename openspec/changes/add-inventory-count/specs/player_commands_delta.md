# Delta: Comandos do jogador

**Change ID:** `add-inventory-count`
**Affects:** `domain/materials.ts`, `domain/intent.ts`,
`behaviors/actions/index.ts`, `behaviors/commands.ts`

---

## ADDED

### Requirement: Contar item da mochila

`COUNT_ITEM` responde quanto o bot tem de um material, com o número exato e sem
chamada de IA. O parâmetro `item` é vocabulário — por isso a intenção é
aprendível.

#### Scenario: A pergunta do log é respondida
- **GIVEN** o bot tem 12 de madeira na mochila
- **WHEN** a criança digita `quantos blocos de madeira voce tem?`
- **THEN** o parser resolve no nível 1, sem IA
- **AND** o bot responde com o número exato

#### Scenario: Mochila vazia responde e oferece
- **GIVEN** o bot não tem pedra nenhuma
- **WHEN** a criança pergunta quanta pedra ele tem
- **THEN** ele diz que não tem
- **AND** oferece ir buscar

#### Scenario: O grupo conta junto
- **GIVEN** o bot tem 3 de `oak_log` e 5 de `birch_log`
- **WHEN** a criança pergunta quanta madeira ele tem
- **THEN** a resposta é 8
- **AND** a razão é que para quem está jogando os dois são "madeira"

---

### Requirement: Catálogo fechado de materiais falados

O que vem depois do "quanto" é capturado e precisa estar no catálogo de nomes
falados (`madeira`, `pedra`, `terra`, `areia`, `cascalho`, os plurais e os
nomes técnicos dos blocos). Nome fora dele **não vira comando**.

É a mesma regra do ataque nomeado, e pelo mesmo motivo.

#### Scenario: Pergunta que não é sobre item continua sendo conversa
- **WHEN** a criança digita `quantos amigos voce tem?`
- **THEN** nenhum comando é reconhecido
- **AND** a mensagem desce na cascata

#### Scenario: "blocos de" na frente não atrapalha
- **GIVEN** a criança escreve `quantos blocos de pedra voce tem`
- **WHEN** o nome é resolvido
- **THEN** o "blocos de" é descartado e o material é `pedra`

---

## MODIFIED

### Requirement: Catálogo de ações executáveis

O catálogo ganha `COUNT_ITEM`, proposta pela IA e aprendível.

#### Scenario: Ação que só fala continua sendo ação
- **GIVEN** `COUNT_ITEM` não muda nada no mundo
- **WHEN** ela roda
- **THEN** ela passa pelo mesmo pipeline de qualquer ação
- **AND** a resposta chega como resultado da ação, igual a `LOOK_AT_OWNER`

---

## REMOVED

(None)
