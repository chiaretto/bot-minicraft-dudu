# Delta: Aplicativo de desktop

**Change ID:** `add-launcher-voice`
**Affects:** `app/status-channel.ts`, `app/bot.ts`, `app/main.ts`,
`launcher/src/`, `launcher/ui/`

---

## ADDED

### Requirement: Ler as falas em voz alta

O bot anuncia cada fala numa linha própria do `stdout`, com prefixo reservado, e
o aplicativo lê em voz alta.

Existe porque a dona do bot tem 7 anos e lê devagar, e o chat do Minecraft rola
rápido: qualquer coisa que aconteça no jogo empurra a fala do bot para cima
antes de ela terminar de ler.

#### Scenario: O que ele fala, ela ouve
- **GIVEN** o bot foi ligado pelo aplicativo e a voz está ligada
- **WHEN** o bot fala qualquer coisa no chat
- **THEN** a janela lê a frase em voz alta
- **AND** a fala continua aparecendo no chat do jogo, como sempre

#### Scenario: Repetição é lida de novo
- **GIVEN** o bot repete a mesma frase (o "quente!" do quente e frio)
- **WHEN** a segunda vez sai
- **THEN** ela é lida de novo
- **AND** a razão é que aqui repetição é conteúdo, diferente do canal de status,
  que engole repetição por ser transição

#### Scenario: Fala nova cancela a anterior
- **GIVEN** a voz está no meio de uma frase
- **WHEN** o bot fala outra coisa
- **THEN** a frase nova ganha
- **AND** a razão é que fila comprida faria a voz ficar meio minuto atrás do
  jogo, e o que importa é o que ele acabou de dizer

#### Scenario: Emoticon não é lido letra por letra
- **GIVEN** a fala termina em `:D`
- **WHEN** ela é preparada
- **THEN** o emoticon é removido
- **AND** a razão é que quase todo sintetizador lê "dois pontos, dê"

#### Scenario: Fala longa é cortada na palavra inteira
- **GIVEN** uma fala maior que o limite
- **WHEN** ela é preparada
- **THEN** o corte cai num espaço, nunca no meio de uma sílaba

#### Scenario: Dá para desligar, e ele lembra
- **GIVEN** o adulto desmarca "Ler o que ele fala em voz alta"
- **WHEN** o bot fala
- **THEN** nada é lido
- **AND** na próxima vez que o aplicativo abre, a caixa continua desmarcada

#### Scenario: A voz vem ligada
- **GIVEN** o aplicativo é aberto pela primeira vez
- **THEN** a voz está ligada
- **AND** a razão é que ela existe para a criança, e o padrão é o que serve a ela

#### Scenario: Sem aplicativo, nada muda
- **GIVEN** o bot roda pelo terminal, sem `DUDU_LAUNCHER=1`
- **WHEN** ele fala
- **THEN** nenhuma linha de fala é escrita no `stdout`
- **AND** a saída é byte a byte a de sempre

---

## MODIFIED

### Requirement: Protocolo com o supervisor

O protocolo ganha um **segundo** prefixo, `@dudu-fala`, ao lado do
`@dudu-status`.

Separados de propósito: status é ciclo de vida e muda meia dúzia de vezes por
sessão; fala acontece o tempo todo. Um canal só faria o supervisor ter que
adivinhar qual é qual — e o protocolo existe para ele não adivinhar nada.

Como o outro, a constante é **repetida nos dois lados**: são processos
separados, e um `import` entre eles amarraria o launcher ao build do bot.

#### Scenario: Launcher que não conhece o prefixo não quebra
- **GIVEN** uma versão do aplicativo anterior a esta mudança
- **WHEN** a linha de fala chega
- **THEN** ela cai como log, que é o que `parseLine` já fazia com o desconhecido
- **AND** nada explode

#### Scenario: Fala com JSON quebrado cai como log
- **GIVEN** uma linha com o prefixo e JSON inválido
- **THEN** ela vira log, e o adulto a vê no bloco de detalhes
