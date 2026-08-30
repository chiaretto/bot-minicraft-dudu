# Delta: Repertório local

**Change ID:** `add-more-blueprints`
**Affects:** `data/repertoire.yaml`, `src/dialogue/default-repertoire.yaml`,
`src/ai/prompt.ts`

---

## MODIFIED

### Requirement: Nenhuma fala nega capacidade que o bot tem

O requisito já valia; o que muda é o alvo da varredura desta vez. Sete falas
prometiam **"casinha e torre"** como se fosse o repertório inteiro de obra, em
cinco entradas: `capacidades`, `pedido_cavar`, `pedido_soltar_item`,
`dono_construindo` e `pedido_truque`.

Com seis plantas no catálogo, essas falas passam a **negar capacidade que ele
tem** — exatamente o que este requisito proíbe.

A reescrita não pode virar lista comprida: criança de 7 anos não lê enumeração
de seis itens no chat. Uma fala cita uma ou duas plantas e convida a pedir.

#### Scenario: Nenhuma fala limita a obra a casa e torre
- **GIVEN** o repertório carregado
- **WHEN** as falas que mencionam construir são lidas
- **THEN** nenhuma diz que ele só sabe fazer casa e torre
- **AND** nenhuma promete planta que não está no catálogo

#### Scenario: A varredura não vira lista no chat
- **GIVEN** uma fala reescrita por causa das plantas novas
- **WHEN** ela é lida
- **THEN** ela cita uma ou duas plantas, não as seis
- **AND** continua com uma ou duas frases curtas

---

### Requirement: O prompt da IA acompanha a capacidade

A descrição de `BUILD` no prompt dizia, à mão, que `"structure" é "casa" ou
"torre"`. Passa a ser **gerada** de `STRUCTURE_NAMES`.

O motivo é o mesmo que já vale para o schema: acrescentar a sétima planta não
pode depender de alguém lembrar de editar o prompt. Prompt desatualizado é a IA
recusando uma coisa que o bot sabe fazer — que foi exatamente o que aconteceu
com a piscina antes deste change.

#### Scenario: Planta nova aparece no prompt sozinha
- **GIVEN** uma estrutura nova entra em `STRUCTURE_NAMES`
- **WHEN** o prompt é montado
- **THEN** o nome dela aparece na descrição de `BUILD`
- **AND** `prompt.ts` não precisou ser editado

#### Scenario: A IA não recusa o que o bot sabe
- **GIVEN** a criança pede uma piscina em palavras livres
- **WHEN** a IA responde
- **THEN** ela pode propor `BUILD` com `structure: 'piscina'`
- **AND** não diz mais que só sabe casa e torre

---

## REMOVED

(None)
