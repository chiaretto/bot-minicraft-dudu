# Delta: Companheiro com IA

**Change ID:** `ai-reply-with-action`
**Affects:** `src/domain/intent.ts`, `src/ai/prompt.ts`, `src/ai/index.ts`,
`src/behaviors/router.ts`, `src/app/bot.ts`

---

## ADDED

### Requirement: Resposta da IA carrega a ação

A IA conhece a lista fechada de ações que o bot sabe executar. Quando a mensagem
do dono for um pedido, ela devolve — **na mesma resposta** — a fala e a ação
correspondente. Conversa que não é pedido vem sem ação.

O bot **fala primeiro e age depois**: a criança precisa ouvir "já vou pegar!"
antes de ver o bot sair andando.

#### Scenario: Pedido em palavras que o parser não reconhece
- **GIVEN** `llm.provider` é `'ollama'` e o parser não reconheceu a mensagem
- **AND** o repertório local também não resolveu
- **WHEN** `FresherRobin90` digita `dudu, será que dava pra você juntar umas madeirinhas pra mim?`
- **THEN** a IA devolve fala e ação numa chamada só
- **AND** o bot fala a resposta no chat
- **AND** **depois** executa `COLLECT_BLOCK` com o bloco e a quantidade propostos
- **AND** a ação passa por validação antes de virar efeito no mundo

#### Scenario: Conversa não vira ação
- **GIVEN** a mensagem é bate-papo, não pedido
- **WHEN** `FresherRobin90` digita `dudu, você gosta de diamante?`
- **THEN** a IA devolve fala e **nenhuma** ação
- **AND** o bot responde no chat e não se move

#### Scenario: Uma ação por resposta
- **GIVEN** o dono pede duas coisas na mesma frase
- **WHEN** a IA responde
- **THEN** no máximo **uma** ação vem na resposta
- **AND** o bot executa essa e não inventa a segunda

#### Scenario: Ação fora do catálogo
- **GIVEN** a IA devolve uma ação `BUILD_HOUSE`
- **WHEN** a validação roda
- **THEN** a ação é descartada e nenhum efeito de mundo acontece
- **AND** a fala da IA ainda é dita no chat
- **AND** o bot não promete o que não sabe fazer

#### Scenario: Resposta que não faz parse
- **GIVEN** a IA devolve texto que não é o objeto esperado
- **WHEN** a resposta é processada
- **THEN** o que veio é tratado como fala pura, sem ação
- **AND** o bot não trava nem cai

#### Scenario: Brincadeira pedida à IA não escolhe papel
- **GIVEN** a IA devolve `PLAY_GAME` sem papel
- **WHEN** a ação é executada
- **THEN** o bot pergunta quem faz o quê, como faz com o convite pelo nome do jogo
- **AND** nenhuma rodada começa antes da resposta

#### Scenario: Log da decisão da IA
- **GIVEN** a IA respondeu com fala e ação
- **WHEN** o turno é registrado
- **THEN** o log traz a pergunta, a fala e a ação proposta
- **AND** ação descartada por validação aparece no log como descartada

#### Scenario: IA desligada
- **GIVEN** `llm.provider` é `'none'`
- **WHEN** o dono manda qualquer mensagem
- **THEN** nada muda em relação ao comportamento atual
- **AND** comando e repertório seguem resolvendo sozinhos

---

### Requirement: A IA sabe o que o bot sabe fazer

O prompt de conversa carrega a lista de ações do catálogo. Uma capacidade que
não está na lista não pode ser proposta, e uma que está não pode ficar de fora
do prompt.

#### Scenario: Cobertura do catálogo
- **GIVEN** o catálogo de intenções tem N tipos executáveis
- **WHEN** o prompt de conversa é montado
- **THEN** todos aparecem nele, descritos em linguagem de criança
- **AND** acrescentar um tipo novo ao catálogo sem citá-lo no prompt é falha de
  teste, não descuido silencioso

#### Scenario: Exemplo de conversa sem ação
- **GIVEN** o prompt está sendo montado
- **WHEN** os exemplos são incluídos
- **THEN** há exemplo de pedido virando ação **e** de conversa não virando nada
- **AND** há exemplo de pedido impossível (construir casa) sem ação

---

## MODIFIED

### Requirement: Interpretação de comando em linguagem natural

Quando o parser determinístico não reconhece a mensagem do dono, a IA responde
**e**, se for pedido, propõe a ação — numa chamada só, validada contra um
catálogo fechado antes de virar efeito.

> Antes eram duas chamadas separadas, uma para falar e outra para interpretar. A
> segunda nunca acontecia: `route()` sempre devolvia uma fala, e o caminho de
> interpretação em `onChat` só rodava com fala **e** intenção nulas — combinação
> impossível enquanto `nao_entendi` existir no repertório. O pedido livre nunca
> virou ação em jogo.

#### Scenario: Pedido livre interpretado com sucesso
- **GIVEN** o dono digita `dudu, pega umas madeiras pra mim`
- **AND** o parser determinístico não reconhece o padrão
- **THEN** a IA é chamada com saída estruturada de fala + ação
- **AND** devolve ação `{ "type": "COLLECT_BLOCK", "params": { "block": "oak_log", "count": 4 } }`
- **AND** a ação é validada contra o schema antes de virar efeito
- **AND** o bot fala antes de começar a agir

#### Scenario: IA devolve intenção fora do catálogo
- **GIVEN** a IA devolve `{ "type": "BUILD_HOUSE", "params": {} }` como ação
- **WHEN** a validação de schema roda
- **THEN** a ação é rejeitada
- **AND** nenhuma ação de mundo é executada
- **AND** a fala da IA é dita normalmente

#### Scenario: IA devolve JSON malformado
- **GIVEN** a IA devolve texto que não faz parse
- **WHEN** a resposta é processada
- **THEN** o erro é registrado e nenhuma ação acontece
- **AND** o bot fala algo amigável em vez de ficar mudo
- **AND** o bot não trava nem cai

#### Scenario: Conversa não vira ação
- **GIVEN** o dono digita `dudu, você gosta de diamante?`
- **WHEN** a mensagem é roteada
- **THEN** ela é tratada como conversa
- **AND** nenhuma ação é executada

---

## REMOVED

### Requirement: Chamada separada de interpretação

O segundo caminho de inferência — `MessageRouter.interpret`, `AiLayer.interpret`,
`LlmProvider.interpret` e `buildInterpretPrompt` — deixa de existir.

**Motivo:** era inalcançável. `route()` nunca devolve fala e intenção nulas ao
mesmo tempo, que era a única condição em que `onChat` chamava `interpret()`.
Toda a máquina estava construída, testada e especificada, e nunca rodou em jogo
— foi exatamente por isso que a IA respondia sem o bot agir.

Os cenários que ele sustentava não se perdem: migraram para "Interpretação de
comando em linguagem natural", agora servida pela chamada única.

Manter os dois caminhos custaria dois prompts para manter e duas chances de o
provider falhar por uma pergunta só.
