# Proposal: O bot promete atacar e não ataca

**Change ID:** `fix-attack-on-command`
**Created:** 2026-08-29
**Status:** Implementation Complete
**Completed:** 2026-08-29

---

## Problem Statement

A criança manda o bot atacar e ele responde que vai — e não faz nada.

Isso é pior que uma recusa. A regra número um manda o bot ser **honesto sobre o
que não sabe fazer**, e aqui ele faz o oposto: promete, a criança espera, nada
acontece. Uma criança de 7 anos não conclui "essa capacidade não existe"; ela
conclui que o amigo dela mentiu, ou que ela falou errado — e tenta de novo.

O diagnóstico foi feito rodando a cascata de verdade, com o provider ativo:

```
"ataca aquele zumbi"
   parser: nenhum        IA: "já tô chegando pra te ajudar!"     acao=null
"mata o esqueleto"
   parser: nenhum        IA: "assim que eu chegar eu protejo você!"  acao=null
"ataca o creeper"
   parser: nenhum        IA: "deixa eu entrar no mundo que eu cuido de você!"  acao=null
```

Três lacunas, encontradas no código, todas reais:

### 1. Não existe ação de atacar

`INTENT_TYPES` tem quinze intenções — e nenhuma delas é atacar. `commands.ts` não
tem padrão para "ataca". O único comando parecido é `pode atacar`, que apenas
**liga a defesa automática**; não manda atacar nada.

A consequência é a promessa vazia acima. O prompt até manda a IA dizer que não
sabe quando o pedido está fora do catálogo, mas "atacar" é perto demais de
"defender", que **está** no catálogo — então o modelo improvisa em vez de recusar.

### 2. Desarmado o bot nunca ataca, nem se defendendo

Esta é provavelmente a que aparece no jogo. A regra 3 de `planDefense`:

```ts
// 3. Desarmado não engaja: só morreria e largaria o inventário.
if (options.weapon === null) return { kind: 'unarmed', threat: target }
```

E a arma sai de `bestWeapon(bot.inventory.items())` — o inventário do bot. Só que
o bot **entra no mundo com o inventário vazio**, não sabe craftar (está escrito
no próprio prompt) e nada no código o faz buscar uma arma.

Ou seja: na prática o bot pode passar a vida inteira desarmado, e nesse estado
**nunca ataca nada** — nem o zumbi que está batendo no dono. O log de 15/08 tem a
prova: *"Eu tô sem arma, FresherRobin90! Não consigo brigar!"*.

### 3. Bicho pacífico: a recusa é certa, a explicação é sorte

Vaca, porco, galinha e ovelha estão na denylist absoluta (`NEVER_ATTACK`) por
decisão de produto — isso **não** é bug. Mas hoje nada garante a explicação: a
recusa depende de a IA improvisar bem. No teste ela improvisou bem ("A vaca é
amiga!"), o que é sorte, não contrato.

## Proposed Solution

### Atacar vira comando, não intenção da IA

O `project.md` é categórico: **"Combate e defesa são determinísticos e nunca
dependem de uma chamada de IA. A IA só narra o que já aconteceu."**

Escolher em quem bater é decisão de combate. Então o comando de ataque entra no
**nível 1** da cascata, em `commands.ts`, e a IA **não** ganha intenção `ATTACK`.
Nenhuma exceção é aberta na regra.

```
"ataca"          → parser (nível 1) → alvo escolhido por regra determinística
"mata o zumbi"   → parser (nível 1) → idem
```

O preço é o de sempre no nível 1: a criança precisa usar frases próximas das que
o parser conhece. Isso é aceitável porque a rotina diária já existe para
descobrir as frases que faltam — e é justamente para isso que o
`/upgrade-repertoire` lê o log.

### Quem o comando mira

Sem IA, a mira precisa ser uma regra. Duas formas de pedir:

| A criança diz | O bot mira |
|---|---|
| "ataca", "mata ele", "bate nele" | a ameaça atacável **mais perto do dono** |
| "ataca o zumbi", "mata a aranha" | o bicho **daquele tipo** mais perto |

O nome falado é traduzido por um **catálogo fechado de nomes em português**
(`zumbi` → `zombie`, `aranha` → `spider`, `esqueleto` → `skeleton`, `vaca` →
`cow`…). É a quinta lista fechada do projeto, e existe pelo mesmo motivo das
outras: limitar o que o bot pode decidir sozinho.

O catálogo precisa incluir também os **bichos pacíficos**, e é isso que conserta
a lacuna 3: com `vaca` mapeada, "ataca a vaca" é reconhecida, cai na denylist e
recebe uma recusa **escrita à mão**, não improvisada.

```
"ataca a vaca"  → parser reconhece → alvo `cow` → NEVER_ATTACK
                → "A vaca é amiga! Eu não machuco bichinho, não."
```

Sem o nome no catálogo, "ataca a vaca" viraria "ataca" e o bot bateria num zumbi
qualquer — respondendo a um pedido que a criança não fez.

### Desarmado passa a bater, mas só no que dá para bater

A regra "desarmado não engaja" foi escrita para o bot não morrer à toa. O
raciocínio está certo e o resultado está errado: um bot que **nunca** briga é
pior, para a criança, do que um bot que tenta e às vezes apanha.

A regra 3 deixa de ser "não engaja" e passa a ser "engaja só contra alvo que dá
para enfrentar de mão":

| Desarmado, contra | Decisão |
|---|---|
| zumbi, aranha, esqueleto, silverfish, endermite, slime | **engaja** |
| creeper | foge (regra 2, inalterada) |
| bruxa, ravager, blaze, piglin bruto, wither skeleton, evoker, vindicator, guardian, hoglin, zoglin | recusa, e **diz por quê** |

A rede de segurança que já existe continua valendo e é o que torna isso seguro:
**vida crítica vence tudo** (regra 1) e faz o bot recuar antes de morrer.

Com arma, nada muda: engaja como hoje.

### O que a criança ouve quando o bot recusa

Toda recusa vira frase de repertório escrita à mão, com o mínimo de 4 variações —
nunca improviso da IA, nunca silêncio:

| Situação | O que ele diz |
|---|---|
| Não tem nada por perto | "Não tô vendo nenhum monstro aqui perto!" |
| Bicho pacífico | "A vaca é amiga! Eu não machuco bichinho, não." |
| Alvo perigoso demais sem arma | "Esse aí é forte demais sem espada! Me dá uma?" |
| Creeper | usa a fala de creeper que já existe |

A última tem um efeito colateral bom: ela **ensina o passo seguinte** (dar uma
espada), que é a regra número um funcionando, e é o caminho que resolve a lacuna
2 de verdade.

## Scope

### In Scope

- Intenção `ATTACK` no catálogo, com parâmetro opcional de alvo.
- Padrões de ataque em `commands.ts` (nível 1, determinístico).
- Catálogo fechado de nomes de bicho em português → nome de mob.
- Seleção de alvo determinística: por tipo quando nomeado, senão o mais perto do
  dono.
- Ação de mundo que executa o ataque, reusando o engajamento que a defesa já tem.
- Regra do desarmado: passa a engajar contra alvo fraco; recusa o resto com
  explicação.
- Catálogo fechado de alvos enfrentáveis desarmado.
- Entradas de repertório para cada recusa (4+ variações, as duas cópias).
- `ATTACK` **fora** de `LEARNABLE_INTENTS` — parâmetro é alvo do momento, não
  vocabulário.
- Testes.

### Out of Scope

- **Intenção `ATTACK` para a IA.** Decisão registrada: combate continua
  determinístico, sem exceção na regra do `project.md`.
- **Mexer na `NEVER_ATTACK`.** Bicho pacífico e jogador continuam intocáveis.
  Esta mudança só melhora a **explicação** da recusa.
- **PvP.** Jogador nunca é alvo, em nenhuma circunstância.
- **O bot buscar arma sozinho** (ir até uma espada no chão, abrir baú). É a
  correção de raiz da lacuna 2 e merece proposta própria — envolve ação de mundo
  nova e o baú é do jogador.
- **Craftar espada.**
- Perseguir alvo para fora do raio de proteção; caçar por conta própria; atacar
  o que não ameaça ninguém quando ninguém pediu.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `domain/intent.ts` | Sim | `ATTACK` em `INTENT_TYPES`; fora de `LEARNABLE_INTENTS` |
| `domain/mobs.ts` | Sim | Catálogo pt-BR → mob; alvos enfrentáveis desarmado |
| `behaviors/commands.ts` | Sim | Padrões de ataque com captura de alvo |
| `behaviors/defense/threat-watcher.ts` | Sim | Regra 3 do `planDefense` |
| `behaviors/actions/` | Sim | Ação de ataque sob comando |
| `app/bot.ts` | Sim | Liga a ação; recusas viram fala |
| `ai/prompt.ts` | Sim | Uma linha no catálogo de ações — a IA precisa **saber** que existe, para parar de improvisar |
| Repertório (as **duas** cópias) | Sim | Entradas de recusa |
| `player_defense` (spec) | Sim | Requisito do desarmado modificado |
| `player_commands` (spec) | Sim | Comando de ataque novo |
| Providers de IA, launcher, memória | Não | — |

## Architecture Considerations

- **A regra de combate determinístico sai intacta, e isso é o ponto.** Havia um
  caminho mais confortável — dar `ATTACK` à IA e deixá-la interpretar. Foi
  recusado: escolher em quem bater é decisão de combate.
- **A IA precisa saber que o comando existe, mesmo sem poder usá-lo.** Sem uma
  linha no catálogo do prompt, ela continua improvisando promessa. Ela não ganha
  a ação — ganha a informação de que o caminho é o comando.
- **Quinta lista fechada.** Nomes de bicho seguem intenções, plantas, jogos e
  intenções aprendíveis. Mesmo motivo: limitar o que o bot decide sozinho.
- **Reuso do engajamento que já existe.** O ataque sob comando não reimplementa
  golpe, cooldown nem aproximação — usa o mesmo caminho da defesa. Duas
  implementações de combate divergiriam em comportamento de falha.
- **`ATTACK` não é aprendível**, pela mesma regra do `GOTO_COORDS`: o alvo é um
  bicho daquele momento, não vocabulário.
- **A rede de segurança carrega o risco do desarmado.** Só dá para afrouxar a
  regra 3 porque a regra 1 (vida crítica → recuar) já existe e é testada.

## Success Criteria

- [x] "ataca" com um zumbi perto faz o bot **bater no zumbi**
- [x] "ataca o esqueleto" mira o esqueleto, mesmo com um zumbi mais perto
- [x] "ataca a vaca" recusa com frase escrita à mão, e a vaca fica ilesa
- [x] Sem nada por perto, o bot diz que não vê monstro — e não promete nada
- [x] **Desarmado, o bot ataca um zumbi** que ameaça o dono
- [x] Desarmado contra ravager, o bot recusa e pede uma espada
- [x] Creeper continua sendo fuga, nunca corpo a corpo
- [x] Jogador nunca vira alvo, nem nomeado explicitamente
- [x] Vida crítica continua interrompendo o combate
- [x] Nenhuma resposta promete ataque que não vai acontecer
- [x] A IA nunca propõe `ATTACK` — o catálogo dela não tem a ação
- [x] `ATTACK` não entra no histórico de comandos aprendidos
- [x] `npx eslint src test` e `npm test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Bot desarmado morre com frequência e frustra a criança | **Média** | Médio | Catálogo de alvos fracos; vida crítica já faz recuar; a recusa pede espada |
| Padrão de ataque largo demais rouba frase de outra entrada ("mata a saudade") | Média | Médio | Padrões ancorados; `repertoire:check` com frases antigas antes de fechar |
| Criança pede ataque a um bicho que o catálogo pt-BR não conhece | **Alta** | Baixo | Sem nome reconhecido, mira o mais perto; a rotina diária colhe os nomes que faltam |
| Nome ambíguo mirar o bicho errado | Média | Médio | Só o tipo nomeado é considerado; sem alvo daquele tipo, recusa em vez de mirar outro |
| Bot atacar bicho de estimação da criança | Baixa | **Alto** | `NEVER_ATTACK` e a guarda de domesticado continuam valendo, checadas duas vezes |
| Bot virar agressivo e caçar sozinho | Baixa | Alto | O comando não muda a defesa automática; sem pedido, nada muda |
| Frase de recusa soar ríspida | Média | Médio | Repertório escrito à mão, 4+ variações, revisado pela regra número um |
| A lacuna 2 continuar de pé porque o bot segue sem arma | **Alta** | Médio | O ataque desarmado a alvo fraco resolve o caso comum; buscar arma fica para proposta própria, e a recusa ensina a criança a dar a espada |

---

## Archive Information

**Archived:** 2026-08-29
**Duration:** diagnóstico, proposta, implementação e arquivamento no mesmo dia
**Outcome:** implementado, testado e confirmado em jogo pelo dono do projeto

### Arquivos criados

- `test/attack.test.ts` — 25 testes: catálogos, parser, seleção de alvo e a
  garantia de que a IA não propõe ataque

### Arquivos modificados

- `src/domain/intent.ts` — `ATTACK` em `INTENT_TYPES`; `AI_PROPOSABLE_INTENTS`
  (que o tira do schema entregue ao provider); `target` no schema
- `src/domain/mobs.ts` — `MOB_NAMES_PT`, `UNARMED_OK`, `mobFromSpokenName()`,
  `canFightUnarmed()`
- `src/behaviors/commands.ts` — `parseAttack()` com captura de alvo
- `src/behaviors/defense/threat-watcher.ts` — regra 3 do `planDefense`;
  `selectAttackTarget()`
- `src/app/bot.ts` — `attackOnCommand()`, mapa de recusas, aviso de encarar
  desarmado
- `src/ai/prompt.ts` — `ATTACK` descrito mas fora do catálogo da IA; seção
  "Atacar é comando"; dois exemplos novos
- `src/ai/providers/claude.ts` — `NULLABLE_ACTION_SCHEMA`
- `src/dialogue/default-repertoire.yaml` e `data/repertoire.yaml` — 6 entradas
- `test/behaviors.test.ts`, `test/ai.test.ts` — testes que codificavam o
  comportamento antigo
- `README.md`, `CLAUDE.md`

### Specs atualizadas

- `openspec/specs/player_commands.md` — três requisitos novos (comando de
  ataque, catálogo de nomes em português, recusa honesta) e o catálogo de ações
  modificado para registrar que `ATTACK` é executável mas não proponível
- `openspec/specs/player_defense.md` — cenário do desarmado **substituído**;
  seleção de alvo ampliada para o pedido explícito; catálogo de enfrentáveis
  desarmado; independência da IA estendida ao ataque sob comando

### Verificação

`tsc --noEmit`, `eslint src test` e 795 testes limpos. Repertório sincronizado
nas duas cópias. Cenários de jogo confirmados pelo dono em 2026-08-29.

### O que só a prova real revelou

Com o prompt novo a IA parou de prometer, mas passou a devolver `acao=STOP` em
todo pedido de ataque — pior que o bug original, porque um `STOP` cancelaria o
que a criança tinha mandado fazer.

A causa não era o prompt: **o schema compartilhado não aceita `action: null`**,
embora o prompt mande responder exatamente isso. Ollama e Gemini toleram a
contradição omitindo o campo; a saída estruturada do Claude Code é estrita e
preenche com uma ação válida qualquer.

### Desvio do que a proposta previa

Nome de bicho fora do catálogo **não vira comando**, em vez de virar ataque
genérico ao mais perto. "mata a saudade" e "mata o tempo" são frases comuns, e o
comportamento previsto faria o bot sair batendo em alguma coisa. O delta spec foi
corrigido durante a implementação.

### Pendências que ficam para outra mudança

- **O schema compartilhado continua contradizendo o prompt.** `action` deveria
  ser anulável para todos os providers, não só para o Claude. O `responseSchema`
  do Gemini usa `nullable: true` em vez de `type: [...]`, e mudar sem poder
  testar os dois trocaria um bug conhecido por um desconhecido.
- **O bot continua sem conseguir uma espada sozinho.** O ataque desarmado
  resolve o caso comum e a recusa passou a pedir a espada, mas buscar arma (no
  chão ou num baú) é a correção de raiz da segunda lacuna.
