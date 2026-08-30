# Proposal: A resposta da IA traz a ação junto

**Change ID:** `ai-reply-with-action`
**Created:** 2026-08-19
**Status:** Implementation Complete (falta verificar a fala em jogo)
**Completed:** 2026-08-19

---

## Problem Statement

Quando a criança pede uma coisa com palavras que o parser não reconhece, a
mensagem chega na IA, a IA responde bonito — e **o bot não faz nada**.

```
Miguel: dudu, será que dava pra você juntar umas madeirinhas pra mim?
Dudu:   Claro! Já vou pegar!          ← só fala. Não anda, não pega nada.
```

Pior que não entender: o bot **promete e não cumpre**. Para uma criança de 7
anos, isso é o bot mentindo.

### A causa, encontrada no código

O caminho de interpretação existe (`MessageRouter.interpret`,
`AiLayer.interpret`, `LlmProvider.interpret`, `INTENT_JSON_SCHEMA`), mas em
`src/app/bot.ts` ele só é alcançado quando `route()` devolve **reply nulo e
intent nulo** ao mesmo tempo:

```ts
if (result.reply)  { say(result.reply); return }   // ← a IA sempre cai aqui
if (result.intent) { execute(result.intent); return }
const intent = await this.router.interpret(...)    // ← nunca chega
```

E `route()` **nunca** devolve os dois nulos:

| Nível da cascata | O que devolve |
|---|---|
| 1. comando | `intent` preenchido |
| 2. repertório | `reply` preenchido |
| 3. IA respondeu | `reply` preenchido |
| 3. IA falhou / desligada | `reply` = `nao_entendi` do repertório |

Confirmado em execução: `nao_entendi` resolve para
`Não entendi! Experimenta falar "me segue" ou "fica aqui".` — sempre há texto.

**Conclusão: `interpret()` é código morto.** Toda a máquina de interpretação de
pedido livre está construída, testada, especificada… e inalcançável. É por isso
que a IA nunca aciona uma ação.

## Proposed Solution

Fundir as duas perguntas que hoje são feitas separadamente. A IA passa a
devolver, **numa chamada só**, o que falar **e** o que fazer:

```json
{ "reply": "Claro! Já vou pegar!", "action": { "type": "COLLECT_BLOCK", "params": { "block": "oak_log", "count": 4 } } }
```

O bot fala o `reply` e, se vier `action`, executa depois de validar. Conversa
pura vem com `action: null` e nada acontece — como hoje.

### Por que uma chamada e não duas

Duas chamadas seriam o dobro de latência num modelo local que já leva de 1 a 12
segundos, com a criança esperando na frente da tela. E seriam duas chances de o
provider falhar por uma pergunta só.

O encanamento para saída estruturada **já existe**: `INTENT_JSON_SCHEMA`, o
`format` do Ollama e o `responseSchema` do Gemini. O que muda é o formato pedido
— de "só a intenção" para "fala + intenção".

### Como fica no código

1. `LlmProvider.converse` passa a devolver `{ reply, action }` em vez de
   `string`. `LlmProvider.interpret` **sai** da interface: com a fala e a ação
   vindo juntas, ele não tem mais chamador.
2. Novo `REPLY_WITH_ACTION_JSON_SCHEMA` em `domain/intent.ts`, envolvendo o
   schema de intenção que já existe.
3. `buildConversePrompt` ganha a **lista de ações** que o bot sabe executar, em
   linguagem de criança, com exemplos de pedido → ação — o conteúdo que hoje
   está preso no `buildInterpretPrompt`.
4. `RouteResult` ganha `action: Intent | null`.
5. `bot.ts`: fala o `reply`, depois executa a `action` se houver. A ordem
   importa — a criança ouve "já vou pegar!" e **então** vê o bot sair andando.
6. `validateIntent` continua sendo o portão único: nada vira ação sem passar por
   ele. `CHAT` e `UNKNOWN` não são ação.

### As ações que a IA vai conhecer

O catálogo é o `INTENT_TYPES` que já existe — nenhuma capacidade nova:

| Ação | O que o bot faz |
|---|---|
| `FOLLOW` | segue o jogador |
| `STAY` | fica de guarda onde está |
| `STOP` | para tudo |
| `COLLECT_BLOCK` | pega blocos (`block`, `count`) |
| `GOTO_COORDS` | vai até uma coordenada |
| `DROP_ITEM_TO_OWNER` | entrega um item |
| `EQUIP_ITEM` | equipa um item |
| `LOOK_AT_OWNER` | olha para o jogador |
| `DEFENSE_ON` / `DEFENSE_OFF` | liga / desliga a defesa |
| `PLAY_GAME` | começa uma brincadeira |
| `ASK_WHICH_GAME` | pergunta qual brincadeira |

`PLAY_GAME` sem `role` continua caindo na pergunta de papel — a IA não escolhe
papel pela criança, igual ao parser.

## Scope

### In Scope

- `converse` devolvendo fala + ação numa chamada, nos três providers.
- Lista de ações e exemplos no prompt de conversa.
- Execução da ação em `bot.ts`, depois da fala.
- Remoção de `interpret` da interface de provider e da camada de IA.
- Registro em log do que a IA falou **e** propôs.
- Testes.

### Out of Scope

- **Ação nova.** O catálogo é o que já existe; nada de construir, craftar,
  atacar jogador.
- Encadear várias ações numa resposta só — uma ação por mensagem.
- Confirmação antes de executar ("você quer mesmo que eu pegue?").
- Mudar o repertório ou o parser de comandos: os níveis 1 e 2 continuam iguais.
- Fazer a IA agir sozinha, sem mensagem do jogador.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| Domínio (`src/domain/intent.ts`) | Sim | Novo schema fala+ação; `INTENT_JSON_SCHEMA` vira peça interna dele |
| Interface de provider (`src/ai/provider.ts`) | Sim | `converse` devolve objeto; `interpret` sai |
| Providers (`ollama`, `gemini`, `none`) | Sim | Saída estruturada no `converse`; some o `interpret` |
| Prompt (`src/ai/prompt.ts`) | Sim | Lista de ações e exemplos migram para o prompt de conversa |
| Camada de IA (`src/ai/index.ts`) | Sim | `converse` tipado com ação; `interpret` removido |
| Roteador (`src/behaviors/router.ts`) | Sim | `RouteResult.action`; `interpret()` removido |
| App (`src/app/bot.ts`) | Sim | Executa a ação depois de falar; some o caminho morto |
| Repertório / parser de comandos | Não | Níveis 1 e 2 intocados |
| Ações de mundo (`behaviors/actions/`) | Não | Já existem e já são chamadas por `execute()` |
| Configuração | Não | — |

## Architecture Considerations

- **A regra de ouro continua valendo**: a IA nunca executa efeito direto. Ela
  devolve uma intenção estruturada que passa por `validateIntent` antes de virar
  ação (`openspec/project.md` → Convenções).
- **Cascata intacta**: comando → repertório → IA. O que muda é só o que o nível
  3 é capaz de devolver.
- **Isolamento de provider preservado**: nada fora de `src/ai/providers/`
  referencia Ollama ou Gemini. O tipo de retorno novo é do domínio.
- **Defesa e jogos seguem determinísticos.** Nada aqui entra no laço de defesa,
  que continua sem chamada de IA.
- **Uma superfície de inferência a menos.** Hoje são dois prompts e dois métodos
  para manter — e um deles nunca roda. Passa a ser um.

## Success Criteria

- [x] `dudu, será que dava pra juntar umas madeirinhas?` faz o bot falar **e**
      sair pegando madeira
- [x] `dudu, você gosta de diamante?` responde e **não** executa nada
- [x] Ação fora do catálogo vira `UNKNOWN` e nenhum efeito acontece
- [x] JSON malformado: o bot fala algo amigável e não trava
- [x] Com `llm.provider: 'none'`, tudo funciona como hoje
- [x] A fala sai **antes** da ação começar
- [x] Nenhuma referência a `interpret` sobra no código
- [x] `npm test` e `npx eslint src test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Modelo local piora a fala ao ser forçado a JSON | Média | Alto | Schema mínimo (dois campos); `reply` continua sendo texto livre dentro dele; testar em jogo com `qwen3:4b` antes de fechar |
| IA inventa ação em conversa boba ("gosta de diamante?" → COLLECT_BLOCK) | Média | Médio | Prompt com exemplos explícitos de conversa → `action: null`; teste dedicado; `dudu, para` sempre cancela |
| Ação que nunca disparava passa a disparar de verdade | Alta | Médio | É o objetivo do change — mas o bot anuncia antes de agir, e nenhuma ação é destrutiva para o mundo do jogador |
| Resposta mais lenta por causa do JSON | Média | Médio | Uma chamada em vez de duas; a fala de espera (`fillerAfterMs`) já cobre a percepção |
| Provider sem suporte a saída estruturada no futuro | Baixa | Médio | `parseIntentFromText` já tolera JSON em cerca de markdown; sem parse, vira fala pura sem ação |
| Remover `interpret` quebrar teste ou spec existente | Alta | Baixo | A remoção está no delta, com os cenários migrados para o requisito novo |

---

## Archive Information

**Archived:** 2026-08-29
**Outcome:** implementado; ver a ressalva de verificação abaixo

### Ressalva de verificação

Os cenários de **prova em jogo** do `tasks.md` **não foram verificados na sessão
que arquivou**. O arquivamento foi decisão do dono do projeto, em lote com os
outros changes de 2026-08-19.

A lógica está coberta por teste unitário; o que falta é a observação no mundo
aberto. Quem for mexer nesta área deve tratar esses cenários como não
confirmados.

### Nota sobre o merge

As seções `MODIFIED` foram mescladas **à mão**, requisito por requisito, com
conferência de cenários perdidos arquivo por arquivo. Neste projeto `MODIFIED` de
delta é **acréscimo**, não substituição — mesclar por script apaga cenário.
