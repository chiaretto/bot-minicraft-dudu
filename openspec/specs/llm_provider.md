# Especificação: Provider de IA

**Componente:** `llm_provider`
**Origem:** `add-minecraft-companion-bot` (2026-08-15)
**Ampliado por:** `add-claude-code-provider` (2026-08-29) — provider Claude Code

> Este arquivo cobre **de onde vem** a inferência. O *comportamento* de conversa
> e interpretação continua em `ai_companion.md`, que é agnóstico de provider.
>
> Cenário alvo assumido: **o modelo local roda no mesmo PC do Minecraft.**
> Isso condiciona as recomendações de tamanho e os limites de concorrência.

---

## Requisitos

### Requirement: Interface única de provider

Toda inferência passa por uma interface `LlmProvider`. O resto do bot não sabe
qual implementação está ativa. Os nomes válidos são
`'ollama' | 'gemini' | 'claude' | 'none'`.

A regra que dá sentido a ela: **nenhum código fora de `src/ai/providers/` pode
referenciar Ollama, Gemini ou o Agent SDK do Claude Code**. É o que mantém a
troca de provider sendo uma linha de configuração — e o que torna cada provider
removível sem tocar no resto.

A interface tem três métodos: `converse()`, `warmUp(identity?)` e um `stop?()`
opcional. `stop()` existe porque um provider pode segurar recurso vivo (o Claude
Code segura um subprocesso); Ollama e Gemini não implementam.

```ts
interface LlmProvider {
  readonly name: 'ollama' | 'gemini'
  converse(ctx: ConversationContext): Promise<string>
  interpret(text: string, ctx: ConversationContext): Promise<Intent>
  warmUp(): Promise<void>
}
```

#### Scenario: Camadas superiores não conhecem o provider
- **GIVEN** o roteador da cascata precisa de uma resposta de IA
- **WHEN** ele chama o nível 3
- **THEN** ele chama `LlmProvider.converse()`
- **AND** nenhum código fora de `src/ai/providers/` referencia Ollama ou Gemini

#### Scenario: Troca de provider sem alterar código
- **GIVEN** o bot está rodando com `llm.provider: "ollama"`
- **WHEN** a config muda para `llm.provider: "gemini"` e o bot reinicia
- **THEN** todo o comportamento de conversa e interpretação continua idêntico
- **AND** nenhum arquivo fora de config precisou mudar

---

### Requirement: Provider Ollama (local)

Implementação que fala com um servidor Ollama por HTTP.

#### Scenario: Conversa com modelo local
- **GIVEN** `llm.provider: "ollama"`, `llm.ollama.baseUrl: "http://localhost:11434"`
  e `llm.ollama.model: "qwen3:4b"`
- **WHEN** o nível 3 precisa responder uma mensagem
- **THEN** o bot chama o endpoint de chat do Ollama com o modelo configurado
- **AND** a resposta é enviada ao chat do jogo
- **AND** nenhuma requisição sai da máquina

#### Scenario: Interpretação com schema forçado
- **GIVEN** o provider Ollama está ativo
- **WHEN** `interpret()` é chamado
- **THEN** o JSON Schema de `Intent` é enviado no parâmetro de formato estruturado
- **AND** a saída é validada contra o schema antes de virar ação
- **AND** saída inválida vira `UNKNOWN`, igual ao provider de nuvem

#### Scenario: Servidor Ollama fora do ar
- **GIVEN** `llm.provider: "ollama"` e o `ollama serve` não está rodando
- **WHEN** o bot inicializa
- **THEN** o bot registra o erro com instrução acionável
  (ex.: `Ollama inacessível em http://localhost:11434 — rode 'ollama serve'`)
- **AND** o bot **inicia mesmo assim**, operando por comandos e repertório
- **AND** não fica em loop de tentativa bloqueando o chat

#### Scenario: Modelo não baixado
- **GIVEN** `llm.ollama.model` aponta para um modelo que não foi puxado
- **WHEN** o bot faz a primeira chamada
- **THEN** o erro é registrado citando o comando de correção
  (ex.: `modelo 'qwen3:4b' não encontrado — rode 'ollama pull qwen3:4b'`)
- **AND** o bot continua funcionando pelos níveis 1 e 2

#### Scenario: Servidor Ollama em outra máquina
- **GIVEN** `llm.ollama.baseUrl: "http://192.168.0.20:11434"`
- **WHEN** o bot precisa de inferência
- **THEN** a chamada vai para essa máquina da rede local
- **AND** o comportamento é idêntico ao de localhost

---

### Requirement: Provider Gemini (nuvem)

A implementação de nuvem continua disponível, agora atrás da mesma interface.

#### Scenario: Conversa com Gemini
- **GIVEN** `llm.provider: "gemini"` e `GEMINI_API_KEY` está no ambiente
- **WHEN** o nível 3 precisa responder
- **THEN** o bot chama a API do Gemini
- **AND** o `responseSchema` nativo é usado em `interpret()`

#### Scenario: Chave exigida só quando o provider é Gemini
- **GIVEN** `llm.provider: "ollama"`
- **AND** `GEMINI_API_KEY` não está definida
- **WHEN** o bot inicializa
- **THEN** o bot inicia normalmente
- **AND** não reclama da chave ausente

#### Scenario: Chave ausente com Gemini selecionado
- **GIVEN** `llm.provider: "gemini"` e `GEMINI_API_KEY` não está definida
- **WHEN** o bot inicializa
- **THEN** o bot recusa iniciar
- **AND** exibe `provider 'gemini' exige a variável GEMINI_API_KEY`

---

### Requirement: Provider Claude Code (assinatura)

O provider `claude` fala com o Claude pelo **Agent SDK**
(`@anthropic-ai/claude-agent-sdk`) rodando localmente, autenticado pela
**credencial da assinatura** — não por chave de API cobrada por token.

A escolha do SDK é consequência da credencial, não preferência de arquitetura: a
Messages API seria mais rápida e mais simples, e está fora porque só aceita chave
de API. É isso que justifica todo o requisito de escopo mínimo abaixo.

#### Scenario: Responder pela assinatura, sem chave de API
- **GIVEN** `llm.provider` é `'claude'`
- **AND** a credencial da assinatura está disponível
- **AND** nenhuma chave de API da Anthropic está configurada
- **WHEN** a criança fala algo que a cascata leva até a IA
- **THEN** o bot responde no chat
- **AND** a resposta traz fala e, quando cabe, ação validada

#### Scenario: Credencial ausente não impede o bot de subir
- **GIVEN** `llm.provider` é `'claude'`
- **AND** a variável de ambiente da credencial não está definida
- **WHEN** o bot inicia
- **THEN** ele sobe assim mesmo
- **AND** avisa no log, nomeando a variável e o comando que a gera
- **AND** tenta usar o login do Claude Code já feito na máquina

> Diferente do Gemini, aqui a ausência da variável **não** é erro: o SDK também
> aceita o login existente na máquina. Falhar recusaria uma configuração que
> funciona.

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
latência — a coisa exata que o provider existe para evitar.

#### Scenario: Nenhuma ferramenta é oferecida ao modelo
- **GIVEN** o provider `claude` está montando uma requisição
- **WHEN** as opções são construídas
- **THEN** o conjunto base de ferramentas embutidas está vazio
- **AND** o modelo não recebe Read, Write, Edit, Bash, Glob, Grep, WebSearch nem
  WebFetch
- **AND** nenhuma chamada de ferramenta aparece no log durante uma conversa

> A opção que desliga ferramenta é a que declara o **conjunto base**, não a de
> auto-aprovação: a lista de auto-aprovação já é vazia por padrão e mesmo assim
> deixa a ferramenta no contexto do modelo.
>
> Isto não é ajuste de performance: é o que mantém a regra de que a IA **nunca**
> executa efeito direto.

#### Scenario: A configuração do repositório não entra no prompt
- **GIVEN** o repositório tem um `CLAUDE.md` na raiz
- **WHEN** o provider monta uma requisição
- **THEN** as fontes de configuração em disco estão explicitamente vazias
- **AND** o conteúdo do `CLAUDE.md` não faz parte do prompt enviado

#### Scenario: O prompt é o do bot, não o do Claude Code
- **GIVEN** o provider está montando uma requisição
- **WHEN** o system prompt é definido
- **THEN** ele é o do projeto, com a persona, o catálogo de ação e a regra
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

#### Scenario: Sem raciocínio estendido
- **GIVEN** o provider está montando uma requisição
- **WHEN** as opções são construídas
- **THEN** o raciocínio estendido está desligado

#### Scenario: Modelo rápido por padrão
- **GIVEN** a configuração não diz o contrário
- **WHEN** o provider é construído
- **THEN** o modelo é o mais rápido da família (`claude-haiku-4-5`)
- **AND** o modelo pode ser trocado pela configuração

---

### Requirement: Sessão viva

O Agent SDK sobe um subprocesso. Pagar essa subida a cada fala da criança domina
qualquer ganho de escolher um modelo rápido — medido nesta máquina, **~14 s de
subida contra ~1,6 s de resposta com a sessão de pé**. É a diferença entre uma
resposta e um silêncio que a criança lê como "travou".

Por isso o provider mantém **uma sessão viva** e manda as falas por ela. É o
primeiro provider do projeto **com estado**: os outros são sem estado, e cada
chamada neles é independente.

#### Scenario: O subprocesso sobe no aquecimento
- **GIVEN** `llm.provider` é `'claude'` e o aquecimento está ligado
- **WHEN** o bot inicia
- **THEN** a sessão é criada e o subprocesso sobe durante o aquecimento
- **AND** a primeira fala da criança não paga a subida do processo

> Criar a sessão não basta: o SDK só sobe o processo na primeira mensagem. O
> aquecimento manda uma fala descartável justamente para forçar a subida.

#### Scenario: A sessão aquecida é a que atende
- **GIVEN** o aquecimento terminou
- **WHEN** a criança fala pela primeira vez
- **THEN** a fala é atendida pela sessão que já estava de pé
- **AND** essa sessão já tem a persona, o catálogo de ação e a regra número um

> O system prompt é fixado na criação da sessão. Uma sessão aquecida com prompt
> genérico e depois descartada jogaria o aquecimento fora; pior, se fosse
> reusada, o bot passaria a conversa inteira respondendo como assistente
> genérico. Por isso o aquecimento recebe a identidade do bot.

#### Scenario: Falas seguidas reaproveitam a sessão
- **GIVEN** a sessão está viva
- **WHEN** a criança fala duas vezes seguidas
- **THEN** nenhum processo novo é criado para a segunda fala
- **AND** a segunda resposta não é mais lenta que a primeira

#### Scenario: O estado do mundo acompanha a fala, não a sessão
- **GIVEN** a sessão foi criada há algum tempo
- **WHEN** a criança fala
- **THEN** o estado atual do mundo vai junto da mensagem
- **AND** o bot não responde sobre o mundo do momento em que a sessão nasceu

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

O provider entrega ao SDK o mesmo schema de resposta que Ollama e Gemini já
usam, e lê a resposta estruturada que volta — a garantia de formato é a mesma dos
outros providers, não uma versão mais frouxa.

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

#### Scenario: Texto que não é o formato vira só fala
- **GIVEN** o modelo devolveu texto fora do formato pedido
- **WHEN** a resposta é lida
- **THEN** o texto vira a fala do bot
- **AND** nenhuma ação é executada
- **AND** nenhuma mensagem de erro chega ao chat

---

### Requirement: Resiliência compartilhada entre providers

Timeout, retry e circuit breaker são um decorador único aplicado sobre qualquer
provider — não são reimplementados em cada um.

#### Scenario: Mesma política para os dois
- **GIVEN** qualquer provider ativo
- **WHEN** ele falha 3 vezes seguidas
- **THEN** o circuit breaker abre
- **AND** o bot passa a responder pelo repertório, como já especificado

#### Scenario: Timeout por provider
- **GIVEN** `llm.ollama.timeoutMs: 12000` e `llm.gemini.timeoutMs: 5000`
- **WHEN** o provider ativo estoura seu próprio timeout
- **THEN** a chamada é abortada e o fallback do repertório assume

#### Scenario: Modelo local é mais lento por padrão
- **GIVEN** nenhum timeout foi configurado
- **WHEN** o bot inicializa
- **THEN** o padrão para Ollama é 12000 ms e para Gemini 5000 ms
- **AND** a diferença é documentada no `config.example.yaml`

---

### Requirement: Fala de espera

Modelo local na mesma máquina do jogo demora. O bot não pode parecer travado.

#### Scenario: Resposta demorando
- **GIVEN** o provider ativo ainda não respondeu depois de `llm.fillerAfterMs` (padrão 2000 ms)
- **WHEN** o limite é atingido
- **THEN** o bot envia uma fala curta de espera vinda do repertório
  (ex.: `deixa eu pensar...`)
- **AND** a resposta real é enviada quando chegar

#### Scenario: Resposta rápida não gera fala de espera
- **GIVEN** o provider respondeu em 800 ms
- **WHEN** a resposta é enviada
- **THEN** nenhuma fala de espera foi emitida

#### Scenario: Fala de espera não vira spam
- **GIVEN** o bot já emitiu uma fala de espera para a mensagem atual
- **WHEN** a resposta continua demorando
- **THEN** nenhuma segunda fala de espera é emitida para a mesma mensagem

---

### Requirement: Convivência com o Minecraft na mesma máquina

O bot não pode degradar o jogo que ele deveria tornar mais divertido.

#### Scenario: Uma inferência por vez
- **GIVEN** uma chamada ao provider está em andamento
- **WHEN** o dono manda outra mensagem que também exigiria IA
- **THEN** a segunda chamada **não** é disparada em paralelo
- **AND** ela é enfileirada ou descartada com resposta do repertório,
  conforme `llm.queueBehavior`

#### Scenario: Aquecimento na inicialização
- **GIVEN** `llm.provider: "ollama"` e `llm.warmUpOnStart` é `true`
- **WHEN** o bot inicializa
- **THEN** uma chamada mínima é feita para carregar o modelo na memória
- **AND** a primeira conversa real não paga o custo de carregamento

#### Scenario: Modelo mantido carregado
- **GIVEN** `llm.ollama.keepAlive: "30m"`
- **WHEN** as chamadas são feitas
- **THEN** esse valor é repassado ao Ollama
- **AND** o modelo não é descarregado entre uma conversa e outra da mesma sessão

#### Scenario: Defesa nunca espera pela IA
- **GIVEN** uma inferência local está em andamento e consumindo a máquina
- **WHEN** um hostil ataca o dono
- **THEN** o bot entra em `DEFEND` imediatamente
- **AND** a inferência em curso não atrasa nem bloqueia o combate

---

### Requirement: Fallback entre providers (opt-in)

O provider primário pode ter um reserva, desligado por padrão. Qualquer provider
pode ser primário ou reserva — inclusive `claude`, dos dois lados.

Duas nuvens de **fornecedores diferentes** deixam de fazer da cota de um só um
ponto único de falha.

#### Scenario: Nuvem primária com outra nuvem de reserva
- **GIVEN** `llm.provider: "claude"` e `llm.fallbackProvider: "gemini"`
- **WHEN** o Claude falha, estoura o timeout ou esgota a cota
- **THEN** a fala é atendida pelo Gemini
- **AND** a criança não percebe a troca

> Aqui o fallback não muda a privacidade — o primário já é de nuvem. Muda a
> resiliência: cota estourada de um fornecedor não deixa a criança sem bot.

#### Scenario: Fallback desligado por padrão
- **GIVEN** `config.yaml` não define `llm.fallbackProvider`
- **WHEN** o provider primário falha
- **THEN** nenhum outro provider é acionado
- **AND** o bot cai para o repertório

#### Scenario: Fallback local → nuvem
- **GIVEN** `llm.provider: "ollama"` e `llm.fallbackProvider: "gemini"`
- **WHEN** o Ollama falha ou estoura o timeout
- **THEN** a mesma requisição é tentada no Gemini
- **AND** a troca é registrada no log

#### Scenario: Aviso explícito de privacidade ao ativar o fallback de nuvem
- **GIVEN** o provider primário é local e o fallback é de nuvem
- **WHEN** o bot inicializa
- **THEN** um aviso é registrado deixando claro que, na falha do local, as
  mensagens do jogador passam a ser enviadas para fora da máquina
- **AND** o `config.example.yaml` documenta essa consequência junto do campo
- **AND** o aviso vale para **qualquer** fallback de nuvem, não para um provider
  em particular

#### Scenario: Origem registrada no histórico
- **GIVEN** uma resposta veio do provider de fallback
- **WHEN** a troca é gravada no histórico do dia
- **THEN** a linha registra qual provider respondeu de fato

---

### Requirement: Configuração do provider

O bloco `llm` da configuração concentra a escolha.

#### Scenario: Valores padrão
- **GIVEN** `config.yaml` não traz o bloco `llm`
- **WHEN** o bot inicializa
- **THEN** vale o padrão: `provider: "ollama"`,
  `ollama: { baseUrl: "http://localhost:11434", model: "qwen3:4b",
  timeoutMs: 12000, keepAlive: "30m" }`, `fallbackProvider: null`,
  `warmUpOnStart: true`, `fillerAfterMs: 2000`, `queueBehavior: "repertoire"`

#### Scenario: Provider desconhecido
- **GIVEN** `llm.provider: "chatgpt"`
- **WHEN** a config é validada
- **THEN** o bot recusa iniciar
- **AND** lista os providers suportados

#### Scenario: Bot totalmente sem IA
- **GIVEN** `llm.provider: "none"`
- **WHEN** o bot inicializa
- **THEN** o nível 3 da cascata é desativado
- **AND** o bot funciona só com comandos e repertório
- **AND** mensagens sem match recebem a entrada `nao_entendi`

---

# Apêndice: Recomendação de modelo (mesmo PC do Minecraft)

O modelo disputa CPU, RAM e GPU com o jogo. Por isso a recomendação é
conservadora — e ela só funciona porque o repertório local já absorve a maior
parte das falas, deixando para a IA apenas a cauda imprevisível.

| Modelo | VRAM (Q4) | Português | Quando usar |
|---|---|---|---|
| `llama3.2:3b` | ~2 GB | razoável | Máquina apertada, GPU fraca |
| **`qwen3:4b`** | ~2,5 GB | bom | **Padrão recomendado** |
| `gemma3:4b` | ~3 GB | bom | Alternativa direta ao padrão |
| `qwen3:8b` | ~5 GB | muito bom | GPU com folga (≥ 8 GB) e sem shaders pesados |

Diretrizes que a implementação deve documentar no README:

- **Abaixo de 3B não vale.** Em português esses modelos quebram a persona e
  alucinam com frequência que uma criança percebe.
- **Shaders pesados + LLM na mesma GPU = engasgo.** Se o jogo travar, primeiro
  reduza o modelo, depois considere CPU-only.
- **CPU-only é viável com 3-4B**, custando 2-4 s por resposta. Cabe no timeout de
  12 s, mas torna a fala de espera essencial.
- **Melhor cenário, se existir:** rodar o Ollama em outra máquina da casa e
  apontar `baseUrl` para ela. Zero disputa de recurso, e permite um modelo maior.
- O catálogo de modelos muda rápido; o README deve mandar conferir
  `ollama.com/library` em vez de fixar essa tabela como verdade eterna.
