# Delta: Aplicativo de desktop

**Change ID:** `add-launcher-inventory`
**Affects:** `app/status-channel.ts`, `app/bot.ts`, `app/main.ts`,
`launcher/src/`, `launcher/ui/`

---

## ADDED

### Requirement: A mochila do bot na janela

O aplicativo mostra o que o bot está carregando: cada item com a quantidade, em
português.

Existe porque a mochila é o que mais aparece na conversa — a criança pergunta
quanto ele tem, a obra é recusada por falta de material, e espiar a mochila do
amigo é diversão por si só. Tudo isso acontecia sem nenhum lugar onde olhar,
com a janela aberta do lado o tempo todo.

#### Scenario: Ela vê o que ele carrega
- **GIVEN** o bot está no mundo com 12 de madeira e 3 de pedra
- **WHEN** a janela desenha
- **THEN** o painel mostra os dois itens com as quantidades
- **AND** os nomes estão em português

#### Scenario: Pegar bloco atualiza o painel
- **GIVEN** o painel mostra 12 de madeira
- **WHEN** o bot coleta mais 8
- **THEN** o painel passa a mostrar 20 em poucos segundos
- **AND** ninguém precisou pedir nada no chat

#### Scenario: Mochila vazia é dita
- **GIVEN** o bot não carrega nada
- **WHEN** a janela desenha
- **THEN** o painel diz que a mochila está vazia
- **AND** a razão é a mesma do prompt da IA: sumir com a informação deixa quem
  lê sem saber se está vazia ou se quebrou

#### Scenario: Sem bot, sem mochila
- **GIVEN** o painel mostra a mochila
- **WHEN** o bot é parado, cai, ou o processo sai
- **THEN** o painel é limpo
- **AND** a razão é que mochila de fantasma é pior que painel vazio: a criança
  pediria um bloco que ninguém está carregando

#### Scenario: Mochila comprida não estoura a janela
- **GIVEN** o bot carrega mais itens do que cabem no painel
- **WHEN** a lista é montada
- **THEN** ela vem ordenada por quantidade, com os maiores primeiro
- **AND** o que não coube vira uma linha de "e mais N coisas"

#### Scenario: A janela mostra, não age
- **GIVEN** o painel está na tela
- **WHEN** alguém clica nele
- **THEN** nada acontece no mundo do jogo
- **AND** o que o bot faz continua vindo do chat

---

### Requirement: Canal da mochila no protocolo

O protocolo ganha um **terceiro** prefixo, `@dudu-mochila`, ao lado de
`@dudu-status` e `@dudu-fala`. A linha carrega os itens já com o nome em
português **e** o id técnico.

Os dois nomes juntos são a decisão que evita duplicar vocabulário: a janela
mostra o nome para a criança e tem o id à mão para o bloco do adulto. Mandar só
o id obrigaria o launcher a traduzir, e os dois lados só repetem **constante de
protocolo**, nunca catálogo.

#### Scenario: A linha carrega item, nome e quantidade
- **GIVEN** o bot carrega 12 de `oak_log`
- **WHEN** a mochila é anunciada
- **THEN** a linha traz o id `oak_log`, o nome `madeira` e a quantidade

#### Scenario: Mochila que não mudou não vira linha
- **GIVEN** a mochila foi anunciada e nada mudou desde então
- **WHEN** o emissor roda de novo
- **THEN** nenhuma linha é escrita
- **AND** a razão é a mesma do canal de status: repetir o mesmo não é transição
- **AND** sem isso, uma casa de 52 blocos encheria o canal de dezenas de linhas

#### Scenario: Sem supervisor, nada muda
- **GIVEN** o bot roda pelo terminal, sem `DUDU_LAUNCHER=1`
- **WHEN** a mochila muda
- **THEN** nenhuma linha de mochila é escrita
- **AND** a saída é byte a byte a de sempre

#### Scenario: Launcher que não conhece o prefixo não quebra
- **GIVEN** uma versão do aplicativo anterior a esta mudança
- **WHEN** a linha de mochila chega
- **THEN** ela cai como log, que é o que `parseLine` já faz com o desconhecido

#### Scenario: JSON quebrado cai como log
- **GIVEN** uma linha com o prefixo e JSON inválido
- **THEN** ela vira log, e o adulto a vê no bloco de detalhes

---

## MODIFIED

### Requirement: Protocolo com o supervisor

De dois prefixos para **três**. A regra que os separa continua a mesma: cada um
tem um ritmo e um significado próprios, e um canal só faria o supervisor ter que
adivinhar qual é qual.

| Prefixo | O que carrega | Ritmo | Repete? |
|---|---|---|---|
| `@dudu-status` | ciclo de vida | meia dúzia de vezes por sessão | não |
| `@dudu-fala` | o que ele disse no chat | o tempo todo | **sim** |
| `@dudu-mochila` | o que ele carrega | periódico, só quando muda | não |

#### Scenario: Cada canal tem a própria regra de repetição
- **GIVEN** os três canais
- **WHEN** o mesmo conteúdo aparece duas vezes seguidas
- **THEN** status e mochila engolem a repetição
- **AND** fala repete, porque ali repetição é conteúdo — o bot diz "quente!"
  várias vezes e a criança precisa ouvir cada uma

---

## REMOVED

(None)
