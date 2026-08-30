# Delta: Comandos do jogador

**Change ID:** `add-escape-hole`
**Affects:** `src/domain/escape.ts`, `src/behaviors/actions/escape.ts`,
`src/behaviors/actions/index.ts`, `src/app/bot.ts`, `src/behaviors/commands.ts`

---

## ADDED

### Requirement: Sair de buraco

Chamado quando está preso no fundo de um buraco, o bot empilha blocos embaixo
de si até alcançar o nível do dono e então volta a seguir. Um chamado nunca
termina em silêncio.

#### Scenario: Chamado no fundo de uma ravina
- **GIVEN** o bot está em `FOLLOW` e o dono está 14 blocos acima
- **AND** o bot não sai do lugar há `behavior.escapeStuckMs`
- **WHEN** o vigia avalia a situação
- **THEN** o bot avisa no chat que caiu num buraco, **antes** de começar
- **AND** empilha blocos embaixo de si até o nível do dono
- **AND** volta a seguir sem precisar de comando novo

#### Scenario: Pedido explícito
- **GIVEN** o bot está num buraco
- **WHEN** `FresherRobin90` digita `dudu, sai do buraco` ou `dudu, sobe`
- **THEN** o parser resolve no nível 1, sem chamar a IA
- **AND** a subida começa

#### Scenario: Não está em buraco nenhum
- **GIVEN** o dono está no mesmo nível do bot, ou abaixo
- **WHEN** a subida é pedida
- **THEN** o bot recusa dizendo que não está num buraco
- **AND** nenhum bloco é colocado

#### Scenario: Desnível pequeno
- **GIVEN** o dono está menos de `behavior.escapeMinDrop` acima
- **WHEN** o vigia avalia
- **THEN** nada acontece — o pulo do pathfinder resolve

#### Scenario: Dono fora de vista
- **GIVEN** o bot está fundo e o dono não está visível
- **WHEN** a subida é avaliada
- **THEN** ele **não** sobe
- **AND** a razão é que uma torre no meio do nada não leva a lugar nenhum

#### Scenario: Teto de altura
- **GIVEN** o dono está 300 blocos acima, voando de criativo
- **WHEN** a subida roda
- **THEN** ela para em `behavior.escapeMaxHeight` degraus
- **AND** o bot fala que subiu mas ainda está fundo

---

### Requirement: Material do degrau

Faltando bloco, o bot cava as paredes em volta. Nunca o chão, e nunca o que não
pode cavar.

#### Scenario: Mochila vazia dentro do buraco
- **GIVEN** o bot não tem nenhum bloco e as paredes são de terra
- **WHEN** a subida vai começar
- **THEN** ele cava as paredes até ter degrau suficiente
- **AND** só então começa a subir

#### Scenario: Nunca cavar embaixo dos pés
- **GIVEN** o bot está escolhendo o que cavar
- **WHEN** os candidatos são listados
- **THEN** nenhum deles está abaixo dos pés
- **AND** a razão é que cavar o chão aprofunda o buraco

#### Scenario: Só o que ele pode cavar E usar
- **GIVEN** um bloco só está em `collectAllowlist`, ou só em `buildAllowlist`
- **WHEN** o material é escolhido
- **THEN** esse bloco **não** é cavado
- **AND** vale apenas a interseção das duas listas

#### Scenario: Nada para cavar e nada na mochila
- **GIVEN** o bot está num buraco de rocha que ele não pode cavar
- **WHEN** a subida é tentada
- **THEN** ele pede ajuda no chat
- **AND** não fica preso tentando

#### Scenario: Teto de escavação
- **GIVEN** cavar não está rendendo material
- **WHEN** `behavior.escapeMaxDigs` blocos foram cavados
- **THEN** ele para de cavar
- **AND** a subida não vira uma escavação sem fim

---

### Requirement: A subida respeita as prioridades

Subir é ação como qualquer outra: cede a lugar para o que é mais urgente.

#### Scenario: `dudu, para` no meio da subida
- **GIVEN** o bot está empilhando blocos
- **WHEN** `FresherRobin90` digita `dudu, para`
- **THEN** a subida para
- **AND** os degraus já colocados permanecem

#### Scenario: Monstro durante a subida
- **GIVEN** a subida está em andamento
- **WHEN** um hostil entra no raio de proteção do dono
- **THEN** a defesa interrompe a subida

#### Scenario: Brincadeira em andamento
- **GIVEN** uma rodada de esconde-esconde ou pega-pega está valendo
- **WHEN** o vigia roda
- **THEN** ele não faz nada
- **AND** a razão é que um bot empilhando blocos estragaria a brincadeira

#### Scenario: Parado por outro motivo
- **GIVEN** o bot está parado, mas o dono está no mesmo nível
- **WHEN** o vigia avalia
- **THEN** nenhuma subida começa

---

## MODIFIED

### Requirement: Seguir o dono

Seguir continua sendo `GoalFollow` dinâmico. O que muda: um chamado que não
consegue ser cumprido **não termina mais em silêncio**.

> `GoalFollow` não avisa quando não existe caminho — o pathfinder simplesmente
> não anda. Com `movements.canDig = false` (proposital, para o esconde-esconde),
> o bot também não abre caminho sozinho. O resultado era o bot parado e mudo no
> fundo da ravina depois de a criança mandar `vem`.

#### Scenario: Chamado normal
- **GIVEN** existe caminho até o dono
- **WHEN** `FresherRobin90` digita `dudu, vem`
- **THEN** o bot segue a `behavior.followDistance`, como sempre

#### Scenario: Chamado sem caminho possível
- **GIVEN** o bot está preso num buraco fundo
- **WHEN** o chamado chega e ele não consegue andar
- **THEN** ele avisa no chat e tenta subir
- **AND** **não** fica parado sem dizer nada

---

## REMOVED

(Nenhum)
