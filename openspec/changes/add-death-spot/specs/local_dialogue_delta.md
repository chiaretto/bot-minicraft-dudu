# Delta: Repertório local

**Change ID:** `add-death-spot`
**Affects:** `data/repertoire.yaml`, `src/dialogue/default-repertoire.yaml`

---

## ADDED

### Requirement: Entrada `lugar_morte_desconhecido`

A fala de quando não há lugar guardado — primeiro dia, ou logo depois de uma
reconexão. É `fallback`: disparada pelo código.

#### Scenario: Honesta, e com saída
- **WHEN** a criança pede para ser levada e não há lugar guardado
- **THEN** o bot diz que não viu ela morrer
- **AND** oferece o que funciona: ficar perto para ver a próxima
- **AND** nenhuma variação promete lembrar de mortes que ele não viu

---

## MODIFIED

### Requirement: Falas espontâneas por evento do jogo

`evento_dono_morreu` existia desde 15/08 e **nunca era dita**: nenhum código a
disparava. Pior, ela prometia *"eu marquei onde foi"* — uma capacidade que o bot
não tinha.

Agora o evento existe, a entrada é disparada, e a promessa é verdade.

#### Scenario: A entrada morta volta a viver
- **GIVEN** o dono morreu
- **WHEN** o bot reage
- **THEN** uma variação de `evento_dono_morreu` é dita
- **AND** o que ela promete o bot cumpre: o lugar está guardado
