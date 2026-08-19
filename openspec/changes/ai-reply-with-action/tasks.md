# Implementation Tasks: A resposta da IA traz a ação junto

**Change ID:** `ai-reply-with-action`

---

## Fase 1: Domínio (contrato de fala + ação)

- [x] 1.1 Em `src/domain/intent.ts`, criar o tipo `ReplyWithAction`
      (`{ reply: string; action: Intent | null }`)
- [x] 1.2 Criar `REPLY_WITH_ACTION_JSON_SCHEMA`, envolvendo o schema de intenção
      que já existe — sem duplicar a lista de tipos
- [x] 1.3 Criar o validador de entrada bruta: fala sempre string; ação ausente,
      `CHAT` ou `UNKNOWN` vira `null`; ação inválida vira `null`
- [x] 1.4 Testes do validador, incluindo JSON malformado e ação fora do catálogo

**Quality Gate:** APROVADO
- [x] `npx eslint src test` limpo
- [x] Nenhuma ação escapa sem passar por `validateIntent`

---

## Fase 2: Prompt

- [x] 2.1 Em `src/ai/prompt.ts`, incluir no prompt de conversa a lista de ações
      que o bot sabe executar, em linguagem de criança
- [x] 2.2 Migrar os exemplos de pedido → ação do `buildInterpretPrompt`
- [x] 2.3 Acrescentar exemplos de **conversa pura → sem ação**, para a IA não
      inventar ação onde não tem
- [x] 2.4 Deixar explícito: uma ação por resposta, ou nenhuma
- [x] 2.5 Remover `buildInterpretPrompt`
- [x] 2.6 Teste: o prompt cita todas as ações do catálogo

**Quality Gate:** APROVADO
- [x] `npm test` passa
- [x] Nenhuma ação do catálogo fica de fora do prompt

---

## Fase 3: Providers

- [x] 3.1 `LlmProvider.converse` devolve `ReplyWithAction`; `interpret` sai da
      interface
- [x] 3.2 Ollama: pedir saída estruturada no `converse` via `format`
- [x] 3.3 Gemini: idem via `responseSchema`
- [x] 3.4 `NoneProvider`: devolve fala vazia e ação nula
- [x] 3.5 Resposta que não faz parse vira fala pura, sem ação, sem derrubar nada
- [x] 3.6 Atualizar `ResilientProvider` e `AiLayer` para o novo tipo
- [x] 3.7 Testes dos providers com provider falso

**Quality Gate:** APROVADO
- [x] `npm test` passa
- [x] Nada fora de `src/ai/providers/` menciona Ollama ou Gemini

---

## Fase 4: Roteador e execução

- [x] 4.1 `RouteResult` ganha `action: Intent | null`
- [x] 4.2 `MessageRouter.route` propaga a ação vinda da IA
- [x] 4.3 Remover `MessageRouter.interpret`
- [x] 4.4 Em `src/app/bot.ts`, falar o `reply` e **depois** executar a ação
- [x] 4.5 Remover o caminho morto de `interpret` no fim do `onChat`
- [x] 4.6 Registrar no log a fala e a ação propostas pela IA
- [x] 4.7 Teste: fala sai antes da ação

**Quality Gate:** APROVADO
- [x] `npm test` passa
- [x] Nenhuma referência a `interpret` sobra em `src/`

---

## Fase 5: Verificação e documentação

- [x] 5.1 Teste de ponta a ponta: pedido livre vira fala + ação
- [x] 5.2 Teste: conversa pura não vira ação
- [x] 5.3 Teste: com `llm.provider: 'none'` nada muda
- [ ] 5.4 **Testar em jogo de verdade** com o modelo local configurado: a fala
      continua natural com a saída estruturada ligada?
- [x] 5.5 Atualizar o README na parte de pedidos livres
- [x] 5.6 `npm test` + `npx eslint src test` finais

**Quality Gate:** APROVADO
- [x] Todos os testes passam
- [x] Lint limpo
- [ ] Qualidade da fala conferida em jogo, não só em teste (PENDENTE — ver 5.4)
- [x] Documentação sincronizada

---

## Completion Checklist

- [x] Fases 1 a 4 completas; da 5, só a verificação em jogo ficou aberta
- [x] Todos os quality gates aprovados
- [x] Documentação sincronizada
- [x] Pronto para `/openspec-archive ai-reply-with-action`
