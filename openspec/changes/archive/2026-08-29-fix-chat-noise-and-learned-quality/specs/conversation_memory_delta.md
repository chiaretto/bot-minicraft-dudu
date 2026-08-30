# Delta: Memória de conversa

**Change ID:** `fix-chat-noise-and-learned-quality`
**Affects:** `memory/jsonl.ts` (consumo), `tools/gaps.ts`, `app/bot.ts`

---

## ADDED

### Requirement: O histórico guarda fala de gente

Só entra no histórico de conversa mensagem que veio de um jogador. Retorno de
comando do jogo é descartado antes de chegar ao registro — o filtro mora na
borda (ver `minecraft_connection_delta.md`), e a memória se beneficia dele sem
saber que existe.

#### Scenario: Eco de sistema não entra no JSONL
- **GIVEN** o dono usa `/tp`, `/gamemode`, `/clear` ou `/time`
- **WHEN** o servidor devolve o retorno do comando
- **THEN** nenhuma linha é acrescentada em `data/conversations/AAAA-MM-DD.jsonl`
- **AND** o arquivo do dia continua sendo só conversa

#### Scenario: O ruído já gravado continua no arquivo
- **GIVEN** o histórico de 15 a 29 de agosto tem ~20 linhas de retorno de comando
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

#### Scenario: Lacuna de verdade continua aparecendo
- **GIVEN** o histórico tem `vem auqi` e `me conta um segredo do minecraft`
- **WHEN** o relatório roda
- **THEN** as duas continuam listadas como lacuna
- **AND** o filtro não pode esconder fala de criança

---

## MODIFIED

### Requirement: Registro de toda troca de conversa

O que o requisito chama de "toda troca" passa a significar **toda troca com
gente**. Mensagem que o servidor gerou como retorno de comando não é troca de
conversa e não é registrada.

Segue valendo, sem mudança: fala do dono, fala de outro jogador, resposta do bot
e a origem de cada resposta (`command`, `learned`, `repertoire`, `llm`) entram
no arquivo do dia.

#### Scenario: Fala do dono continua registrada como sempre
- **GIVEN** o dono digita `dudu, me segue`
- **WHEN** a mensagem desce a cascata
- **THEN** a fala e a resposta entram no arquivo do dia, como antes

#### Scenario: A frase de correção é fala e fica registrada
- **GIVEN** o bot acabou de replicar um comando aprendido
- **WHEN** a criança digita `nao era isso`
- **THEN** a fala dela e a resposta do bot entram no histórico
- **AND** o filtro de ruído não pode engolir a correção — ela é a evidência de
  que o bot aprendeu errado

---

## REMOVED

(None)
