# Especificação: Conexão com o Minecraft

**Componente:** `minecraft_connection`
**Origem:** `add-minecraft-companion-bot` (2026-08-15)

---

## Requisitos

### Requirement: Entrada no mundo

O bot conecta ao servidor Minecraft Java Edition como um cliente comum e
cumprimenta o dono ao aparecer no mundo.

#### Scenario: Conexão bem-sucedida
- **GIVEN** o servidor está no ar e a configuração é válida
- **WHEN** o bot inicializa
- **THEN** o bot conecta e recebe o evento `spawn`
- **AND** envia uma saudação no chat mencionando o dono pelo nome
- **AND** entra no estado `IDLE`

#### Scenario: Servidor indisponível na primeira tentativa
- **GIVEN** o servidor não está aceitando conexões
- **WHEN** o bot tenta conectar
- **THEN** o bot registra a falha e tenta de novo com backoff exponencial
- **AND** desiste após o teto de tentativas configurado, com mensagem clara

---

### Requirement: Reconexão automática

Perda de conexão dispara reconexão automática sem intervenção do jogador.

#### Scenario: Servidor cai durante a sessão
- **GIVEN** o bot está conectado e seguindo o dono
- **WHEN** o servidor cai e a conexão termina
- **THEN** o bot tenta reconectar com backoff exponencial (1s, 2s, 4s, 8s…)
- **AND** ao reconectar, envia a saudação e volta para `IDLE`
- **AND** **não** retoma automaticamente o estado `FOLLOW` anterior

#### Scenario: Bot expulso do servidor
- **GIVEN** o bot está conectado
- **WHEN** o servidor expulsa o bot com um motivo
- **THEN** o bot registra o motivo da expulsão
- **AND** não tenta reconectar (expulsão é decisão deliberada do servidor)

---

### Requirement: Snapshot do estado do mundo

A qualquer momento o bot consegue produzir um retrato do seu estado, que serve
de contexto para as decisões da IA.

#### Scenario: Montagem do snapshot
- **GIVEN** o bot está conectado e no mundo
- **WHEN** o snapshot é solicitado
- **THEN** ele contém posição, vida, fome, hora do dia, resumo do inventário,
  se o dono está visível e quais mobs hostis estão a menos de 16 blocos

#### Scenario: Dono fora do alcance de visão
- **GIVEN** o dono está a 200 blocos de distância, fora do chunk carregado
- **WHEN** o snapshot é montado
- **THEN** `ownerVisible` é `false` e `ownerPosition` é nulo

---

### Requirement: Chat com throttle

Mensagens do bot no chat respeitam o limite de taxa do servidor, para não levar
kick por flood.

> `minecraft/chat.ts` cuida das duas direções: a fila de saída daqui e o
> predicado de entrada do requisito seguinte. Continua puro e testável.

#### Scenario: Rajada de mensagens
- **GIVEN** o bot precisa enviar 5 mensagens em menos de um segundo
- **WHEN** as mensagens são enfileiradas
- **THEN** são enviadas espaçadas pelo intervalo mínimo configurado
- **AND** nenhuma é perdida

#### Scenario: Mensagem maior que o limite do chat
- **GIVEN** o provider de IA gerou uma resposta com 400 caracteres
- **WHEN** o bot vai enviar no chat
- **THEN** a mensagem é quebrada em partes dentro do limite do servidor
- **AND** as partes são enviadas em ordem

---

### Requirement: Retorno de comando do jogo não é fala de jogador

O servidor devolve o resultado de um comando (`/tp`, `/gamemode`, `/clear`,
`/time`) no formato `[Fulano: corpo]`, e o mineflayer parte isso como se fosse
fala, com o dono no lugar do remetente. O cliente **não emite** `chat` nesse
caso.

O corte fica na borda de propósito: o mesmo filtro protege a cascata, o
histórico de conversa, a chamada de IA e o cache de comandos aprendidos. Feito
em cada consumidor, seria a mesma regra repetida quatro vezes — e esquecida na
quinta.

#### Scenario: Teletransporte não vira conversa
- **GIVEN** o bot está conectado e o dono digita `/tp Odraude Miguel`
- **WHEN** o servidor devolve `[Miguel: Teleported Odraude to Miguel]`
- **THEN** o cliente não emite `chat`
- **AND** o bot não responde nada no chat
- **AND** nada é gravado no histórico de conversa
- **AND** nenhuma chamada ao provider de IA acontece

#### Scenario: Mudança de modo de jogo não vira conversa
- **GIVEN** o dono digita `/gamemode creative`
- **WHEN** o servidor devolve `[Miguel: Set own game mode to Creative Mode]`
- **THEN** a mensagem é descartada na borda
- **AND** o bot continua fazendo o que estava fazendo, calado

#### Scenario: A chave de tradução é quem decide
- **GIVEN** o mineflayer emite `message` com a mensagem estruturada antes de
  emitir `chat`
- **WHEN** a mensagem estruturada tem `translate: 'chat.type.admin'`
- **THEN** o `chat` correspondente não é emitido
- **AND** este é o sinal principal, por ser o que o protocolo realmente diz
- **AND** a chave chega como **terceiro argumento** do evento `chat`: o padrão
  que gera o evento é do tipo antigo e repassa o `translate` da mensagem
  original, então não é preciso parear dois eventos

#### Scenario: Colchete desemparelhado é a rede de segurança
- **GIVEN** um servidor não entrega a chave de tradução
- **WHEN** chega um texto terminado em `]` sem `[` correspondente
- **THEN** ele é tratado como eco de sistema e descartado
- **AND** a razão é que esse `]` sobrando é a marca de um `[Fulano: corpo]` mal
  partido

#### Scenario: Fala de verdade da criança nunca é confundida com eco
- **GIVEN** a criança digita `vem auqi`, `me conta um segredo do minecraft` ou
  `voce gosta de diamante?`
- **WHEN** a mensagem chega
- **THEN** ela é emitida como `chat` normalmente
- **AND** a razão é que as duas regras exigem `]` no fim, o que conversa não tem

#### Scenario: Colchete emparelhado continua sendo texto
- **GIVEN** alguém escreve `olha o [bau]`
- **WHEN** a mensagem chega
- **THEN** ela não é eco: o `[` fecha com o `]`

#### Scenario: O que foi filtrado dá para depurar
- **GIVEN** o log da aplicação está em nível `debug`
- **WHEN** uma mensagem é descartada como eco de sistema
- **THEN** o texto descartado aparece no log
- **AND** filtro exagerado pode ser diagnosticado sem adivinhação
