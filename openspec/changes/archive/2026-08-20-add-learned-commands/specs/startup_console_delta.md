# Delta: Console de Inicialização

**Change ID:** `add-learned-commands`
**Affects:** `src/app/startup-banner.ts`

---

## MODIFIED

### Requirement: Cartão de startup em desenvolvimento

O cartão ganha uma linha com o estado do aprendizado: quantos comandos o bot já
sabe replicar sozinho e quantos foram descartados por já estarem no parser de
regex. Sem isso o aprendizado é invisível — quem cuida do bot não tem como saber
se ele decorou dois comandos ou duzentos.

A linha só aparece quando `learned.enabled` é `true`. Anunciar contagem de um
recurso desligado é ruído.

#### Scenario: Cartão com comandos aprendidos
- **GIVEN** `learned.enabled` é `true`
- **AND** o histórico carregou 12 entradas válidas e descartou 3 já cobertas pelo parser
- **WHEN** o cartão é impresso
- **THEN** ele mostra uma linha com `12` comandos aprendidos
- **AND** menciona as `3` descartadas por já estarem no código

#### Scenario: Histórico vazio na primeira execução
- **GIVEN** `data/learned-commands.json` ainda não existe
- **WHEN** o cartão é impresso
- **THEN** a linha mostra que ele ainda não aprendeu nenhum comando
- **AND** nenhum aviso de erro é mostrado — arquivo ausente é o caso normal

#### Scenario: Aprendizado desligado não aparece no cartão
- **GIVEN** `learned.enabled` é `false`
- **WHEN** o cartão é impresso
- **THEN** nenhuma linha sobre comandos aprendidos aparece

#### Scenario: Histórico corrompido avisa no cartão
- **GIVEN** o arquivo do histórico não pôde ser lido
- **WHEN** o cartão é impresso
- **THEN** ele diz que o aprendizado começou do zero, com o motivo
- **AND** o bot continua subindo normalmente

---

### Requirement: Cartão sem segredo

O cartão continua sem mostrar segredo, e a linha nova não abre exceção: ela mostra
**contagem**, nunca a frase que a criança falou.

#### Scenario: Contagem, não conteúdo
- **GIVEN** o histórico tem entradas aprendidas de frases da criança
- **WHEN** o cartão é impresso
- **THEN** só números aparecem
- **AND** nenhuma frase do jogador vai para o terminal

---

## REMOVED

(Nenhum)
