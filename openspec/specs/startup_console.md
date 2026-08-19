# Especificação: Console de startup

**Componente:** `startup_console`
**Origem:** `add-startup-banner` (2026-08-19)

> **Escopo:** tudo que o bot escreve no **terminal de quem o executa**, em
> oposição ao chat do jogo (`local_dialogue`) e ao log estruturado do `pino`.
> O público aqui é o adulto que sobe o processo, não a criança dona do bot.

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
