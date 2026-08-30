# Implementation Tasks: Provider Claude Code (Agent SDK) com Haiku

**Change ID:** `add-claude-code-provider`
**Concluído:** 2026-08-29

---

## Fase 0: Reconhecimento (antes de escrever código)

- [x] 0.1 Documentação oficial do Agent SDK lida, e as assinaturas conferidas
      contra o `sdk.d.ts` **instalado** — a doc pública vem resumida por modelo
      pequeno e trouxe pelo menos dois tipos errados (`SDKUserMessage` tem
      `message: MessageParam`, não `content`)
- [x] 0.2 Credencial: `CLAUDE_CODE_OAUTH_TOKEN`. O spike autenticou **sem
      variável nenhuma**, pelo login do Claude Code já feito na máquina
- [x] 0.3 Spike medindo spawn e reuso de sessão
- [x] 0.4 Pendências fechadas no `proposal.md`

**Quality Gate: PASSOU**
- [x] Assinaturas vieram do `.d.ts`, não de memória
- [x] Segunda fala 4x mais rápida que a primeira (1419 ms contra 5635 ms)
- [x] Comparação com o Gemini feita na fase 3

### O que saiu diferente do previsto

| Achado | Consequência |
|---|---|
| **`allowedTools: []` não desliga ferramenta** — é auto-aprovação, e o padrão já é vazio. Quem desliga é **`tools: []`** | Requisito corrigido na proposta e no delta |
| **Structured output existe** (`outputFormat` → `structured_output`) | O contrato fala+ação ficou tão garantido quanto o do Gemini, não mais frouxo |
| **SDK exige peer `zod@^4`; o projeto está no `zod@3`** | Único bloqueio de verdade — resolvido sem migrar (abaixo) |
| `SDKResultSuccess` traz `duration_ms` e `ttft_ms` | A medição da fase 3 usa o número do próprio SDK |

**O conflito do zod.** Migrar para o zod 4 significaria mexer em
`config/schema.ts` — o código que decide se o bot sobe — por um motivo alheio a
trocar de provider. Não foi preciso: o zod aqui é peer **só de tipos** (usado em
`tool()`/MCP, que esta mudança não toca). Provado removendo `node_modules/zod` e
carregando o SDK mesmo assim. Resolvido com
`overrides: { "@anthropic-ai/claude-agent-sdk": { "zod": "$zod" } }`, e
`skipLibCheck: true` já estava no `tsconfig.json`.

---

## Fase 1: Configuração e contrato

- [x] 1.1 `'claude'` em `ProviderName`
- [x] 1.2 `claudeSchema` com `model`, `timeoutMs`, `sessionMaxAgeMs` e
      `sessionMaxTurns`
- [x] 1.3 `'claude'` nos enums de `provider` e `fallbackProvider`
- [x] 1.4 `CLAUDE_CODE_OAUTH_TOKEN` lido do ambiente; `claudeOauthToken` e
      `token` na lista proibida no YAML
- [x] 1.5 Segredo ausente
      - **Mudou de erro para aviso.** A proposta pedia falhar no startup, como o
        Gemini faz. Errado: o Agent SDK também aceita o login que o Claude Code
        já fez na máquina — foi assim que o spike autenticou. Falhar seria
        recusar uma configuração que funciona. Virou aviso com o comando.
- [x] 1.6 Bloco `claude` no `config.example.yaml`
- [x] 1.7 Testes de configuração

**Quality Gate: PASSOU** — `tsc`, `eslint` e testes limpos

---

## Fase 2: O provider

- [x] 2.1 `src/ai/providers/claude.ts`
- [x] 2.2 Escopo mínimo: `tools: []`, `settingSources: []`, sem MCP,
      `thinking: disabled`, `maxTurns`, prompt próprio, modelo da config
- [x] 2.3 `warmUp()` sobe a sessão; falha não impede o bot de iniciar
- [x] 2.4 `converse()` pela sessão viva
- [x] 2.5 Formato de resposta — **por schema, não por instrução de prompt**
- [x] 2.6 Sessão morta detectada e resubida uma vez
- [x] 2.7 Reciclagem por idade e por número de falas
- [x] 2.8 `AbortSignal` respeitado
- [x] 2.9 Encerramento sem subprocesso órfão
      - Exigiu plumbing novo: `LlmProvider.stop?()`, repassado por
        `ResilientProvider` e `AiLayer`, chamado em `CompanionBot.stop()`.
        Ollama e Gemini não têm o que soltar; este tem.
- [x] 2.10 Credencial redigida em toda mensagem de erro
- [x] 2.11 `case 'claude'` e timeout no `ai/index.ts`
- [x] 2.12 23 testes com dublê do SDK

**Quality Gate: PASSOU**
- [x] Teste prova que nenhuma ferramenta é oferecida
- [x] Teste prova `settingSources: []` — o `CLAUDE.md` fora do prompt
- [x] Nenhum arquivo fora de `providers/` importa o SDK (conferido por grep)

---

## Fase 3: Prova no mundo real

Esta fase **mudou o código três vezes**. Nenhuma das três falhas aparecia em
teste unitário: as três só existiam contra o SDK de verdade.

- [x] 3.1 Bot conversando com o provider `claude`
- [x] 3.2 Latência medida contra o Gemini, com 5 frases reais de
      `data/conversations/`, mesma máquina, mesmo dia:

      | | mediana | mín | máx | falhas |
      |---|---|---|---|---|
      | `claude` (haiku 4.5) | **1619 ms** | 1454 ms | 2370 ms | 0/5 |
      | `gemini` (flash-lite) | 11236 ms | 1069 ms | 16449 ms | 0/5 |

      Aquecimento do Claude: ~14 s, pago no startup.

      Vence por 7x na mediana, e por muito mais em **consistência**: 900 ms de
      variação contra 15 s. Para uma criança de 7 anos a consistência importa
      tanto quanto a mediana — uma espera de 16 s ela lê como "travou".
- [x] 3.3 Primeira fala não paga spawn: **1454 ms**, contra 8858 ms antes da
      correção
- [x] 3.4 Pedido em linguagem natural virando ação validada
- [x] 3.5 Sessão derrubada e recuperada
- [x] 3.6 Sem subprocesso órfão
- [x] 3.7 `provider: 'gemini'` continua idêntico
- [x] 3.8 Fallback exercitado
- [x] 3.9 Revisão pela regra número um — ver abaixo

### As três falhas que a medição revelou

**1. O aquecimento não aquecia nada.** `query()` é preguiçoso: criar a sessão
não sobe processo, o spawn só acontece na primeira mensagem. A criança pagava os
~9 s mesmo com `warmUpOnStart: true`. Corrigido mandando uma fala de mentira no
`warmUp()`.

**2. O bot perdeu a persona.** Este é o pior, e o mais silencioso: nenhum teste
pegaria. O system prompt é fixado na criação da sessão, e a sessão do aquecimento
nascia antes de existir contexto de jogo — com um prompt genérico. Ela era então
reusada a conversa inteira, e o bot respondia **"Estou aqui para ajudar!"** em vez
de "Tô indo!". Sem persona, sem catálogo de ação, sem a regra número um.

Corrigido dividindo o prompt: `staticPrompt()` (persona, identidade, catálogo,
exemplos) vai na criação da sessão; `worldBlock()` (estado do mundo, que muda a
cada fala) vai na mensagem. `buildConversePrompt()` continua igual para Ollama e
Gemini. O aquecimento passou a receber a identidade do bot, o que exigiu passá-la
por `AiLayer.warmUp()` e `CompanionBot`.

**3. `maxTurns: 1` estourava.** O SDK conta a fala do jogador e a resposta do bot
como turnos separados, então `1` dá `error_max_turns` — derrubando o aquecimento
e, de vez em quando, uma fala no meio da conversa (que então pagava a subida de
uma sessão nova). Passou para `2`, e o delta foi corrigido.

**Quality Gate: PASSOU**
- [x] Latência medida, não estimada
- [x] Respostas na voz do bot: "Já vou!", "Deixa comigo, já começo!",
      "Já vou pegar!" — a mesma voz dos exemplos do prompt
- [x] Zero subprocesso órfão

---

## Fase 4: Documentação

- [x] 4.1 `README.md`: seção `claude`, com `claude setup-token`, a nota de cota
      compartilhada e a tabela de latência medida
- [x] 4.2 `CLAUDE.md`: seção nova com as quatro armadilhas do SDK e a regra do
      prompt fixado na criação da sessão
- [x] 4.3 Repertório conferido: nenhuma promessa desatualizada sobre IA
- [x] 4.4 Números registrados aqui, para a próxima pessoa não refazer a conta

**Quality Gate: PASSOU**

---

## Ressalvas

- **`npm run lint` acusa `prettier --check`** em dezenas de arquivos —
  desalinho **pré-existente**, em arquivos que esta mudança não tocou. Os
  arquivos desta mudança passam.
- **`test/dialogue.test.ts` → "três saudações seguidas dão três respostas
  diferentes" é instável por construção**: sorteia 3 de um fixture pequeno e
  exige 3 distintas, o que o sorteio não garante. Falhou 2 de 3 execuções
  isoladas. **Não é desta mudança** — `dialogue/` não foi tocado aqui — mas
  passou a falhar com frequência alta e merece uma correção própria.
- **Emoji.** O Haiku emite emoji com facilidade ("😊", "🏠") quando o prompt não
  o proíbe. Com o prompt do projeto isso não apareceu nas medições, mas o
  `cleanReply` não filtra emoji e o Minecraft Java renderiza mal. Vale observar
  na primeira sessão de verdade com a criança.

---

## Completion Checklist

- [x] Todas as fases completas
- [x] Todos os quality gates passados
- [x] Success criteria da proposta conferidos um a um
- [x] Pronto para `/openspec-archive`
