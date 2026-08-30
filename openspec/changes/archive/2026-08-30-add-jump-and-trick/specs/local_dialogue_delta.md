# Delta: Repertório local

**Change ID:** `add-jump-and-trick`
**Affects:** `data/repertoire.yaml`, `src/dialogue/default-repertoire.yaml`

---

## MODIFIED

### Requirement: Nenhuma fala nega capacidade que o bot tem

A varredura desta vez é sobre pular e girar. `habilidade_fisica` dizia que ele
pula "quando tá andando", como quem explica um limite — e agora ele pula porque
foi pedido.

#### Scenario: A fala de habilidade acompanha a capacidade
- **GIVEN** a criança pergunta `voce sabe pular?`
- **WHEN** o repertório responde
- **THEN** a fala diz que ele pula quando ela pede
- **AND** nenhuma fala do catálogo diz mais que pular a pedido ele não sabe

---

## REMOVED

### Requirement: Entrada `pedido_pular`

Removida. Os nove padrões (`pule`, `pula`, `pula ai`, `pula pra mim`,
`da uns pulos`…) viraram comando `JUMP` em `behaviors/commands.ts`.

Comando de ação não é repertório (`CLAUDE.md`), e manter a entrada faria a
recusa ganhar do comando em qualquer frase que o parser não pegasse — o bot
diria que não sabe pular logo depois de ter pulado.

### Requirement: Entrada `pedido_truque`

Removida pelo mesmo motivo. Os nove padrões (`faz uma dancinha`,
`gira no lugar`, `ande em circulos`, `da uma volta`, `dance`…) viraram comando
`TRICK`.

#### Scenario: A frase que era recusa agora é ação
- **GIVEN** a criança digita `faz uma dancinha`
- **WHEN** a cascata resolve
- **THEN** ela para no nível 1, como comando
- **AND** nenhuma entrada de repertório responde no lugar
