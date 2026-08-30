# Proposal: Quatro plantas novas — piscina, ponte, escada e cerca

**Change ID:** `add-more-blueprints`
**Created:** 2026-08-30
**Status:** Implementation Complete (falta prova em jogo)
**Completed:** 2026-08-30

---

## Problem Statement

O bot sabe construir **duas** coisas: `casa` e `torre`. Tudo o mais é recusa.

`"construa uma piscina"` apareceu **duas vezes** no log de 29/08, e as duas
respostas foram a IA pedindo desculpa:

> *"Desculpa, piscina eu não sei fazer! Só consigo fazer casa e torre. Quer uma
> torre em vez disso?"*

E a recusa está espalhada pelo repertório: **seis falas** prometem "casinha e
torre" como se fosse o repertório inteiro de obra — em `capacidades` (duas),
`recusa_escopo`, `pedido_cavar`, `dono_construindo` e `pedido_soltar_item` —
mais um comentário de origem que diz a mesma coisa.

O custo de não fazer é maior do que parece. A máquina de construir **já existe
inteira** — planta, âncora que não enterra a criança, escolha de material, busca
automática do que falta, colocação em passadas com apoio, obra interrompível. O
que falta é só **geometria**: cada estrutura nova é uma função que devolve uma
lista de blocos em ordem.

## Proposed Solution

Quatro plantas novas, escolhidas por serem **distintas entre si** — nada de
variação de tamanho da mesma caixa:

| Planta | O que é | Blocos |
|---|---|---|
| `piscina` | Bacia 5x5: fundo fechado e borda de 1 de altura, **sem tampa** | 41 |
| `ponte` | Passarela de 3 de largura por 9 de comprimento, com guarda-corpo dos dois lados | 45 |
| `escada` | Escadaria de 5 degraus, 2 de largura, subindo em cheio | 30 |
| `cerca` | Curral 7x7 de 2 de altura, com portão de 1 vão | 46 |

Nenhuma passa de 80 blocos — o teto que o teste já cobra para a criança não
cansar de assistir. O catálogo vai de 2 para 6.

### A piscina é honesta sobre a água

O bot não tem balde, e balde não está neste change. A piscina que ele levanta é
a **bacia**: fundo e borda, pronta para receber água. A fala do fim diz isso
com todas as letras:

> *"Piscina pronta! Agora joga água dentro com o balde!"*

Prometer uma piscina cheia seria quebrar a regra número um. Entregar a bacia e
dizer o que falta é o que um amigo faria — e a criança consegue completar
sozinha, o que é melhor do que assistir.

### Cada estrutura ganha a própria fala de conclusão

Hoje o fim de obra é uma frase só, escrita para casa:
*"Pronto! Sua casa tá de pé. Entra pra ver!"* — que sai errada em quatro das seis
plantas ("entra pra ver" numa escada, numa ponte, numa piscina).

A planta passa a carregar duas frases, `finishedLine` e `partialLine`, ao lado
da geometria. Ficam **junto da planta** de propósito: um mapa paralelo em outro
arquivo é o tipo de coisa que alguém esquece de estender ao acrescentar a
sétima estrutura, e aí a piscina volta a convidar a criança a entrar.

### A ordem de colocação continua sendo o invariante

No Minecraft só dá para colocar bloco encostado em algo que já existe. O teste
que trava isso já roda para **toda** estrutura do catálogo, então as quatro
novas nascem cobertas. Duas delas exigiram pensar a ordem:

- **Escada:** camada por camada, não coluna por coluna. Subir um degrau inteiro
  antes do seguinte violaria "de baixo para cima"; a ordem certa é a camada
  `y=0` de todos os degraus, depois a `y=1` dos que ainda sobem, e assim por
  diante.
- **Ponte:** o tabuleiro sai na ordem do comprimento, cada bloco encostado no
  anterior. É o que permite a ponte crescer **sobre um vão** — onde não existe
  chão para apoiar.

### Sem promessa desatualizada sobrando

O change varre as falas do repertório que dizem "casinha e torre", o
catálogo que a IA recebe no prompt (`"structure" é "casa" ou "torre"`, hoje
escrito à mão) e a tabela de comandos do README.

O catálogo do prompt passa a ser **gerado** de `STRUCTURE_NAMES`: a sétima
planta não pode exigir que alguém lembre de editar o prompt.

## Scope

### In Scope

- `piscina`, `ponte`, `escada` e `cerca` em `STRUCTURE_NAMES` e no gerador de
  plantas.
- `finishedLine` e `partialLine` por estrutura; `build.ts` passa a usá-las.
- Padrões de comando para as quatro, em `behaviors/commands.ts`, incluindo os
  apelidos que a criança usa (`curral`, `piscininha`, `pontezinha`,
  `cercadinho`).
- Catálogo de estruturas do prompt da IA gerado de `STRUCTURE_NAMES`.
- Varredura das falas do repertório que prometem só casa e torre, **nas duas
  cópias**.
- README: tabela de comandos e a seção de construir.
- Testes de geometria para as quatro, mais os invariantes que já rodam para
  todas.

### Out of Scope

- **Água na piscina.** Balde é item, não bloco; encher exige um verbo que o bot
  não tem. A bacia é entregue vazia, e a fala diz isso.
- **Porta e vidro de verdade.** A casa já usa vão aberto em vez de porta; as
  plantas novas seguem a mesma regra. Item com estado (porta, portão, cerca de
  madeira) é outro assunto.
- **Iglu.** Estava no `BACKLOG.md` como candidato e ficou de fora: sem neve na
  allowlist de material, um "iglu" de pedra é uma casa com nome errado. Volta
  quando houver material próprio.
- **Escolher tamanho pelo pedido** ("uma casa grande"). O catálogo é fechado e
  cada nome é uma planta só.
- **Cavar para encaixar a obra no terreno.** A obra continua nascendo por cima
  do chão, sem derrubar nada.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `domain/blueprints.ts` | Sim | Quatro geradores novos; plantas passam a carregar as falas |
| `behaviors/actions/build.ts` | Sim | Usa as falas da planta em vez de uma frase fixa |
| `behaviors/commands.ts` | Sim | Padrões das quatro estruturas |
| `ai/prompt.ts` | Sim | Catálogo de estruturas gerado de `STRUCTURE_NAMES` |
| `domain/intent.ts` | Não | O enum do schema já sai de `STRUCTURE_NAMES` |
| Repertório (as **duas** cópias) | Sim | Sete falas que prometiam só casa e torre |
| `README.md` | Sim | Tabela de comandos e seção de construir |
| Configuração | Não | `buildMaxBlocks` (120) já cobre a maior planta nova (46) |
| Ações, jogos, defesa, cache aprendido | Não | — |

## Architecture Considerations

- **Catálogo fechado, outra vez.** `STRUCTURE_NAMES` continua sendo a única
  fonte: schema da IA, validação de intenção e prompt saem dele. Acrescentar
  uma planta é mexer em um lugar.
- **Geometria pura.** `blueprints.ts` continua sem `mineflayer`: decide o quê e
  em que ordem; quem encosta em bloco é `build.ts`.
- **A ordem é lei.** O invariante de apoio e o "de baixo para cima" já rodam
  para todo o catálogo — planta nova que erre a ordem quebra o teste antes de
  chegar ao mundo.
- **Nada de estrutura grande.** O teto de 80 blocos é sobre a criança, não sobre
  desempenho: obra que demora demais é obra que ela abandona no meio.
- **Cada planta é uma unidade.** Geometria, tamanho e as duas falas ficam no
  mesmo lugar, porque é assim que a sétima planta nasce completa.

## Success Criteria

- [x] `dudu, faz uma piscina` levanta a bacia e diz que falta a água
      *(teste; falta ver em jogo — tarefa 6.3)*
- [x] `dudu, faz uma ponte`, `constrói uma escada` e `faz um curral` funcionam
      — a escada mudou de verbo, ver o desvio abaixo
- [x] Cada estrutura termina com uma fala que faz sentido para ela
- [x] Nenhuma fala do repertório continua dizendo que ele só sabe casa e torre
- [x] A IA recebe as seis estruturas no prompt, sem ninguém editar o prompt
- [x] Os invariantes de ordem e de tamanho passam para as seis
- [x] `npm test` (853 testes) e `npx eslint src test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Ordem errada deixa obra pela metade | Média | Alto | O teste de apoio roda para toda estrutura do catálogo |
| Ponte sobre vão não acha apoio | Média | Médio | Tabuleiro sai na ordem do comprimento, cada bloco encostado no anterior; o algoritmo já adia bloco sem apoio e volta nele |
| Piscina sem água frustrar a criança | Média | Baixo | A fala do fim diz o que falta e como completar |
| Padrão novo roubar frase de outro comando | Média | Médio | `repertoire:check` com as frases antigas antes de fechar |
| Cerca de 7x7 não caber no terreno | Média | Baixo | A obra pula posição ocupada, como já faz; termina parcial e fala |
| Criança pedir planta que não existe ("castelo") | Alta | Baixo | Catálogo fechado: a IA recusa com educação, como hoje |

---

## Desvio da proposta: o verbo da escada

A proposta dizia `faz uma escada`. Na implementação apareceu que essa frase
**já tinha dono**: é padrão de `ESCAPE_HOLE` desde `add-escape-hole`, e é como
quem caiu num buraco pede socorro.

O log resolveu o empate. A criança pede obra com o verbo **"construa"** — foi
assim que ela pediu a piscina, duas vezes. Então a escadaria ficou com a família
do verbo de obra (`constroi`, `construa`, `monta`, `quero`, `me faz`) e as frases
ambíguas continuam sendo socorro: perder uma escadaria é chato, ficar preso num
buraco é pior.

Está travado por teste, comentado no `commands.ts` e avisado no README.

---

## Archive Information

**Archived:** 2026-08-30
**Duration:** implementado e arquivado no mesmo dia
**Outcome:** implementado; ver a ressalva de verificação abaixo

### Specs atualizadas

- `player_commands.md` — três requisitos novos (plantas, falas de obra, parser)
- `local_dialogue.md` — varredura de "casinha e torre"; prompt gerado

### Ressalva de verificação

**Nada deste change foi provado em jogo.** As tarefas em aberto no `tasks.md`
continuam em aberto, e o arquivamento foi decisão do dono do projeto.

Nenhuma das quatro plantas foi levantada em jogo; a piscina nunca segurou água de balde.

O que sustenta o arquivamento é teste unitário, medição sobre os arquivos reais
de log e de cache, e a prova de que os módulos carregam em Node de verdade sobre
o `dist/`.

### Nota do arquivamento em lote

Os dez changes de 29 e 30/08 foram arquivados na mesma sessão, em ordem
cronológica de implementação. Duas coisas apareceram na conferência e valem
para os próximos deltas:

- **`MODIFIED` que não acha alvo.** Vários deltas apontavam para requisitos que
  não existem com aquele nome (`Configuração do comportamento`,
  `Privacidade do que aparece no terminal`, `Comportamento de emergência` no
  componente errado). Foram escritos do ponto de vista da feature, não do índice
  da spec. **Confira o índice antes de escrever um `MODIFIED`.**
- **Configuração sem delta.** Quatro changes criaram chave de configuração e
  nenhum trouxe delta de `configuration`. As chaves entraram na spec durante o
  arquivamento, num requisito próprio — sem isso, a fonte da verdade ficaria sem
  metade do que o `config.example.yaml` tem.

O merge foi por acréscimo e conferido por contagem: nenhum cenário perdido em
nenhuma das oito specs. As únicas cinco linhas removidas em todo o lote são as
frases que os requisitos `MODIFIED` reescreveram.
