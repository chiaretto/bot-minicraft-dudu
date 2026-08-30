# Proposal: Dormir na cama, e pular a noite

**Change ID:** `add-sleep`
**Created:** 2026-08-30
**Status:** Draft

---

## Problem Statement

`pedido_dormir` nasceu em 19/08 de três jeitos diferentes de pedir a mesma
coisa no mesmo dia: `deite na cama`, `vamos dormir`, `queria ver se voce
conseguia dormir`. A resposta era honesta e triste:

> *"Eu não sei dormir, {owner}. Mas fico de olho enquanto você dorme!"*

O que essa recusa custa é maior do que parece. Dormir no Minecraft **pula a
noite** — e a noite é a parte do jogo que mais assusta uma criança de 7 anos.
O bot ficava de guarda enquanto a criança atravessava sozinha justamente o
pedaço difícil.

## Proposed Solution

`SLEEP`: ele acha a cama mais perto (24 blocos), anda até ela e deita.

### Recusar cedo, e com fala

O Minecraft só deixa dormir de noite. Atravessar o mundo até uma cama para
levar um "não" do servidor seria pior do que não tentar — então a recusa
acontece **antes de andar**, com três motivos e uma fala para cada um:

| Motivo | Fala |
|---|---|
| `de_dia` | "Só dá pra dormir de noite! Me chama quando escurecer." |
| `sem_cama` | "Não achei cama nenhuma por aqui. Põe uma cama que eu deito!" |
| `longe` | "A cama que eu achei tá muito longe daqui." |

As falas moram **junto da regra**, num `Record` tipado: quem acrescentar um
motivo novo é obrigado pelo compilador a escrever a fala. Recusa sem fala é o
bot parecendo quebrado.

### O "não" do servidor também vira português

O servidor recusa com motivo próprio, em inglês — *"you may not rest now, there
are monsters nearby"*. Traduzir isso é a diferença entre a criança entender e
não entender:

> *"Tem monstro por perto! Não dá pra dormir assim."*

### "boa noite" NÃO manda ele dormir

É despedida na boca de uma criança, não ordem. Mandar o bot para a cama porque
ela se despediu seria obedecer a coisa errada.

De quebra, a varredura achou um erro antigo: `boa noite` caía em `elogio_bot`
pela palavra "boa", e o bot agradecia um elogio que ninguém fez. Foi para
`despedida`, que é onde sempre deveria ter estado.

### `para` tira ele da cama

O abort não acorda ninguém: `stopEverything` passa a chamar `wake()`.

## Scope

### In Scope

- `domain/sleeping.ts`: cama, as três recusas e as falas — puro.
- `sleepInBed()` e `wakeUp()` em `actions/`.
- `SLEEP` no catálogo, schema, aprendíveis e prompt.
- 12 padrões em `commands.ts`.
- `pedido_dormir` vira `pergunta_dormir`: as ordens saíram para o parser, as
  perguntas ficaram, e a resposta mudou de "não sei" para "sei, e pulo a noite".
- `boa noite` movido para `despedida`.
- Testes.

### Out of Scope

- **Pôr cama.** Cama é item com estado e ocupa dois blocos; `PLACE_BLOCK` põe
  bloco simples. Se não houver cama, ele pede uma.
- **Dormir sozinho ao anoitecer.** Seria instinto, e instinto que some com o
  bot no meio de uma brincadeira é pior que a noite.
- **Definir spawn.** Dormir já define, mas isso é efeito do jogo, não promessa
  do bot.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `domain/sleeping.ts` | **Novo** | Cama, recusas e falas |
| `behaviors/actions/index.ts` | Sim | `sleepInBed()` e `wakeUp()` |
| `app/bot.ts` | Sim | `para` acorda |
| `domain/intent.ts`, `ai/prompt.ts` | Sim | `SLEEP` |
| `behaviors/commands.ts` | Sim | 12 padrões |
| Repertório (as **duas** cópias) | Sim | `pergunta_dormir`; `boa noite` em `despedida` |

## Architecture Considerations

- **A fala mora com a regra.** `SLEEP_REFUSAL_LINES` é um `Record` sobre o tipo
  da recusa: motivo novo sem fala não compila.
- **Recusa cedo.** A regra pura decide antes de qualquer passo no mundo.
- **Traduzir o servidor é trabalho do bot.** Nada em inglês chega ao chat.

## Success Criteria

- [ ] De noite, com cama perto, ele deita e a noite passa
- [ ] De dia ele recusa e diz por quê, sem sair andando
- [ ] Sem cama, ele pede uma cama
- [ ] Com monstro perto, o "não" do servidor chega em português
- [ ] `boa noite` continua sendo despedida
- [ ] `para` tira ele da cama
- [ ] `npm test` e `npx eslint src test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| "boa noite" virar ordem de dormir | Alta sem guarda | Médio | Fora dos padrões, com teste travando |
| Ele andar até a cama e o servidor recusar | Média | Baixo | Recusa cedo cobre dia, ausência e distância; o resto vira fala traduzida |
| Ficar preso na cama | Baixa | Médio | `para` acorda; o jogo acorda sozinho ao amanhecer |
| A criança pedir cama que não existe | Alta | Baixo | Ele pede uma cama, que é uma coisa que ela sabe fazer |

---

## Archive Information

**Archived:** 2026-08-30
**Duration:** implementado e arquivado no mesmo dia
**Outcome:** implementado; ver a ressalva de verificação abaixo

### Specs atualizadas

- `player_commands.md` — "Dormir na cama" e a guarda do "boa noite"
- `local_dialogue.md` — `pergunta_dormir`

### Ressalva de verificação

**Nada deste change foi provado em jogo.** As tarefas em aberto no `tasks.md`
continuam em aberto, e o arquivamento foi decisão do dono do projeto.

O bot nunca dormiu, e a tradução do "não" do servidor (monstro por perto) nunca foi vista.

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

---

## Verificado em jogo

**2026-08-30 — o dono testou e aprovou.**

A ressalva acima descreve o estado em que este change foi arquivado, algumas
horas antes. Fica registrada como histórico: é ela que explica por que os itens
de "em jogo" do `tasks.md` continuam sem marca.

As caixas **não** foram marcadas uma a uma de propósito. O que houve foi
aprovação da sessão inteira; dizer qual cenário específico foi exercitado seria
inventar detalhe que ninguém observou.
