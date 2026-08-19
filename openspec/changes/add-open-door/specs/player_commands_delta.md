# Delta: Comandos do jogador

**Change ID:** `add-open-door`
**Affects:** `src/domain/doors.ts`, `src/behaviors/actions/doors.ts`,
`src/behaviors/actions/index.ts`, `src/app/bot.ts`, `src/behaviors/commands.ts`

---

## ADDED

### Requirement: Abrir porta

O bot abre porta, portão de cerca e alçapão de madeira, clicando neles como o
jogador faria. Porta de ferro **não**: essa só abre com botão, alavanca ou placa
de pressão, e ele diz isso em vez de tentar.

#### Scenario: Pedido explícito
- **GIVEN** existe uma porta de madeira fechada por perto
- **WHEN** `FresherRobin90` digita `dudu, abre a porta`
- **THEN** o parser resolve no nível 1, sem chamar a IA
- **AND** o bot caminha até a porta e a abre
- **AND** avisa no chat que abriu

#### Scenario: Portão e alçapão
- **GIVEN** o bloco mais próximo é um portão de cerca ou um alçapão
- **WHEN** a abertura acontece
- **THEN** o bot chama o bloco pelo nome que a criança usa — `portão`, `alçapão`
- **AND** nunca pelo nome técnico

#### Scenario: Porta de ferro
- **GIVEN** a porta mais próxima é de ferro
- **WHEN** a abertura é pedida
- **THEN** o bot **não** clica nela
- **AND** explica que ela só abre com botão ou alavanca

> Ficar clicando numa porta que não vai abrir pareceria bot quebrado. A recusa
> honesta é a regra do público (`openspec/project.md`).

#### Scenario: Nenhuma porta por perto
- **GIVEN** não há porta em `behavior.doorSearchRadius`
- **WHEN** a abertura é pedida
- **THEN** o bot diz que não está vendo porta nenhuma

#### Scenario: Porta já aberta
- **GIVEN** a única porta por perto já está aberta
- **WHEN** a abertura é pedida
- **THEN** o bot avisa que ela já está aberta
- **AND** **não** clica nela — clicar de novo a fecharia

#### Scenario: As duas metades da porta
- **GIVEN** uma porta ocupa dois blocos e os dois aparecem na busca
- **WHEN** o alvo é escolhido
- **THEN** só a metade de baixo é considerada
- **AND** o bot não trata as duas metades como portas diferentes

#### Scenario: O clique não surtiu efeito
- **GIVEN** o bot clicou na porta
- **WHEN** ela continua fechada
- **THEN** ele fala que tentou e não abriu
- **AND** **não** anuncia que abriu

---

### Requirement: Porta fechada não trava o chamado

Porta fechada é parede para o pathfinder. Um chamado nunca pode terminar com o
bot parado do lado de fora, calado.

#### Scenario: Chamado com a porta fechada no caminho
- **GIVEN** o dono entrou em casa e fechou a porta
- **AND** o bot está em `FOLLOW` e não sai do lugar há `behavior.escapeStuckMs`
- **WHEN** o vigia avalia
- **THEN** o bot avisa que tem porta no caminho
- **AND** abre a porta
- **AND** volta a seguir sem precisar de comando novo

#### Scenario: Porta vem antes de buraco
- **GIVEN** o bot está travado
- **AND** existe porta fechada por perto
- **WHEN** o vigia escolhe o que fazer
- **THEN** ele tenta a porta primeiro
- **AND** a razão é que porta é mais comum, mais barata de resolver, e acontece
  no mesmo nível — onde a regra do buraco nem se aplica

#### Scenario: Porta de ferro não conta como causa
- **GIVEN** o bot está travado e a única porta por perto é de ferro
- **WHEN** o vigia avalia
- **THEN** a porta **não** é tratada como causa
- **AND** o vigia segue para a avaliação de buraco

#### Scenario: Brincadeira em andamento
- **GIVEN** uma rodada de esconde-esconde ou pega-pega está valendo
- **WHEN** o vigia roda
- **THEN** ele não abre porta nenhuma

> A garantia de "quem se lacrou não é achado" vem de o pathfinder não conseguir
> entrar. A sessão de jogo não abre portas, e o vigia não roda durante rodada:
> abrir porta continua sendo decisão do jogador.

---

### Requirement: A abertura respeita as prioridades

#### Scenario: `dudu, para` durante a abertura
- **GIVEN** o bot está indo até a porta
- **WHEN** `FresherRobin90` digita `dudu, para`
- **THEN** ele para e não clica na porta

#### Scenario: Monstro durante a abertura
- **GIVEN** a abertura está em andamento
- **WHEN** um hostil entra no raio de proteção do dono
- **THEN** a defesa interrompe a abertura

---

## MODIFIED

(Nenhum requisito existente muda de comportamento. O vigia de "preso", criado
para a saída de buraco, ganha a porta como primeira causa avaliada.)

---

## REMOVED

(Nenhum)
