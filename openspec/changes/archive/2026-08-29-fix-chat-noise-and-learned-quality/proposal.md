# Proposal: Ruído do jogo fora da cascata, e cache aprendido sem lixo

**Change ID:** `fix-chat-noise-and-learned-quality`
**Created:** 2026-08-29
**Status:** Implementation Complete (falta prova em jogo)
**Completed:** 2026-08-29

---

## Problem Statement

O bot está conversando com o Minecraft achando que é a criança, e decorando o
resultado.

### O que está acontecendo

Quando o dono usa um comando do jogo (`/tp`, `/gamemode`, `/clear`), o vanilla
devolve o retorno no formato `[Fulano: Teleported Odraude to Fulano]`. O
mineflayer parte isso como se fosse fala, com `username` = dono e mensagem =
o corpo **com o `]` sobrando no fim**. O `bot.ts:291` confia no evento `chat` e
trata como fala do dono.

Está no `data/conversations/`, sem margem de dúvida:

```
{"speaker":"FresherRobin90","text":"Teleported Odraude to FresherRobin90]","source":"command"}
```

São **~20 ocorrências em 5 dias de log** — `Set own game mode to Creative Mode]`
(7x), `Set own game mode to Survival Mode]` (5x), `Teleported ... ]` (9x),
`Killed FresherRobin90]`, `Removed 3 item(s) from player FresherRobin90]`,
`Set the time to 1000]`.

### O estrago, em quatro camadas

| Camada | Estrago |
|---|---|
| Custo e privacidade | Cada uma vira chamada de IA paga, e manda para a nuvem uma frase que nem é da criança |
| Conversa | O bot responde ao jogo em voz alta: *"Eba, modo criativo!"*, *"Nossa, você caiu?"* — fala que ninguém pediu, no meio da brincadeira |
| Rotina de manutenção | O `repertoire:gaps` mostra `teleported fresherrobin90 to` como lacuna de repertório em `NÃO ENTENDI`, e alguém pode escrever entrada para atender o Minecraft |
| Aprendizado | Duas dessas viraram **comando decorado** |

### E o cache decorou coisa que não é comando

`data/learned-commands.json`, hoje, 8 entradas — **4 são lixo**:

```
"teleported odraude to fresherrobin90"          -> LOOK_AT_OWNER
"removed 3 item s from player fresherrobin90"   -> LOOK_AT_OWNER
"qual sua llm"                                  -> FOLLOW
"construa uma casa quando eu falar ja"          -> STAY
```

As duas primeiras são o bug de cima. As duas últimas são outro buraco: **a regra
de aprender não olha o que a frase é**, só se a ação terminou com `ok`. `qual
sua llm?` é uma **pergunta**; a IA respondeu conversa e mandou `FOLLOW` junto;
seguir o dono "deu certo" (sempre dá) e o par foi decorado. Agora `qual sua llm`
é um comando de seguir, sem passar por IA nenhuma.

E desfazer isso é difícil de propósito: hoje o único desfazer é `para` dentro de
15 s do replay. A criança de 7 anos que vê o bot fazer a coisa errada não diz
`para` — ela diz **"não era isso"**, e o bot não entende.

## Proposed Solution

Duas guardas, do mesmo espírito das que o projeto já tem: **catálogo fechado e
recusa conservadora**.

### 1. Retorno de comando não é fala

Uma função pura em `src/minecraft/chat.ts` responde a pergunta "isto é eco do
sistema?", e o `MinecraftClient` deixa de emitir `chat` quando ela diz que sim.
O corte fica na **borda**, antes da cascata, antes do log e antes do
aprendizado — os quatro estragos caem de uma vez.

Dois sinais, nesta ordem:

1. **Chave de tradução.** O mineflayer emite `message` (com o JSON da mensagem)
   antes de emitir `chat`. Retorno de comando vem com `translate:
   'chat.type.admin'`. Este é o sinal correto e é o que decide.
2. **Colchete desemparelhado, como rede de segurança.** `Teleported Odraude to
   FresherRobin90]` termina em `]` sem `[` correspondente — assinatura de um
   `[Fulano: corpo]` mal partido. Vale para versão de servidor em que o sinal 1
   não chegar.

Falso positivo custa uma mensagem ignorada; falso negativo custa uma chamada de
IA, uma fala fora de hora e um comando decorado errado. Por isso a recusa é
conservadora dos dois lados: **as duas regras só disparam com o `]` no fim**, o
que uma criança digitando conversa não produz.

O mesmo predicado entra no `tools/gaps.ts`. O log de 5 dias já está gravado e é
append-only — quem filtra é a leitura, e o relatório de amanhã já sai limpo.

### 2. Pergunta não vira comando decorado

Uma terceira condição para aprender, ao lado das três que já existem (veio da
IA, tinha ação, a ação deu certo): **a frase precisa ser um pedido**.

Pergunta é recusada por forma, não por assunto: termina em `?`, ou começa com
palavra interrogativa (`qual`, `quem`, `como`, `quando`, `onde`, `por que`,
`quanto`, `sera que`, `voce sabe`, `voce consegue`). É o mesmo tipo de lista
fechada e sintática que o projeto já usa na guarda de negação — nada de tentar
entender a frase.

> `sera que da pra pegar madeira?` também deixa de ser decorado, e isso é
> aceitável: a ação continua acontecendo, só não vira atalho. Perder um atalho é
> barato; decorar uma pergunta é caro.

### 3. "não era isso" desfaz

Um segundo caminho de desaprender, ao lado do `para`, com a palavra que a
criança usa de verdade: `nao era isso`, `nao e isso`, `errado`, `nao foi isso`,
`nao era esse`.

Vale a mesma janela do `para` (`learned.unlearnOnStopMs`) e o mesmo lugar na
ordem: antes da cascata, como já acontece com `isGiveUp` e com a resposta da
pergunta de papel. Sem replay recente, a frase **desce a cascata como conversa
normal** — "errado" no meio de uma brincadeira não pode apagar nada.

O bot responde por uma entrada nova de repertório, `comando_esquecido`, com 4+
variações, seguindo a regra número um: *"Ah, desculpa! Já esqueci, me ensina de
novo?"* — nunca "entrada removida do cache".

### 4. O que já está decorado errado sai sozinho

O carregamento já descarta entrada **sombreada pelo parser**. As duas guardas
novas entram no mesmo ponto: entrada cuja frase é eco de sistema ou é pergunta é
descartada na carga, contada e logada como as outras.

Assim as 4 entradas ruins de hoje somem no primeiro startup depois da mudança,
sem ninguém editar JSON à mão — que é exatamente o que o `CLAUDE.md` manda não
fazer.

## Scope

### In Scope

- Predicado puro de eco de sistema em `src/minecraft/chat.ts`, com teste.
- `MinecraftClient` deixa de emitir `chat` para retorno de comando do jogo.
- `tools/gaps.ts` ignora eco de sistema ao ler o histórico já gravado.
- Guarda de pergunta na gravação do comando aprendido.
- Frase de correção (`nao era isso`) como segundo caminho de desaprender.
- Entrada `comando_esquecido` no repertório, **nas duas cópias**.
- Descarte na carga de entrada que é eco de sistema ou pergunta, com contagem no
  banner de inicialização junto das sombreadas.
- Testes para todas as guardas novas.

### Out of Scope

- **Reescrever o histórico já gravado.** `data/conversations/*.jsonl` é
  append-only por decisão de projeto; o ruído antigo continua no arquivo e passa
  a ser filtrado na leitura.
- **Reagir a evento de sistema.** Nada de o bot comentar mudança de modo de jogo
  ou teletransporte. Se um dia isso for desejado, é feature nova, com o evento
  tratado como evento — não como fala.
- **Entender pergunta.** A guarda é sintática. Classificar intenção de fala é o
  trabalho da IA, e ela continua fazendo isso no nível 3.
- **Desaprender pelo chat com frase livre** ("esquece tudo que você aprendeu").
  O apagão geral continua sendo apagar o arquivo com o bot parado.
- Item 3 em diante do `BACKLOG.md`.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `minecraft/chat.ts` | Sim | Predicado puro `isSystemEcho` |
| `minecraft/client.ts` | Sim | Não emite `chat` para eco; pareia `message` com `chat` |
| `app/bot.ts` | Sim | Frase de correção antes da cascata, como `isGiveUp` |
| `dialogue/learned.ts` | Sim | Guarda de pergunta e predicado da frase de correção |
| `memory/learned-store.ts` | Sim | Descarte na carga por eco e por pergunta |
| Repertório (as **duas** cópias) | Sim | Entrada `comando_esquecido` |
| `tools/gaps.ts` | Sim | Filtro de eco na leitura do histórico |
| `app/startup-banner.ts` | Sim | Contagem das descartadas ganha os motivos novos |
| Providers de IA | Não | Nenhum sabe que existe filtro |
| Ações, jogos, defesa, construção | Não | — |
| Configuração | Não | Nenhuma chave nova; a janela reusa `learned.unlearnOnStopMs` |

## Architecture Considerations

- **O corte é na borda.** Filtrar em `minecraft/` e não em `behaviors/` faz o
  ruído sumir para todo mundo de uma vez — cascata, log, IA e cache. Filtrar em
  cada consumidor seria repetir a regra quatro vezes e esquecer a quinta.
- **Regra pura, I/O na borda.** `isSystemEcho` e a guarda de pergunta são
  funções puras e testáveis; quem escuta evento e quem escreve arquivo continua
  onde estava. É o par que o projeto já usa em `dialogue/` + `loader.ts`.
- **`client.ts` não vira dono de regra de comportamento.** O que ele passa a
  saber é de **protocolo**: separar fala de jogador de retorno de comando é da
  mesma natureza que separar `kicked` de `end`.
- **Descarte na carga é o mecanismo que já existe.** As guardas novas entram
  junto de `shadowed`, e o cache continua se limpando sozinho — regra nova
  aplicada retroativamente sem migração e sem editar JSON à mão.
- **A correção fala como amiga.** O desfazer é uma frase de criança, e a
  resposta vem do repertório com variação. O bot admite o erro e pede para
  aprender de novo.
- **Nada de configuração nova.** A janela do desfazer reusa
  `learned.unlearnOnStopMs`: são a mesma ideia — "isso que você acabou de fazer
  não era o que eu quis".

## Success Criteria

- [x] Retorno de comando do jogo (`/tp`, `/gamemode`, `/clear`, `/time`) não
      chega à cascata, não vira chamada de IA e não entra no JSONL
      *(coberto por teste; falta ver em jogo — tarefa 6.2)*
- [ ] O bot fica calado quando o dono usa comando do jogo *(falta ver em jogo)*
- [x] `npm run repertoire:gaps` não lista mais `teleported ...` nem
      `set own game mode ...` como lacuna — medido no log real: 264 → 233 falas,
      49% → 56% resolvidas local, 4 → 2 grupos de `miss`, 30 → 22 de `ai`
- [x] Pergunta respondida pela IA com ação junto **não** é decorada
- [x] `nao era isso` logo depois de um replay apaga a entrada e o bot responde
      com uma variação de `comando_esquecido` *(teste; falta ver em jogo)*
- [x] `nao era isso` sem replay recente segue na cascata como conversa
- [x] No primeiro startup depois da mudança as entradas ruins somem, e o banner
      diz quantas saíram e por quê — rodado contra o arquivo real: **8 → 3**,
      2 por recado do jogo e 3 por não serem pedido
- [x] Comando aprendido legítimo continua sendo replicado sem rede
- [x] `npx eslint src test` passa e `npm test` passa (819 testes)

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Filtro engolir fala de verdade da criança | Baixa | Alto | As duas regras exigem `]` no fim; teste com falas reais do log; falso positivo custa uma mensagem, não uma ação errada |
| `chat.type.admin` não chegar em alguma versão de servidor | Média | Médio | A rede de segurança do colchete desemparelhado cobre sozinha |
| Ordem `message` → `chat` não ser garantida | Média | Médio | Confirmada por teste na fase 1; se não for, o filtro roda só pelo texto |
| Guarda de pergunta barrar pedido legítimo em forma de pergunta | Média | Baixo | Só o atalho é perdido: a ação acontece igual, pela IA |
| `errado` apagar aprendizado bom no meio de uma brincadeira | Baixa | Médio | Só dentro da janela e só se houve replay; fora disso é conversa |
| Descarte na carga apagar entrada boa | Baixa | Médio | Mesmos predicados dos testes; e cache perdido é reaprendido em um pedido |
| Criança falar "não era isso" e o bot esquecer o comando certo | Baixa | Baixo | É o comportamento pedido; ela reensina numa frase |

---

## Archive Information

**Archived:** 2026-08-29
**Duration:** proposto, implementado e arquivado no mesmo dia
**Outcome:** implementado; ver a ressalva de verificação abaixo

### Arquivos modificados

| Arquivo | O quê |
|---|---|
| `src/minecraft/chat.ts` | `isSystemEcho()` e `ADMIN_TRANSLATE` |
| `src/minecraft/client.ts` | não emite `chat` para retorno de comando |
| `src/dialogue/learned.ts` | `isQuestion`, `learnBlockReason`, `isCorrection`, `isEchoCommand`; 4ª condição em `shouldLearn` |
| `src/memory/learned-store.ts` | descarte na carga por `noise` e `notRequest` |
| `src/app/bot.ts` | `tryCorrectLearned()` antes da cascata; log da recusa de aprender |
| `src/app/startup-banner.ts` | linha `Esqueci N:` com os motivos separados |
| `src/tools/gaps.ts` | filtro de eco na leitura do histórico |
| Repertório (as **duas** cópias) | entrada `comando_esquecido` |
| `README.md` | 4ª condição, `nao era isso`, item novo em "Problemas comuns" |
| `test/{minecraft,learned,gaps,startup-banner}.test.ts` | 19 testes novos |

### Specs atualizadas

- `openspec/specs/minecraft_connection.md` — requisito **novo** "Retorno de
  comando do jogo não é fala de jogador" (7 cenários)
- `openspec/specs/conversation_memory.md` — dois requisitos novos ("O histórico
  guarda fala de gente", "A rotina de manutenção lê só conversa"); "Registro de
  toda troca" passa a dizer *toda troca com gente*
- `openspec/specs/learned_commands.md` — três requisitos novos ("Só pedido vira
  comando aprendido", "A criança desfaz com a palavra dela", "Regra nova limpa o
  que já está decorado"); as três condições viram quatro; os dois caminhos de
  desaprender viram três
- `openspec/specs/local_dialogue.md` — entrada `comando_esquecido`; a cascata
  ganha a nota do que **não entra** nela
- `openspec/specs/startup_console.md` — motivos do descarte separados no cartão

### O que foi medido, e em cima do quê

Com o log real de 15 a 29/08/2026 e o `data/learned-commands.json` real:

| | Antes | Depois |
|---|---|---|
| Falas do jogador no relatório | 264 | 233 |
| Resolvidas localmente | 49% | 56% |
| Grupos `NÃO ENTENDI` | 4 | 2 |
| Grupos `RESOLVIDO SÓ PELA IA` | 30 | 22 |
| Entradas no cache aprendido | 8 | 3 |

### Ressalva de verificação

As tarefas **6.2 a 6.6** do `tasks.md` — silêncio no `/tp` e `/gamemode`, replay
sem rede na segunda vez, `nao era isso` esquecendo e respondendo, `errado` fora
de janela não apagando nada, e um `repertoire:gaps` depois de uma sessão de jogo
— **não foram verificadas em jogo**. O bot não subiu na sessão que implementou,
e o arquivamento foi decisão do dono do projeto.

Tudo está coberto por teste unitário e por medição sobre os arquivos reais de
log e de cache; o que falta é a observação no mundo aberto. Quem for mexer nisto
deve tratar esses cinco como não confirmados.

Junto deles seguem por confirmar os cenários **6.6 e 6.7 do
`add-learned-commands`**, que este change tinha adotado na fase 6 pelo mesmo
motivo e que continuam pendentes desde 2026-08-20.

### Desvio da proposta, registrado na spec

A proposta previa só a guarda de pergunta. Ela sozinha deixaria
`construa uma casa quando eu falar ja` → `STAY` no cache, e o critério "as 4
entradas ruins somem" seria falso. Foi acrescentada a guarda de **condição**
(`quando`, `se eu`, `se voce`, `depois que`, `toda vez que`, `sempre que`), da
mesma natureza sintática e pela razão certa: **o bot não tem execução
condicional**. Ela pegou uma quinta entrada.

### O que ficou de fora, de propósito

`ja` → `BUILD`, decorado de um `já!` solto, continua no cache: não existe sinal
sintático que a denuncie. Quem resolve é a criança, com `nao era isso` no
próximo replay — que agora existe. Está escrito como cenário na spec para não
virar surpresa depois.

### Nota sobre o merge

Seguido o aviso deixado pelo arquivamento de `add-learned-commands`: **seção
`MODIFIED` de delta neste projeto é acréscimo, não substituição.** O merge foi
feito à mão, requisito por requisito, e conferido por contagem: nenhum cenário
foi perdido em nenhum dos cinco arquivos (8→15, 34→40, 32→48, 66→71, 23→25). As
únicas quatro linhas removidas em todo o merge são as duas frases que os
requisitos `MODIFIED` reescreveram.

---

## Verificado em jogo

**2026-08-30 — o dono testou e aprovou.**

A ressalva acima descreve o estado em que este change foi arquivado, algumas
horas antes. Fica registrada como histórico: é ela que explica por que os itens
de "em jogo" do `tasks.md` continuam sem marca.

As caixas **não** foram marcadas uma a uma de propósito. O que houve foi
aprovação da sessão inteira; dizer qual cenário específico foi exercitado seria
inventar detalhe que ninguém observou.
