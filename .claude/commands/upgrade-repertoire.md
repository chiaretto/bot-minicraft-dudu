---
description: Analisa o histórico de conversa e amplia o repertório local do bot
argument-hint: "[--days N | --since AAAA-MM-DD | --kind miss|ai]"
allowed-tools: Bash(npm run:*), Bash(npm test), Bash(npm install), Bash(node:*), Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git log:*), Read, Edit, Write, Grep, Glob
---

Rotina de aprendizado do bot: ler o que o jogador falou, descobrir o que o
repertório local não cobriu e fechar essas lacunas — para o bot entender mais
variações de frase sozinho e depender cada vez menos da IA.

Argumentos recebidos (repassados ao relatório, pode vir vazio): `$ARGUMENTS`

## Antes de tudo

**Leia `CLAUDE.md`** — em especial "Regra número um: o dono é uma criança de 7
anos" e "Rotina diária". Toda frase que você escrever aqui vai ser lida por uma
criança de 7 anos: curta, palavra simples, tom de amigo, honesta sobre o que o
bot não sabe fazer.

Se `node_modules/` não existir, rode `npm install` primeiro — o relatório roda
por `tsx`.

## 1. Levantar as lacunas

```
npm run repertoire:gaps -- $ARGUMENTS
```

O relatório separa em dois grupos, e os dois interessam:

- **NÃO ENTENDI (miss)** — caiu em `nao_entendi`: o bot não respondeu nada útil.
- **RESOLVIDO SÓ PELA IA (ai)** — a IA salvou, mas custou rede e demora. É
  exatamente o que internalizar para o bot responder sozinho na próxima.

Cada grupo já vem com: quantas vezes repetiu, como o jogador escreveu de
verdade, a resposta que a IA deu (matéria-prima para as variações) e a entrada
mais parecida que já existe.

O relatório traz ainda uma terceira seção: os **comandos aprendidos** da IA
(nível 1.5 da cascata), ordenados por uso. Os marcados como candidatos já
repetiram o bastante para virar regex em `src/behaviors/commands.ts` — promova
os que fizerem sentido, que a entrada sai do cache sozinha no startup seguinte.

O que **ignorar** ao ler:

- grupos marcados `JÁ RESOLVE HOJE` (o relatório esconde por padrão) — o gap
  fechou depois daquele dia de log;
- ruído de sistema que entrou no chat, tipo `Teleported X to Y`, nome de
  jogador solto, mensagem de morte — não é fala dirigida ao bot;
- frase única e sem sentido que não vai repetir. Priorize o que repetiu, e
  entre iguais o mais recente.

Se não houver log nenhum, diga isso ao dono e pare — sem histórico não há o que
aprender.

## 2. Agrupar por assunto, não por frase

Cinco jeitos de perguntar a mesma coisa viram **uma** entrada com cinco
padrões, nunca cinco entradas. Junte o que o relatório separou por texto:
"sabe voar", "voce consegue voar" e "da pra voar" são o mesmo assunto.

## 3. Decidir o destino de cada assunto

| O que é | Onde vai |
|---|---|
| Assunto de conversa novo | entrada nova em `data/repertoire.yaml` |
| Variação de assunto existente | um padrão a mais na entrada que já existe |
| Comando de ação (seguir, ficar, parar, cavar, construir) | `src/behaviors/commands.ts` — **não** é repertório |
| Capacidade que o bot não tem | resposta honesta: "isso eu ainda não aprendi", mais uma sugestão do que ele sabe fazer |

Use a linha `parecido com:` do relatório para não criar entrada quase
duplicada. Na dúvida entre entrada nova e padrão a mais, prefira padrão a mais.

Comando de ação novo é mudança de comportamento, não de conversa: se aparecer
algo grande (um pedido de ação que o bot não executa), **não implemente aqui** —
liste no fim como sugestão para o dono decidir.

## 4. Escrever

Ao editar `data/repertoire.yaml` (ou a semente, ver passo 6):

- **Padrões normalizados**: minúsculas, sem acento, sem pontuação. Padrão com
  acento nunca casa. O casamento é por palavra: padrão de uma palavra só e
  genérica ("voce", "pega") pega frase demais — use 2+ palavras.
- **Mínimo de 4 respostas** por entrada, senão o bot fica repetitivo e a criança
  percebe rápido. Varie de verdade, não troque só uma palavra.
- **Uma ou duas frases** por resposta, palavra simples, tom de amigo.
- **`specificity` maior** quando a entrada nova for mais específica que uma que
  já casa com a mesma frase (é o que faz "quem te criou" cair em `origem` e não
  em `identidade`).
- **Nunca prometa o que o bot não faz.** Antes de escrever que ele faz algo,
  confirme em `src/behaviors/` que a capacidade existe. Buscar item, por
  exemplo, só funciona com IA ligada.
- **Comentário com a data de origem** em cada entrada nascida do log, para dar
  para rastrear depois por que ela existe:
  `# 2026-08-19: jogador perguntou 3x, caía em nao_entendi`
- Placeholders válidos: `{owner}` `{botName}` `{originStory}` `{health}`
  `{ownerHealth}` `{coords}` `{timeOfDay}` `{inventorySummary}`. Outro derruba
  o bot no startup.

## 5. Validar

Confira que cada frase do log agora cai onde você quis — e que nada regrediu:

```
npm run repertoire:check -- "frase do log" "outra frase do log" "oi" "para"
npm test
```

`repertoire:check` mostra o nível da cascata (COMANDO / REPERTÓRIO / IA) sem
precisar subir o bot. Rode com as frases novas **e** com algumas antigas que já
funcionavam: padrão largo demais rouba frase de outra entrada.

Se o repertório ficar inválido (placeholder errado, YAML quebrado, id
repetido), o próprio relatório recusa carregar e aponta o erro — conserte antes
de seguir.

## 6. Sincronizar as duas cópias

```
npm run repertoire:sync
```

`data/repertoire.yaml` é o que o bot lê, mas `data/` está inteiro no
`.gitignore` (por causa das conversas do jogador). A cópia versionada é
`src/dialogue/default-repertoire.yaml`. Sem esse passo, o trabalho do dia fica
fora do git e sem backup.

Se `data/repertoire.yaml` não existir (máquina onde o bot nunca rodou), edite
`src/dialogue/default-repertoire.yaml` direto — e use
`npm run repertoire:sync -- --from-seed` se quiser a cópia de execução também.

## 7. Fechar

Mostre ao dono, em português simples:

1. quantas lacunas o relatório achou e quantas você fechou;
2. o que entrou de novo (entradas e padrões), em uma linha cada;
3. o que você **não** fez e por quê — pedido de ação que precisa de código,
   assunto que precisa de decisão dele;
4. `git status --short` e `git diff --stat`.

Aí **pergunte** se ele quer commitar. Se sim, commite só os arquivos desta
rodada, com mensagem no padrão do repo:

```
feat(repertoire): entender <assunto> e <assunto>
```

Não commite `config.yaml` nem nada de `data/` (o `.gitignore` já cuida disso, mas
confira). Não faça `push` sem ele pedir.
