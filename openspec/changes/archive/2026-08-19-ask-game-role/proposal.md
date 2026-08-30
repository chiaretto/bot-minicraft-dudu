# Proposal: O bot pergunta quem faz cada papel

**Change ID:** `ask-game-role`
**Created:** 2026-08-19
**Status:** Implementation Complete
**Completed:** 2026-08-19

---

## Problem Statement

As duas brincadeiras têm dois papéis cada — no esconde-esconde o bot se esconde
ou procura; no pega-pega ele pega ou foge. Hoje **a frase escolhe o papel**, e
só ela:

| O que a criança digita | Papel que sai | O que ela provavelmente queria |
|---|---|---|
| `dudu, pega pega` | `bot_pega` — o bot corre atrás | pode ser qualquer um dos dois |
| `dudu, me pega` | `bot_foge` — o bot foge | isso mesmo |
| `dudu, esconde esconde` | `bot_esconde` — o bot se esconde | pode ser qualquer um dos dois |
| `dudu, eu vou me esconder` | `bot_procura` — o bot procura | isso mesmo |

Quer dizer: para escolher o papel, a criança precisa **saber de cor a frase
exata** que ativa aquele papel. Quem digita o nome da brincadeira — o jeito mais
natural de convidar — nunca escolhe: leva sempre o padrão, e o padrão é uma
decisão do código, não dela.

O efeito prático é o relatado pelo dono: **não está fácil escolher o
comportamento**. A criança pede `pega pega` querendo fugir, o bot foge dela, e
não há nada no chat ensinando que existia outra opção.

Isso bate de frente com a regra do público (`openspec/project.md` → "Público do
bot"): a criança nem sempre sabe o que pedir, e cabe ao bot ensinar o caminho.

## Proposed Solution

Quando o convite **não disser o papel**, o bot pergunta antes de começar, e a
resposta da criança decide:

```
Miguel: dudu, pega pega
Dudu:   Quem corre: eu ou você?
Miguel: eu
Dudu:   Então eu pego! Vou contar até 5...
```

E quando o convite **já disser o papel**, nada muda — perguntar ali seria
repetir o que a criança acabou de falar:

```
Miguel: dudu, me pega
Dudu:   Vou te pegar! Contando: 1...
```

A regra que sustenta as duas colunas é uma só, e é a mesma que já existe para o
convite genérico `vamos brincar`:

> **Papel ausente é pergunta, não padrão.**

### Como fica no código

1. Os convites pelo **nome do jogo** (`pega pega`, `vamos brincar de esconde
   esconde`, …) deixam de carregar `role` em `commands.ts`. Continuam sendo
   `PLAY_GAME`, só que sem papel.
2. Os convites com **papel explícito** (`me pega`, `eu vou me esconder`, …)
   ficam exatamente como estão.
3. `startGame()` passa a tratar `role` ausente como pergunta: fala a pergunta do
   jogo e guarda uma **escolha pendente** `{ game, expiresAt }`. Não entra em
   `GAME` e não cria sessão nenhuma enquanto não houver resposta.
4. A resposta é lida no topo de `onChat`, no mesmo lugar e do mesmo jeito que o
   `isGiveUp` já é lido hoje — antes da cascata, e só quando faz sentido.
5. `DEFAULT_ROLE_BY_GAME` deixa de existir: com papel ausente virando pergunta,
   não sobra caminho que precise de um padrão.

### As perguntas e as respostas

| Jogo | Pergunta | `eu` → papel do bot | `você` → papel do bot |
|---|---|---|---|
| esconde-esconde | `Quem se esconde: eu ou você?` | `bot_procura` | `bot_esconde` |
| pega-pega | `Quem corre: eu ou você?` | `bot_pega` | `bot_foge` |

**A mesma palavra significa papéis opostos nos dois jogos** — por isso a escolha
pendente guarda o jogo, e o parser de resposta recebe o jogo como parâmetro.
Um `eu` solto, sem pergunta pendente, continua sendo conversa comum.

Respostas aceitas, já normalizadas (minúsculas, sem acento, sem pontuação):

| Jogo | criança | bot |
|---|---|---|
| esconde-esconde | `eu`, `sou eu`, `eu quero`, `eu me escondo`, `eu escondo`, `eu que me escondo`, `eu vou me esconder` | `voce`, `tu`, `e voce`, `voce se esconde`, `voce esconde`, `voce que se esconde`, `voce vai se esconder` |
| pega-pega | `eu`, `sou eu`, `eu quero`, `eu corro`, `eu fujo`, `eu que corro`, `eu vou correr` | `voce`, `tu`, `e voce`, `voce corre`, `voce foge`, `voce que corre`, `voce vai correr` |

> **Cada lista usa só o verbo que a pergunta citou.** `eu pego` / `voce pega` e
> `eu procuro` / `voce procura` ficaram **de fora** de propósito: `voce pega`
> respondendo "quem corre?" pareceria dizer que o bot corre, quando quer dizer
> exatamente o contrário. Essas frases já são comando com papel explícito, e o
> parser normal as resolve com o papel certo. Descoberto ao implementar —
> a primeira versão desta lista as incluía e teria invertido o papel.

## Scope

### In Scope

- Pergunta de papel quando o convite não traz papel, nos **dois** jogos.
- Convite com papel explícito continua começando direto.
- Escolha pendente com jogo, prazo (`games.roleQuestionTimeoutMs`, padrão 45 s)
  e regras de descarte.
- Parser das respostas, por jogo.
- Duas entradas novas no repertório (as perguntas), com 4+ variações cada.
- Remoção de `DEFAULT_ROLE_BY_GAME`.
- Testes.

### Out of Scope

- Mudar como cada papel **se comporta** depois de escolhido. Contagem, fuga,
  esconderijo, tudo segue igual.
- Perguntar de novo em rodadas seguintes ("da última vez você escolheu…"):
  memória de preferência é outro assunto.
- Perguntar qual brincadeira — isso já existe e não muda.
- Chave de configuração para desligar a pergunta.
- Jogo novo no registro.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| Domínio (`src/domain/games.ts`) | Sim | Sai `DEFAULT_ROLE_BY_GAME`; entra o mapa resposta → papel por jogo |
| Comandos (`src/behaviors/commands.ts`) | Sim | Convites por nome do jogo perdem `role`; novo `parseRoleAnswer(game, texto)` |
| Sessão de jogo (`src/behaviors/games/index.ts`) | Sim | `resolveRole` passa a exigir papel — quem não tem não chega até aqui |
| App (`src/app/bot.ts`) | Sim | Escolha pendente, pergunta, leitura da resposta, prazo e descarte |
| Configuração (`src/config/schema.ts`) | Sim | `games.roleQuestionTimeoutMs`, padrão 45000 |
| Repertório (as **duas** cópias) | Sim | `jogo_quem_esconde` e `jogo_quem_corre` |
| Máquina de estados | Não | A pendência não é estado do bot: ele fica em `IDLE` esperando |
| IA | Não | `PLAY_GAME` sem papel vindo da IA cai na mesma pergunta |
| Conexão, defesa, memória | Não | — |

## Architecture Considerations

- **A pendência não é um estado da máquina de estados.** Enquanto espera a
  resposta o bot continua em `IDLE` (ou no que estava), livre para seguir,
  parar, conversar e se defender. Um estado novo só para segurar uma pergunta
  seria caro e daria prioridade a algo que não faz nada.
- **Leitura da resposta segue o precedente do `isGiveUp`**: uma checagem curta
  no topo do `onChat`, guardada por condição de contexto, antes da cascata.
  Nenhum caminho novo de despacho.
- **Cascata intacta**: parser → repertório → IA continua valendo. A resposta de
  papel é uma pré-condição, do mesmo jeito que desistir já é.
- **Falas do repertório**, como toda fala de jogo — instantâneas e sem IA.
- **Público**: a pergunta ensina as duas opções em uma frase curta. É
  exatamente o "sugerir um comando que funciona" da regra número um, aplicado
  antes de a criança errar em vez de depois.

## Success Criteria

- [x] `dudu, pega pega` pergunta `Quem corre: eu ou você?` e não inicia rodada
- [x] `dudu, esconde esconde` pergunta `Quem se esconde: eu ou você?`
- [x] `eu` e `você` iniciam a rodada no papel certo, **diferente em cada jogo**
- [x] `dudu, me pega` e `dudu, eu vou me esconder` começam direto, sem pergunta
- [x] `vamos brincar` → `pega pega` → pergunta de papel → rodada
- [x] Pergunta pendente não impede `dudu, para`, `dudu, me segue` nem a defesa
- [x] Pendência expira sozinha e `eu` fora de pergunta volta a ser conversa
- [x] Nenhuma rodada começa com papel escolhido pelo código
- [x] `npm test` passa e as duas cópias do repertório ficam iguais

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `eu`/`voce` viram resposta de papel fora de hora e engolem conversa | Média | Alto | Só são lidos com pendência viva; expira em 45 s; qualquer comando descarta |
| Criança responde algo fora da lista e a rodada não começa | Alta | Médio | Bot repergunta **uma vez**, mais simples; depois deixa a pendência expirar em silêncio |
| Um passo a mais desanima quem só queria brincar | Média | Médio | Só acontece no convite sem papel; as frases com papel explícito continuam diretas |
| Pendência sobrevive a `dudu, para` e ressuscita depois | Baixa | Médio | Todo comando reconhecido descarta a pendência, `para` inclusive |
| Repertório editado só em `data/` e perdido | Média | Alto | Tarefa explícita de copiar para `src/dialogue/default-repertoire.yaml` |
| `eu` responder papéis opostos nos dois jogos confunde na manutenção | Baixa | Médio | O mapa vive no domínio, em tabela única por jogo, coberto por teste dos dois lados |

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
