# Proposal: Sair de buraco fazendo escadinha

**Change ID:** `add-escape-hole`
**Created:** 2026-08-19
**Status:** Implementation Complete
**Completed:** 2026-08-19

---

## Problem Statement

O bot cai numa caverna, numa ravina ou num buraco que ele mesmo cavou pegando
pedra. A criança chama `dudu, vem` — e **não acontece nada**. Nem movimento,
nem resposta, nem explicação.

A causa está em `MinecraftClient.followOwner`:

```ts
bot.pathfinder.setGoal(new goals.GoalFollow(owner, distance), true)
return true
```

É fogo-e-esquece. `GoalFollow` não avisa quando não existe caminho: o
pathfinder simplesmente não anda. E como `movements.canDig = false` (proposital,
para o esconde-esconde funcionar), o bot não abre caminho sozinho.

Para uma criança de 7 anos, o bot fica **quebrado e mudo**. Pior: ela acabou de
mandar um comando que sempre funcionou.

## Proposed Solution

Um vigia de "preso" durante o `FOLLOW`, e uma ação que sobe fazendo escadinha
de blocos.

```
Miguel: dudu, vem
        (6 segundos parado, dono 14 blocos acima)
Dudu:   Peraí, caí num buraco! Vou fazer uma escadinha.
        (empilha 13 blocos embaixo dos próprios pés)
Dudu:   Saí do buraco! Tô indo aí!
```

### Como detectar

**Geometria local não serve.** Olhar as paredes em volta não distingue "estou no
fundo de um poço de 10 blocos de largura" de "estou num campo aberto": nos dois
casos os vizinhos imediatos estão livres. A parede que prende está a metros de
distância.

O sinal confiável é a combinação de três fatos:

1. o estado é `FOLLOW` (mandaram vir),
2. o bot não sai do lugar há `escapeStuckMs` (padrão 6 s),
3. o dono está `escapeMinDrop` blocos ou mais **acima** (padrão 3).

### Como subir

Empilhar bloco embaixo de si — a técnica que funciona no Minecraft: olhar para
baixo, pular, e colocar o bloco no ápice. Repete até chegar ao nível do dono.

**Faltando bloco, ele cava as paredes** para arranjar material — nunca o chão,
que só aprofundaria o buraco. Cava apenas o que está na interseção de
`collectAllowlist` (pode cavar) com `buildAllowlist` (serve de degrau): é o que
impede o bot de cavar a casa do jogador para subir.

### Como fica no código

```
domain/escape.ts             quando subir, quanto subir, o que cavar (puro)
behaviors/actions/escape.ts  a subida, sobre a interface estreita EscapeWorld
behaviors/actions/index.ts   adaptador para mineflayer (pillarUp, dig)
app/bot.ts                   o vigia, no tick que já existe
behaviors/commands.ts        `sai do buraco`, `sobe`, `faz uma escadinha`
```

Também vira intenção `ESCAPE_HOLE`, então a IA pode propor — e o comando de
nível 1 funciona com `llm.provider: 'none'`.

## Scope

### In Scope

- Vigia de "preso" durante o `FOLLOW`, com retomada automática do seguir.
- Ação de subir empilhando blocos, com teto de altura.
- Cavar as paredes para arranjar degrau quando a mochila está vazia.
- Comando de nível 1 e intenção `ESCAPE_HOLE`.
- Configuração: `escapeMinDrop`, `escapeMaxHeight`, `escapeMaxDigs`,
  `escapeStuckMs`.
- Testes.

### Out of Scope

- **Escada de verdade em diagonal**, que a criança também pudesse usar. Subir
  reto é a técnica confiável; escada diagonal exige pular sobre cada degrau.
- Sair de buraco quando o dono está no mesmo nível (preso numa sala fechada) —
  aí não é altura que falta, é abrir caminho, e isso é escavação.
- Cavar para os lados até achar saída.
- Desfazer a torre depois de subir.
- Mudar `movements.canDig`: continua `false`, e o esconde-esconde depende disso.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| Domínio | Sim | `escape.ts` novo; `ESCAPE_HOLE` em `intent.ts` |
| Ações | Sim | `escape.ts` novo; adaptador `EscapeWorld` com `pillarUp` |
| App (`bot.ts`) | Sim | `tickStuck()` no tick que já existe; retomada do seguir |
| Comandos | Sim | Padrões de nível 1 |
| Prompt da IA | Sim | `ESCAPE_HOLE` no catálogo de ações |
| Configuração | Sim | Quatro campos novos em `behavior` |
| Repertório | Sim | `capacidades` cita a habilidade nova |
| Defesa, jogos | Não | O vigia só roda em `FOLLOW`, e nunca com rodada em andamento |

## Architecture Considerations

- **O vigia entra no laço que já existe** (`THREAT_TICK_MS`, 250 ms) e é
  síncrono: ele só decide e dispara. A subida roda fora do tick.
- **Prioridade preservada**: a subida usa `state.signal`, então `dudu, para`, a
  defesa e vida crítica cancelam no meio.
- **Nunca durante uma brincadeira**: o vigia sai cedo se houver rodada — um bot
  que empilha blocos no esconde-esconde estragaria o jogo.
- **Regra pura, efeito na borda**, como em `build.ts`: `escape.ts` do domínio
  não conhece `mineflayer`.
- **A fala vem antes da subida**: a criança precisa saber por que o bot sumiu do
  caminho por um minuto.

## Success Criteria

- [x] Chamado num buraco fundo, o bot avisa e sobe sozinho
- [x] Depois de subir, volta a seguir sem precisar de novo comando
- [x] Sem bloco na mochila, ele cava a parede para conseguir degrau
- [x] Nunca cava embaixo dos próprios pés
- [x] Sem dono à vista, não vira torre no meio do nada
- [x] `dudu, para` interrompe a subida
- [x] `sai do buraco` funciona como comando, sem IA
- [x] `npm test` e `npx eslint src test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `pillarUp` depende de tempo de física e falha em servidor com lag | **Alta** | Alto | Espera o bot subir de verdade (1,05 bloco) em vez de dormir um tanto fixo; falha encerra falando, não travando |
| Falso positivo: parado por outro motivo vira subida à toa | Média | Médio | Três condições juntas — `FOLLOW`, parado 6 s **e** dono 3+ acima |
| Bot sobe e cai de volta, ou cai da torre | Média | Médio | Sobe reto, sem se deslocar; para ao alcançar o nível do dono |
| Torre até o céu com dono voando de criativo | Média | Baixo | `escapeMaxHeight` (24) |
| Cavar a construção do jogador para arranjar degrau | Baixa | **Alto** | Só a interseção das duas allowlists; nunca o chão |
| Subida durante brincadeira estragar o jogo | Baixa | Médio | O vigia não roda com rodada em andamento |
