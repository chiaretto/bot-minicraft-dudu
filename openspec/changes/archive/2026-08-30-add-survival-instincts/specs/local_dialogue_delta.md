# Delta: Repertório local

**Change ID:** `add-survival-instincts`
**Affects:** `data/repertoire.yaml`, `src/dialogue/default-repertoire.yaml`

---

## ADDED

### Requirement: Entradas `evento_fome` e `evento_tocha`

As falas dos dois instintos. São `spontaneous`: disparadas pelo laço, nunca por
padrão de texto.

Existem porque **bot que trava sem explicar parece bug**. Comer para o bot por
quase dois segundos; sem uma palavra, a criança só vê o amigo congelar.

#### Scenario: Ele explica por que parou
- **GIVEN** o bot comeu porque estava com fome
- **WHEN** ele fala
- **THEN** sai uma variação de `evento_fome`
- **AND** a fala é curta: ele volta ao que fazia logo em seguida

#### Scenario: A tocha também é anunciada
- **GIVEN** ele acendeu uma tocha
- **THEN** sai uma variação de `evento_tocha`
- **AND** ela pode dizer por que aquilo importa ("monstro não nasce na luz")

#### Scenario: Cinco variações cada
- **GIVEN** as duas entradas
- **WHEN** o catálogo é validado
- **THEN** as duas têm pelo menos `MIN_VARIATIONS_WARN` variações
- **AND** o sorteio nunca repete a última usada

---

## REMOVED

(None)
