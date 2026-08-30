# Proposal: Quente e frio, o terceiro jogo

**Change ID:** `add-hot-and-cold`
**Created:** 2026-08-30
**Status:** Draft

---

## Problem Statement

O bot sabe duas brincadeiras, e as duas são de **correr**: esconde-esconde e
pega-pega. As duas exigem pathfinding, terreno bom e uma criança disposta a
perseguir ou fugir.

Falta uma brincadeira de **conversa** — e conversa é justamente o que uma
criança de 7 anos mais quer de um amigo virtual.

O registro de jogos já é extensível: `GAME_NAMES`, `ROLES_BY_GAME`,
`createSession()` e o `GameWorld` estreito estão prontos desde o pega-pega. O
que falta é uma rodada que use isso.

## Proposed Solution

**Quente e frio.** O bot escolhe um ponto secreto perto da criança e vai dizendo
se ela está esquentando ou esfriando.

É o jogo mais barato do registro em movimento — ninguém persegue ninguém, e não
há linha de visão nem esconderijo a avaliar — e o mais generoso em conversa: o
bot fala a cada dois segundos.

### Três decisões que são sobre a criança, não sobre o código

- **"Morno" existe.** Criança para de andar para pensar. Dizer "frio" nessa hora
  seria mentira: ela não se afastou, só ficou parada. O bot pede que ela ande.
- **"Pelando" é sobre distância absoluta**, não sobre movimento. Perto é perto
  mesmo que ela tenha acabado de dar um passo para trás — e é a dica que faz
  ela olhar em volta em vez de continuar andando.
- **Ele não repete a mesma palavra toda vez.** Mudança sempre sai; repetição sai
  a cada `repeatEvery` passos. Repetir "frio" oito vezes seguidas enche o chat e
  a criança para de ler.

### Um papel só, e por isso nenhuma pergunta

Quem esconde é sempre o bot. `ROLES_BY_GAME['quente_frio']` tem um item, e
`startGame` passa a escolher sozinho quando a lista tem tamanho 1 — perguntar
seria fazer uma pergunta de uma resposta só.

O papel inverso (a criança esconde e guia o bot) exigiria o bot **ouvir** o chat
no meio da rodada, que é uma capacidade que o `GameWorld` não tem. Fica de fora.

### O ponto é do bot e nunca é dito

Contar onde é acabaria com a brincadeira. Tem teste travando que nenhuma fala do
jogo contenha coordenada.

No fim — achou, desistiu ou estourou o tempo — ele **leva a criança até o
lugar**. Rodada de esconder que acaba sem revelar deixa a criança sem fecho, e
sem saber se o bot estava mesmo com um lugar em mente.

## Scope

### In Scope

- `domain/hot-cold.ts`: as seis temperaturas e a regra, puras.
- `behaviors/games/hot-cold.ts`: a rodada, no contrato `GameWorld` de sempre.
- `quente_frio` no registro, com o papel `bot_esconde_ponto`.
- Jogo de um papel só não faz a pergunta de papel.
- `hotCold` na configuração, documentado.
- Nove entradas de repertório, 4-5 variações cada, nas **duas** cópias.
- Varredura das falas que diziam "sei duas brincadeiras".
- Testes.

### Out of Scope

- **A criança esconder e o bot procurar.** Exigiria o bot ouvir o chat durante a
  rodada; o `GameWorld` não tem isso, e dar essa capacidade a ele é mudança de
  contrato que merece o próprio change.
- **Tesouro de verdade** (um baú, um item no chão). O ponto é imaginário de
  propósito: pôr um baú no mundo da criança é mexer no mundo dela.
- **Placar entre rodadas.**

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `domain/hot-cold.ts` | **Novo** | Temperaturas e regra |
| `behaviors/games/hot-cold.ts` | **Novo** | A rodada |
| `domain/games.ts` | Sim | Jogo, papel e duas fases novas |
| `behaviors/games/index.ts` | Sim | Registro |
| `app/bot.ts` | Sim | Jogo de um papel só não pergunta |
| `behaviors/commands.ts` | Sim | 9 padrões; `ROLE_ANSWERS` ganha a chave vazia |
| `config/schema.ts` + exemplo | Sim | Bloco `hotCold` |
| Repertório (as **duas** cópias) | Sim | 9 entradas novas, 3 falas atualizadas |

## Architecture Considerations

- **O registro provou que era extensível.** Um jogo novo entrou sem mexer em
  esconde-esconde nem em pega-pega — só somando.
- **`GameWorld` não mudou.** A rodada nova usa o contrato que já existia, o que
  é a evidência de que ele estava no tamanho certo.
- **Regra pura, sessão na borda**, como nos outros dois.
- **Catálogo fechado** de temperaturas, com `Record` de falas: temperatura nova
  sem fala não compila.

## Success Criteria

- [ ] `quente e frio` começa uma rodada sem perguntar papel
- [ ] O bot fala quente/frio conforme a criança anda
- [ ] Parada, ela ouve "morno" e um pedido para andar
- [ ] Chegando perto, ela ouve "pelando" e depois "achou"
- [ ] Desistência e tempo esgotado revelam o lugar
- [ ] Nenhuma fala do jogo entrega a coordenada
- [ ] `npm test` e `npx eslint src test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| O chat encher de "frio" | Alta sem guarda | Médio | `repeatEvery`: repetição espaçada, mudança sempre sai |
| Ponto escolhido inalcançável | Média | Médio | Só ponto com chão e alcançável pelo pathfinder |
| A criança não entender a brincadeira | Média | Alto | A fala de abertura explica em uma frase, e "morno" ensina que é preciso andar |
| Rodada não acabar | Baixa | Médio | `roundTimeoutMs` revela e encerra |
| Falar a coordenada por engano | Baixa | Alto | Teste trava que nenhuma fala tenha número de posição |

---

## Archive Information

**Archived:** 2026-08-30
**Duration:** implementado e arquivado no mesmo dia
**Outcome:** implementado; ver a ressalva de verificação abaixo

### Specs atualizadas

- `bot_games.md` — "Quente e frio" e "Jogo de um papel só não pergunta"
- `local_dialogue.md` — as nove falas do jogo

### Ressalva de verificação

**Nada deste change foi provado em jogo.** As tarefas em aberto no `tasks.md`
continuam em aberto, e o arquivamento foi decisão do dono do projeto.

Nenhuma rodada foi jogada. Se a brincadeira é divertida, teste nenhum mede.

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
