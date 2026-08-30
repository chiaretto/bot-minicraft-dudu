# Implementation Tasks: O bot promete atacar e não ataca

**Change ID:** `fix-attack-on-command`
**Concluído:** 2026-08-29 (prova em jogo confirmada)

---

## Fase 1: Domínio — os catálogos fechados

- [x] 1.1 `ATTACK` em `INTENT_TYPES`, com `target` opcional
- [x] 1.2 `ATTACK` fora de `LEARNABLE_INTENTS`
- [x] 1.3 Catálogo `MOB_NAMES_PT`, com hostis **e** pacíficos
- [x] 1.4 `UNARMED_OK`: alvos enfrentáveis de mão
- [x] 1.5 Testes dos catálogos
      - Acrescentado: `AI_PROPOSABLE_INTENTS`, que tira `ATTACK` do schema
        entregue ao provider. Sem isso a IA poderia propor ataque por engano de
        schema, mesmo com o prompt mandando não propor.

**Quality Gate: PASSOU**
- [x] Teste prova que a denylist vence o catálogo pt-BR
- [x] `tsc` e `eslint` limpos

---

## Fase 2: O comando (nível 1, sem IA)

- [x] 2.1 Padrões genéricos e nomeados em `commands.ts`
- [x] 2.2 Captura normalizada (CAPS, acento e pontuação não atrapalham)
- [x] 2.3 `ATTACK` descrito em `ACTION_DESCRIPTIONS` mas **fora** do catálogo que
      a IA vê (`AI_ACTION_CATALOG`)
- [x] 2.4 Conferido contra colisão
- [x] 2.5 Testes do parser

**Quality Gate: PASSOU**
- [x] `pode atacar` e `nao ataca` continuam controlando a defesa
- [x] `mata a saudade` e `mata o tempo` não viram ataque

### Desvio do delta spec, corrigido na spec

A proposta dizia que nome fora do catálogo viraria **ataque genérico ao mais
perto**. É perigoso: "mata a saudade" e "mata o tempo" são frases comuns, e o bot
sairia batendo em alguma coisa. Implementado ao contrário — nome desconhecido
**não vira comando** e a frase desce na cascata como conversa. O delta spec foi
corrigido junto.

---

## Fase 3: Seleção de alvo e execução

- [x] 3.1 `selectAttackTarget()`, função pura ao lado da defesa
- [x] 3.2 Tipo pedido ausente → recusa, nunca mira outro
- [x] 3.3 Execução **reusa** o engajamento da defesa: o alvo é marcado como
      agressor e o laço que já existe cuida de aproximação, arma, cooldown,
      guarda dupla e recuo
- [x] 3.4 Guarda dupla preservada (vem do caminho reusado)
- [x] 3.5 Vida crítica continua interrompendo
- [x] 3.6 Testes de seleção

**Quality Gate: PASSOU**
- [x] "ataca o esqueleto" ignora um zumbi mais perto
- [x] Jogador e domesticado nunca viram alvo, nem nomeados

---

## Fase 4: Desarmado passa a bater

- [x] 4.1 Regra 3 do `planDefense` distingue alvo fraco de forte
- [x] 4.2 `engage` com `weapon: null`; recusa continua em `unarmed`
- [x] 4.3 Creeper intocado
- [x] 4.4 Testes da matriz
- [x] 4.5 Teste antigo `desarmado não engaja` **substituído** — ele codificava o
      comportamento que esta mudança corrige

**Quality Gate: PASSOU**
- [x] Desarmado + zumbi = engaja, com `weapon: null`
- [x] Desarmado + ravager = recusa
- [x] Nenhum outro teste de defesa quebrou

---

## Fase 5: O que a criança ouve

- [x] 5.1 Entradas novas: `ataque_bicho_amigo`, `ataque_nao_achei`,
      `ataque_sem_alvo`, `ataque_longe`, `combate_desligado`,
      `combate_sem_arma_encara` — 4 variações cada
- [x] 5.2 Revisão pela regra número um
- [x] 5.3 `combate_desarmado` **reescrita**: mudou de sentido. Antes era "não
      consigo brigar"; agora é só para alvo forte, e todas as variações **pedem a
      espada** — é o passo seguinte que tira o bot do estado desarmado
- [x] 5.4 `repertoire:sync` — as duas cópias iguais
- [x] 5.5 Repertório varrido

**Quality Gate: PASSOU**
- [x] `repertoire:sync --check` limpo

---

## Fase 6: Prova no mundo real

- [x] 6.1–6.6 Cobertos por teste unitário e pela seleção determinística, e
      **confirmados em jogo pelo dono do projeto** em 2026-08-29
- [x] 6.7 Log conferido: `ataque pedido pela criança` e `ataque recusado` saem
      com o alvo e o motivo
- [x] 6.8 **A IA não propõe `ATTACK`** — verificado contra o provider real

### O bug que a prova real revelou

Com o prompt novo, a IA parou de prometer — mas passou a devolver **`acao=STOP`**
em todo pedido de ataque. Um `STOP` cancelaria justamente o que a criança tinha
mandado fazer, então isto era pior que o bug original.

A causa não era o prompt: **o schema compartilhado não aceita `action: null`**,
embora o prompt mande responder exatamente isso. `INTENT_JSON_SCHEMA` é
`type: 'object'` com `type` obrigatório. Ollama e Gemini toleram a contradição
omitindo o campo; a saída estruturada do Claude Code é estrita e preenche com uma
ação válida qualquer.

Corrigido no provider Claude, que passa um schema com `action` anulável. A
contradição continua existindo no schema compartilhado — ver "Pendente".

Antes e depois, mesmo provider:

```
"ataca aquele bicho verde"   antes: acao=STOP   depois: acao=null
"mata o monstro ali"         antes: acao=STOP   depois: acao=null
"me segue"                   antes: FOLLOW      depois: FOLLOW
```

---

## Fase 7: Documentação

- [x] 7.1 `README.md`: o comando na tabela
- [x] 7.2 `README.md`: a regra do desarmado, com o porquê
- [x] 7.3 `CLAUDE.md`: seção nova — por que atacar é comando, os três efeitos
      colaterais e a armadilha do `action: null`
- [x] 7.4 Nenhum limite novo virou configuração

**Quality Gate: PASSOU**
- [x] `tsc`, `eslint` e 795 testes limpos

---

## Pendente

- **O schema compartilhado continua contradizendo o prompt.** `action` deveria
  ser anulável para todos os providers, não só para o Claude. Não mexi porque o
  `responseSchema` do Gemini usa `nullable: true` em vez de `type: [...]`, e
  mudar isso sem poder testar os dois seria trocar um bug conhecido por um
  desconhecido. Merece mudança própria.
- **O bot continua sem conseguir uma espada sozinho.** O ataque desarmado
  resolve o caso comum; a recusa passou a pedir a espada. Buscar arma continua
  fora de escopo, como a proposta registrou.

---

## Completion Checklist

- [x] Todas as fases completas
- [x] Todos os quality gates passados
- [x] Success criteria conferidos, exceto os que exigem o jogo aberto
- [x] Prova em jogo — confirmada pelo dono do projeto em 2026-08-29
