# Proposal: Provider Claude Code (Agent SDK) com Haiku

**Change ID:** `add-claude-code-provider`
**Created:** 2026-08-29
**Status:** Implementation Complete
**Completed:** 2026-08-29

---

## Problem Statement

O bot tem dois providers de IA de verdade: o Ollama local e o Gemini de nuvem.
O Gemini é o que responde rápido o bastante para uma criança não achar que o bot
travou — e ele custa **chave de API com crédito por token**.

Isso cria um atrito que não é técnico, é de bolso: cada frase da criança é uma
linha na fatura. Uma criança de 7 anos repete pedido, testa o bot, conversa por
esporte. O padrão de uso dela é exatamente o pior caso para cobrança por token.

Enquanto isso, a máquina já tem uma **assinatura do Claude** paga e ociosa. O
`claude setup-token` gera uma credencial de longa duração que o Claude Code usa,
e o Agent SDK aceita a mesma credencial. O que falta é o bot saber falar por ali.

Existe um segundo problema, menor mas real: o Gemini é a única porta de nuvem do
projeto. Se ele cair, o repertório local assume — e o repertório não improvisa.
Ter uma segunda porta de nuvem, de outro fornecedor, é resiliência de graça.

## Proposed Solution

Um provider novo, `claude`, que fala com o Claude via
**`@anthropic-ai/claude-agent-sdk`** — o harness do Claude Code rodando local — e
que é **estrangulado até virar quase uma chamada crua**.

Esta é a decisão central da mudança, e ela merece ser dita sem rodeio.

### Por que o Agent SDK, se ele é o caminho mais lento

O Agent SDK é o Claude Code empacotado como biblioteca: loop de agente,
ferramentas de arquivo e bash, subagentes, gestão de contexto. Para responder
"oi" no chat do Minecraft, **nada disso serve** — é peso puro. A rota mais rápida
para esse trabalho seria a Messages API (`@anthropic-ai/sdk`), uma chamada HTTP e
pronto.

A Messages API está fora **porque ela só aceita chave de API cobrada por token**.
A credencial do `claude setup-token` é da assinatura, e o único caminho que a
aceita é o Agent SDK. Ou seja: o SDK não foi escolhido por ser o melhor harness
para o trabalho — foi escolhido porque é o que a credencial abre.

Aceito isso, o trabalho da mudança passa a ser **tirar do caminho tudo que o
harness carrega e o bot não usa**.

### O regime de escopo mínimo

Cada item abaixo existe para cortar latência ou token, e todos são obrigatórios —
esquecer um devolve o harness inteiro.

| Corte | Por quê |
|---|---|
| `settingSources: []` | Sem isto o SDK lê `CLAUDE.md` e os settings do projeto do disco. Este repositório tem um `CLAUDE.md` **grande** — ele entraria como prompt em toda fala da criança |
| `tools: []` | Zera Read/Write/Edit/Bash/Glob/Grep/WebSearch/WebFetch. **Corrigido na fase 0:** a proposta dizia `allowedTools: []` — errado. `allowedTools` é lista de auto-aprovação, o padrão já é `[]` e ela **não tira ferramenta do contexto**. Quem tira é `tools: []`, documentado como "Disable all built-in tools" |
| `systemPrompt` próprio | Substitui o preset do Claude Code (prompt de agente de código, milhares de tokens) pelo `buildConversePrompt()` que o projeto já usa |
| `maxTurns: 2` | Uma fala, uma resposta. **Corrigido na fase 3:** `1` estoura em `error_max_turns` — o SDK conta a fala do jogador e a resposta do bot como turnos separados |
| Sem servidores MCP | Nada a carregar, nada a negociar no start |
| `model: 'claude-haiku-4-5'` | O modelo mais rápido da família |
| Sem thinking | Raciocínio é latência; a tarefa é uma frase curta para uma criança |
| Sessão viva, reaproveitada | **O corte que mais importa** — ver abaixo |

### O gargalo é o processo, não o modelo

O Agent SDK sobe um **subprocesso** do Claude Code. Pagar essa subida a cada
mensagem da criança domina qualquer ganho de escolher Haiku sobre Sonnet — é a
diferença entre uma resposta e um silêncio constrangedor.

Por isso o provider mantém **uma sessão viva** e manda as mensagens por ela, em
vez de chamar `query()` do zero a cada fala.

O encaixe é bonito porque já existe: a interface `LlmProvider` tem `warmUp()`,
criado para o Ollama carregar modelo sem a criança esperando. O provider Claude
usa o mesmo gancho para **subir o subprocesso no startup do bot**. A primeira
frase da criança já encontra o processo de pé.

```
startup do bot   →  warmUp() sobe o subprocesso   (a criança nem está lá ainda)
"oi"             →  mensagem na sessão viva       (sem spawn)
"pega madeira"   →  mensagem na sessão viva       (sem spawn)
```

Um efeito colateral bom: sessão viva significa que o Claude **já tem o contexto
da conversa**, então o histórico curto não precisa ser reenviado inteiro a cada
fala — menos token, menos latência.

### Fala e ação, com structured output

> **Corrigido na fase 0.** Esta seção dizia que o Agent SDK não tem parâmetro de
> formato de saída e que o contrato viraria instrução de prompt. **Está errado.**
> O `sdk.d.ts` traz `outputFormat: { type: 'json_schema', schema }`, e o
> resultado chega em `SDKResultSuccess.structured_output`. Verificado no spike:
> o mesmo `REPLY_WITH_ACTION_JSON_SCHEMA` dos outros providers volta preenchido.

O provider passa o schema que o projeto já tem e lê `structured_output` — mesma
garantia do Gemini, não uma versão mais frouxa.

O parser tolerante (`parseReplyWithActionFromText`) continua sendo a rede: se
`structured_output` vier vazio por qualquer motivo, o texto de `result` é lido
como fala pura, sem ação. O pior caso continua sendo **bot conversa e não age** —
nunca erro no chat, nunca ação errada.

### O Gemini continua, como rede

`claude` vira o provider padrão; o Gemini sai da frente mas **fica disponível
como `fallbackProvider`**. O mecanismo já existe e custa zero manter, e as duas
portas de nuvem agora são de fornecedores diferentes — cota estourada de um lado
não derruba o outro.

O aviso de privacidade que já existe (`leaksToCloudOnFallback`) passa a valer
para o novo par também: com primário local e fallback de nuvem, a frase da
criança **passa a sair da máquina** quando o local cai, e isso precisa continuar
sendo dito no log.

### Onde entra no código

```
src/ai/providers/claude.ts   provider novo — o ÚNICO arquivo que conhece o SDK
src/ai/index.ts              mais um `case` na construção
src/config/schema.ts         'claude' no enum + bloco `claude`
src/ai/provider.ts           'claude' em ProviderName
config.example.yaml          bloco documentado
```

A regra de camada continua valendo inteira: nenhum código fora de
`src/ai/providers/` referencia o Agent SDK, do mesmo jeito que nenhum referencia
Ollama ou Gemini hoje. Trocar de provider continua sendo uma linha de config.

## Scope

### In Scope

- Provider `claude` em `src/ai/providers/claude.ts`, via
  `@anthropic-ai/claude-agent-sdk`.
- Regime de escopo mínimo: sem ferramentas, sem MCP, sem settings de disco,
  system prompt próprio, um turno, sem thinking.
- Sessão viva subida no `warmUp()` e reaproveitada entre falas.
- Modelo `claude-haiku-4-5`, configurável.
- Credencial pela assinatura (`claude setup-token` →
  `CLAUDE_CODE_OAUTH_TOKEN`), como segredo de ambiente.
- Contrato fala+ação por `outputFormat` com JSON Schema, com o parser tolerante
  como rede.
- `claude` no enum de provider e de `fallbackProvider`; bloco `claude` na config.
- Gemini mantido como fallback.
- Recuperação: sessão morta é resubida sem derrubar o bot.
- Medição de latência ponta a ponta contra o Gemini de hoje.
- Testes e documentação (`README.md`, `CLAUDE.md`, `config.example.yaml`).

### Out of Scope

- **Dar ferramenta ao bot.** Nada de Read/Write/Bash. O bot age no mundo pelas
  ações validadas de `behaviors/actions/`, e a IA **nunca** executa efeito
  direto — a regra do `project.md` não abre exceção para o Agent SDK.
- **Subagentes, MCP, hooks, permissões** do Claude Code.
- **Messages API** (`@anthropic-ai/sdk`). Decisão registrada: a credencial de
  assinatura não a abre.
- **Remover o Gemini.** Ele vira rede de segurança.
- Streaming da resposta para o chat. A fala no Minecraft é atômica; streaming não
  encurta o tempo até a criança ler.
- Trocar o `prompt.ts` ou o repertório. A cascata continua a mesma, e a IA
  continua sendo o último recurso.
- Cache de prompt, batch, thinking.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `ai/providers/claude.ts` | **Novo** | Único arquivo que conhece o Agent SDK |
| `ai/provider.ts` | Sim | `'claude'` em `ProviderName` |
| `ai/index.ts` | Sim | Um `case` a mais; timeout do novo bloco |
| `ai/resilient.ts` | Talvez | Só se o aviso de vazamento à nuvem precisar do par novo |
| `config/schema.ts` | Sim | Enum + `claudeSchema` |
| `config.example.yaml` | Sim | Bloco documentado |
| Segredos | Sim | `CLAUDE_CODE_OAUTH_TOKEN` entra na lista proibida no YAML |
| `package.json` | Sim | `@anthropic-ai/claude-agent-sdk` |
| `ai/prompt.ts` | Não | O prompt é o mesmo dos outros providers |
| `domain/intent.ts` | Não | O parser tolerante já existe |
| Repertório, cascata, ações, jogos, defesa | Não | — |
| Launcher | Não | — |

## Architecture Considerations

- **O provider é uma fronteira, e ela segura.** O Agent SDK é uma dependência
  pesada e opinativa; ela morre dentro de um arquivo. É o mesmo contrato que já
  vale para Ollama e Gemini, e é o que torna esta mudança reversível.
- **`warmUp()` já era o gancho certo.** Ele nasceu para o Ollama carregar modelo;
  serve igual para subir subprocesso. Não foi preciso inventar ciclo de vida
  novo — sinal de que a interface estava bem desenhada.
- **Estado a mais no provider.** Este é o primeiro provider **com sessão**. Os
  outros são sem estado, e cada chamada é independente. Sessão viva traz coisas
  que não existiam: pode morrer, pode envelhecer, pode acumular contexto sem fim.
  O provider precisa tratar as três — e é aí que mora o risco desta mudança.
- **A IA continua sem poder agir.** Ela devolve intenção estruturada que passa
  por validação antes de virar ação. O Agent SDK **poderia** dar ferramentas ao
  modelo, e é exatamente por isso que `allowedTools: []` é requisito e não
  detalhe de configuração.
- **Duas nuvens, dois fornecedores.** Cota, incidente e mudança de preço deixam
  de ser ponto único de falha.
- **A cota agora é compartilhada com o adulto.** Diferente de uma chave de API
  com crédito próprio, a assinatura é a mesma que a pessoa usa no Claude Code do
  dia a dia. Isso é novo no projeto e precisa estar escrito.

## Success Criteria

- [x] Uma frase da criança é respondida pelo Claude sem chave de API — só com a
      credencial da assinatura
- [x] A resposta é **mais rápida ou igual** à do Gemini de hoje, medida ponta a
      ponta no mesmo conjunto de frases
- [x] O `CLAUDE.md` do projeto **não** entra no prompt (`settingSources: []`)
- [x] Nenhuma ferramenta é oferecida ao modelo, e nenhuma chamada de ferramenta
      aparece no log
- [x] O subprocesso sobe no `warmUp()`, e a primeira fala da criança não paga
      spawn
- [x] Falas seguidas reaproveitam a sessão, sem subir processo de novo
- [x] Pedido em linguagem natural vira ação validada, como já vira com o Gemini
- [x] Resposta que não é JSON vira fala pura, sem ação e sem erro no chat
- [x] Sessão morta é resubida sozinha, sem derrubar o bot e sem a criança ver
      mensagem técnica
- [x] `provider: 'gemini'` continua funcionando exatamente como hoje
- [x] Fechar o bot não deixa subprocesso do Claude Code órfão
- [x] A credencial nunca aparece em log nem em mensagem de erro
- [x] `npx eslint src test` e `npm test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Latência do subprocesso deixar a resposta **pior** que a do Gemini, derrubando a premissa | **Média** | **Alto** | Sessão viva + `warmUp()`; medição é critério de aceite, não observação. Se perder do Gemini, a mudança volta a ser discussão, não código |
| Esquecer um dos cortes de escopo e reintroduzir o harness inteiro | Média | Alto | Os cortes são **requisito com cenário**, não configuração recomendada |
| `settingSources` padrão mudar de versão e o `CLAUDE.md` voltar ao prompt | Baixa | Alto | Passar `[]` explicitamente, sempre; teste que prova a ausência |
| Sessão morrer no meio da brincadeira | **Alta** | Médio | Detectar e resubir; enquanto isso, repertório responde. A criança nunca vê erro |
| Contexto da sessão crescer sem fim numa tarde longa | Alta | Médio | Reciclar a sessão por idade ou por número de falas; o histórico curto do projeto continua sendo a fonte da verdade |
| Cota da assinatura ser consumida pela criança e faltar para o adulto | **Alta** | Médio | O teto de chamadas por minuto já existe (`maxCallsPerMinute`); documentar que a cota é compartilhada |
| Modelo devolver texto em vez de JSON e o bot parar de agir | Média | Médio | Parser tolerante já existente: vira fala pura. Instrução de formato no prompt |
| Modelo responder como assistente de código, não como amigo de 7 anos | Média | **Alto** | `systemPrompt` próprio substituindo o preset; revisão pela regra número um; teste de fumaça com frases reais do log |
| Subprocesso órfão ao encerrar o bot | Média | Médio | Encerrar a sessão no `stop()`, como o launcher já faz com o processo do bot |
| Credencial vazar em log de erro | Baixa | **Alto** | Redação na mensagem de erro, como o `GeminiProvider` já faz com a API key |
| Dependência pesada nova no `package.json` da raiz | Alta | Baixo | É dependência de runtime do bot, diferente do Electron; fica no pacote principal mesmo |
| API do Agent SDK mudar (produto novo, evoluindo rápido) | Média | Médio | Fronteira de um arquivo; o resto do projeto não sabe que ele existe |

## Reconhecimento (fase 0 — fechada em 2026-08-29)

As pendências que estavam aqui foram resolvidas contra o `sdk.d.ts` instalado e
um spike de verdade. O que saiu diferente do previsto:

| Achado | Consequência |
|---|---|
| **`allowedTools: []` não desliga ferramenta** — é lista de auto-aprovação e o padrão já é `[]`. Quem desliga é **`tools: []`** | Requisito corrigido na proposta e no delta |
| **Structured output existe** (`outputFormat: {type:'json_schema'}` → `structured_output`) | O contrato fala+ação fica tão garantido quanto o do Gemini |
| **O SDK exige peer `zod@^4`; o projeto está no `zod@3`** | Ver abaixo — foi o único bloqueio de verdade |
| `settingSources: []` é "SDK isolation mode", e a doc diz que **`'project'` é obrigatório para carregar `CLAUDE.md`** | `[]` garante o `CLAUDE.md` fora do prompt |
| `maxTurns: 1` **não** quebra o reuso da sessão | Fica como limite defensivo |
| Credencial: `CLAUDE_CODE_OAUTH_TOKEN` | O spike autenticou **sem variável nenhuma**, pelo login do Claude Code já feito na máquina |
| `SDKResultSuccess` traz `duration_ms`, `duration_api_ms` e `ttft_ms` | A medição da fase 3 usa o número do próprio SDK |

### O conflito do zod, e por que não viramos zod 4

O Agent SDK declara peer `zod@^4.0.0`. O projeto usa `zod@3` em
`config/schema.ts`, `config/load.ts`, `dialogue/schema.ts` e `domain/intent.ts` —
inclusive 6 usos de `z.ZodIssueCode`, que o zod 4 mudou.

Migrar para o zod 4 significaria mexer na **validação de configuração — o código
que decide se o bot sobe** — por um motivo que não tem nada a ver com trocar de
provider de IA.

Não foi preciso. O zod aqui é peer **só de tipos**: o `sdk.d.ts` o usa apenas em
`tool()`, `AnyZodRawShape` e `SdkMcpToolDefinition` — helpers de MCP que esta
mudança não toca. Provado empiricamente: **com o `node_modules/zod` removido, o
SDK carrega e exporta normalmente.** E o `tsconfig.json` já tem
`skipLibCheck: true`, então o `import 'zod/v4'` do `.d.ts` não é verificado.

A resolução fica declarada no `package.json`, para `npm install` puro funcionar:

```json
"overrides": { "@anthropic-ai/claude-agent-sdk": { "zod": "$zod" } }
```

### O que o spike mediu

```
subida do processo   4964 ms   ← pago UMA vez, no warmUp()
1a fala              5635 ms   ← inclui a subida
2a fala              1419 ms   ← sessão reaproveitada
```

A segunda fala é **4x mais rápida** que a primeira. É exatamente a premissa da
mudança, e ela se sustenta: o custo é a subida, e o `warmUp()` a tira do caminho
da criança.

---

## Resultado medido

| | mediana | mín | máx | falhas |
|---|---|---|---|---|
| `claude` (haiku 4.5) | **1619 ms** | 1454 ms | 2370 ms | 0/5 |
| `gemini` (flash-lite) | 11236 ms | 1069 ms | 16449 ms | 0/5 |

5 frases reais de `data/conversations/`, mesma máquina, mesmo dia. Aquecimento do
Claude ~14 s, pago no startup.

Vence por 7x na mediana e por muito mais em **consistência** — 900 ms de variação
contra 15 s. Para uma criança de 7 anos as duas coisas contam: uma espera de 16 s
ela lê como "travou".

A premissa da proposta se sustentou, mas **três falhas só apareceram medindo**, e
nenhuma delas apareceria em teste unitário. A pior foi silenciosa: a sessão do
aquecimento nascia com prompt genérico e era reusada a conversa inteira, e o bot
respondia "Estou aqui para ajudar!" no lugar de "Tô indo!" — sem persona, sem
catálogo de ação, sem a regra número um. As três estão em `tasks.md`, fase 3.

---

## Archive Information

**Archived:** 2026-08-29
**Duration:** proposta, implementação e arquivamento no mesmo dia
**Outcome:** implementado e verificado em execução real

### Arquivos criados

- `src/ai/providers/claude.ts` — único arquivo que conhece o Agent SDK
- `test/claude-provider.test.ts` — 23 testes com dublê do SDK

### Arquivos modificados

- `src/ai/provider.ts` — `'claude'` em `ProviderName`; `warmUp(identity?)`;
  `stop?()` opcional
- `src/ai/index.ts` — `case 'claude'`, timeout, `AiLayer.stop()`, `isCloud()`
- `src/ai/resilient.ts` — repassa `warmUp(identity)` e `stop()`
- `src/ai/prompt.ts` — `staticPrompt()` e `worldBlock()` separados de
  `buildConversePrompt()`, que continua idêntico para Ollama e Gemini
- `src/app/bot.ts` — `identityContext()` no aquecimento; `ai.stop()` no
  encerramento
- `src/config/schema.ts` — `claudeSchema`, enums, segredo
- `src/config/load.ts` — leitura da credencial e aviso condicional
- `package.json` — dependência e `overrides` do zod
- `config.example.yaml`, `config.yaml`, `README.md`, `CLAUDE.md`

### Specs atualizadas

- `openspec/specs/llm_provider.md` — três requisitos novos (provider Claude Code,
  escopo mínimo do harness, sessão viva, fala e ação com formato pedido) e dois
  modificados (interface única, fallback entre providers)
- `openspec/specs/configuration.md` — requisito `Bloco claude`; segredos
  ampliados para a credencial da assinatura

### Verificação

`tsc --noEmit`, `eslint src test` e 766 testes limpos.

Latência medida com 5 frases reais de `data/conversations/`:

| | mediana | mín | máx |
|---|---|---|---|
| `claude` (haiku 4.5) | **1619 ms** | 1454 ms | 2370 ms |
| `gemini` (flash-lite) | 11236 ms | 1069 ms | 16449 ms |

### O que só apareceu medindo

Três falhas, nenhuma visível em teste unitário. A pior foi silenciosa: a sessão
do aquecimento nascia com prompt genérico e era reusada a conversa inteira — o
bot respondia "Estou aqui para ajudar!" no lugar de "Tô indo!". Detalhes na
fase 3 do `tasks.md`.

### Ressalvas registradas

- `test/dialogue.test.ts` → "três saudações seguidas dão três respostas
  diferentes" é **instável por construção** (sorteia 3 de um fixture pequeno e
  exige 3 distintas). Não é desta mudança; merece correção própria.
- `test/module-loading.test.ts` → "dist/minecraft/client.js carrega" leva ~5 s e
  estourou o timeout uma vez sob carga paralela. Passa isolado.
- `npm run lint` acusa `prettier` em arquivos pré-existentes não tocados aqui.
