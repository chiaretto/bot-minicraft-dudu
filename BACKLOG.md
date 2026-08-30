# Backlog do Dudu

Lista ordenada do que falta implementar. A ordem é para ser seguida de cima para
baixo: bug que corrompe dado vem antes de feature, e feature barata que a
criança já pediu vem antes de aposta grande.

Cada item nasceu de evidência — log de conversa (`npm run repertoire:gaps`),
entrada de repertório que hoje só sabe recusar, ou código que não existe. A
evidência fica escrita junto para dar para decidir depois se o item ainda vale.

O caminho de cada item é o de sempre: `/openspec-proposal` → `/openspec-apply` →
`/openspec-archive`.

---

## Tier 1 — bugs que sujam os dados (fazer primeiro)

> **Feito e arquivado em 2026-08-29**, os dois, no change
> `fix-chat-noise-and-learned-quality`. As specs já valem; o que continua
> pendente é a prova em jogo (tarefas 6.2 a 6.6 do `tasks.md` arquivado), que
> ficou registrada como ressalva no `proposal.md`.

### 1. ~~Filtrar mensagem de sistema do jogo~~ ✅

O vanilla manda o retorno de comando como `[Fulano: Teleported ...]`, e o
mineflayer parte isso em `username` + texto terminado em `]`. O bot trata como
fala da criança.

**Evidência.** No `data/conversations/*.jsonl`:

```
{"speaker":"FresherRobin90","text":"Teleported Odraude to FresherRobin90]","source":"command"}
```

São ~20 ocorrências em 5 dias (`Set own game mode to...`, `Killed ...`,
`Removed 3 item(s) ...`, `Teleported ...`). Cada uma gasta uma chamada de IA,
polui o histórico, aparece no relatório de lacunas como se fosse assunto de
verdade — e duas viraram comando aprendido.

**Onde mexe.** `src/app/bot.ts:291` (`this.mc.on('chat', ...)`). Trocar a
confiança no evento `chat` por checagem da chave de tradução (`chat.type.admin`)
no evento `message`, ou filtro equivalente em `src/minecraft/chat.ts`.

**Pronto quando.** Retorno de comando não entra no JSONL, não chega ao roteador
e não aparece no `repertoire:gaps`.

**Custo.** Baixo.

### 2. ~~Freio no cache de comandos aprendidos~~ ✅

Hoje basta a ação terminar com `ok` para o par `frase → intenção` ser decorado.
O resultado é cache com lixo.

**Evidência.** `data/learned-commands.json` tem
`"qual sua llm" -> FOLLOW`, `"construa uma casa quando eu falar ja" -> STAY`, e
mais dois vindos do bug do item 1
(`"teleported odraude to fresherrobin90" -> LOOK_AT_OWNER`).

**O que falta.**

- Não aprender frase que é pergunta (termina em `?`, ou começa com pronome
  interrogativo).
- Desfazer explícito: hoje só `para` logo depois do replay apaga a entrada.
  `"não era isso"` / `"errado"` / `"não é isso"` deveria apagar também, com o bot
  respondendo que esqueceu.

**Onde mexe.** `src/dialogue/learned.ts`, `src/memory/learned-store.ts`,
`src/behaviors/commands.ts` (padrões do desfazer).

**Pronto quando.** Pergunta nunca vira comando decorado, e existe frase que a
criança fala para o bot esquecer o que decorou errado.

**Custo.** Baixo.

---

## Tier 2 — o que o repertório hoje recusa por escrito

Estas entradas existem só para dizer "ainda não sei". Cada uma implementada é
uma recusa que vira capacidade — e a entrada correspondente precisa ser
reescrita no mesmo change (regra número um: nunca prometer o que não faz, nem
recusar o que já faz).

### 3. ~~Mais plantas de construção~~ ✅

> **Feito em 2026-08-30**, no change `add-more-blueprints`: `piscina`, `ponte`,
> `escada` e `cerca` entraram, e o catálogo foi de 2 para 6. O `iglu` ficou de
> fora — sem neve na allowlist, seria uma casa com nome errado. Falta a prova em
> jogo (tarefas 6.3 e 6.4 do `tasks.md`).

`STRUCTURE_NAMES` tem só `casa` e `torre`. Candidatos: **piscina**, **ponte**,
**escada**, **cerca/curral**, **iglu**.

**Evidência.** `"construa uma piscina"` apareceu 2x no log e a IA teve que
recusar as duas.

**Onde mexe.** `src/domain/blueprints.ts` (catálogo fechado, é só somar o padrão
de blocos), padrões novos em `src/behaviors/commands.ts`, e o enum do schema da
IA segue sozinho por `STRUCTURE_NAMES`.

**Custo.** Baixo — a máquina de construir já existe inteira.

### 4. ~~`JUMP` — pular a pedido~~ ✅ (2026-08-30, `add-jump-and-trick`)

**Evidência.** Entrada `pedido_pular`, criada em 2026-08-19 depois de `pule`
aparecer 3x e a IA responder que tinha pulado — mentira.

**Onde mexe.** Intenção nova em `src/domain/intent.ts`, ação em
`src/behaviors/actions/`, padrões em `commands.ts`, reescrita de `pedido_pular`.

**Custo.** ~20 linhas (`bot.setControlState('jump')`).

### 5. ~~`TRICK` — dancinha, girar no lugar~~ ✅ (2026-08-30, `add-jump-and-trick`)

**Evidência.** Entrada `pedido_truque` (`faz uma dancinha`, `gira no lugar`,
`ande em circulos`, `dance`).

**Onde mexe.** Igual ao item 4. Combinação de `look()` com passo curto.

**Custo.** ~20 linhas, e é o item com melhor retorno por linha para uma criança
de 7 anos.

### 6. ~~Inventário que ele sabe contar~~ ✅ (2026-08-30, `add-inventory-count`)

**Evidência.** `"quantos blocos de madeira voce tem?"` foi para a IA, que
respondeu *"isso eu não sei ver"* — mas o `WorldSnapshot` **já carrega**
`inventory`, e o placeholder `{inventorySummary}` já existe.

**O que falta.**

- `worldContext()` em `src/ai/prompt.ts:82` manda vida, fome, posição, hora e
  monstros — e não manda a mochila. A IA responde no escuro.
- Um comando local que conta um item pelo nome, para não depender de IA numa
  pergunta que o snapshot responde sozinho.

**Custo.** Baixo.

### 7. Comer quando está com fome

Não existe nada de `eat` no código. Sobrevivência básica, sem pedido e sem IA —
igual à defesa, é comportamento determinístico.

**Onde mexe.** `src/behaviors/` (laço próprio ou junto do threat-watcher), com
chave de ligar/desligar em `config.yaml → behavior`.

**Custo.** Baixo/médio.

### 8. `PLACE_BLOCK` — "põe um bloco aqui"

**Evidência.** Entrada `pedido_soltar_item`, criada depois de a IA dizer que
tinha soltado o bloco — e não ter soltado.

**Onde mexe.** `src/behaviors/actions/`, reaproveitando o que `build.ts` já sabe
sobre colocar bloco.

**Custo.** Médio.

### 9. `DIG` — cavar buraco ou túnel

**Evidência.** Entrada `pedido_cavar`, com 9 padrões — é assunto recorrente.

**Cuidado.** Cavar para baixo sem regra é como o bot se mata. A planta precisa
ser fechada como as de construção: profundidade limitada, nunca cavar o bloco
sob os próprios pés sem escadinha, e `ESCAPE_HOLE` como saída garantida.

**Custo.** Médio.

### 10. `SLEEP` — dormir na cama

**Evidência.** Entrada `pedido_dormir`, nascida de três jeitos diferentes de
pedir a mesma coisa no mesmo dia.

**Por que vale mais do que parece.** `bot.sleep()` numa cama perto **pula a
noite** — o bot deixa de ser só companhia e passa a resolver a parte do jogo que
mais assusta criança.

**Custo.** Médio.

### 11. Tocha quando escurece

A própria IA já sugeriu isso sozinha no log (*"tá muito escuro aqui, acende uma
tocha aí!"*) sem o bot ter como fazer.

**Onde mexe.** Ação nova + gatilho por nível de luz, no mesmo laço periódico do
threat-watcher.

**Custo.** Médio.

### 12. Buscar as coisas do dono quando ele morre

Marcar a coordenada da morte do dono e ir até lá a pedido — *"morri lá, pega
minhas coisas"*.

**Por que vale.** É o tipo de ajuda que faz o bot parecer amigo de verdade, e usa
peça que já existe (`GOTO_COORDS` + evento de morte do dono, que o repertório já
cobre em `evento_dono_morreu`).

**Cuidado.** A coordenada é estado do mundo — o pedido pode ser comando, mas
nunca pode ser decorado no cache de comandos aprendidos. É a mesma razão de
`GOTO_COORDS` estar fora de `LEARNABLE_INTENTS`.

**Custo.** Médio.

---

## Tier 3 — apostas maiores

### 13. Terceiro jogo: quente e frio

O registro de jogos (`src/domain/games.ts`, `src/behaviors/games/`) já é
extensível e já tem toda a máquina de papéis e a pergunta "quem faz o quê".

**Por que este jogo.** Ele escolhe um ponto e vai falando "quente"/"frio"
conforme a criança se aproxima — não precisa de pathfinding novo nenhum, só de
distância, que o snapshot já dá.

**Custo.** Médio.

### 14. Voz no launcher

A dona do bot tem 7 anos e lê devagar; o chat do Minecraft rola rápido. Ler as
falas do bot em voz alta é a mudança de maior impacto do projeto inteiro.

**Por que é mais barato do que parece.** O launcher já é Electron e já recebe o
`stdout` do bot pelo canal `@dudu-status`. Não toca em nenhuma camada do bot.

**Depois, se der certo.** O caminho inverso — a criança falar e virar chat.

**Custo.** Médio.

### 15. Log da aplicação em arquivo

Hoje o pino vai só para o `stdout` (`CLAUDE.md` → Diagnóstico). Quando algo falha
sem terminal aberto, não sobra rastro nenhum.

**Onde mexe.** `src/logging/logger.ts` + rotação por dia, do lado de
`data/conversations/`.

**Custo.** Baixo — dá para puxar para cima da lista a qualquer momento; está aqui
embaixo só por não mudar nada para a criança.
