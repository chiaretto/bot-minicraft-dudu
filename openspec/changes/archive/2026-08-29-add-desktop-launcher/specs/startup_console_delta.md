# Delta: Console de startup (`startup_console`)

**Change ID:** `add-desktop-launcher`
**Affects:** `src/app/main.ts`, `src/app/status-channel.ts` (novo)

> O componente já é dono de "tudo que o bot escreve no terminal de quem o
> executa". Este delta acrescenta o caso em que **quem executa é um programa**, e
> abre a mão contrária: o bot passa a ouvir uma ordem pelo `stdin`.

---

## ADDED

### Requirement: Canal de status para o processo supervisor

Quando o bot é executado por um supervisor (`DUDU_LAUNCHER=1`), ele anuncia cada
transição do próprio ciclo de vida em `stdout`, como uma linha JSON com prefixo
reservado — para que o supervisor não precise adivinhar o estado interpretando
mensagem de log, que é texto para gente e muda sem aviso.

O canal é **desligado por padrão**: sem a variável de ambiente, a saída do bot é
byte a byte igual à de hoje.

#### Scenario: Anunciar o ciclo de vida
- **GIVEN** o bot foi iniciado com `DUDU_LAUNCHER=1`
- **WHEN** ele começa a subir, tenta conectar, entra no mundo, desiste de
  reconectar ou cai
- **THEN** cada transição sai como uma linha em `stdout` com o prefixo reservado
- **AND** a linha traz o estado em campo estruturado, não em frase

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

#### Scenario: `stdin` ignorado sem a variável de ambiente
- **GIVEN** `DUDU_LAUNCHER` não está definida
- **WHEN** qualquer coisa é escrita no `stdin` do processo
- **THEN** o bot não reage
- **AND** continua rodando normalmente

#### Scenario: Linha desconhecida é ignorada
- **GIVEN** o canal de parada está ligado
- **WHEN** chega uma linha que não é `parar`
- **THEN** o bot a ignora sem encerrar e sem quebrar

---

## MODIFIED

(Nenhum — os requisitos existentes do cartão de startup e do silêncio em
produção continuam valendo sem alteração.)

---

## REMOVED

(Nenhum)
