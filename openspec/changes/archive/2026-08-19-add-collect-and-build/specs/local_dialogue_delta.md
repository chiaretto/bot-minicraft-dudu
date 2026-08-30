# Delta: Repertório local

**Change ID:** `add-collect-and-build`
**Affects:** `data/repertoire.yaml`, `src/dialogue/default-repertoire.yaml`,
`src/ai/prompt.ts`

> Requisito de outro componente (`local_dialogue`). Ao arquivar, aplicar em
> `openspec/specs/local_dialogue.md`.

---

## ADDED

### Requirement: Nenhuma fala nega capacidade que o bot tem

O repertório responde **antes** da IA. Uma entrada que diz "isso eu não sei
fazer" para algo que o bot faz é pior que um bug: é o bot mentindo para a
criança, e nenhum código de ação alcança ela.

Foi exatamente o que aconteceu com a coleta: `collectBlock` existia desde o
começo, e `pedido_coleta` respondia "Buscar coisa eu ainda não aprendi".

#### Scenario: Capacidade nova varre o repertório
- **GIVEN** o bot aprendeu a construir e a pegar bloco
- **WHEN** o repertório é revisado
- **THEN** nenhuma entrada nega essas capacidades
- **AND** as entradas de recusa cobrem só o que ele de fato não faz

#### Scenario: Pedir casa não cai em recusa
- **GIVEN** o catálogo atual
- **WHEN** `faz uma casa` ou `constroi uma casa` é resolvido pelo repertório
- **THEN** a resposta **não** diz que ele não sabe fazer

#### Scenario: Pedir madeira não cai em recusa
- **GIVEN** o catálogo atual
- **WHEN** `pega madeira` ou `pega pedra` é resolvido pelo repertório
- **THEN** a resposta **não** diz que ele não sabe fazer

#### Scenario: O que ele não faz continua recusado
- **GIVEN** o bot não sabe craftar nem fazer poção
- **WHEN** `crafta`, `faz uma pocao` ou `constroi um castelo` chega
- **THEN** a resposta vem de `recusa_escopo`
- **AND** ela oferece o que funciona: casinha, torre, pegar bloco

#### Scenario: Minério continua sendo recusa honesta
- **GIVEN** minério não está na allowlist de coleta
- **WHEN** `pega diamante` chega
- **THEN** a resposta vem de `pedido_coleta`
- **AND** ela ensina um pedido que funciona

#### Scenario: A lista de capacidades acompanha
- **GIVEN** perguntam o que o bot sabe fazer
- **WHEN** `capacidades` responde
- **THEN** pegar bloco e construir aparecem entre as respostas

---

### Requirement: O prompt da IA acompanha a capacidade

O que o bot diz que sabe fazer é igual no repertório e no prompt. As duas fontes
não podem contar histórias diferentes.

#### Scenario: Identidade não nega mais construir
- **GIVEN** o bot aprendeu a construir
- **WHEN** o prompt de conversa é montado
- **THEN** construir aparece entre o que ele sabe
- **AND** **não** aparece entre o que ele não sabe

#### Scenario: Exemplo do prompt sem promessa desatualizada
- **GIVEN** os exemplos de "pedido impossível" no prompt
- **WHEN** o prompt é montado
- **THEN** nenhum deles usa construir casa como exemplo do que ele não faz

---

## MODIFIED

(Nenhum requisito existente muda de forma. As entradas `recusa_escopo`,
`pedido_coleta` e `capacidades` mudam de conteúdo, não de papel.)

---

## REMOVED

(Nenhum)
