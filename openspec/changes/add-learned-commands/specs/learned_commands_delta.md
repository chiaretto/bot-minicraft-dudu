# Delta: Comandos Aprendidos

**Change ID:** `add-learned-commands`
**Affects:** `src/domain/intent.ts`, `src/dialogue/learned.ts`,
`src/memory/learned-store.ts`, `src/behaviors/router.ts`, `src/app/bot.ts`

> Componente **novo**. No arquivamento vira `openspec/specs/learned_commands.md`.
>
> Convenção de nomes: `Dudu` é o bot, `Miguel` é o jogador dono.

---

## ADDED

### Requirement: Aprender o que a IA resolveu

Quando o nível 3 resolve uma mensagem em ação e essa ação é executada com
sucesso, o par `frase normalizada → intenção validada` é gravado no histórico de
comandos aprendidos.

As três condições são obrigatórias e cumulativas: **veio da IA**, **tinha ação**,
**a ação deu certo**.

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

Entrada errada sai do histórico por dois caminhos: a criança reclamando com
`para`, e a promoção da frase para o parser de regex.

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

## MODIFIED

(Nenhum requisito de outro componente é modificado neste arquivo — ver os deltas
de `local_dialogue`, `conversation_memory`, `ai_companion`, `configuration` e
`startup_console`.)

---

## REMOVED

(Nenhum)
