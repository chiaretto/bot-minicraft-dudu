# Delta: Provider de IA Plugável (local ou nuvem)

**Change ID:** `add-minecraft-companion-bot`
**Affects:** `src/ai/`, `src/config/`

> Este arquivo cobre **de onde vem** a inferência. O *comportamento* de conversa
> e interpretação continua em `ai_companion_delta.md`, que é agnóstico de provider.
>
> Cenário alvo assumido: **o modelo local roda no mesmo PC do Minecraft.**
> Isso condiciona as recomendações de tamanho e os limites de concorrência.

---

## ADDED

### Requirement: Interface única de provider

Toda inferência passa por uma interface `LlmProvider`. O resto do bot não sabe
qual implementação está ativa.

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

O provider primário pode ter um reserva, desligado por padrão.

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

## MODIFIED

### Requirement: Segredos apenas por variável de ambiente

A exigência de `GEMINI_API_KEY` deixa de ser incondicional. Ela passa a ser
obrigatória **apenas** quando o provider ativo (primário ou de fallback) é o
Gemini. A regra de nunca aceitar segredo no `config.yaml` continua valendo
integralmente.

#### Scenario: Setup local não precisa de segredo nenhum
- **GIVEN** `llm.provider: "ollama"` e `llm.fallbackProvider: null`
- **WHEN** o bot inicializa sem nenhum `.env`
- **THEN** o bot inicia normalmente
- **AND** nenhuma variável de ambiente de IA é exigida

---

## REMOVED

(Nenhum)

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
