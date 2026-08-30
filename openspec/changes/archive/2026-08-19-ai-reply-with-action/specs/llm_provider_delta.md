# Delta: Provider de IA

**Change ID:** `ai-reply-with-action`
**Affects:** `src/ai/provider.ts`, `src/ai/providers/{ollama,gemini,none}.ts`,
`src/ai/resilient.ts`, `src/ai/index.ts`

> Requisito de outro componente (`llm_provider`). Ao arquivar, aplicar em
> `openspec/specs/llm_provider.md`.

---

## MODIFIED

### Requirement: Interface única de provider

Toda inferência passa por uma interface `LlmProvider`. O resto do bot não sabe
qual implementação está ativa.

`converse` devolve **fala e ação** — a ação é `null` quando a mensagem não é
pedido. Não existe mais um método separado de interpretação: uma mensagem do
jogador custa **uma** chamada de inferência.

```ts
interface ReplyWithAction {
  reply: string
  action: Intent | null
}

interface LlmProvider {
  readonly name: 'ollama' | 'gemini' | 'none'
  converse(ctx: ConversationContext): Promise<ReplyWithAction>
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
- **THEN** todo o comportamento de conversa e de ação continua idêntico
- **AND** nenhum arquivo fora de config precisou mudar

#### Scenario: Uma chamada por mensagem
- **GIVEN** o dono manda uma mensagem que chega ao nível 3
- **WHEN** a IA é consultada
- **THEN** acontece **uma** chamada de inferência, não duas
- **AND** dela saem tanto a fala quanto a ação

---

### Requirement: Provider Ollama (local)

Implementação que fala com um servidor Ollama por HTTP.

#### Scenario: Conversa com modelo local
- **GIVEN** `llm.provider: "ollama"`, `llm.ollama.baseUrl: "http://localhost:11434"`
  e `llm.ollama.model: "qwen3:4b"`
- **WHEN** o nível 3 precisa responder uma mensagem
- **THEN** o bot chama o endpoint de chat do Ollama com o modelo configurado
- **AND** a fala é enviada ao chat do jogo
- **AND** nenhuma requisição sai da máquina

#### Scenario: Fala e ação com schema forçado
- **GIVEN** o provider Ollama está ativo
- **WHEN** `converse()` é chamado
- **THEN** o JSON Schema de fala + ação é enviado no parâmetro de formato estruturado
- **AND** a saída é validada contra o schema antes de virar ação

#### Scenario: Saída fora do formato
- **GIVEN** o modelo devolveu algo que não bate com o schema
- **WHEN** a resposta é processada
- **THEN** o que veio é aproveitado como fala pura, sem ação
- **AND** nenhuma exceção sobe para o roteador

---

### Requirement: Provider Gemini (nuvem)

#### Scenario: Fala e ação com `responseSchema`
- **GIVEN** o provider Gemini está ativo
- **WHEN** `converse()` é chamado
- **THEN** o schema de fala + ação vai no `responseSchema` da requisição
- **AND** a saída é validada antes de virar ação

---

## ADDED

(Nenhum requisito novo. O contrato existente muda de forma; a lista de ações
que a IA conhece é requisito de `ai_companion`.)

---

## REMOVED

### Requirement: `interpret` na interface de provider

O método `interpret(text, ctx)` sai de `LlmProvider`, de `ResilientProvider` e
de `AiLayer`, com os cenários de "Interpretação com schema forçado" de cada
provider — que passam a valer para `converse`.

**Motivo:** com a ação vindo junto da fala, ele não tem mais chamador. Ver o
delta de `ai_companion` → "Chamada separada de interpretação" para o histórico
completo (era código inalcançável).
