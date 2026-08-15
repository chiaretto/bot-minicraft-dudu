# Delta: Conexão Minecraft e Estado do Mundo

**Change ID:** `add-minecraft-companion-bot`
**Affects:** `src/minecraft/`

---

## ADDED

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

## MODIFIED

(Nenhum — projeto novo.)

## REMOVED

(Nenhum)
