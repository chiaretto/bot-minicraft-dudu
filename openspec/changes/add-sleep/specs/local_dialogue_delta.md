# Delta: Repertório local

**Change ID:** `add-sleep`
**Affects:** `data/repertoire.yaml`, `src/dialogue/default-repertoire.yaml`

---

## MODIFIED

### Requirement: Nenhuma fala nega capacidade que o bot tem

`pedido_dormir` dizia *"Eu não sei dormir"*. Agora ele sabe.

A entrada foi **partida**: as ordens (`vamos dormir`, `deita na cama`) viraram
comando `SLEEP`, e o que sobrou são as **perguntas** (`voce sabe dormir?`), numa
entrada renomeada para `pergunta_dormir` — o nome antigo dizia "pedido", e
pedido agora é comando.

As respostas mudaram de "não sei" para "sei, e a noite passa voando".

#### Scenario: A pergunta tem resposta nova
- **WHEN** a criança pergunta `voce sabe dormir?`
- **THEN** ele diz que sim
- **AND** ensina a frase que funciona (`vamos dormir`)
- **AND** avisa que de dia não dá — a limitação continua sendo dita

#### Scenario: `boa noite` volta para o lugar certo
- **GIVEN** `boa noite` casava com `elogio_bot` pela palavra "boa"
- **WHEN** a criança se despede
- **THEN** ela cai em `despedida`
- **AND** o bot para de agradecer um elogio que ninguém fez

---

## REMOVED

(None — `pedido_dormir` foi renomeada e reescrita, não removida.)
