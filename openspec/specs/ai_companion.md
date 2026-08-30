# Especificação: Companheiro com IA (comportamento)

**Componente:** `ai_companion`
**Origem:** `add-minecraft-companion-bot` (2026-08-15)
**Atualizado por:** `add-open-door`, `ai-reply-with-action` (2026-08-19)

> Este arquivo é **agnóstico de provider**: "o provider" significa a
> implementação ativa de `LlmProvider` — Ollama local ou Gemini na nuvem. Todo
> cenário aqui vale igual para os dois. A escolha, a configuração e as
> particularidades de cada um estão em `llm_provider.md`.

---

## Requisitos

### Requirement: Conversa natural no chat

> **2026-08-30:** o bloco de situação do mundo passou a incluir **a mochila**.
> Ele mandava vida, fome, posição, hora e monstros — e não mandava o que o bot
> está carregando. Era isso que fazia a IA responder no escuro: em 20/08 ela
> disse *"isso eu não sei ver"* sobre o inventário, que o snapshot já carregava.
>
> Só os cinco maiores itens entram, e mochila vazia é dita como `nada` em vez de
> sumir — campo que some deixa quem lê sem saber se está vazio ou se quebrou.

Mensagens do dono que não são comandos **nem foram resolvidas pelo repertório
local** viram conversa com IA: o provider de IA gera a resposta a partir da persona, da
memória curta e do estado atual do mundo.

> O provider de IA é o **nível 3** da cascata. A ordem completa e o critério de
> encaminhamento estão em `local_dialogue.md`.

#### Scenario: Bate-papo simples
- **GIVEN** o bot está conectado e o dono é `"Miguel"`
- **AND** o repertório local não atingiu o limiar de confiança para a mensagem
- **WHEN** o dono digita no chat `dudu, tá gostando daqui?`
- **THEN** o bot chama o provider com persona + memória + snapshot do mundo
- **AND** responde no chat em português, dentro do limite de caracteres
- **AND** a troca entra na memória curta

#### Scenario: Resposta consciente do contexto do mundo
- **GIVEN** é noite no jogo e há um creeper a 8 blocos do bot
- **WHEN** o dono pergunta `dudu, tá tudo bem aí?`
- **THEN** o system prompt inclui a hora do dia e os hostis próximos
- **AND** a resposta pode mencionar a noite ou o creeper

---

### Requirement: Memória curta de conversa

O bot lembra das últimas trocas dentro da sessão, com janela limitada.

#### Scenario: Referência a mensagem anterior
- **GIVEN** o dono disse `meu nome favorito de cachorro é Bolinha` há duas mensagens
- **WHEN** o dono pergunta `qual nome eu falei?`
- **THEN** a memória curta enviada ao provider contém a troca anterior
- **AND** o bot responde `Bolinha`

#### Scenario: Janela de memória cheia
- **GIVEN** a janela está configurada para 10 trocas e já tem 10
- **WHEN** uma nova troca acontece
- **THEN** a troca mais antiga é descartada
- **AND** a janela permanece com 10

#### Scenario: Memória sobrevive ao reinício no mesmo dia
- **GIVEN** o bot tem histórico de conversa gravado hoje
- **WHEN** o processo do bot é reiniciado no mesmo dia
- **THEN** a janela curta é reconstruída a partir do arquivo do dia
- **AND** o bot retoma a conversa com contexto
  (persistência especificada em `conversation_memory.md`)

#### Scenario: Contexto não atravessa dias
- **GIVEN** o bot conversou muito ontem
- **WHEN** ele inicializa hoje
- **THEN** a memória curta começa vazia
- **AND** o arquivo de ontem permanece em disco, sem entrar no contexto

---

### Requirement: Interpretação de comando em linguagem natural

Quando o parser determinístico não reconhece a mensagem do dono, o provider a
traduz em uma intenção estruturada, validada contra um catálogo fechado.

Desde `ai-reply-with-action` a IA responde **e**, se for pedido, propõe a ação —
numa chamada só.

> Antes eram duas chamadas separadas, uma para falar e outra para interpretar. A
> segunda nunca acontecia: `route()` sempre devolvia uma fala, e o caminho de
> interpretação em `onChat` só rodava com fala **e** intenção nulas — combinação
> impossível enquanto `nao_entendi` existir no repertório. O pedido livre nunca
> virou ação em jogo.

Desde `add-learned-commands` a IA **ensina de uma vez**: traduzida com sucesso
uma vez, aquela frase passa a ser atendida pelo nível 1.5 nas vezes seguintes.
Isso não afrouxa nada — a intenção continua passando pela validação do catálogo
fechado antes de virar efeito, tanto na primeira vez quanto no replay.

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
- **THEN** ela é tratada como conversa, não como comando
- **AND** nenhuma intenção de ação é gerada

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

### Requirement: Isolamento de falhas da IA

Falha, lentidão ou estouro de cota do provider de IA degrada só a conversa — nunca
derruba o bot nem bloqueia os comandos determinísticos.

#### Scenario: Timeout da API
- **GIVEN** o provider não responde dentro do seu timeout
- **WHEN** o timeout dispara
- **THEN** o bot envia uma resposta de fallback (ex.: `deu um branco aqui, repete?`)
- **AND** permanece conectado e responsivo

#### Scenario: Circuito aberto após falhas seguidas
- **GIVEN** as 3 últimas chamadas ao provider falharam
- **WHEN** chega uma nova mensagem de conversa
- **THEN** o circuit breaker está aberto e a chamada é pulada
- **AND** o bot usa respostas de fallback
- **AND** tenta a API de novo depois do período de recuperação

#### Scenario: Comandos continuam funcionando com IA fora do ar
- **GIVEN** o circuit breaker do provider está aberto
- **WHEN** o dono digita `dudu, me segue`
- **THEN** o parser determinístico reconhece e o bot entra em `FOLLOW` normalmente

#### Scenario: Conversa continua pelo repertório com IA fora do ar
- **GIVEN** o circuit breaker do provider está aberto
- **WHEN** o dono digita `oi`, `quem te criou?` e `o que você sabe fazer?`
- **THEN** as três são respondidas normalmente pelo repertório local
- **AND** o jogador não percebe degradação nessas interações

#### Scenario: Sem IA e sem match no repertório
- **GIVEN** o circuit breaker do provider está aberto
- **WHEN** o dono faz uma pergunta que o repertório não cobre
- **THEN** o bot responde com a entrada `nao_entendi` do repertório
- **AND** permanece conectado e responsivo

---

### Requirement: Controle de custo e taxa

Chamadas ao provider de IA são limitadas por taxa. Com provider de nuvem isso
contém custo; com provider local, contém a carga na máquina que também está
rodando o Minecraft. Em ambos, evita spam.

Desde `add-learned-commands` existe uma segunda economia, **anterior** ao limite
de taxa: pedido repetido não chega ao provider. O nível 1.5 atende pelo histórico
de comandos aprendidos, e o limite passa a ser gasto só com o que é novo.

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

## Descontinuado

### Requirement: Memória exclusivamente volátil (removido: 2026-08-15)

O cenário "Memória não sobrevive à sessão" saiu com a chegada da persistência
em disco. A memória continua volátil **entre dias**, mas não mais entre
reinícios do mesmo dia. Ver `conversation_memory.md`.

Removido pelo change `add-minecraft-companion-bot`.

---

### Requirement: A IA sabe abrir porta
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

## Descontinuado

### Requirement: Chamada separada de interpretação (removido: 2026-08-19)

O segundo caminho de inferência — `MessageRouter.interpret`, `AiLayer.interpret`,
`LlmProvider.interpret` e `buildInterpretPrompt` — deixou de existir em
`ai-reply-with-action`.

**Motivo:** era inalcançável. `route()` nunca devolve fala e intenção nulas ao
mesmo tempo, que era a única condição em que `onChat` chamava `interpret()`. Toda
a máquina estava construída, testada e especificada, e nunca rodou em jogo — foi
exatamente por isso que a IA respondia sem o bot agir.

Os cenários que ele sustentava não se perderam: migraram para *Interpretação de
comando em linguagem natural*, agora servida pela chamada única.
