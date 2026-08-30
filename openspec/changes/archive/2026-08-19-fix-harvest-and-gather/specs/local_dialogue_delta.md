# Delta: Repertório local

**Change ID:** `fix-harvest-and-gather`
**Affects:** `data/repertoire.yaml`, `src/dialogue/default-repertoire.yaml`

> Requisito de outro componente (`local_dialogue`). Ao arquivar, aplicar em
> `openspec/specs/local_dialogue.md` → "Nenhuma fala nega capacidade que o bot
> tem".

---

## MODIFIED

### Requirement: Nenhuma fala nega capacidade que o bot tem

O requisito ganha a outra ponta: **nem afirma capacidade que ele não tem
sempre.** "Sei pegar pedra" só vale com picareta, e o bot normalmente não tem
ferramenta nenhuma.

#### Scenario: Capacidade condicional não vira promessa
- **GIVEN** pegar pedra depende de ter picareta
- **WHEN** o repertório lista o que ele sabe fazer
- **THEN** ele oferece o que funciona sempre: madeira, terra e areia
- **AND** pedra aparece com a condição dita, ou não aparece

#### Scenario: A recusa de minério ensina o que funciona
- **GIVEN** `pega diamante` chega
- **WHEN** `pedido_coleta` responde
- **THEN** ela oferece material que ele consegue pegar na mão
- **AND** menciona a picareta quando falar de pedra

---

## ADDED

(Nenhum requisito novo.)

---

## REMOVED

(Nenhum)
