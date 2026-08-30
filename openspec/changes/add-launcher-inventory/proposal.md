# Proposal: A mochila do Dudu na janela

**Change ID:** `add-launcher-inventory`
**Created:** 2026-08-30
**Status:** Implementation Complete (falta prova com a janela aberta)
**Completed:** 2026-08-30

---

## Problem Statement

O aplicativo de desktop mostra **três coisas**: se o bot está no mundo, os
botões de ligar e parar, e o log para o adulto. Sobre o bot em si — o que ele
está carregando — não mostra nada.

E a mochila é justamente o que mais aparece na conversa:

- No log de 20/08 a criança perguntou *"quantos blocos de madeira voce tem?"*.
  Resolvemos isso **no chat** (`COUNT_ITEM`), mas ela precisa perguntar, esperar
  e ler a resposta — com a janela do aplicativo aberta do lado o tempo todo.
- Quando falta material, a obra é recusada com *"me faltam 12 de madeira pra
  terminar. Me dá um pouco?"*. Não há nenhum lugar onde olhar para saber o que
  ele já tem.
- E, para uma criança de 7 anos, espiar a mochila do amigo é diversão por si só.

### O achado que expandiu esta proposta

Ao levantar como os nomes de item chegam à criança, apareceu um defeito antigo
em **quatro falas do chat**:

```ts
`não tenho ${itemName} comigo`     // "não tenho cooked_beef comigo"
`Toma aí o ${itemName}!`           // "Toma aí o iron_sword!"
`Equipei ${itemName}!`             // "Equipei torch!"
```

O bot fala o **nome técnico em inglês** para uma criança de 7 anos. `friendlyName()`
existe e resolve isso para bloco de obra (`oak_log` → "madeira"), mas nunca foi
chamado nessas quatro linhas — e o catálogo dele só cobre material de
construção, não comida, ferramenta ou tocha.

Mostrar "carne assada" na janela enquanto o chat diz "cooked_beef" seria
incoerente. Os dois problemas têm a mesma raiz e a mesma solução, então andam
juntos.

## Proposed Solution

### 1. Um catálogo de nomes de item em português

`domain/item-names.ts`: catálogo **fechado**, no espírito dos outros (bicho,
planta, jogo, material). Cobre o que o bot realmente manuseia — os blocos de
obra, a comida de `FOOD_ITEMS`, tocha, cama, ferramenta, arma.

`friendlyItemName(id)` devolve o nome em português, ou **o próprio id** quando
não conhece. Nunca esconde: item desconhecido aparece com o nome técnico, e a
falta vira item novo no catálogo, não um buraco silencioso.

As quatro falas do chat passam a usá-lo.

### 2. Um terceiro canal no protocolo: `@dudu-mochila`

O bot anuncia a mochila em linha própria do `stdout`, como já faz com status e
fala:

```
@dudu-mochila {"itens":[{"id":"oak_log","nome":"madeira","qtd":12}],"total":12}
```

**Os dois nomes vão juntos** de propósito: a janela mostra `nome` para a
criança e tem o `id` à mão para o bloco do adulto. A alternativa — mandar só o
id e traduzir no launcher — obrigaria a duplicar o catálogo inteiro do outro
lado, e os dois lados só repetem **constante de protocolo**, nunca vocabulário.

### 3. Periódico, e só quando muda

A mochila muda a cada bloco colocado numa obra. Emitir a cada mudança encheria
o canal com dezenas de linhas por casa construída.

O emissor roda no mesmo ritmo dos instintos e **compara com o que mandou por
último**: mochila igual não vira linha. É a mesma regra do canal de status
("repetir o mesmo estado não é transição"), pelo mesmo motivo.

### 4. Sem bot, sem mochila

Quando o bot cai ou é parado, o painel **limpa**. Mochila de fantasma na tela é
pior que painel vazio: a criança pediria um bloco que ninguém está carregando.

### 5. Vazia é dito, não escondido

*"Mochila vazia"* aparece. É a mesma lição do prompt da IA, onde a linha diz
`nada` em vez de sumir: some, e quem lê não sabe se está vazia ou se quebrou.

## Scope

### In Scope

- `domain/item-names.ts`: catálogo fechado de nomes em português.
- As **quatro falas do chat** que hoje dizem o nome técnico.
- `SPEECH_PREFIX` ganha um irmão, `INVENTORY_PREFIX`, com `formatInventory()`.
- `onInventory()` no bot, emitido periodicamente e só quando muda.
- `parseLine` do launcher reconhece a linha nova.
- Painel na janela: itens com quantidade, limpo quando o bot não está no mundo.
- Testes dos dois lados.

### Out of Scope

- **Ícone de cada item.** Precisaria das texturas do jogo, que não são nossas
  para distribuir. Nome e quantidade bastam.
- **Mexer na mochila pela janela** (largar, organizar). A janela **mostra**; o
  que o bot faz continua vindo do chat. Botão que age no mundo do jogo a partir
  do aplicativo é outra categoria de coisa.
- **Vida, fome e posição.** Cabem no mesmo canal um dia, mas o pedido é a
  mochila, e cada campo a mais é uma decisão de layout a tomar sem necessidade.
- **Histórico do que ele carregou.** É o agora.
- **Traduzir o jogo inteiro.** O catálogo cobre o que o bot manuseia; o resto
  aparece com o id técnico até alguém precisar dele.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `domain/item-names.ts` | **Novo** | Catálogo fechado de nomes em português |
| `behaviors/actions/index.ts` | Sim | Quatro falas param de dizer o nome técnico |
| `app/status-channel.ts` | Sim | `INVENTORY_PREFIX`, `formatInventory`, `sendInventory` |
| `app/bot.ts` | Sim | `onInventory()`, emissão periódica com dedup |
| `app/main.ts` | Sim | Liga um ao outro |
| `launcher/src/status.ts` | Sim | Reconhece a linha; tipo `inventory` |
| `launcher/src/runner.ts`, `main.ts`, `preload.ts` | Sim | Repasse até a janela |
| `launcher/src/inventory.ts` | **Novo** | Ordenação e corte, puros |
| `launcher/ui/` | Sim | O painel |
| Cascata, IA, jogos, cache aprendido | Não | Nada disso sabe que a janela existe |

## Architecture Considerations

- **O protocolo cresce por soma, outra vez.** Terceiro prefixo; launcher antigo
  trata como log e nada quebra — é o que `parseLine` já faz com o desconhecido.
- **Vocabulário fica no bot; protocolo é repetido.** A constante do prefixo
  aparece nos dois lados, como as outras duas. O catálogo de nomes, **não**: ele
  é domínio, e vai traduzido na linha.
- **Dedup no emissor, não no receptor.** Quem sabe se mudou é quem tem a mochila.
- **Regra pura, borda na janela.** Ordenar e cortar a lista é `inventory.ts`,
  testável sem abrir janela; a janela só desenha.
- **O bot não sabe que existe painel.** Ele anuncia o que carrega; quem desenha
  é problema de quem supervisiona — o mesmo desenho da voz.

## Success Criteria

- [x] Com o bot no mundo, a janela mostra o que ele carrega, em português
      *(coberto por teste; falta ver com a janela aberta)*
- [x] Pegar madeira atualiza o painel em poucos segundos
- [x] Mochila que não mudou **não** gera linha nova no `stdout`
- [x] Bot parado ou caído limpa o painel
- [x] Mochila vazia é dita, não escondida
- [x] O chat para de dizer `cooked_beef` e passa a dizer "carne assada"
- [x] Item fora do catálogo aparece com o id, nunca some
- [x] Sem o aplicativo, o `stdout` continua byte a byte o de sempre
- [x] `npm test` (981) e os testes do launcher (88) passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Encher o `stdout` durante uma obra | **Alta** sem guarda | Médio | Emissão periódica + dedup por conteúdo |
| Painel mostrar mochila de bot que já morreu | Média | Médio | Limpa em `saiu`, `caiu` e ao parar |
| Nome técnico vazar para a criança | Média | Médio | Catálogo fechado + teste que varre as falas de item |
| Mochila comprida estourar a janela | Média | Baixo | Ordenada por quantidade, cortada, com "e mais N" |
| Duplicar vocabulário nos dois pacotes | Média | Alto | O nome vai **traduzido** na linha; o launcher nunca traduz |
| Painel virar tentação de mexer no jogo | Baixa | Médio | Fora de escopo, explicitamente: a janela mostra, não age |
