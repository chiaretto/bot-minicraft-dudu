# Delta: Configuração

**Change ID:** `add-learned-commands`
**Affects:** `src/config/schema.ts`, `config.example.yaml`

---

## ADDED

### Requirement: Bloco `learned`

O histórico de comandos aprendidos é configurável, com defaults que funcionam sem
ninguém mexer em nada. Os dois valores que um adulto realmente ajusta são
`enabled` — para desligar o aprendizado por completo — e `minConfidence`, se o bot
começar a replicar comando em frase parecida demais.

```yaml
learned:
  enabled: true                       # false volta à cascata de três níveis
  path: 'data/learned-commands.json'  # fora do git, como todo o data/
  minConfidence: 0.85                 # mais alto que o do repertório (0.7):
                                      # ação errada é pior que pergunta repetida
  maxEntries: 200                     # teto; a menos usada sai primeiro
  maxRepliesPerEntry: 4               # falas da IA guardadas por entrada,
                                      # material para o /upgrade-repertoire
  forgetAfterDays: null               # null = guardar para sempre
  unlearnOnStopMs: 15000              # 'para' nessa janela apaga o aprendizado
```

> **`minConfidence` é mais alto que o do repertório de propósito.** Em `0.7` o
> casamento aceita saco de palavras, e "não pega madeira" tem as mesmas palavras
> de "pega madeira". Para conversa isso custa uma resposta esquisita; para ação,
> custa o bot fazendo o contrário do que foi pedido.

#### Scenario: Configuração ausente
- **GIVEN** `config.yaml` não tem o bloco `learned`
- **WHEN** o bot inicia
- **THEN** os defaults acima são aplicados
- **AND** o aprendizado funciona sem nenhuma configuração

#### Scenario: Aprendizado desligado
- **GIVEN** `config.yaml` traz `learned.enabled: false`
- **WHEN** o bot inicia
- **THEN** o histórico não é carregado, consultado nem gravado
- **AND** a cascata volta a ter três níveis

#### Scenario: Config antiga continua válida
- **GIVEN** um `config.yaml` escrito antes desta mudança
- **WHEN** o bot inicia
- **THEN** ele inicia normalmente, com o aprendizado nos defaults
- **AND** nenhuma migração de arquivo é necessária

#### Scenario: Limiar fora da faixa é recusado
- **GIVEN** `learned.minConfidence` é `1.4`
- **WHEN** a configuração é validada
- **THEN** o startup falha apontando o campo
- **AND** a faixa aceita é de 0 a 1, como a do repertório

#### Scenario: Caminho do histórico dentro de `data/`
- **GIVEN** `learned.path` não foi configurado
- **WHEN** o default é aplicado
- **THEN** o arquivo fica em `data/`, que está inteiro no `.gitignore`
- **AND** o aprendizado derivado das falas da criança não vai para um commit

---

## MODIFIED

### Requirement: `config.example.yaml` documentado

O arquivo de exemplo ganha o bloco `learned` com comentário em cada campo,
inclusive o porquê de `minConfidence` ser mais rígido que o do repertório.

#### Scenario: Exemplo cobre o bloco novo
- **GIVEN** `config.example.yaml`
- **WHEN** alguém procura como desligar o aprendizado
- **THEN** o bloco `learned` está lá, com `enabled` comentado
- **AND** cada campo tem uma linha explicando o efeito prático de mexer nele

---

## REMOVED

(Nenhum)
