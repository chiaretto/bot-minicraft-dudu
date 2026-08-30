# Especificação: Memória de Conversa

**Componente:** `conversation_memory`
**Origem:** `add-minecraft-companion-bot` (2026-08-15)

> Convenção de nomes: `Dudu` é o **bot**, `Miguel` é o **jogador dono**.

---

## Requisitos

### Requirement: Registro de toda troca de conversa

Toda mensagem trocada com o bot é gravada, venha a resposta de qualquer nível da
cascata.

"Toda troca" quer dizer **toda troca com gente**: mensagem que o servidor gerou
como retorno de comando do jogo não é conversa e não é registrada. Ela nem chega
até aqui — o corte é na borda (`minecraft_connection` → "Retorno de comando do
jogo não é fala de jogador").

#### Scenario: Troca resolvida pelo repertório
- **GIVEN** o dono digita `dudu, oi` e o repertório responde
- **WHEN** a resposta é enviada ao chat
- **THEN** uma linha é gravada com a fala do dono e outra com a do bot
- **AND** a linha do bot registra `source: "repertoire"` e o `entryId` usado

#### Scenario: Troca resolvida pela IA
- **GIVEN** a mensagem do dono foi respondida pelo provider de IA
- **WHEN** a resposta é enviada
- **THEN** a linha do bot registra `source: "llm"`
- **AND** registra `provider` com o nome da implementação que respondeu
  (`"ollama"` ou `"gemini"`)

#### Scenario: Comando também é registrado
- **GIVEN** o dono digita `dudu, me segue` e o bot entra em `FOLLOW`
- **WHEN** a confirmação é enviada
- **THEN** a troca é gravada com `source: "command"` e o comando reconhecido

#### Scenario: Fala espontânea é registrada
- **GIVEN** anoiteceu e o bot falou sozinho
- **WHEN** a fala é enviada
- **THEN** a linha é gravada com `source: "spontaneous"`, sem mensagem do jogador

#### Scenario: Mensagem de outro jogador
- **GIVEN** o jogador `Fulano` fala com o bot
- **WHEN** a troca acontece
- **THEN** ela é gravada com o `speaker` sendo `Fulano`
- **AND** fica distinguível das falas do dono

#### Scenario: A frase de correção é fala e fica registrada
- **GIVEN** o bot acabou de replicar um comando aprendido
- **WHEN** a criança digita `nao era isso`
- **THEN** a fala dela e a resposta do bot entram no histórico
- **AND** o filtro de ruído não pode engolir a correção — ela é a evidência de
  que o bot aprendeu errado

---

### Requirement: Um arquivo por dia

O histórico é particionado por data local, em JSONL append-only.

#### Scenario: Primeiro registro do dia
- **GIVEN** hoje é `2026-08-15` e ainda não há arquivo do dia
- **WHEN** a primeira troca acontece
- **THEN** `data/conversations/2026-08-15.jsonl` é criado
- **AND** a troca é gravada como a primeira linha

#### Scenario: Trocas seguintes no mesmo dia
- **GIVEN** `data/conversations/2026-08-15.jsonl` já existe com 40 linhas
- **WHEN** uma nova troca acontece no mesmo dia
- **THEN** a linha é acrescentada ao fim do mesmo arquivo
- **AND** nada do conteúdo anterior é reescrito

#### Scenario: Virada de meia-noite com o bot rodando
- **GIVEN** o bot está rodando e gravando em `2026-08-15.jsonl`
- **WHEN** o relógio local passa da meia-noite
- **THEN** a próxima troca vai para `2026-08-16.jsonl`
- **AND** o arquivo anterior é fechado sem perder nada

#### Scenario: Sessões separadas no mesmo dia
- **GIVEN** o bot rodou de manhã e foi encerrado
- **WHEN** ele sobe de novo à tarde do mesmo dia
- **THEN** ele continua gravando no **mesmo** arquivo do dia, em modo append

---

### Requirement: Formato do registro

> Desde `add-learned-commands`, `source` aceita `learned`. Sem esse valor um
> comando replicado do histórico seria indistinguível de um resolvido pela IA, e
> a rotina diária não conseguiria medir o que foi economizado.

Cada linha é um objeto JSON autocontido.

#### Scenario: Campos obrigatórios de uma linha
- **GIVEN** qualquer troca gravada
- **WHEN** a linha é lida
- **THEN** ela contém `ts` (ISO 8601 com fuso), `speaker`, `text`, `source`,
  `botState` e `sessionId`

#### Scenario: Campos opcionais de contexto
- **GIVEN** a troca aconteceu durante um combate
- **WHEN** a linha é gravada
- **THEN** ela pode conter `entryId` (se veio do repertório), `latencyMs`,
  `botHealth` e `dimension`

#### Scenario: Valores possíveis de `source`
- **GIVEN** uma fala do bot gravada
- **WHEN** o campo `source` é lido
- **THEN** ele é um de `command`, `repertoire`, `learned`, `llm` ou `spontaneous`
- **AND** `learned` significa comando replicado do histórico, sem chamada de rede

#### Scenario: Comando aprendido guarda quem ensinou
- **GIVEN** uma fala com `source: 'learned'`
- **WHEN** a linha é gravada
- **THEN** ela pode conter `provider` — o provider que ensinou aquele comando
- **AND** dá para saber depois se o aprendizado veio do Gemini ou do modelo local

#### Scenario: Uma linha por objeto, sem quebra
- **GIVEN** a resposta do bot contém quebra de linha
- **WHEN** a linha é gravada
- **THEN** as quebras são escapadas dentro do JSON
- **AND** o arquivo mantém exatamente um objeto JSON por linha

#### Scenario: Linha corrompida não invalida o arquivo
- **GIVEN** uma linha do arquivo ficou truncada por um crash
- **WHEN** o arquivo é lido na inicialização
- **THEN** a linha inválida é pulada com aviso no log
- **AND** todas as outras linhas são carregadas normalmente

---

### Requirement: Memória curta em RAM

O contexto enviado ao provider de IA vem de uma janela deslizante, não do arquivo inteiro.

#### Scenario: Janela limitada
- **GIVEN** a janela é de 10 trocas e já está cheia
- **WHEN** uma nova troca acontece
- **THEN** a mais antiga sai da janela
- **AND** o arquivo do dia **continua** com todas as trocas

#### Scenario: Janela alimenta o prompt da IA
- **GIVEN** há 6 trocas na janela
- **WHEN** o provider de IA é chamado
- **THEN** as 6 trocas entram no prompt como histórico da conversa

---

### Requirement: Retomada do contexto do dia

Ao subir, o bot relê o arquivo de hoje para não perder o fio da conversa.

#### Scenario: Reinício no mesmo dia
- **GIVEN** o bot conversou de manhã e foi reiniciado à tarde do mesmo dia
- **WHEN** ele inicializa
- **THEN** ele lê `data/conversations/<hoje>.jsonl`
- **AND** carrega as últimas N trocas na memória curta
- **AND** o dono pode perguntar `o que eu te falei antes?` e ser entendido

#### Scenario: Primeiro início do dia
- **GIVEN** não existe arquivo para hoje
- **WHEN** o bot inicializa
- **THEN** a memória curta começa vazia
- **AND** nenhum arquivo de dias anteriores é carregado

#### Scenario: Dias anteriores não entram no contexto
- **GIVEN** existem arquivos de vários dias anteriores
- **WHEN** o bot inicializa
- **THEN** só o arquivo de hoje é lido
- **AND** os anteriores permanecem em disco, intactos e legíveis

---

### Requirement: Durabilidade da escrita

O histórico não pode ser perdido por queda do processo.

#### Scenario: Escrita a cada troca
- **GIVEN** uma troca acabou de acontecer
- **WHEN** a linha é gravada
- **THEN** ela é escrita e liberada para o SO imediatamente
- **AND** não fica represada num buffer esperando N mensagens

#### Scenario: Encerramento gracioso
- **GIVEN** o bot recebe `SIGINT`
- **WHEN** ele encerra
- **THEN** o arquivo do dia é sincronizado e fechado antes da saída

#### Scenario: Falha de escrita não derruba o bot
- **GIVEN** o disco está cheio ou o diretório ficou sem permissão
- **WHEN** a gravação falha
- **THEN** o erro é registrado no log
- **AND** o bot continua conversando e obedecendo normalmente

---

### Requirement: Privacidade e retenção do histórico

> O histórico de comandos aprendidos é dado derivado das frases da criança e
> segue as mesmas regras: fica em `data/`, que está inteiro no `.gitignore`, e
> nunca é enviado para fora. O aprendizado **reduz** o que sai da máquina — cada
> acerto do histórico é uma frase que deixa de ir para o provider de nuvem.

O histórico é um arquivo local com conversas de uma criança — tratado como tal.

#### Scenario: O histórico nunca sai da máquina
- **GIVEN** o bot está gravando conversas
- **WHEN** qualquer chamada ao provider de IA é feita
- **THEN** só a janela curta em RAM é enviada
- **AND** nenhum arquivo de histórico é lido ou transmitido para fora

#### Scenario: Com provider local, nada sai da máquina
- **GIVEN** `llm.provider` é `"ollama"` com `baseUrl` em localhost
- **AND** `llm.fallbackProvider` é `null`
- **WHEN** o dono conversa com o bot durante toda uma sessão
- **THEN** nenhuma mensagem da criança trafega para fora do computador
- **AND** nem o histórico nem a janela curta saem da máquina

#### Scenario: Diretório de dados fora do controle de versão
- **GIVEN** o repositório tem `.gitignore`
- **WHEN** o projeto é inicializado
- **THEN** `data/conversations/` está ignorado
- **AND** nenhuma conversa vai parar num commit

#### Scenario: Retenção configurada
- **GIVEN** `memory.retentionDays` é 90
- **WHEN** o bot inicializa
- **THEN** arquivos de conversa com mais de 90 dias são apagados
- **AND** cada exclusão é registrada no log

#### Scenario: Arquivo de aprendidos fora do controle de versão
- **GIVEN** `data/learned-commands.json` existe
- **WHEN** `git status` é consultado
- **THEN** o arquivo não aparece como candidato a commit
- **AND** a razão é a mesma das conversas: é fala de criança

#### Scenario: Histórico aprendido não vai para o provider
- **GIVEN** uma mensagem desce até o nível 3
- **WHEN** o contexto é montado para o provider
- **THEN** ele leva a janela curta de conversa, como já levava
- **AND** **não** leva o conteúdo do histórico de comandos aprendidos

#### Scenario: Menos frases saindo da máquina
- **GIVEN** um pedido já aprendido é repetido
- **WHEN** o bot atende pelo histórico
- **THEN** nenhuma frase da criança é enviada ao provider naquela troca

#### Scenario: Apagar o aprendizado é apagar um arquivo
- **GIVEN** um adulto quer remover tudo o que o bot aprendeu
- **WHEN** `data/learned-commands.json` é apagado com o bot parado
- **THEN** o bot volta ao estado de quem nunca aprendeu nada
- **AND** o histórico de conversa em `data/conversations/` não é afetado

#### Scenario: Retenção infinita
- **GIVEN** `memory.retentionDays` é `null`
- **WHEN** o bot inicializa
- **THEN** nenhum arquivo antigo é apagado

---

### Requirement: Configuração da memória

O bloco `memory` da configuração parametriza o comportamento.

#### Scenario: Valores padrão
- **GIVEN** `config.yaml` não traz o bloco `memory`
- **WHEN** o bot inicializa
- **THEN** vale o padrão: `dir: "data/conversations"`, `shortTermWindow: 10`,
  `retentionDays: null`, `resumeToday: true`

#### Scenario: Retomada desligada
- **GIVEN** `memory.resumeToday` é `false`
- **WHEN** o bot reinicia no mesmo dia
- **THEN** a memória curta começa vazia
- **AND** a gravação no arquivo do dia continua normalmente

---

### Requirement: O histórico guarda fala de gente

Só entra no histórico de conversa mensagem que veio de um jogador. Retorno de
comando do jogo é descartado antes de chegar ao registro.

#### Scenario: Eco de sistema não entra no JSONL
- **GIVEN** o dono usa `/tp`, `/gamemode`, `/clear` ou `/time`
- **WHEN** o servidor devolve o retorno do comando
- **THEN** nenhuma linha é acrescentada em `data/conversations/AAAA-MM-DD.jsonl`
- **AND** o arquivo do dia continua sendo só conversa

#### Scenario: O ruído já gravado continua no arquivo
- **GIVEN** o histórico de 15 a 29 de agosto de 2026 tem ~30 linhas de retorno de
  comando
- **WHEN** a mudança entra em vigor
- **THEN** nenhuma linha antiga é apagada nem reescrita
- **AND** a razão é que o histórico é append-only por decisão de projeto
- **AND** quem filtra o passado é a leitura, não o arquivo

---

### Requirement: A rotina de manutenção lê só conversa

O relatório de lacunas ignora eco de sistema ao ler o histórico já gravado, para
não apontar como lacuna de repertório uma frase que o Minecraft escreveu.

#### Scenario: Eco antigo some do relatório
- **GIVEN** o histórico tem `Teleported Odraude to FresherRobin90]` sete vezes
- **WHEN** `npm run repertoire:gaps` roda
- **THEN** essas linhas não aparecem em `NÃO ENTENDI` nem em `RESOLVIDO SÓ PELA IA`
- **AND** ninguém é induzido a escrever entrada de repertório para atender o jogo

#### Scenario: A contagem do relatório não conta ruído
- **GIVEN** o dia tem 40 falas de jogador e 8 ecos de sistema
- **WHEN** o relatório calcula quanto foi resolvido localmente
- **THEN** o denominador é 40
- **AND** a porcentagem passa a descrever o repertório, não o filtro
- **AND** medido no log de 15 a 29/08/2026: 264 falas viraram 233, e 49% de
  resolução local viraram 56%

#### Scenario: Lacuna de verdade continua aparecendo
- **GIVEN** o histórico tem `vem auqi` e `me conta um segredo do minecraft`
- **WHEN** o relatório roda
- **THEN** as duas continuam listadas como lacuna
- **AND** o filtro não pode esconder fala de criança
