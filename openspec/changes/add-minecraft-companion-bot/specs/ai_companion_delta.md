# Delta: Companheiro com IA (comportamento)

**Change ID:** `add-minecraft-companion-bot`
**Affects:** `src/ai/`

> Este arquivo é **agnóstico de provider**: "o provider" significa a
> implementação ativa de `LlmProvider` — Ollama local ou Gemini na nuvem. Todo
> cenário aqui vale igual para os dois. A escolha, a configuração e as
> particularidades de cada um estão em `llm_provider_delta.md`.

---

## ADDED

### Requirement: Conversa natural no chat

Mensagens do dono que não são comandos **nem foram resolvidas pelo repertório
local** viram conversa com IA: o provider de IA gera a resposta a partir da persona, da
memória curta e do estado atual do mundo.

> O provider de IA é o **nível 3** da cascata. A ordem completa e o critério de
> encaminhamento estão em `local_dialogue_delta.md`.

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
  (persistência especificada em `conversation_memory_delta.md`)

#### Scenario: Contexto não atravessa dias
- **GIVEN** o bot conversou muito ontem
- **WHEN** ele inicializa hoje
- **THEN** a memória curta começa vazia
- **AND** o arquivo de ontem permanece em disco, sem entrar no contexto

---

### Requirement: Interpretação de comando em linguagem natural

Quando o parser determinístico não reconhece a mensagem do dono, o provider a
traduz em uma intenção estruturada, validada contra um catálogo fechado.

#### Scenario: Pedido livre interpretado com sucesso
- **GIVEN** o dono digita `dudu, pega umas madeiras pra mim`
- **AND** o parser determinístico não reconhece o padrão
- **THEN** o provider é chamado em modo de interpretação com saída JSON forçada
- **AND** devolve `{ "type": "COLLECT_BLOCK", "params": { "block": "oak_log", "count": 4 } }`
- **AND** a intenção é validada contra o schema antes de virar ação

#### Scenario: IA devolve intenção fora do catálogo
- **GIVEN** o provider devolve `{ "type": "BUILD_HOUSE", "params": {} }`
- **WHEN** a validação de schema roda
- **THEN** a intenção é rejeitada e vira `UNKNOWN`
- **AND** nenhuma ação de mundo é executada
- **AND** o bot responde no chat que não sabe fazer isso

#### Scenario: IA devolve JSON malformado
- **GIVEN** o provider devolve texto que não faz parse como JSON
- **WHEN** a interpretação é processada
- **THEN** o erro é registrado e a intenção vira `UNKNOWN`
- **AND** o bot pede ao dono para reformular
- **AND** o bot não trava nem cai

#### Scenario: Conversa não vira ação
- **GIVEN** o dono digita `dudu, você gosta de diamante?`
- **WHEN** a mensagem é roteada
- **THEN** ela é tratada como conversa, não como comando
- **AND** nenhuma intenção de ação é gerada

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

#### Scenario: Rajada de mensagens do jogador
- **GIVEN** o limite é de 10 chamadas por minuto
- **WHEN** o dono manda 20 mensagens em um minuto
- **THEN** no máximo 10 vão para o provider
- **AND** o excedente recebe uma resposta de fallback pedindo calma

---

## MODIFIED

(Nenhum — projeto novo.)

## REMOVED

(Nenhum)
