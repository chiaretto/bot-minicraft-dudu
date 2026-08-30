# Delta: Conexão com o Minecraft

**Change ID:** `fix-chat-noise-and-learned-quality`
**Affects:** `minecraft/chat.ts`, `minecraft/client.ts`

---

## ADDED

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

#### Scenario: O que foi filtrado dá para depurar
- **GIVEN** o log da aplicação está em nível `debug`
- **WHEN** uma mensagem é descartada como eco de sistema
- **THEN** o texto descartado aparece no log
- **AND** filtro exagerado pode ser diagnosticado sem adivinhação

---

## MODIFIED

### Requirement: Chat com throttle

*(Sem mudança de comportamento. Registrado aqui porque `minecraft/chat.ts` passa
a abrigar também o predicado de eco de sistema: o módulo deixa de ser só a saída
de fala e passa a ser o que o projeto sabe sobre o chat do jogo, nas duas
direções. Continua puro e testável.)*

---

## REMOVED

(None)
