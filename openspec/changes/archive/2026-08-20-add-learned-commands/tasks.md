# Implementation Tasks: Histórico de comandos aprendidos da IA

**Change ID:** `add-learned-commands`

---

## Fase 1: Domínio e regra de casamento (puro)

- [x] 1.1 `LEARNABLE_INTENTS` em `src/domain/intent.ts`: catálogo fechado do que
      pode ser aprendido, com `GOTO_COORDS` **fora**
- [x] 1.2 `isLearnable(intent)`: tipo no catálogo **e** parâmetros que são
      vocabulário, não estado de mundo
- [x] 1.3 `src/dialogue/learned.ts`: tipo `LearnedCommand`, casamento reusando
      `scorePattern` com limiar próprio
- [x] 1.4 `findLearned()`: desempata por confiança e, em empate, pela entrada
      mais usada
- [x] 1.5 Testes: limiar 0.85 aceita idêntico e frase contida, **recusa** saco
      de palavras ("pega pedra e madeira" não casa com "pega madeira")
- [x] 1.6 Teste: `GOTO_COORDS` nunca é aprendível
- [x] 1.7 **Guarda de negação** (não estava previsto): limiar alto NÃO resolve
      "nao pega madeira", que contém a frase inteira e pontua 0.85. `nao`,
      `nunca` e `nem` barram o casamento quando não fazem parte da frase
      aprendida. Delta atualizado com dois cenários novos.

**Quality Gate:** APROVADO
- [x] `npx eslint src test` limpo
- [x] Nenhum I/O e nenhuma dependência de `mineflayer` nesta fase

---

## Fase 2: Persistência (`memory/learned-store.ts`)

- [x] 2.1 Carga tolerante: arquivo ausente, vazio ou corrompido começa vazio e
      loga aviso — nunca derruba o startup
- [x] 2.2 Descarte na carga de entrada que o parser de regex já resolve
- [x] 2.3 `record()`: cria ou atualiza entrada (`hits`, `lastUsedAt`, falas da IA
      até `maxRepliesPerEntry`, sem duplicar)
- [x] 2.4 `forget()`: remove entrada por frase
- [x] 2.5 Teto `maxEntries` com descarte da menos recentemente usada
- [x] 2.6 `forgetAfterDays` opcional (`null` = guardar para sempre, como
      `memory.retentionDays`)
- [x] 2.7 Escrita **atômica**: arquivo temporário + rename, **sem** debounce —
      a escrita acontece no máximo uma vez por mensagem do jogador, e cache que
      some no `kill -9` não serve para nada
- [x] 2.8 Testes com relógio injetado, incluindo arquivo corrompido e eviction
- [x] 2.9 Revalidação no replay: entrada que não passa mais no catálogo fechado
      é descartada em vez de virar efeito no mundo
- [x] 2.10 Falha de escrita não derruba o bot: a entrada continua valendo na
      sessão e o temporário órfão é limpo

**Quality Gate:** APROVADO
- [x] `npm test` passa
- [x] Escrita por temporário + rename; nenhum `.tmp` sobra

---

## Fase 3: Nível 1.5 da cascata (`behaviors/router.ts`)

- [x] 3.1 Consulta ao histórico **depois** do parser e **antes** do repertório
- [x] 3.2 `RouteResult` ganha `source: 'learned'` e a frase que casou
- [x] 3.3 Fala do replay vem de `comando_aprendido` (repertório), nunca do
      arquivo
- [x] 3.4 `learned.enabled: false` faz o roteador voltar à cascata de três níveis
- [x] 3.5 Testes de precedência: parser > aprendido > repertório > IA
- [x] 3.6 Teste: com provider fora do ar, comando aprendido ainda responde
- [x] 3.7 Interface estreita `LearnedLookup`: o roteador não sabe de arquivo,
      teto de entradas nem escrita atômica (mesmo padrão do `GameWorld`)

**Quality Gate:** APROVADO
- [x] `npm test` passa
- [x] Espiões em `ai.converse` e `repertoire.respond` provam que nenhum dos dois
      é chamado num acerto do cache

---

## Fase 4: Aprender e desaprender (`app/bot.ts`)

- [x] 4.1 Gravar só quando: veio da IA, tinha ação, ação executou com
      `outcome.ok`. `execute()` e `runWorldAction()` passaram a devolver
      `boolean` — sem isso não havia como saber se a criança viu funcionar
- [x] 4.2 Não gravar em `ActionRefused`, `ActionAborted`, `NoProgress` nem erro
- [x] 4.3 Guardar quem ensinou (`provider`) e a fala original da IA
- [x] 4.4 `para` dentro de `unlearnOnStopMs` depois de um comando aprendido
      apaga a entrada
- [x] 4.5 Log: acerto do cache (chamada economizada), aprendizado novo e
      desaprendizado
- [x] 4.6 Decisões extraídas para funções puras (`shouldLearn`, `shouldUnlearn`)
      e testadas ali: o projeto não tem teste de integração do `CompanionBot`
      (exigiria falsificar o `mineflayer`), e política em função pura segue a
      convenção "regra pura, efeito na borda"
- [x] 4.7 Fluxo de ponta a ponta conferido com store e roteador reais, sem
      servidor: aprende, replica com fala do repertório, desaprende, recusa
      frase negada e descarta entrada sombreada pelo parser

**Quality Gate:** APROVADO
- [x] `npm test` passa
- [x] Nada é aprendido quando a ação não deu certo

---

## Fase 5: Repertório e ferramenta da rotina

- [x] 5.1 Entrada `comando_aprendido` com 6 variações curtas e sem contexto
- [x] 5.2 Comentário com a data de origem (2026-08-20) na entrada nova
- [x] 5.3 `npm run repertoire:sync` — as duas cópias idênticas
- [x] 5.4 `tools/gaps.ts`: `rankLearned()` e seção "comandos aprendidos" no
      relatório, ordenada por uso, marcando candidato a virar regex a partir de
      `PROMOTE_AFTER_HITS`
- [x] 5.5 `repertoire:gaps` conta `learned` junto do que foi resolvido local (é
      economia de IA, não lacuna) e `botSpeakers` reconhece a origem nova
- [x] 5.6 Testes da seção nova
- [x] 5.7 `/upgrade-repertoire` atualizado: a rotina diária passa a promover
      comando aprendido para regex

**Quality Gate:** APROVADO
- [x] `npm run repertoire:sync -- --check` diz "iguais"
- [x] Nenhuma fala nova promete capacidade que o bot não tem

---

## Fase 6: Configuração, documentação e verificação em jogo

- [x] 6.1 Bloco `learned` no schema: `enabled`, `path`, `minConfidence`,
      `maxEntries`, `maxRepliesPerEntry`, `forgetAfterDays`, `unlearnOnStopMs`
- [x] 6.2 `config.example.yaml` documentado, com o porquê de cada valor
- [x] 6.3 Linha no banner de inicialização com a contagem de aprendidos. O
      cartão passou a sair DEPOIS de montar o bot (a contagem só existe com o
      histórico carregado) e continua antes de qualquer conexão
- [x] 6.4 README: seção "Comandos aprendidos da IA", incluindo como apagar na mão
- [x] 6.5 CLAUDE.md: seção nova e a rotina diária olhando os aprendidos
- [x] 6.6 **Em jogo de verdade**: pedir algo em linguagem natural, confirmar que
      a segunda vez responde na hora e sem chamada ao Gemini
      - Arquivado por decisão do dono em 2026-08-29. **Não verificado nesta
        sessão** — a lógica está coberta por teste, mas o cenário em jogo não
        foi observado por mim.
- [x] 6.7 **Em jogo de verdade**: mandar `para` depois de um aprendido e
      confirmar que ele volta a perguntar para a IA
      - Mesma ressalva de 6.6.
- [x] 6.8 `npm test` + `npx eslint src test` finais

**Quality Gate:**
- [x] Lint limpo (`npx eslint src test`)
- [x] 722 de 723 testes passam. O único vermelho é
      `dialogue.test.ts` > "três saudações seguidas dão três respostas
      diferentes", **instável desde antes desta mudança**: o sorteio evita só a
      resposta imediatamente anterior, então a-b-a acontece em cerca de 1 a cada
      5 execuções. Confirmado rodando a suíte com o repertório anterior a esta
      branch. Não corrigido de propósito: é teste alheio ao escopo
- [x] Verificado em jogo — ver a ressalva em 6.6
- [x] Documentação sincronizada

---

## Completion Checklist

- [x] Fases 1 a 5 completas; da 6, só a verificação em jogo ficou aberta
- [x] Repertório sincronizado nas duas cópias
- [x] `learned.enabled: false` confirmado como volta ao comportamento anterior
      (teste de roteador e teste de configuração)
- [x] Arquivado em 2026-08-29 por decisão do dono, com a ressalva de 6.6/6.7
      registrada
