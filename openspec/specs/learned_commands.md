# Especificação: Comandos Aprendidos

**Componente:** `learned_commands`
**Origem:** `add-learned-commands` (2026-08-20)

> **Escopo:** o **nível 1.5** da cascata — o cache que guarda o que a IA já
> resolveu e replica sem rede. Fica entre o parser de regex e o repertório.
>
> A regra que atravessa o componente inteiro: **cache é sugestão, código é lei.**
> O parser vem antes e sempre ganha; o que um humano escreveu vale mais que o que
> o bot deduziu.
>
> Convenção de nomes: `Dudu` é o bot, `Miguel` é o jogador dono.

---

## Requisitos


### Requirement: Aprender o que a IA resolveu

Quando o nível 3 resolve uma mensagem em ação e essa ação é executada com
sucesso, o par `frase normalizada → intenção validada` é gravado no histórico de
comandos aprendidos.

As **quatro** condições são obrigatórias e cumulativas: **veio da IA**, **tinha
ação**, **a ação deu certo** e **a frase é um pedido** (ver "Só pedido vira
comando aprendido").

O que nem chega a ser avaliado: retorno de comando do jogo, cortado na borda
(`minecraft_connection` → "Retorno de comando do jogo não é fala de jogador").
Duas das entradas ruins de 29/08/2026 nasceram exatamente disso.

#### Scenario: Pedido em linguagem natural vira comando aprendido
- **GIVEN** `learned.enabled` é `true` e o provider é `gemini`
- **AND** o parser de regex e o repertório não resolveram a mensagem
- **WHEN** `Miguel` digita `dudu, constroi uma casinha de pedra pra mim`
- **AND** a IA devolve fala mais a ação `BUILD` com `structure: 'casa'` e `material: 'pedra'`
- **AND** a obra termina com sucesso
- **THEN** o histórico ganha uma entrada com a frase normalizada e essa intenção
- **AND** a entrada registra o provider que ensinou, a data e a fala original da IA

#### Scenario: Conversa não vira comando
- **GIVEN** a IA respondeu sem ação nenhuma
- **WHEN** `Miguel` digita `dudu, você gosta de chuva?`
- **THEN** nada é gravado no histórico
- **AND** o repertório continua sendo a única fonte de conversa escrita à mão

#### Scenario: Ação recusada não é aprendida
- **GIVEN** a IA propôs `COLLECT_BLOCK` com um bloco fora da allowlist
- **WHEN** a ação é recusada (`ActionRefused`)
- **THEN** nada é gravado
- **AND** o próximo pedido igual volta a passar pela IA

#### Scenario: Ação cancelada no meio não é aprendida
- **GIVEN** a IA propôs `BUILD` e a obra começou
- **WHEN** `Miguel` digita `dudu, para` antes de a obra terminar
- **THEN** nada é gravado
- **AND** o bot não aprende um pedido que a criança interrompeu

#### Scenario: Ação que falhou não é aprendida
- **GIVEN** a IA propôs `COLLECT_BLOCK` e o bot não achou o bloco
- **WHEN** a ação termina em `NoProgress` ou erro
- **THEN** nada é gravado

#### Scenario: Segunda vez com as mesmas palavras não gera entrada nova
- **GIVEN** o histórico já tem a frase `constroi uma casinha de pedra`
- **WHEN** `Miguel` repete a frase e o bot replica a ação
- **THEN** a entrada existente tem o contador de uso incrementado
- **AND** nenhuma entrada duplicada é criada

#### Scenario: Eco de sistema não é aprendido
- **GIVEN** o dono usa `/tp` e o servidor devolve o retorno do comando
- **WHEN** a mensagem seria processada
- **THEN** ela nem chega à cascata
- **AND** nada é gravado no histórico

#### Scenario: Só o dono ensina
- **GIVEN** outro jogador do servidor conversa com o bot
- **WHEN** a mensagem dele desce a cascata
- **THEN** nada é gravado no histórico
- **AND** vale a mesma regra de autorização do resto da cascata

---

### Requirement: Catálogo fechado de intenções aprendíveis

Só entra no histórico intenção que esteja em `LEARNABLE_INTENTS` **e** cujos
parâmetros sejam vocabulário (nome de bloco, estrutura, item, jogo, papel), nunca
estado do mundo daquele instante.

#### Scenario: Intenção com coordenada nunca é aprendida
- **GIVEN** a IA propôs `GOTO_COORDS` com `x: 104, y: 64, z: -233`
- **AND** o bot chegou lá com sucesso
- **WHEN** a gravação é avaliada
- **THEN** nada é gravado
- **AND** a razão é que a coordenada é do momento: amanhã a mesma frase levaria o bot ao lugar errado

#### Scenario: Intenção fora do catálogo é ignorada em silêncio
- **GIVEN** uma intenção nova existe em `INTENT_TYPES` mas não em `LEARNABLE_INTENTS`
- **WHEN** ela é executada com sucesso a pedido da IA
- **THEN** nada é gravado
- **AND** o bot funciona igual, só sem aprender aquela

#### Scenario: Vocabulário é preservado inteiro
- **GIVEN** a IA propôs `COLLECT_BLOCK` com `block: 'madeira'` e `count: 8`
- **WHEN** a entrada é gravada
- **THEN** o bloco e a quantidade são guardados como foram validados
- **AND** o replay pede exatamente a mesma quantidade — nada é inferido por analogia

---

### Requirement: Replay sem chamada de rede

Um acerto no histórico executa a ação sem consultar provider nenhum, mesmo com a
IA ligada e saudável.

#### Scenario: Segunda vez é instantânea
- **GIVEN** o histórico tem `pega umas madeirinhas` → `COLLECT_BLOCK madeira 8`
- **WHEN** `Miguel` digita `dudu, pega umas madeirinhas`
- **THEN** o bot fala uma variação de `comando_aprendido` e executa a coleta
- **AND** **nenhuma** chamada ao provider de IA acontece
- **AND** a fala chega ao chat sem esperar rede

#### Scenario: Funciona com a IA fora do ar
- **GIVEN** o circuito do provider está aberto ou a cota estourou
- **WHEN** `Miguel` repete um pedido já aprendido
- **THEN** o bot executa a ação normalmente
- **AND** um pedido que funcionou ontem não deixa de funcionar por causa da rede

#### Scenario: A fala do replay vem do repertório
- **GIVEN** a entrada guardada tem a fala original `Eba, casa de pedra! Tá escuro aqui, acende uma tocha!`
- **WHEN** o comando é replicado num dia claro
- **THEN** o bot diz uma variação de `comando_aprendido`, curta e sem contexto
- **AND** a fala guardada **não** é dita, porque o contexto dela venceu
- **AND** ela continua no arquivo, como material para a rotina do repertório

#### Scenario: Desligado, a cascata volta a ter três níveis
- **GIVEN** `learned.enabled` é `false`
- **WHEN** uma mensagem desce a cascata
- **THEN** o histórico não é consultado nem gravado
- **AND** o comportamento é idêntico ao de antes desta mudança

---

### Requirement: Casamento conservador de frase

O casamento reusa o `scorePattern` do repertório com limiar próprio,
`learned.minConfidence` (padrão `0.85`), maior que o da conversa.

#### Scenario: Frase idêntica casa
- **GIVEN** a entrada guardada é `pega umas madeirinhas`
- **WHEN** `Miguel` digita `DUDU, PEGA UMAS MADEIRINHAS!!!`
- **THEN** a normalização iguala as duas e o comando é replicado

#### Scenario: Frase inteira dentro de outra casa
- **GIVEN** a entrada guardada é `constroi uma casinha de pedra`
- **WHEN** `Miguel` digita `dudu, constroi uma casinha de pedra aqui do lado`
- **THEN** o comando é replicado

#### Scenario: Saco de palavras NÃO casa
- **GIVEN** a entrada guardada é `pega madeira`
- **WHEN** `Miguel` digita `pega pedra e madeira`
- **THEN** a confiança fica em 0.75, abaixo do limiar, e o histórico declina
- **AND** a mensagem segue na cascata
- **AND** a razão é que as mesmas palavras em outra ordem são outro pedido, e ação errada é pior que pergunta repetida

#### Scenario: Frase negada NÃO casa
- **GIVEN** a entrada guardada é `pega madeira`
- **WHEN** `Miguel` digita `nao pega madeira`
- **THEN** o histórico declina
- **AND** limiar nenhum resolveria isso: a frase guardada está contida inteira, com limites de palavra, e pontuaria 0.85
- **AND** quem recusa é uma guarda de negação, que barra `nao`, `nunca` e `nem` quando a palavra não faz parte da frase aprendida

#### Scenario: Negação que faz parte do pedido não estorva
- **GIVEN** a entrada guardada é `nao mexe no meu bau`
- **WHEN** `Miguel` repete `nao mexe no meu bau`
- **THEN** o comando é replicado normalmente
- **AND** a guarda só barra negação **nova**, que não existia quando o comando foi aprendido

#### Scenario: Empate vai para a mais usada
- **GIVEN** duas entradas casam com a mesma confiança
- **WHEN** o histórico escolhe
- **THEN** vence a que tem mais usos registrados

---

### Requirement: Desaprender comando errado

Entrada errada sai do histórico por três caminhos: a criança reclamando com
`para`, a criança reclamando com a frase de correção (ver "A criança desfaz com
a palavra dela"), e a promoção da frase para o parser de regex.

#### Scenario: `para` logo depois desfaz o aprendizado
- **GIVEN** o bot acabou de replicar um comando aprendido
- **WHEN** `Miguel` digita `dudu, para` dentro de `learned.unlearnOnStopMs`
- **THEN** a ação é interrompida como sempre
- **AND** a entrada é apagada do histórico
- **AND** o próximo pedido igual volta a passar pela IA

#### Scenario: `para` fora da janela não apaga nada
- **GIVEN** o último comando aprendido foi replicado há vários minutos
- **WHEN** `Miguel` digita `dudu, para`
- **THEN** só a ação em curso é interrompida
- **AND** o histórico fica intacto

#### Scenario: Entrada sombreada pelo parser é descartada na carga
- **GIVEN** o histórico tem `venha aqui` → `FOLLOW`
- **AND** `venha aqui` passou a ser padrão do parser de regex em `commands.ts`
- **WHEN** o bot inicia e carrega o histórico
- **THEN** a entrada é descartada
- **AND** o log diz quantas entradas saíram por já estarem no código

#### Scenario: Os dois desfazeres da criança convivem
- **GIVEN** o bot acabou de replicar um comando aprendido
- **WHEN** a criança digita `para` **ou** `nao era isso` dentro da janela
- **THEN** nos dois casos a entrada é apagada
- **AND** `para` também interrompe a ação; a correção só desfaz o aprendizado

#### Scenario: Apagar na mão
- **GIVEN** um adulto quer limpar o aprendizado
- **WHEN** o arquivo `data/learned-commands.json` é apagado com o bot parado
- **THEN** o bot inicia com o histórico vazio e volta a aprender do zero

---

### Requirement: Persistência tolerante a falha

O histórico vive em `learned.path` (padrão `data/learned-commands.json`), é
reescrito por completo a cada mudança e **nunca** impede o bot de funcionar.

#### Scenario: Escrita atômica
- **GIVEN** uma entrada nova precisa ser gravada
- **WHEN** o arquivo é escrito
- **THEN** o conteúdo vai primeiro para um arquivo temporário no mesmo diretório
- **AND** só então é renomeado sobre o definitivo
- **AND** um crash no meio deixa o arquivo anterior íntegro

#### Scenario: Arquivo corrompido não derruba o bot
- **GIVEN** `data/learned-commands.json` tem JSON inválido
- **WHEN** o bot inicia
- **THEN** o histórico começa vazio
- **AND** um aviso é logado com o caminho do arquivo
- **AND** o bot conecta e opera normalmente

#### Scenario: Arquivo ausente é o caso normal da primeira execução
- **GIVEN** o arquivo não existe
- **WHEN** o bot inicia
- **THEN** o histórico começa vazio, sem aviso de erro
- **AND** o arquivo é criado na primeira gravação

#### Scenario: Teto de entradas descarta a menos usada
- **GIVEN** o histórico está com `learned.maxEntries` entradas
- **WHEN** uma entrada nova é aprendida
- **THEN** a entrada usada há mais tempo é descartada
- **AND** o arquivo não cresce sem limite

#### Scenario: Esquecimento por idade é opcional
- **GIVEN** `learned.forgetAfterDays` é `null`
- **WHEN** o histórico é carregado
- **THEN** nada é descartado por idade
- **AND** com um número, entrada sem uso há mais dias que isso é descartada

---

### Requirement: Comandos aprendidos visíveis

O aprendizado não pode ser invisível: quem cuida do bot precisa saber o que ele
decorou, quanto isso economizou e o que já merece virar código.

#### Scenario: Contagem no banner de inicialização
- **GIVEN** o histórico tem 12 entradas válidas
- **WHEN** o bot inicia
- **THEN** o banner mostra uma linha com a contagem de comandos aprendidos
- **AND** mostra quantas foram descartadas por já estarem no parser

#### Scenario: Acerto do cache aparece no log
- **GIVEN** um comando aprendido é replicado
- **WHEN** o log da aplicação é escrito
- **THEN** aparece a frase que casou, a intenção e quem tinha ensinado
- **AND** fica registrado que uma chamada de IA foi economizada

#### Scenario: Relatório da rotina lista os aprendidos
- **GIVEN** o histórico tem entradas com uso repetido
- **WHEN** `npm run repertoire:gaps` roda
- **THEN** existe uma seção com os comandos aprendidos, ordenada por uso
- **AND** as mais usadas aparecem marcadas como candidatas a virar regex em `commands.ts`

---

### Requirement: Só pedido vira comando aprendido

A quarta condição de gravação: a frase precisa ser um **pedido**. Duas formas de
não ser, as duas recusadas por forma e não por assunto — nada aqui tenta
entender a frase, como já vale para a guarda de negação:

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

A guarda mora **dentro** de `shouldLearn`, não no chamador: guarda que quem
chama precisa lembrar de aplicar é guarda que um dia falta.

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

#### Scenario: Palavra interrogativa no meio da frase não faz pergunta
- **GIVEN** a criança digita `constroi uma casa quando eu falar ja`
- **WHEN** a frase é avaliada
- **THEN** ela não é recusada como pergunta
- **AND** quem a recusa é a guarda de condição, pelo motivo certo

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
- **WHEN** uma frase deixa de ser decorada
- **THEN** o log diz a frase e o motivo (`pergunta` ou `condicao`)
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
sentido, ela é conversa comum. A janela é a mesma do `para`
(`learned.unlearnOnStopMs`) — são a mesma ideia.

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

O carregamento já descarta entrada sombreada pelo parser. As guardas de ruído e
de "não é pedido" entram no mesmo ponto: entrada que nasceu de recado do jogo,
ou cuja frase não é pedido, é descartada na carga.

A entrada de recado é reconhecida pelos **exemplos**, não pela frase: a frase
guardada está normalizada e a normalização come a pontuação, então o `]` que
denuncia o recado já não está lá. Os exemplos guardam como a mensagem chegou.

É assim que regra nova vale para trás sem migração e sem ninguém editar
`data/learned-commands.json` à mão — o que o `CLAUDE.md` proíbe justamente
porque o arquivo é cache.

#### Scenario: As entradas ruins de 29/08/2026 somem no primeiro startup
- **GIVEN** o histórico tem `teleported odraude to fresherrobin90` →
  `LOOK_AT_OWNER`, `removed 3 item s from player fresherrobin90` →
  `LOOK_AT_OWNER`, `qual sua llm` → `FOLLOW`,
  `construa uma casa quando eu falar ja` → `STAY` e
  `faca uma casa grande com concreto se voce nao tiver fas de madeira` → `BUILD`
- **WHEN** o bot inicia depois desta mudança
- **THEN** as cinco são descartadas: duas por recado do jogo, três por não serem
  pedido
- **AND** o arquivo real de 8 entradas fica com 3
- **AND** as entradas boas sobrevivem com o contador de uso intacto

#### Scenario: A limpeza não alcança tudo, e isso está assumido
- **GIVEN** o histórico tem `ja` → `BUILD`, decorado de um `já!` que a criança
  disse no meio de outra conversa
- **WHEN** o bot inicia
- **THEN** a entrada continua lá
- **AND** a razão é que não existe sinal sintático que a denuncie
- **AND** quem resolve é a criança, dizendo `nao era isso` no próximo replay

#### Scenario: O relatório de carga separa os motivos
- **GIVEN** entradas foram descartadas na carga
- **WHEN** o relatório é montado
- **THEN** os motivos vêm separados: `shadowed`, `noise`, `notRequest`,
  `expired`, `invalid`
- **AND** um número só, somando tudo, esconderia qual regra está agindo
