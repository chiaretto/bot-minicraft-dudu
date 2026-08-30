# Delta: Companheiro com IA

**Change ID:** `add-learned-commands`
**Affects:** `src/behaviors/router.ts`, `src/app/bot.ts`

> A camada de IA em si **não muda**: nenhum provider sabe que existe cache. O que
> muda é quantas vezes ela é chamada e o que o bot faz com o que ela ensinou.

---

## MODIFIED

### Requirement: Controle de custo e taxa

Chamadas ao provider de IA são limitadas por taxa. Com provider de nuvem isso
contém custo; com provider local, contém a carga na máquina que também está
rodando o Minecraft. Em ambos, evita spam.

A partir desta mudança existe uma segunda economia, anterior ao limite de taxa:
**pedido repetido não chega ao provider**. O nível 1.5 atende pelo histórico de
comandos aprendidos, e o limite de taxa passa a ser gasto só com o que é
realmente novo.

#### Scenario: Rajada de mensagens do jogador
- **GIVEN** o limite é de 10 chamadas por minuto
- **WHEN** o dono manda 20 mensagens em um minuto
- **THEN** no máximo 10 vão para o provider
- **AND** o excedente recebe uma resposta de fallback pedindo calma

#### Scenario: Pedido repetido não consome o limite
- **GIVEN** o limite é de 10 chamadas por minuto
- **AND** um pedido já foi aprendido
- **WHEN** o dono repete esse pedido cinco vezes
- **THEN** nenhuma dessas cinco vezes conta para o limite
- **AND** o orçamento de chamadas continua disponível para pedido novo

#### Scenario: Uma criança repetindo custa uma chamada, não dez
- **GIVEN** a criança pede a mesma casa em cinco sessões diferentes
- **WHEN** o histórico está ligado
- **THEN** só a primeira vez custa chamada ao provider
- **AND** as outras quatro são atendidas na máquina

---

### Requirement: Interpretação de comando em linguagem natural

A IA continua sendo quem traduz pedido em palavras livres para intenção
validada — mas agora ela ensina de uma vez. Traduzida com sucesso uma vez, aquela
frase passa a ser atendida pelo nível 1.5 nas vezes seguintes.

Isso não afrouxa nada do que já valia: a intenção continua passando pela
validação do catálogo fechado antes de virar efeito no mundo, tanto na primeira
vez quanto no replay.

#### Scenario: Pedido em palavras livres, primeira vez
- **GIVEN** o parser e o repertório não reconheceram a mensagem
- **WHEN** o dono digita `dudu, será que dava pra você juntar umas madeirinhas?`
- **THEN** a IA devolve fala e ação numa chamada só
- **AND** o bot fala e depois executa a ação validada

#### Scenario: Mesmo pedido, segunda vez
- **GIVEN** a mesma frase já foi traduzida com sucesso antes
- **WHEN** o dono a repete
- **THEN** a ação é executada sem chamada ao provider
- **AND** a intenção replicada passa pela mesma validação de sempre

#### Scenario: A validação não é atalhada no replay
- **GIVEN** uma entrada do histórico ficou com parâmetro que a validação recusa
- **WHEN** ela é replicada
- **THEN** a intenção é descartada e nenhum efeito de mundo acontece
- **AND** a mensagem segue na cascata como se o histórico não tivesse casado

---

## REMOVED

(Nenhum)
