# Delta: Memória de Conversa

**Change ID:** `add-learned-commands`
**Affects:** `src/domain/types.ts`, `src/memory/store.ts`,
`src/memory/learned-store.ts`, `src/tools/gaps.ts`

---

## MODIFIED

### Requirement: Formato do registro

Cada linha é um objeto JSON autocontido. O campo `source` ganha o valor
`learned`: sem ele, um comando replicado do histórico seria indistinguível de um
resolvido pela IA, e a rotina diária não conseguiria medir o que foi economizado.

#### Scenario: Campos obrigatórios de uma linha
- **GIVEN** qualquer troca gravada
- **WHEN** a linha é lida
- **THEN** ela contém `ts` (ISO 8601 com fuso), `speaker`, `text`, `source`,
  `botState` e `sessionId`

#### Scenario: Valores possíveis de `source`
- **GIVEN** uma fala do bot gravada
- **WHEN** o campo `source` é lido
- **THEN** ele é um de `command`, `repertoire`, `learned`, `llm` ou `spontaneous`
- **AND** `learned` significa comando replicado do histórico, sem chamada de rede

#### Scenario: Campos opcionais de contexto
- **GIVEN** a troca aconteceu durante um combate
- **WHEN** a linha é gravada
- **THEN** ela pode conter `entryId` (se veio do repertório), `latencyMs`,
  `botHealth` e `dimension`

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

### Requirement: Privacidade e retenção do histórico

O histórico de comandos aprendidos é dado derivado das frases da criança e segue
as mesmas regras do histórico de conversa: fica em `data/`, que está inteiro no
`.gitignore`, e **nunca** é enviado para fora da máquina.

O aprendizado **reduz** o que sai da máquina: cada acerto do histórico é uma
frase da criança que deixa de ir para o provider de nuvem.

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

---

## REMOVED

(Nenhum)
