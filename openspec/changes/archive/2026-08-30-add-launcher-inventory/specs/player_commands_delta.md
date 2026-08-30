# Delta: Comandos do jogador

**Change ID:** `add-launcher-inventory`
**Affects:** `domain/item-names.ts`, `behaviors/actions/index.ts`

---

## ADDED

### Requirement: Catálogo de nomes de item em português

`domain/item-names.ts` traduz o id do jogo para a palavra que a criança usa —
`cooked_beef` → "carne assada", `torch` → "tocha", `iron_sword` → "espada".

Catálogo **fechado**, como o de bicho, planta, jogo e material, e cobrindo o que
o bot realmente manuseia: bloco de obra, a comida de `FOOD_ITEMS`, tocha, cama,
ferramenta e arma.

Item fora do catálogo aparece com **o próprio id**. Nunca some: a falta vira
item novo na lista, não um buraco silencioso na fala nem na janela.

#### Scenario: O nome técnico não chega à criança
- **GIVEN** o bot carrega `cooked_beef`
- **WHEN** ele fala sobre esse item
- **THEN** ele diz "carne assada"

#### Scenario: Item desconhecido aparece como está
- **GIVEN** um item que o catálogo não conhece
- **WHEN** ele precisa ser nomeado
- **THEN** o id aparece, sem tradução
- **AND** ele **não** é escondido: esconder faria a conta da mochila mentir

---

## MODIFIED

### Requirement: Entregar item na mão do jogador

Quatro falas diziam o **nome técnico em inglês** para uma criança de 7 anos:

```
"não tenho cooked_beef comigo"
"Toma aí o iron_sword!"
"Equipei torch!"
```

`friendlyName()` existia desde a coleta e resolvia isso para bloco de obra, mas
nunca foi chamado nessas linhas — e o catálogo dele só cobre material de
construção. As quatro passam a usar o catálogo de nomes de item.

É a regra número um: se um conceito técnico precisa aparecer, traduza.

#### Scenario: A entrega fala português
- **GIVEN** o bot tem carne assada e o jogador pede
- **WHEN** ele entrega
- **THEN** a fala é "Toma aí a carne assada!"
- **AND** nenhuma palavra em inglês aparece

#### Scenario: A recusa também
- **GIVEN** o bot não tem o item pedido
- **WHEN** ele recusa
- **THEN** a fala usa o nome em português

#### Scenario: Equipar também
- **GIVEN** o jogador manda equipar a espada
- **WHEN** ele equipa
- **THEN** a fala diz "espada", não `iron_sword`

---

## REMOVED

(None)
