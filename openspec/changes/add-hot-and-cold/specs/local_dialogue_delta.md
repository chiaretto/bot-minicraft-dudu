# Delta: Repertório local

**Change ID:** `add-hot-and-cold`
**Affects:** `data/repertoire.yaml`, `src/dialogue/default-repertoire.yaml`

---

## ADDED

### Requirement: Falas do quente e frio

Nove entradas `fallback`, uma por temperatura mais as três da rodada
(`qf_comecou`, `qf_revela`, `qf_sem_lugar`).

Cada temperatura tem **5 variações**, uma a mais que o mínimo, porque o bot fala
a cada dois segundos: numa rodada de três minutos ele fala dezenas de vezes.

#### Scenario: Toda temperatura tem fala
- **GIVEN** o catálogo fechado de temperaturas
- **WHEN** o repertório é validado
- **THEN** existe entrada para cada uma
- **AND** temperatura nova sem fala não compila: o mapa é um `Record` sobre o
  tipo

#### Scenario: A fala de abertura explica a brincadeira
- **WHEN** a rodada começa
- **THEN** a fala diz que existe um lugar secreto e o que a criança deve fazer
- **AND** ela cabe em uma linha de chat

---

## MODIFIED

### Requirement: Nenhuma fala nega capacidade que o bot tem

Três falas diziam que ele sabe **duas** brincadeiras. Agora são três.

#### Scenario: A pergunta "qual brincadeira?" oferece as três
- **WHEN** a criança digita `vamos brincar`
- **THEN** o bot oferece as três
- **AND** nenhuma fala do catálogo diz mais que ele sabe só duas
