# Delta: Comandos Aprendidos

**Change ID:** `fix-chat-noise-and-learned-quality`
**Affects:** `dialogue/learned.ts`, `memory/learned-store.ts`, `app/bot.ts`,
`app/startup-banner.ts`

---

## ADDED

### Requirement: Só pedido vira comando aprendido

Uma **quarta** condição de gravação, ao lado das três que já existem (veio da
IA, tinha ação, a ação deu certo): a frase precisa ser um **pedido**.

Duas formas de não ser, e as duas são recusadas por forma, não por assunto —
nada aqui tenta entender a frase, como já vale para a guarda de negação:

- **Pergunta.** Termina em `?`, ou começa com palavra de uma lista fechada
  (`qual`, `quais`, `quem`, `como`, `quando`, `onde`, `aonde`, `por que`,
  `porque`, `quanto`, `quantos`, `quantas`, `o que`, `sera que`, `voce sabe`,
  `voce consegue`).
- **Pedido com condição.** Contém `quando`, `se eu`, `se voce`, `depois que`,
  `toda vez que` ou `sempre que`. O bot não sabe esperar por gatilho: ele age
  agora, e decorar a frase transforma a condição em ação imediata.

Os dois motivos são concretos, e os dois estavam no cache de 29/08/2026.
`qual sua llm ?` foi decorado como `FOLLOW`: a IA respondeu conversa e mandou
uma ação junto, seguir o dono "deu certo" — sempre dá — e a pergunta virou
comando instantâneo, sem passar por IA nunca mais. E
`construa uma casa quando eu falar ja` foi decorado como `STAY`: o replay
constrói na hora, que é o contrário do que a criança pediu.

> **Desvio da proposta, feito na implementação.** A proposta previa só a guarda
> de pergunta. Com ela sozinha, `construa uma casa quando eu falar ja`
> continuaria no cache e o critério "as 4 entradas ruins somem" seria falso. A
> guarda de condição é da mesma natureza sintática e recusa pela razão certa:
> o bot não tem execução condicional.

#### Scenario: Pergunta com ação junto não é decorada
- **GIVEN** a criança digita `qual sua llm ?`
- **AND** a IA responde conversa e propõe `FOLLOW` junto
- **AND** o bot segue o dono com sucesso
- **WHEN** a gravação é avaliada
- **THEN** nada é gravado no histórico
- **AND** a próxima pergunta igual volta a ser respondida como conversa

#### Scenario: Pergunta sem ponto de interrogação também é recusada
- **GIVEN** a criança digita `quantos blocos de madeira voce tem`
- **WHEN** a gravação é avaliada
- **THEN** nada é gravado
- **AND** a razão é a palavra inicial, não a pontuação — criança de 7 anos não
  fecha pergunta com `?`

#### Scenario: Pedido em forma de pergunta perde o atalho, não a ação
- **GIVEN** a criança digita `sera que da pra pegar madeira?`
- **WHEN** a IA resolve e a coleta dá certo
- **THEN** o bloco é coletado normalmente
- **AND** nada é decorado
- **AND** o custo aceito é esse: perder um atalho é barato, decorar uma pergunta
  é caro

#### Scenario: Pedido preso a uma condição não é decorado
- **GIVEN** a criança digita `construa uma casa quando eu falar ja`
- **AND** a IA propõe uma ação e ela dá certo
- **WHEN** a gravação é avaliada
- **THEN** nada é gravado
- **AND** a razão é que o bot não sabe esperar por gatilho: decorado, o pedido
  vira ação imediata na próxima vez que a frase aparecer

#### Scenario: Pedido normal continua sendo decorado
- **GIVEN** a criança digita `pega umas madeirinhas`
- **WHEN** a IA resolve e a coleta dá certo
- **THEN** o par entra no histórico como sempre

#### Scenario: A recusa de aprender é rastreável
- **GIVEN** o log da aplicação está em nível `debug`
- **WHEN** uma frase deixa de ser decorada por ser pergunta
- **THEN** o log diz a frase e o motivo
- **AND** "por que isso não foi decorado?" deixa de ser investigação

---

### Requirement: A criança desfaz com a palavra dela

Além do `para`, uma frase de correção desfaz o último comando replicado:
`nao era isso`, `nao e isso`, `nao foi isso`, `nao era esse`, `nao era essa`,
`errado`, `ta errado`, `esta errado`, `isso ta errado`. A frase precisa ser a
mensagem inteira: "nao era isso que eu queria construir" é conversa.

`para` existe e funciona, mas não é o que uma criança de 7 anos diz quando o bot
faz a coisa errada — ela diz que não era aquilo. Sem essa frase, o único
desfazer é uma palavra que ela não vai usar na hora certa.

A frase é tratada **antes da cascata**, no mesmo lugar de `isGiveUp` e da
resposta da pergunta de papel, e pelo mesmo motivo: fora do contexto que lhe dá
sentido, ela é conversa comum.

#### Scenario: Correção logo depois do replay apaga a entrada
- **GIVEN** o bot acabou de replicar um comando aprendido
- **WHEN** a criança digita `nao era isso` dentro de `learned.unlearnOnStopMs`
- **THEN** a entrada é apagada do histórico
- **AND** o bot responde uma variação de `comando_esquecido`
- **AND** o próximo pedido igual volta a passar pela IA

#### Scenario: Correção sem replay recente é conversa
- **GIVEN** nenhum comando aprendido foi replicado nos últimos minutos
- **WHEN** a criança digita `errado` no meio de uma brincadeira
- **THEN** nada é apagado do histórico
- **AND** a mensagem desce a cascata como qualquer outra

#### Scenario: A correção não interrompe o que estiver em curso
- **GIVEN** o bot está executando a ação replicada
- **WHEN** a criança digita `nao era isso`
- **THEN** o aprendizado é desfeito
- **AND** quem interrompe a ação continua sendo `para` — são coisas diferentes e
  a criança pode querer as duas, uma de cada vez

#### Scenario: O bot admite o erro como amigo
- **GIVEN** uma entrada acabou de ser esquecida
- **WHEN** o bot responde
- **THEN** a fala é curta, calorosa e convida a ensinar de novo
- **AND** nenhuma palavra técnica ("cache", "entrada", "removida") chega ao chat

---

### Requirement: Regra nova limpa o que já está decorado

O carregamento do histórico já descarta entrada sombreada pelo parser. As
guardas novas entram no mesmo ponto: entrada que nasceu de recado do jogo, ou
cuja frase não é pedido, é descartada na carga.

A entrada de recado é reconhecida pelos **exemplos**, não pela frase: a frase
guardada está normalizada e a normalização come a pontuação, então o `]` que
denuncia o recado já não está lá. Os exemplos guardam como a mensagem chegou.

É assim que a regra vale para trás sem migração e sem ninguém editar
`data/learned-commands.json` à mão — o que o `CLAUDE.md` proíbe justamente
porque o arquivo é cache.

#### Scenario: As entradas ruins de hoje somem no primeiro startup
- **GIVEN** o histórico tem `teleported odraude to fresherrobin90` →
  `LOOK_AT_OWNER`, `removed 3 item s from player fresherrobin90` →
  `LOOK_AT_OWNER`, `qual sua llm` → `FOLLOW`,
  `construa uma casa quando eu falar ja` → `STAY` e
  `faca uma casa grande com concreto se voce nao tiver fas de madeira` → `BUILD`
- **WHEN** o bot inicia depois desta mudança
- **THEN** as cinco são descartadas: duas por recado do jogo, três por não serem
  pedido
- **AND** as entradas boas sobrevivem com o contador de uso intacto

#### Scenario: A limpeza não alcança tudo, e isso está assumido
- **GIVEN** o histórico tem `ja` → `BUILD`, decorado de um `já!` que a criança
  disse no meio de outra conversa
- **WHEN** o bot inicia
- **THEN** a entrada continua lá
- **AND** a razão é que não existe sinal sintático que a denuncie
- **AND** quem resolve é a criança, dizendo `nao era isso` no próximo replay

#### Scenario: O banner diz o que saiu e por quê
- **GIVEN** entradas foram descartadas na carga
- **WHEN** o cartão de inicialização é montado
- **THEN** os motivos aparecem separados: já no parser, recado do jogo, não era pedido
- **AND** um número só, somando tudo, esconderia qual regra está agindo

---

## MODIFIED

### Requirement: Aprender o que a IA resolveu

As três condições passam a ser **quatro**: veio da IA, tinha ação, a ação deu
certo, **e a frase é um pedido** (nem pergunta, nem pedido com condição). Todas
obrigatórias e cumulativas.

O requisito também deixa de depender de o chamador saber o que é fala: retorno
de comando do jogo não chega mais até aqui, porque é cortado na borda (ver
`minecraft_connection_delta.md`). Duas das entradas ruins de hoje nasceram
exatamente disso.

#### Scenario: Eco de sistema não é aprendido
- **GIVEN** o dono usa `/tp` e o servidor devolve o retorno do comando
- **WHEN** a mensagem seria processada
- **THEN** ela nem chega à cascata
- **AND** nada é gravado no histórico

---

### Requirement: Desaprender comando errado

Os dois caminhos viram **três**: `para` dentro da janela, a frase de correção
dentro da janela, e a promoção da frase para o parser de regex.

Segue valendo, sem mudança: fora da janela, `para` é só "pare o que está
fazendo"; entrada sombreada pelo parser é descartada na carga; e apagar o
arquivo com o bot parado continua sendo o apagão geral.

#### Scenario: Os dois desfazeres convivem
- **GIVEN** o bot acabou de replicar um comando aprendido
- **WHEN** a criança digita `para` **ou** `nao era isso` dentro da janela
- **THEN** nos dois casos a entrada é apagada
- **AND** `para` também interrompe a ação; a correção só desfaz o aprendizado

---

## REMOVED

(None)
