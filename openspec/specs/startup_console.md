# Especificação: Console de startup

**Componente:** `startup_console`
**Origem:** `add-startup-banner` (2026-08-19)
**Ampliado por:** `add-desktop-launcher` (2026-08-29) — protocolo com o supervisor

> **Escopo:** tudo que o bot escreve no **terminal de quem o executa**, em
> oposição ao chat do jogo (`local_dialogue`) e ao log estruturado do `pino`.
> O público aqui é o adulto que sobe o processo, não a criança dona do bot.
>
> Desde `add-desktop-launcher`, "quem o executa" também pode ser um **programa**
> — o aplicativo de desktop (`desktop_launcher`). Para esse caso o componente
> cobre as duas mãos: o que o bot escreve em `stdout` e a única ordem que ele
> aceita pelo `stdin`.

---

## Requisitos

### Requirement: Cartão de startup em desenvolvimento

Ao subir em modo de desenvolvimento, o bot imprime no terminal um cartão
emoldurado avisando que está de pé e ensinando o passo seguinte: abrir o
Minecraft e abrir o mundo para LAN na porta que a configuração espera.

O cartão sai por `stdout` antes de qualquer tentativa de conexão, para que a
pessoa leia a instrução antes de ver as tentativas de reconexão falharem.

#### Scenario: Startup com `npm run dev`
- **GIVEN** `NODE_ENV` não é `production`
- **AND** o `config.yaml` é válido, com `server.host: "localhost"`,
  `server.port: 55654`, `server.version: "1.21.11"`, `persona.name: "Odraude"` e
  `ownerPlayer: "FresherRobin90"`
- **WHEN** o processo inicia
- **THEN** o terminal mostra um cartão emoldurado anunciando que `Odraude` está de pé
- **AND** o cartão mostra o passo a passo para abrir o mundo em LAN
- **AND** o cartão mostra `localhost:55654` como o endereço aguardado
- **AND** o cartão mostra `1.21.11` como a versão em que o mundo deve ser aberto
- **AND** o cartão aparece antes da primeira tentativa de conexão

#### Scenario: Aviso sobre a porta do LAN
- **GIVEN** o cartão de startup está sendo montado
- **WHEN** ele é impresso
- **THEN** ele avisa que a porta do LAN muda a cada vez que o mundo é aberto
- **AND** indica corrigir `server.port` no `config.yaml` se o jogo mostrar outra porta

#### Scenario: Reinício do watch
- **GIVEN** `npm run dev` está rodando e um arquivo de `src/` é salvo
- **WHEN** o `tsx watch` reinicia o processo
- **THEN** o cartão é impresso de novo, com os valores da configuração atual

---

### Requirement: Silêncio em modo produtivo

Em produção o `stdout` é log de máquina. O cartão não é impresso ali.

#### Scenario: Startup com `npm start` em produção
- **GIVEN** `NODE_ENV` é `production`
- **WHEN** o processo inicia
- **THEN** nenhum cartão é impresso
- **AND** a primeira saída no terminal é a linha de log `iniciando` do `pino`

---

### Requirement: Degradação sem cor

O cartão é legível em qualquer terminal e em arquivo. Enfeite que não puder ser
renderizado simplesmente não é usado — o conteúdo nunca depende dele.

#### Scenario: Saída redirecionada para arquivo
- **GIVEN** `stdout` não é um TTY (`npm run dev > saida.txt`)
- **WHEN** o cartão é impresso
- **THEN** o texto sai sem nenhum código de escape ANSI
- **AND** as instruções e o endereço continuam presentes e legíveis

#### Scenario: `NO_COLOR` definido
- **GIVEN** a variável de ambiente `NO_COLOR` está definida
- **WHEN** o cartão é impresso
- **THEN** o texto sai sem nenhum código de escape ANSI

#### Scenario: Alinhamento da moldura
- **GIVEN** o cartão foi renderizado
- **WHEN** as linhas que têm borda à esquerda e à direita são medidas
- **THEN** todas têm o mesmo comprimento visível

---

### Requirement: Cartão sem segredo

O cartão mostra só o que serve para abrir o mundo. Nenhum segredo passa por ele.

#### Scenario: Segredos configurados no ambiente
- **GIVEN** `GEMINI_API_KEY` e `MINECRAFT_PASSWORD` estão definidos no `.env`
- **WHEN** o cartão é impresso
- **THEN** nenhum dos dois valores aparece no texto
- **AND** o cartão mostra apenas nome do bot, nome do dono, host, porta e versão

---

### Requirement: Configuração inválida continua mandando

O cartão pressupõe uma configuração carregada. Se a configuração não carrega, o
erro é o que precisa aparecer — e sozinho.

#### Scenario: `ownerPlayer` ausente
- **GIVEN** o `config.yaml` não define `ownerPlayer`
- **WHEN** o processo inicia em modo de desenvolvimento
- **THEN** nenhum cartão é impresso
- **AND** o bot exibe a mensagem de configuração inválida e encerra com código
  diferente de zero

---

### Requirement: Canal de status para o processo supervisor

Quando o bot é executado por um supervisor (`DUDU_LAUNCHER=1`), ele anuncia cada
transição do próprio ciclo de vida em `stdout`, como uma linha JSON com prefixo
reservado — para que o supervisor não precise adivinhar o estado interpretando
mensagem de log, que é texto para gente e muda sem aviso.

O bot anuncia quatro estados: `ligando`, `procurando`, `no_mundo` e `desistiu`.
"Parado" e "caiu" **não** estão entre eles, e a ausência é a regra: um processo
não anuncia a própria morte. Quem observa isso é o supervisor, pela saída do
processo.

O canal é **desligado por padrão**: sem a variável de ambiente, a saída do bot é
byte a byte igual à de antes de `add-desktop-launcher`.

#### Scenario: Anunciar o ciclo de vida
- **GIVEN** o bot foi iniciado com `DUDU_LAUNCHER=1`
- **WHEN** ele começa a subir, tenta conectar, entra no mundo ou desiste de
  reconectar
- **THEN** cada transição sai como uma linha em `stdout` com o prefixo reservado
- **AND** a linha traz o estado em campo estruturado, não em frase

#### Scenario: Repetir o mesmo estado não é transição
- **GIVEN** o canal de status está ligado
- **AND** o bot está no backoff, com várias quedas seguidas sem conectar
- **WHEN** o mesmo estado seria anunciado de novo
- **THEN** nenhuma linha nova é escrita

#### Scenario: Silêncio sem a variável de ambiente
- **GIVEN** `DUDU_LAUNCHER` não está definida
- **WHEN** o bot sobe, conecta e é encerrado
- **THEN** nenhuma linha de status é escrita
- **AND** a saída do terminal é idêntica à de antes desta mudança

#### Scenario: Status não polui o cartão nem o log
- **GIVEN** o cartão de startup está sendo impresso
- **WHEN** o canal de status está ligado
- **THEN** as linhas de status são distinguíveis do cartão e do log do `pino`
  por um prefixo que nenhum dos dois usa

---

### Requirement: Parada graciosa pedida pelo supervisor

Com `DUDU_LAUNCHER=1`, o bot lê o `stdin` e trata a linha `parar` exatamente como
trata `SIGINT`: desconecta limpo, fecha o arquivo do dia e sai.

Isto existe porque **`SIGTERM` não é sinal de verdade no Windows**: enviado a um
processo filho, o Node o traduz para `TerminateProcess` e o handler de
encerramento não roda. Sem um canal explícito, parar o bot pela janela o deixaria
como fantasma no mundo até o servidor derrubá-lo por timeout.

#### Scenario: Parar pelo canal
- **GIVEN** o bot está rodando com `DUDU_LAUNCHER=1` e conectado ao mundo
- **WHEN** a linha `parar` chega pelo `stdin`
- **THEN** o bot segue o mesmo caminho de encerramento do `SIGINT`
- **AND** desconecta do servidor antes de sair
- **AND** o processo termina com código de saída zero

#### Scenario: Pedido repetido não encerra duas vezes
- **GIVEN** a parada já começou
- **WHEN** outra linha `parar` chega
- **THEN** nada além do encerramento em curso acontece

#### Scenario: Linha partida em pedaços continua valendo
- **GIVEN** o canal de parada está ligado
- **WHEN** a palavra `parar` chega em vários pedaços de `stdin`, fechando com
  quebra de linha
- **THEN** o encerramento acontece assim que a linha se completa

#### Scenario: `stdin` ignorado sem a variável de ambiente
- **GIVEN** `DUDU_LAUNCHER` não está definida
- **WHEN** qualquer coisa é escrita no `stdin` do processo
- **THEN** o bot não reage
- **AND** continua rodando normalmente

#### Scenario: Linha desconhecida é ignorada
- **GIVEN** o canal de parada está ligado
- **WHEN** chega uma linha que não é `parar`
- **THEN** o bot a ignora sem encerrar e sem quebrar
