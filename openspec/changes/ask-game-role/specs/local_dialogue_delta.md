# Delta: Repertório local

**Change ID:** `ask-game-role`
**Affects:** `data/repertoire.yaml`, `src/dialogue/default-repertoire.yaml`

> Requisito de outro componente (`local_dialogue`). Ao arquivar, aplicar em
> `openspec/specs/local_dialogue.md` → "Falas das brincadeiras no catálogo".

---

## ADDED

### Requirement: Falas da pergunta de papel

As perguntas de papel entram no catálogo como qualquer fala de jogo:
instantâneas, sem IA, com 4+ variações.

| Entrada | Quando |
|---|---|
| `jogo_quem_esconde` | convite de esconde-esconde sem papel |
| `jogo_quem_corre` | convite de pega-pega sem papel |

#### Scenario: Toda variação oferece as duas opções
- **GIVEN** o catálogo tem `jogo_quem_esconde` e `jogo_quem_corre`
- **WHEN** qualquer variação de qualquer uma das duas é sorteada
- **THEN** ela nomeia **as duas** escolhas possíveis
- **AND** uma pergunta que cita só um lado não é aceitável — esconder metade das
  opções é o defeito que este change existe para corrigir

#### Scenario: Pergunta sem IA
- **GIVEN** `llm.provider` é `'none'`
- **WHEN** o bot pergunta o papel
- **THEN** a fala sai do repertório local, na hora
- **AND** nenhuma chamada de provider acontece

#### Scenario: Repergunta usa a mesma entrada
- **GIVEN** o bot já perguntou uma vez e vai reperguntar
- **WHEN** ele fala de novo
- **THEN** a fala vem da mesma entrada, em outra variação
- **AND** vale a regra de não repetir a variação anterior

---

## MODIFIED

(Nenhum requisito existente muda. As entradas novas entram na tabela de
`jogo_*` já descrita em "Falas das brincadeiras no catálogo".)

---

## REMOVED

(Nenhum)
