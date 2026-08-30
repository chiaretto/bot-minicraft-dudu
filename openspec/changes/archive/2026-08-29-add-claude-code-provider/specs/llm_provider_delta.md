# Delta: Provider de IA (`llm_provider`)

**Change ID:** `add-claude-code-provider`
**Affects:** `src/ai/providers/claude.ts` (novo), `src/ai/provider.ts`,
`src/ai/index.ts`

---

## ADDED

### Requirement: Provider Claude Code (assinatura)

Um terceiro provider, `claude`, fala com o Claude pelo **Agent SDK**
(`@anthropic-ai/claude-agent-sdk`) rodando localmente, autenticado pela
**credencial da assinatura** gerada com `claude setup-token` — não por chave de
API cobrada por token.

Como todo provider, ele mora atrás da interface `LlmProvider` e é o único arquivo
do projeto que conhece o SDK.

#### Scenario: Responder pela assinatura, sem chave de API
- **GIVEN** `llm.provider` é `'claude'`
- **AND** a credencial da assinatura está no ambiente
- **AND** nenhuma chave de API da Anthropic está configurada
- **WHEN** a criança fala algo que a cascata leva até a IA
- **THEN** o bot responde no chat
- **AND** a resposta traz fala e, quando cabe, ação validada

#### Scenario: Credencial ausente é erro de startup acionável
- **GIVEN** `llm.provider` é `'claude'`
- **AND** a credencial da assinatura não está no ambiente
- **WHEN** o bot inicia
- **THEN** ele falha com mensagem que nomeia a variável esperada
- **AND** a mensagem diz o comando que a gera (`claude setup-token`)

#### Scenario: A credencial nunca aparece
- **GIVEN** o provider está ativo
- **WHEN** qualquer erro do SDK é registrado no log
- **THEN** o valor da credencial não aparece em lugar nenhum da mensagem

---

### Requirement: Escopo mínimo do harness

O Agent SDK é o harness do Claude Code: loop de agente, ferramentas de arquivo e
bash, subagentes, leitura de configuração do disco. Para responder uma frase no
chat do Minecraft **nada disso serve**, e tudo custa token e tempo.

O provider é obrigado a desligar cada peça. Isto é **requisito, não recomendação
de configuração**: esquecer um item devolve o harness inteiro, e o sintoma é
latência — a coisa exata que a mudança existe para evitar.

#### Scenario: Nenhuma ferramenta é oferecida ao modelo
- **GIVEN** o provider `claude` está montando uma requisição
- **WHEN** as opções são construídas
- **THEN** o conjunto de ferramentas embutidas está vazio
- **AND** o modelo não recebe Read, Write, Edit, Bash, Glob, Grep, WebSearch nem
  WebFetch
- **AND** nenhuma chamada de ferramenta aparece no log durante uma conversa

> A opção que desliga ferramenta é a que declara o **conjunto base**, não a de
> auto-aprovação: a lista de auto-aprovação já é vazia por padrão e mesmo assim
> deixa a ferramenta no contexto do modelo.

#### Scenario: A configuração do repositório não entra no prompt
- **GIVEN** o repositório tem um `CLAUDE.md` na raiz
- **WHEN** o provider monta uma requisição
- **THEN** as fontes de configuração em disco estão explicitamente vazias
- **AND** o conteúdo do `CLAUDE.md` não faz parte do prompt enviado

#### Scenario: O prompt é o do bot, não o do Claude Code
- **GIVEN** o provider está montando uma requisição
- **WHEN** o system prompt é definido
- **THEN** ele é o do projeto (`buildConversePrompt`), com a persona e a regra
  número um
- **AND** o preset de agente de código do Claude Code não é usado

#### Scenario: Uma fala, uma resposta
- **GIVEN** o provider está montando uma requisição
- **WHEN** o número de turnos é definido
- **THEN** ele permite exatamente uma fala do jogador e uma resposta do bot,
  e nada além disso
- **AND** nenhum servidor MCP é carregado

> Medido: o SDK conta a fala e a resposta como **dois** turnos. Um limite de 1
> estoura em `error_max_turns`, derruba o aquecimento e, de vez em quando, uma
> fala no meio da conversa — que então paga a subida de uma sessão nova.

#### Scenario: Modelo rápido por padrão
- **GIVEN** a configuração não diz o contrário
- **WHEN** o provider é construído
- **THEN** o modelo é `claude-haiku-4-5`
- **AND** o modelo pode ser trocado pela configuração

---

### Requirement: Sessão viva

O Agent SDK sobe um subprocesso. Pagar essa subida a cada fala da criança domina
qualquer ganho de escolher um modelo rápido — é a diferença entre uma resposta e
um silêncio que a criança lê como "travou".

Por isso o provider mantém **uma sessão viva** e manda as falas por ela. O
`warmUp()`, que existe desde o Ollama para carregar modelo antes de a criança
chegar, é o gancho que sobe o subprocesso.

#### Scenario: O subprocesso sobe no aquecimento
- **GIVEN** `llm.provider` é `'claude'` e o aquecimento está ligado
- **WHEN** o bot inicia
- **THEN** a sessão é criada durante o `warmUp()`
- **AND** a primeira fala da criança não paga a subida do processo

#### Scenario: Falas seguidas reaproveitam a sessão
- **GIVEN** a sessão está viva
- **WHEN** a criança fala duas vezes seguidas
- **THEN** nenhum processo novo é criado para a segunda fala
- **AND** a segunda resposta não é mais lenta que a primeira

#### Scenario: Falha de aquecimento não impede o bot de subir
- **GIVEN** a sessão não consegue ser criada no startup
- **WHEN** o bot inicia
- **THEN** ele sobe assim mesmo
- **AND** avisa no log que a IA está indisponível
- **AND** comandos e repertório continuam funcionando

#### Scenario: Sessão morta é resubida sozinha
- **GIVEN** a sessão morreu entre uma fala e outra
- **WHEN** a criança fala
- **THEN** o provider sobe uma sessão nova e atende
- **AND** a criança não vê mensagem técnica nenhuma

#### Scenario: Falha persistente cai para o repertório
- **GIVEN** a sessão não consegue ser recriada
- **WHEN** a criança fala
- **THEN** o provider devolve erro à camada de resiliência
- **AND** a cascata responde pelo repertório, com fala de criança

#### Scenario: Sessão é reciclada antes de envelhecer demais
- **GIVEN** a sessão passou do limite de idade ou de falas da configuração
- **WHEN** a criança fala de novo
- **THEN** o provider recicla a sessão
- **AND** a troca é invisível para a criança

#### Scenario: Nenhum subprocesso órfão
- **GIVEN** o bot está rodando com a sessão viva
- **WHEN** o bot é encerrado
- **THEN** a sessão é encerrada junto
- **AND** nenhum subprocesso do Claude Code sobra na máquina

---

### Requirement: Fala e ação com formato pedido

O provider entrega ao SDK o mesmo `REPLY_WITH_ACTION_JSON_SCHEMA` que Ollama e
Gemini já usam, e lê a resposta estruturada que volta — a garantia de formato é a
mesma dos outros providers, não uma versão mais frouxa.

O parser tolerante do projeto continua como rede. O pior caso precisa ser **bot
conversa e não age** — nunca erro no chat, nunca ação errada.

#### Scenario: Resposta bem formada vira fala e ação
- **GIVEN** o modelo devolveu fala e ação no formato pedido
- **WHEN** a resposta é lida
- **THEN** a fala vai para o chat
- **AND** a ação passa pela validação de intenção antes de virar efeito

#### Scenario: Resposta estruturada ausente cai para o texto
- **GIVEN** a resposta estruturada veio vazia
- **WHEN** a resposta é lida
- **THEN** o texto final é lido pelo parser tolerante
- **AND** o bot fala, mesmo sem ação

#### Scenario: Resposta em texto puro vira só fala
- **GIVEN** o modelo devolveu texto que não é o formato pedido
- **WHEN** a resposta é lida
- **THEN** o texto vira a fala do bot
- **AND** nenhuma ação é executada
- **AND** nenhuma mensagem de erro chega ao chat

#### Scenario: A IA continua sem executar efeito direto
- **GIVEN** o provider `claude` está ativo
- **WHEN** o modelo propõe uma ação
- **THEN** ela passa pela mesma validação de intenção dos outros providers
- **AND** o modelo não tem nenhum caminho para agir na máquina por conta própria

---

## MODIFIED

### Requirement: Interface única de provider

Continua valendo inteira, com um provider a mais: `ProviderName` passa a ser
`'ollama' | 'gemini' | 'claude' | 'none'`.

A regra que dá sentido a ela não muda de forma nenhuma — e ganha um caso a mais
para valer: **nenhum código fora de `src/ai/providers/` pode referenciar o Agent
SDK**, do mesmo jeito que nenhum referencia Ollama ou Gemini. É o que mantém a
troca de provider sendo uma linha de configuração, e o que torna esta mudança
reversível se a latência não se provar.

#### Scenario: Trocar para o Claude é uma linha
- **GIVEN** o bot está rodando com `provider: 'gemini'`
- **WHEN** a configuração passa a `provider: 'claude'` e o bot reinicia
- **THEN** a conversa continua funcionando pela mesma interface
- **AND** nenhum código fora de `ai/providers/` precisou mudar

#### Scenario: O SDK não vaza da fronteira
- **GIVEN** o código-fonte do projeto
- **WHEN** se procura por importação do Agent SDK
- **THEN** ela aparece só em `src/ai/providers/claude.ts`

---

### Requirement: Fallback entre providers (opt-in)

O mecanismo não muda; a lista de participantes ganha o `claude`, dos dois lados —
ele pode ser primário com o Gemini de rede, e pode ser a rede de outro.

Duas portas de nuvem de **fornecedores diferentes** deixam de fazer da cota de um
só um ponto único de falha.

#### Scenario: Claude primário com Gemini de rede
- **GIVEN** `provider: 'claude'` e `fallbackProvider: 'gemini'`
- **WHEN** o Claude falha ou estoura a cota
- **THEN** a fala é atendida pelo Gemini
- **AND** a criança não percebe a troca

#### Scenario: O aviso de privacidade continua valendo
- **GIVEN** o primário é local (`ollama`) e o fallback é de nuvem
- **WHEN** o bot inicia
- **THEN** o log avisa que, na falha do local, as mensagens da criança passam a
  sair da máquina
- **AND** o aviso vale para qualquer fallback de nuvem, `gemini` ou `claude`

---

## REMOVED

(Nenhum. O provider Gemini **continua**, como rede de segurança — a mudança troca
o padrão, não apaga a alternativa.)
