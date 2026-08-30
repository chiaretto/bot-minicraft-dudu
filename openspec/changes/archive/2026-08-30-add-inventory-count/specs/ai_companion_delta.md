# Delta: Companheiro de IA

**Change ID:** `add-inventory-count`
**Affects:** `ai/prompt.ts`

---

## MODIFIED

### Requirement: Conversa natural no chat

O bloco de situação do mundo passa a incluir **a mochila**. Ele mandava vida,
fome, posição, hora e monstros — e não mandava o que o bot está carregando.

Era isso que fazia a IA responder no escuro: em 20/08 ela disse *"isso eu não
sei ver"* sobre o inventário, que o snapshot já carregava.

#### Scenario: A IA enxerga o que o bot carrega
- **GIVEN** o bot tem 12 de madeira e 3 de pedra
- **WHEN** o prompt é montado
- **THEN** a linha da mochila aparece na situação atual
- **AND** só os cinco maiores itens entram — o resto é ruído no contexto

#### Scenario: Mochila vazia é dito, não omitido
- **GIVEN** o bot não carrega nada
- **WHEN** o prompt é montado
- **THEN** a linha diz `nada`
- **AND** a IA não precisa adivinhar se o campo faltou ou se a mochila é que
  está vazia

---

## REMOVED

(None)
