# Delta: Comandos do jogador

**Change ID:** `add-collect-and-build`
**Affects:** `src/domain/materials.ts`, `src/domain/blueprints.ts`,
`src/behaviors/actions/build.ts`, `src/behaviors/actions/index.ts`,
`src/behaviors/commands.ts`

---

## ADDED

### Requirement: Pegar bloco de verdade

Pedido de bloco comum é comando de **nível 1**: resolve sem IA, sem espera e com
`llm.provider: 'none'`. O bot vai até o bloco, cava e avisa o que trouxe.

A busca é sempre pelo **grupo** do material, nunca por um bloco só: "madeira"
vale por qualquer tronco.

| A criança fala | Grupo procurado |
|---|---|
| `pega madeira`, `pega tronco` | qualquer tronco |
| `pega pedra` | pedra e pedregulho |
| `pega terra` | terra |
| `pega areia` | areia |

#### Scenario: Pedido de madeira numa floresta
- **GIVEN** `games`/IA irrelevantes e há árvores por perto
- **WHEN** `FresherRobin90` digita `dudu, pega madeira`
- **THEN** o parser resolve no nível 1, sem chamar a IA
- **AND** o bot caminha até o tronco, cava e avisa quanto pegou

#### Scenario: Floresta sem o tronco exato pedido
- **GIVEN** o lugar só tem bétula
- **WHEN** o pedido chega como `oak_log`
- **THEN** a busca cobre o grupo inteiro e a bétula serve
- **AND** o bot **não** responde "não achei" num lugar cheio de árvore

#### Scenario: Bloco fora da allowlist de coleta
- **GIVEN** `diamond_ore` não está em `collectAllowlist`
- **WHEN** a coleta é pedida
- **THEN** o bot recusa sem cavar nada
- **AND** a recusa usa o nome que a criança entende, nunca o técnico

#### Scenario: Não há o bloco por perto
- **GIVEN** não existe nenhum bloco do grupo em 32 blocos
- **WHEN** a coleta roda
- **THEN** o bot avisa que não achou
- **AND** volta para `IDLE` sem ficar preso

---

### Requirement: Construir coisa simples

O bot levanta estruturas de um **catálogo fechado**. Pedido fora da lista nunca
vira obra.

| Estrutura | Forma |
|---|---|
| `casa` | 5x5, paredes de 2, porta na frente, 3 janelas, telhado plano |
| `torre` | 3x3, paredes de 4, porta, topo fechado |

#### Scenario: Pedir uma casa
- **GIVEN** o bot tem material suficiente, ou sabe buscar
- **WHEN** `FresherRobin90` digita `dudu, faz uma casa`
- **THEN** o parser resolve no nível 1, sem chamar a IA
- **AND** o bot levanta a casa ao lado de onde está
- **AND** avisa no chat quando termina

#### Scenario: A casa é habitável
- **GIVEN** uma casa recém-construída
- **WHEN** a criança chega nela
- **THEN** existe um vão de porta da altura da parede
- **AND** o interior é oco
- **AND** o telhado é fechado, sem buraco

#### Scenario: Estrutura fora do catálogo
- **GIVEN** o pedido é `castelo`
- **WHEN** a construção é avaliada
- **THEN** nenhuma obra começa e nenhum bloco é colocado
- **AND** o bot responde que essa ele não sabe fazer

#### Scenario: Obra grande demais
- **GIVEN** a planta pedida passa de `behavior.buildMaxBlocks`
- **WHEN** a construção é avaliada
- **THEN** ela é recusada **antes** de colocar o primeiro bloco

---

### Requirement: A obra nunca destrói o que já existe

Construir só acrescenta. Posição que já tem bloco é pulada, e conta como
pronta.

#### Scenario: Bloco do jogador no caminho da parede
- **GIVEN** existe um bloco do jogador onde a parede passaria
- **WHEN** a obra chega naquela posição
- **THEN** o bloco é preservado
- **AND** a obra segue e termina normalmente

#### Scenario: Material fora da allowlist de obra
- **GIVEN** o pedido é construir com `tnt`
- **WHEN** o material é escolhido
- **THEN** a obra é recusada
- **AND** `buildAllowlist` é a única fonte do que pode virar parede

---

### Requirement: Ordem de colocação com apoio

Todo bloco é colocado encostado em algo que já existe: no chão, no bloco de
baixo ou num vizinho já posto. A planta sai ordenada de baixo para cima e, em
cada camada, de fora para dentro.

> Sem isso o telhado não fecha: bloco no ar não pode ser colocado, e a obra
> terminaria pela metade com a criança olhando.

#### Scenario: Telhado fecha do anel de fora para o meio
- **GIVEN** as paredes estão de pé
- **WHEN** o telhado é colocado
- **THEN** o anel externo se apoia na parede
- **AND** cada anel seguinte se apoia no anterior, até o centro

#### Scenario: Bloco sem apoio na vez dele
- **GIVEN** um bloco cujo apoio ainda não existe
- **WHEN** a passada chega nele
- **THEN** ele é adiado para a passada seguinte
- **AND** a obra não trava esperando por ele

#### Scenario: Passada que não avança encerra a obra
- **GIVEN** uma passada inteira sem colocar nada
- **WHEN** ela termina
- **THEN** a obra é encerrada
- **AND** o bot fala que faltaram pedaços, em vez de fingir que terminou

---

### Requirement: Material da obra

Uma obra usa **um** material. Sem pedido explícito, vence o que o bot tem em
maior quantidade. Faltando material, ele busca antes de começar.

#### Scenario: Constrói com o que tem
- **GIVEN** o bot tem 90 de pedregulho e 10 de tronco
- **WHEN** a casa é pedida sem dizer o material
- **THEN** a obra inteira sai de pedregulho

#### Scenario: Material pedido pelo jogador
- **GIVEN** a criança pede uma torre de pedra
- **WHEN** o material é escolhido
- **THEN** a obra usa pedra, se estiver na allowlist de obra

#### Scenario: Falta material e ele busca
- **GIVEN** falta material e `behavior.buildAutoGather` é `true`
- **WHEN** a obra vai começar
- **THEN** o bot coleta o que falta primeiro
- **AND** só então levanta a estrutura

#### Scenario: Falta material e não dá para buscar
- **GIVEN** a busca não trouxe o suficiente
- **WHEN** a obra vai começar
- **THEN** ela é recusada **antes** de levantar meia parede
- **AND** o bot diz quantos blocos faltam e pede ajuda

#### Scenario: Mochila vazia
- **GIVEN** o bot não tem bloco nenhum e não sabe buscar
- **WHEN** a obra é pedida
- **THEN** ele recusa sem sair do lugar

---

### Requirement: A obra é interrompível

Construir é ação como qualquer outra: para na hora que mandarem parar.

#### Scenario: `dudu, para` no meio da obra
- **GIVEN** a casa está pela metade
- **WHEN** `FresherRobin90` digita `dudu, para`
- **THEN** a obra para em menos de 1 s
- **AND** o que já foi construído permanece
- **AND** o bot volta para `IDLE`

#### Scenario: Ameaça durante a obra
- **GIVEN** a obra está em andamento
- **WHEN** um hostil entra no raio de proteção do dono
- **THEN** a defesa interrompe a obra
- **AND** a obra **não** recomeça sozinha quando o combate acaba

---

## MODIFIED

(Nenhum requisito existente muda de comportamento. `collectBlock` passa a
procurar pelo grupo do material em vez de um bloco só — o que antes devolvia
"não achei" agora acha.)

---

## REMOVED

(Nenhum)
