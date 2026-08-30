# Implementation Tasks: Ruído do jogo fora da cascata, e cache aprendido sem lixo

**Change ID:** `fix-chat-noise-and-learned-quality`
**Implementado:** 2026-08-29 — fases 1 a 5 completas; fase 6 **pendente de prova
em jogo** (ver o bloco no fim)

> Ordem pensada para o ruído parar de entrar **antes** de mexer no cache: com a
> fase 1 no lugar, metade do lixo aprendido deixa de nascer, e a fase 5 só
> precisa varrer o que já está lá.

> **2026-08-30 — provado em jogo pelo dono, e aprovado.**
>
> As caixas de "em jogo" abaixo ficaram como estavam: a aprovação foi da sessão
> inteira, não item a item. Marcá-las uma a uma diria que cada cenário foi
> observado, e isso ninguém afirmou.

---

## Fase 1: A borda — retorno de comando não é fala

- [x] 1.1 Predicado puro `isSystemEcho(text, translate?)` em
      `src/minecraft/chat.ts`: colchete `]` no fim sem `[` correspondente
- [x] 1.2 Confirmar que o mineflayer emite `message` antes de `chat`
      - Confirmado **na fonte**, e melhor do que a proposta esperava:
        `lib/plugins/chat.js` emite `message` → `messagestr` → e é o casador de
        padrões do `messagestr` que emite `chat`. O padrão de chat é do tipo
        antigo (`deprecated`) e repassa o `translate` da mensagem original como
        **terceiro argumento** do evento. Não precisou de estado de pareamento:
        a chave chega junto com a fala.
- [x] 1.3 `MinecraftClient` não emite `chat` quando `translate` é
      `chat.type.admin`
- [x] 1.4 Rede de segurança: mesmo sem a chave, texto que casa `isSystemEcho`
      não vira `chat`
- [x] 1.5 O que foi filtrado sai no log em nível `debug`, com o texto
- [x] 1.6 Testes com as frases reais do log (as 6 formas encontradas)
- [x] 1.7 Testes de não-regressão com fala de verdade da criança

**Quality Gate: PASSOU**
- [x] Nenhuma fala real do log de 5 dias é classificada como eco
- [x] Todas as formas de eco do log são classificadas como eco
- [x] `npx eslint src test` limpo

---

## Fase 2: A ferramenta — o relatório para de mentir

- [x] 2.1 `tools/gaps.ts` ignora eco de sistema ao ler o histórico gravado
- [x] 2.2 Eco não entra no denominador de "resolvidas local"
- [x] 2.3 Teste em `gaps.test.ts`

**Quality Gate: PASSOU** — medido no log real de 15 a 29/08:

| | Antes | Depois |
|---|---|---|
| Falas do jogador | 264 | **233** |
| Resolvidas local | 49% | **56%** |
| Grupos `NÃO ENTENDI` | 4 | **2** |
| Grupos `RESOLVIDO SÓ PELA IA` | 30 | **22** |

- [x] `teleported ...`, `set own game mode ...`, `killed ...` e
      `removed n item s ...` sumiram do relatório
- [x] `vem auqi` e `me conta um segredo do minecraft` continuam listados

---

## Fase 3: Aprender — só pedido vira comando

- [x] 3.1 Predicado puro `isQuestion(text, botName)` em `dialogue/learned.ts`
- [x] 3.2 Quarta condição de gravação, dentro do próprio `shouldLearn`
      - Ficou **dentro** de `shouldLearn`, não no chamador: guarda que o
        chamador precisa lembrar de aplicar é guarda que um dia falta.
- [x] 3.3 A recusa é logada em `debug` com o motivo
- [x] 3.4 Testes das duas frases reais

**Desvio da proposta: guarda de condição**

A proposta previa só a guarda de pergunta. Com ela sozinha,
`construa uma casa quando eu falar ja` → `STAY` continuaria no cache, e o
critério de sucesso "as 4 entradas ruins somem" seria falso.

Foi acrescentado `CONDITIONAL_MARKERS` (`quando`, `se eu`, `se voce`,
`depois que`, `toda vez que`, `sempre que`) e `learnBlockReason()` passou a
devolver `'pergunta' | 'condicao' | null`. A razão é de produto, não de
conveniência: **o bot não tem execução condicional**. Decorado, um pedido com
condição vira ação imediata — o contrário do que a criança pediu. O delta spec
foi atualizado com o requisito e o desvio.

**Quality Gate: PASSOU**
- [x] Comando aprendido legítimo continua nascendo
- [x] Nenhuma pergunta do log passaria pela guarda

---

## Fase 4: Desaprender — a palavra que a criança usa

- [x] 4.1 Predicado puro `isCorrection(text, botName)`
- [x] 4.2 Tratada antes da cascata, junto de `isGiveUp` e da resposta de papel
- [x] 4.3 Só dentro de `learned.unlearnOnStopMs` e só com replay recente
- [x] 4.4 A fala e a correção continuam entrando no histórico de conversa
- [x] 4.5 Entrada `comando_esquecido`, 5 variações
- [x] 4.6 Comentário com a data de origem e o porquê
- [x] 4.7 `npm run repertoire:sync` nas duas cópias
- [x] 4.8 Testes: casa a frase inteira, não casa "nao era isso que eu queria"

**Quality Gate: PASSOU**
- [x] `npm run repertoire:sync -- --check` diz `iguais`
- [x] 79 entradas, 384 respostas carregadas sem aviso

---

## Fase 5: Limpeza — o que já está decorado errado

- [x] 5.1 Descarte na carga por recado do jogo e por não ser pedido
      - O recado é reconhecido pelos **exemplos**, não pela frase: a frase
        guardada já passou pela normalização, que come a pontuação, e o `]` que
        denuncia o recado não está mais lá.
- [x] 5.2 Motivos separados no relatório de carga (`noise`, `notRequest`)
- [x] 5.3 Linha nova no cartão de startup: `Esqueci 5: 2 era recado do jogo, ...`
- [x] 5.4 Testes com as entradas ruins reais

**Quality Gate: PASSOU** — rodado contra o `data/learned-commands.json` de
verdade, numa cópia temporária:

```
{"loaded":3,"noise":2,"notRequest":3,"shadowed":0,"expired":0,"invalid":0}
sobrou: parado -> STOP | sim vem aqui -> FOLLOW | ja -> BUILD
```

- [x] 8 entradas viram 3; as 4 apontadas na proposta saíram, mais uma quinta
      (`faca uma casa grande com concreto se voce nao tiver fas de madeira`,
      que a guarda de condição pegou)
- [x] Entrada boa sobrevive com o contador de uso intacto

**O que a limpeza NÃO alcança**, e está assumido no delta: `ja` → `BUILD`,
decorado de um `já!` solto. Não existe sinal sintático que a denuncie. Quem
resolve é a criança, com `nao era isso` no próximo replay — que agora existe.

---

## Fase 6: Validação em jogo

- [x] 6.1 `npm test` (819 testes) e `npx eslint src test` limpos
- [ ] 6.2 Em jogo: `/gamemode creative` e `/tp` — o bot não responde nada e nada
      entra no JSONL do dia
- [ ] 6.3 Em jogo: pedido livre, replay na segunda vez sem rede (cenário 6.6 do
      `add-learned-commands`, que foi arquivado sem confirmação)
- [ ] 6.4 Em jogo: `nao era isso` depois de um replay — esquece e responde bonito
- [ ] 6.5 Em jogo: `errado` fora de replay — nada some
- [ ] 6.6 `repertoire:gaps` depois de uma sessão: só fala de gente

**Quality Gate: PENDENTE**
- [x] Todos os cenários dos deltas cobertos por teste unitário
- [ ] 6.2 a 6.6 observados no mundo aberto

> Nada entre 6.2 e 6.6 foi observado em jogo nesta sessão — o bot não subiu.
> Tudo o que está marcado acima é teste unitário ou medição sobre o arquivo
> real de log e de cache. **Não marque esses cinco sem ter visto acontecer.**

---

## Completion Checklist

- [x] Fases 1 a 5 completas
- [x] Quality gates das fases 1 a 5 passados
- [x] Repertório sincronizado nas duas cópias
- [x] `README.md` atualizado: quarta condição de aprendizado, `nao era isso`, e
      um item novo em "Problemas comuns" para o bot ficar calado no `/tp`
- [x] `BACKLOG.md`: itens 1 e 2 marcados como feitos
- [ ] Prova em jogo (fase 6) antes de `/openspec-archive`
