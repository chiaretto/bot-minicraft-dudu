# Delta: Repertório Local de Conversa

**Change ID:** `add-learned-commands`
**Affects:** `src/behaviors/router.ts`, `data/repertoire.yaml`,
`src/dialogue/default-repertoire.yaml`

---

## ADDED

### Requirement: Entrada `comando_aprendido`

O repertório passa a ser a fonte da fala do replay de comando aprendido. A ação
vem do histórico; a fala, daqui.

A entrada é `fallback` (disparada pelo código, não por padrão de texto) e as
variações precisam ser **curtas e sem contexto**: elas vão sair em qualquer hora
do dia, para qualquer ação, em qualquer lugar do mundo.

#### Scenario: Fala do replay sai do repertório
- **GIVEN** um comando aprendido casou com a mensagem do dono
- **WHEN** o bot vai responder
- **THEN** uma variação de `comando_aprendido` é escolhida e dita
- **AND** a fala que a IA tinha dado no dia do aprendizado **não** é usada

#### Scenario: Variação suficiente para não soar decorado
- **GIVEN** o catálogo é carregado
- **WHEN** `comando_aprendido` é validada
- **THEN** ela tem no mínimo `MIN_VARIATIONS_WARN` variações
- **AND** o sorteio nunca repete a última usada, como em qualquer entrada

#### Scenario: Fala independente de contexto
- **GIVEN** as variações de `comando_aprendido`
- **WHEN** cada uma é lida
- **THEN** nenhuma cita hora do dia, lugar, bloco ou ação específica
- **AND** nenhuma promete capacidade — o que o bot vai fazer, ele já vai fazer em seguida

---

## MODIFIED

### Requirement: Cascata de resolução de mensagens

Toda mensagem do dono passa por **quatro** níveis, em ordem. Cada nível só
entrega ao seguinte o que não conseguiu resolver.

**Ordem:** parser de comandos → **comandos aprendidos** → repertório local →
provider de IA

O nível novo fica onde fica por dois motivos. Primeiro, ele produz **ação**, e
ação tem precedência sobre conversa — o mesmo motivo que põe o parser antes do
repertório. Segundo, o conflito com o repertório é raro por construção: frase que
o repertório responde nunca chega à IA, então nunca chega a ser aprendida.

O parser de regex continua ganhando de todos: o que um humano escreveu vale mais
que o que o bot deduziu.

#### Scenario: Comando tem precedência sobre o aprendido
- **GIVEN** o dono digita `dudu, me segue`
- **AND** existe uma entrada aprendida que também casaria com essa frase
- **WHEN** a mensagem é roteada
- **THEN** o parser de comandos resolve e o bot entra em `FOLLOW`
- **AND** o histórico de aprendidos não é consultado

#### Scenario: Aprendido tem precedência sobre o repertório
- **GIVEN** o histórico tem `pega umas madeirinhas` → `COLLECT_BLOCK madeira 8`
- **WHEN** o dono digita `dudu, pega umas madeirinhas`
- **THEN** o comando aprendido resolve e a coleta começa
- **AND** o repertório não é consultado
- **AND** o provider de IA não é chamado

#### Scenario: Aprendido declina e o repertório assume
- **GIVEN** nenhuma entrada aprendida atinge `learned.minConfidence`
- **WHEN** a mensagem continua descendo
- **THEN** o repertório é consultado normalmente

#### Scenario: Repertório resolve sem chamar a IA
- **GIVEN** o dono digita `dudu, oi`
- **AND** nem o parser nem o histórico de aprendidos reconhecem
- **WHEN** a mensagem chega ao repertório
- **THEN** uma resposta de saudação é escolhida e enviada ao chat
- **AND** o provider de IA **não** é chamado
- **AND** a resposta chega ao chat em menos de 100 ms

#### Scenario: Sem match, cai para a IA
- **GIVEN** o dono digita `dudu, você acha que existe vida em outro planeta?`
- **AND** nenhum nível anterior resolveu
- **WHEN** a mensagem termina de descer a cascata
- **THEN** o provider de IA é chamado no modo de conversa
- **AND** a resposta da IA é enviada ao chat

#### Scenario: Cascata de três níveis com o aprendizado desligado
- **GIVEN** `learned.enabled` é `false`
- **WHEN** qualquer mensagem é roteada
- **THEN** a ordem é parser → repertório → IA
- **AND** o comportamento é idêntico ao de antes desta mudança

---

## REMOVED

(Nenhum)
