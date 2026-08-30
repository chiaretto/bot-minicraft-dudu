# Delta: Repertório local

**Change ID:** `add-place-and-dig`
**Affects:** `data/repertoire.yaml`, `src/dialogue/default-repertoire.yaml`

---

## MODIFIED

### Requirement: Nenhuma fala nega capacidade que o bot tem

`pedido_soltar_item` prometia que ele não sabia pôr bloco. Agora sabe, e a
entrada foi reescrita para cobrir **só o que continua faltando**: largar item
solto no chão.

#### Scenario: A entrada cobre só o que sobrou
- **GIVEN** a criança digita `poe um bloco aqui`
- **THEN** isso é comando, não recusa
- **AND** `joga no chao` continua caindo na entrada, que agora oferece as duas
  saídas que existem: entregar na mão, ou pôr um bloco

---

## REMOVED

### Requirement: Entrada `pedido_cavar`

Removida. Os nove padrões viraram comando `DIG`.

Comando de ação não é repertório, e manter a entrada faria a recusa ganhar do
comando em qualquer frase que o parser não pegasse — o bot diria que não sabe
cavar logo depois de abrir um buraco.
