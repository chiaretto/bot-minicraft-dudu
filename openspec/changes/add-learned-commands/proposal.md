# Proposal: Histórico de comandos aprendidos da IA

**Change ID:** `add-learned-commands`
**Created:** 2026-08-20
**Status:** Implementation Complete
**Completed:** 2026-08-20

---

## Problem Statement

Hoje a cascata é `comando → repertório → IA`, e o nível 3 **não guarda nada**.
Toda vez que a criança pede a mesma coisa com as mesmas palavras, o bot paga o
mesmo preço:

| Custo | Por quê importa |
|---|---|
| Latência | Gemini leva segundos; a criança acha que travou e repete a frase |
| Dinheiro | Cada pedido repetido é uma chamada paga a mais |
| Privacidade | A frase da criança sai da máquina **de novo**, sem necessidade |
| Fragilidade | Provider fora do ar, cota estourada ou circuito aberto = pedido que já funcionou ontem para de funcionar hoje |

O log de 15, 16 e 19/08 mostra o desperdício acontecendo: `constroi uma casa`
resolvido pela IA em três sessões diferentes; `me de um bloco de grama` e
`colete 52 blocos` idem. E não é caso raro — criança de 7 anos **repete**: pede
a mesma casa, o mesmo bloco, a mesma brincadeira, muitas vezes com a mesma
frase, dia após dia.

O `/upgrade-repertoire` já ataca isso, mas com um humano no meio: alguém precisa
ler o relatório e escrever o padrão à mão. O que falta é o bot **aproveitar na
hora** o que a IA já lhe ensinou.

## Proposed Solution

Um **nível 1.5 na cascata**: um histórico de comandos aprendidos, entre o parser
de regex e o repertório.

```
comando (regex)  →  comando APRENDIDO  →  repertório  →  IA
   código                 cache             conversa      último recurso
```

### O que é aprendido

Quando a IA resolve uma mensagem em **ação** e essa ação **dá certo**, o par
`frase normalizada → intenção validada` entra no histórico.

Três condições, todas obrigatórias:

1. **A IA propôs ação**, não só conversa. Bate-papo não vira comando.
2. **A ação executou com sucesso** (`ActionOutcome.ok`). Recusa, cancelamento e
   falha não ensinam nada — aprender uma ação que deu errado é ensinar o bot a
   errar mais rápido.
3. **A intenção é do tipo aprendível**, por catálogo fechado em código
   (`LEARNABLE_INTENTS`), no mesmo espírito do catálogo de intenções e do de
   plantas.

`GOTO_COORDS` fica **fora** do catálogo aprendível, e a razão vale a regra
inteira: os parâmetros dela guardam um lugar do mundo daquele momento. "vem aqui"
aprendido como "vá para x=104, y=64, z=-233" manda o bot para o lugar errado
amanhã. Só entra no histórico intenção cujos parâmetros são **vocabulário**
(nome de bloco, estrutura, item, jogo), não estado do mundo.

### Como o replay soa para a criança

A **ação** vem do histórico; a **fala** vem do repertório, de uma entrada nova
`comando_aprendido` com 4+ variações ("Deixa comigo!", "Já vou!").

```
Miguel: constroi uma casinha de pedra
Dudu:   Deixa comigo!              ← repertório, instantâneo
Dudu:   Casa pronta! Ficou linda.  ← resultado da ação
```

A fala original da IA fica **guardada no arquivo**, mas não é dita: ela pode
estar presa ao momento em que foi aprendida ("tá escuro aqui, acende uma
tocha!") e sair fora de hora soa quebrado. O que ela serve é de matéria-prima
para o `/upgrade-repertoire` transformar em variação escrita à mão.

### Casamento conservador

O mesmo `scorePattern` do repertório, com limiar **mais alto**: `0.85` contra
`0.7`. Na prática isso aceita texto idêntico e frase inteira contida, e **recusa**
o casamento por saco de palavras (`0.75`) — que é ótimo para conversa e perigoso
para ação: "pega pedra e madeira" tem as mesmas palavras de "pega madeira" e é
outro pedido.

> **Descoberto na implementação:** limiar nenhum resolve **negação**. "nao pega
> madeira" contém a frase "pega madeira" inteira, com limites de palavra, e
> pontua 0.85. Por isso existe também uma guarda de negação: `nao`, `nunca` e
> `nem` barram o casamento quando a palavra não fazia parte da frase aprendida —
> um comando aprendido de "nao mexe no meu bau" continua casando com ele mesmo.

### Desaprender

Um comando aprendido errado é pior que nenhum: a criança repete o pedido e o bot
repete o erro, cada vez mais rápido. Duas saídas:

- **`para` desfaz.** `STOP` dentro de `unlearnOnStopMs` (15 s) depois de um
  comando aprendido apaga a entrada. Reusa o comando que a criança já sabe, sem
  palavra nova para decorar.
- **Sombra do parser.** Entrada cuja frase o parser de regex passou a resolver é
  descartada no carregamento — é assim que a promoção para código, feita pelo
  `/upgrade-repertoire`, limpa o cache sozinha.

### Onde fica no código

```
domain/intent.ts            LEARNABLE_INTENTS (catálogo fechado)
dialogue/learned.ts         casamento e regras, funções puras
memory/learned-store.ts     carga, escrita atômica, teto e LRU
behaviors/router.ts         nível 1.5 da cascata
app/bot.ts                  gravação depois do sucesso da ação
tools/gaps.ts               os aprendidos entram no relatório da rotina
```

O par "regra pura + store na borda" é o mesmo do repertório (`dialogue/` puro,
I/O em `loader.ts`) e do que já existe em `tools/gaps.ts`.

### O ciclo que isso fecha

```
IA resolve  →  histórico replica sem rede  →  /upgrade-repertoire promove
   (1x)            (n vezes, de graça)          o que repetiu para regex
                                                        ↓
                                            entrada some do cache
                                            (o parser passou a resolver)
```

A IA vira **professora**, não intérprete de plantão.

## Scope

### In Scope

- Histórico persistente em `data/learned-commands.json`, com escrita atômica.
- Nível 1.5 na cascata, com limiar próprio de confiança.
- Gravação só de ação que a IA propôs **e** que deu certo.
- Catálogo fechado de intenções aprendíveis, com `GOTO_COORDS` de fora.
- Entrada `comando_aprendido` no repertório (as duas cópias).
- Desaprender por `para` e descarte de entrada sombreada pelo parser.
- Teto de entradas com descarte da menos usada; `forgetAfterDays` opcional.
- `source: 'learned'` no histórico de conversa, para medir o que foi economizado.
- Bloco `learned` na configuração, com `enabled: false` desligando tudo.
- Contagem no banner de inicialização e seção nova no `repertoire:gaps`.
- Testes.

### Out of Scope

- **Generalizar o que foi aprendido.** "pega 8 madeiras" não ensina
  "pega 20 pedras": nada de inferir parâmetro por analogia.
- **Aprender conversa.** Fala sem ação não entra; o repertório continua sendo
  escrito à mão, por gente que lê a regra número um.
- **Promoção automática para `commands.ts`.** Virar regex é decisão de código,
  revisada por humano na rotina diária.
- Editar o histórico pelo chat ("esquece o que eu falei"): `esquece` já é `STOP`.
- Compartilhar o aprendizado entre máquinas ou entre jogadores.
- Embedding ou casamento semântico. O limiar aqui é sintático de propósito.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| Domínio | Sim | `LEARNABLE_INTENTS` em `intent.ts` |
| Diálogo | Sim | `dialogue/learned.ts` novo (casamento puro) |
| Memória | Sim | `memory/learned-store.ts` novo; `TurnSource` ganha `'learned'` |
| Roteador | Sim | Nível 1.5 antes do repertório |
| `app/bot.ts` | Sim | Grava depois do sucesso; desaprende no `para` |
| Repertório (as **duas** cópias) | Sim | Entrada `comando_aprendido` |
| Configuração | Sim | Bloco `learned` + `config.example.yaml` |
| Banner de inicialização | Sim | Uma linha com a contagem |
| Ferramenta (`tools/gaps.ts`) | Sim | Seção dos aprendidos no relatório |
| Providers de IA | Não | Nenhum provider sabe que existe cache |
| Ações, jogos, defesa, conexão | Não | — |

## Architecture Considerations

- **Cache é sugestão, código é lei.** O parser de regex vem antes e sempre
  ganha: o que um humano escreveu vale mais que o que o bot deduziu.
- **Nível 1.5, não 2.5.** Ação tem precedência sobre conversa, pelo mesmo motivo
  que o parser tem precedência sobre o repertório. E o conflito é raro por
  construção: frase que o repertório responde nunca chega à IA, então nunca é
  aprendida.
- **Nenhuma camada de baixo sabe do cache.** Provider não muda; quem consulta é
  o roteador, quem grava é o `app/`. A dependência continua de cima para baixo.
- **Catálogo fechado outra vez.** `LEARNABLE_INTENTS` é a terceira lista fechada
  do projeto (intenções, plantas, jogos) e existe pelo mesmo motivo: limitar o
  que o bot pode decidir sozinho.
- **Falha de cache nunca derruba o bot.** Arquivo corrompido ou ilegível carrega
  vazio e loga aviso — é cache, não fonte da verdade.
- **Privacidade não piora, melhora.** O arquivo é derivado das frases da criança
  e mora em `data/`, que está inteiro no `.gitignore`; e cada acerto do cache é
  uma frase que **deixa** de sair da máquina.

## Success Criteria

- [x] Pedido em linguagem natural que a IA resolveu na segunda vez é atendido
      **sem** chamada de rede
- [x] Com o provider fora do ar, comando já aprendido continua funcionando
- [x] Ação que falhou, foi recusada ou foi cancelada **não** é aprendida
- [x] `GOTO_COORDS` nunca entra no histórico
- [x] `para` logo depois de um comando aprendido apaga a entrada
- [x] Entrada que o parser passou a resolver desaparece no carregamento seguinte
- [x] Arquivo corrompido não impede o bot de iniciar
- [x] `learned.enabled: false` volta ao comportamento de hoje, bit a bit
- [x] O histórico de conversa distingue `learned` de `llm`
- [x] Nenhuma fala do bot fica presa ao contexto de quando foi aprendida
- [x] `npx eslint src test` passa; `npm test` passa fora de um teste instável
      pré-existente (ver `tasks.md`, quality gate da fase 6)

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Frase ambígua vira comando errado e o erro passa a ser instantâneo | Média | **Alto** | Limiar 0.85 (sem saco de palavras); só ação bem-sucedida; catálogo fechado; `para` desfaz |
| Intenção com parâmetro preso ao mundo replica no lugar errado | Média | Alto | `GOTO_COORDS` fora do catálogo; regra explícita de "parâmetro é vocabulário, não estado" |
| Cache envelhece depois de mudança em `commands.ts` ou no repertório | Alta | Baixo | Parser tem precedência; entrada sombreada é descartada na carga |
| Fala do replay soar repetitiva | Alta | Médio | Fala vem do repertório, com 4+ variações e o sorteio que já evita repetir a última |
| Arquivo corrompido por crash no meio da escrita | Média | Médio | Escrita atômica (arquivo temporário + rename); carga tolerante começa vazia |
| Histórico crescer sem fim | Média | Baixo | `maxEntries` com descarte da menos usada; `forgetAfterDays` opcional |
| Criança perceber que o bot "decorou" e ficar entediada | Baixa | Baixo | Só a ação é decorada; a fala continua sorteada |
| Aprender a frase de outro jogador do servidor | Baixa | Médio | Só mensagem do dono vira comando, como já vale para o resto da cascata |
