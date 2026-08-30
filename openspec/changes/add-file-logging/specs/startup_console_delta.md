# Delta: Console de inicialização e log

**Change ID:** `add-file-logging`
**Affects:** `logging/file-stream.ts`, `logging/logger.ts`, `app/main.ts`

---

## ADDED

### Requirement: Log da aplicação em arquivo

O log da aplicação passa a sair em **dois** destinos: o `stdout` de sempre e um
arquivo por dia em `logDir` (padrão `data/logs/AAAA-MM-DD.log`).

Somar, não trocar: o aplicativo de desktop mostra o `stdout` em "Coisas de
adulto", e tirá-lo quebraria isso. O arquivo é o que sobra depois que a janela
fecha.

#### Scenario: A sessão deixa rastro
- **GIVEN** `logDir` é `data/logs`
- **WHEN** o bot roda e registra qualquer coisa
- **THEN** a linha aparece no terminal
- **AND** também no arquivo do dia

#### Scenario: A madrugada não vai para o arquivo errado
- **GIVEN** uma sessão começou às 23h50
- **WHEN** passa da meia-noite e o bot registra alguma coisa
- **THEN** a linha vai para o arquivo do **dia novo**
- **AND** a razão é que o dia é decidido a cada escrita, não na abertura

#### Scenario: Sessão nova continua o arquivo do dia
- **GIVEN** já existe log de hoje
- **WHEN** o bot é reiniciado
- **THEN** as linhas novas são acrescentadas
- **AND** nada do que já estava lá é perdido

#### Scenario: Falha de escrita não derruba o bot
- **GIVEN** a pasta não pode ser criada
- **WHEN** o bot registra alguma coisa
- **THEN** nenhum erro sobe
- **AND** o `stdout` continua funcionando
- **AND** a razão é que disco cheio não pode derrubar um bot no meio de uma
  brincadeira

#### Scenario: Segredo redigido também em disco
- **GIVEN** uma linha de log carrega `apiKey`
- **WHEN** ela é gravada
- **THEN** o arquivo tem `[REDACTED]`, nunca o segredo
- **AND** o que não pode aparecer no terminal também não pode ficar gravado

#### Scenario: Dá para desligar
- **GIVEN** `logDir: null`
- **WHEN** o bot roda
- **THEN** o log vai só para o terminal, como antes desta mudança

---

## MODIFIED

### Requirement: Privacidade do que aparece no terminal

*(Sem mudança de regra, mas o alcance dela cresceu: o mesmo cuidado passa a
valer para o arquivo. O log fica dentro de `data/`, que está inteiro no
`.gitignore` — log de bot tem fala de criança, como o histórico de conversa.)*

#### Scenario: O log não sai da máquina
- **GIVEN** o arquivo de log
- **WHEN** o repositório é commitado
- **THEN** ele não entra: `data/` inteiro está ignorado
