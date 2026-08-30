# Delta: Comandos do jogador

**Change ID:** `add-jump-and-trick`
**Affects:** `domain/intent.ts`, `behaviors/actions/index.ts`,
`behaviors/commands.ts`

---

## ADDED

### Requirement: Pular a pedido

`JUMP` faz o bot pular três vezes no lugar e falar. Sem parâmetro: "pula" não
tem quantidade, e número no pedido viraria parâmetro a validar por uma graça de
dois segundos.

#### Scenario: Pedido direto
- **GIVEN** o provider está em `none`
- **WHEN** a criança digita `dudu, pula`
- **THEN** o parser resolve no nível 1, sem IA
- **AND** o bot pula três vezes no lugar
- **AND** fala uma frase curta sobre estar pulando

#### Scenario: `para` corta no meio
- **GIVEN** o bot está no segundo pulo
- **WHEN** a criança digita `dudu, para`
- **THEN** a ação termina ali
- **AND** o bot não completa os três pulos

#### Scenario: Pular não sai do lugar
- **GIVEN** o bot está perto de uma beirada
- **WHEN** ele pula a pedido
- **THEN** nenhum controle de andar é ligado
- **AND** ele continua onde estava

---

### Requirement: Fazer graça a pedido

`TRICK` gira o bot 360° em passos curtos e termina com um pulo. É a resposta a
`faz uma dancinha`, `gira no lugar` e `ande em circulos`.

#### Scenario: A dancinha acontece
- **WHEN** a criança digita `dudu, faz uma dancinha`
- **THEN** o bot gira uma volta completa em passos
- **AND** termina com um pulo
- **AND** fala uma frase curta e animada

#### Scenario: Girar no lugar, nunca andar em círculo
- **GIVEN** o pedido foi `ande em circulos`
- **WHEN** a ação roda
- **THEN** o bot gira sem sair do lugar
- **AND** a razão é que andar em círculo cai em buraco, e girar é seguro em
  qualquer terreno

#### Scenario: A graça é curta
- **WHEN** qualquer uma das duas roda inteira
- **THEN** ela termina em menos de 3 segundos
- **AND** a razão é que graça que demora deixa de ser graça

---

## MODIFIED

### Requirement: Catálogo de ações executáveis

O catálogo ganha `JUMP` e `TRICK`. As duas são propostas pela IA e entram em
`LEARNABLE_INTENTS`: os parâmetros são vazios, então não há estado do mundo
para decorar errado.

#### Scenario: A IA pode propor as duas
- **GIVEN** a criança pede em palavras livres ("dá uns pulinhos aí")
- **WHEN** a IA responde
- **THEN** ela pode propor `JUMP`
- **AND** a ação passa pela mesma validação de sempre antes de virar efeito

---

## REMOVED

### Requirement: (nenhum requisito removido)

Nada foi removido daqui. As duas entradas de repertório que sumiram
(`pedido_pular` e `pedido_truque`) estão registradas no
`local_dialogue_delta.md` deste change.
