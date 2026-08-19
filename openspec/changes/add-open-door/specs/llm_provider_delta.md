# Delta: Provider de IA

**Change ID:** `add-open-door`
**Affects:** `src/ai/prompt.ts`, `src/config/schema.ts`, `config.example.yaml`

> Requisitos de outros componentes (`ai_companion` e `configuration`). Ao
> arquivar, aplicar cada um no arquivo do componente dono.

---

## ADDED

### Requirement: A IA sabe abrir porta (componente `ai_companion`)

`OPEN_DOOR` entra no catálogo de ações do prompt, com o limite dito por
extenso: porta de ferro ele não abre.

#### Scenario: A ação aparece no prompt
- **GIVEN** o prompt de conversa é montado
- **WHEN** o catálogo de ações é escrito
- **THEN** `OPEN_DOOR` aparece descrito em linguagem de criança
- **AND** o texto diz que porta de ferro precisa de botão ou alavanca

#### Scenario: Pedido em palavras livres
- **GIVEN** a criança digita algo que o parser não reconhece, como
  `dudu, dá pra você destrancar isso aí pra mim?`
- **WHEN** a IA responde
- **THEN** ela pode propor `OPEN_DOOR`
- **AND** a ação passa pela validação antes de virar efeito

---

### Requirement: Raio de busca de porta (componente `configuration`)

`behavior.doorSearchRadius` define até onde o bot procura porta. Padrão: `6`.

#### Scenario: Valor padrão
- **GIVEN** `config.yaml` não traz o campo
- **WHEN** o bot inicia
- **THEN** o raio é 6 blocos
- **AND** nenhuma migração de arquivo é necessária

#### Scenario: Raio curto evita porta do vizinho
- **GIVEN** o raio padrão
- **WHEN** o bot procura porta
- **THEN** ele só considera o que está perto de verdade
- **AND** não sai abrindo porta de construção alheia

#### Scenario: Valor inválido
- **GIVEN** `doorSearchRadius` é zero ou negativo
- **WHEN** a config é carregada
- **THEN** o startup falha com mensagem clara

---

## MODIFIED

### Requirement: Interface única de provider — nota sobre portas

Nada muda na interface. Fica registrado, porém, um limite do
`mineflayer-pathfinder@2.4.5` que atravessa o projeto:

`movements.canOpenDoors` **não abre portas**. O conjunto `openable` da lib só
inclui bloco cujo nome contém `gate`, ou seja, portão de cerca. O comentário no
ponto de uso é `// Open fence gates`.

Além disso, a própria lib mantém a flag desligada com a justificativa
`Causes issues. Probably due to none paper servers` — e o mundo deste projeto é
aberto em LAN pelo cliente vanilla, exatamente esse caso.

**Decisão: `movements.canOpenDoors` permanece `false`.** Porta é resolvida por
`bot.activateBlock`, fora do pathfinder.

#### Scenario: Configuração de movimento no spawn
- **GIVEN** o bot acabou de entrar no mundo
- **WHEN** `Movements` é configurado
- **THEN** `allowSprinting` é `true`
- **AND** `canDig` é `false`
- **AND** `canOpenDoors` é `false`

---

## REMOVED

(Nenhum)
