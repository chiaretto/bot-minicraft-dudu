# Delta: Configuração

**Change ID:** `add-bot-games-hide-and-seek`
**Affects:** `src/config/schema.ts`, `config.example.yaml`

---

## ADDED

### Requirement: Bloco `games`

Os parâmetros da brincadeira são configuráveis, com defaults que funcionam sem
ninguém mexer em nada. As distâncias são o que o pai ajusta se a rodada ficar
fácil ou difícil demais para a criança.

```yaml
games:
  enabled: true
  hideAndSeek:
    hideMinDistance: 10                 # esconderijo nunca colado no jogador
    hideMaxDistance: 30                 # nem tão longe que vire caminhada
    hideCandidateSamples: 24            # pontos avaliados antes de desistir
    touchDistance: 2                    # encostou nessa distância, achou
    seeDistance: 20                     # alcance máximo do "ver" do bot
    countTo: 10                         # até quanto ele conta
    countIntervalMs: 1000               # piso real de 900 ms (throttle do chat)
    fakeSearches: 2                     # erros de propósito antes de procurar
    fakeSearchMinDistanceFromOwner: 8   # busca falsa longe do jogador
    roundTimeoutMs: 180000              # 3 min: rodada nunca fica pendurada
```

#### Scenario: Configuração ausente
- **GIVEN** `config.yaml` não tem o bloco `games`
- **WHEN** o bot inicia
- **THEN** os defaults acima são aplicados
- **AND** a brincadeira funciona sem nenhuma configuração

#### Scenario: Desligar os jogos
- **GIVEN** `games.enabled` é `false`
- **WHEN** o bot inicia
- **THEN** nenhum convite inicia rodada
- **AND** o parser de comandos continua reconhecendo o convite, para o bot poder
  responder honestamente em vez de cair em `nao_entendi`

#### Scenario: Faixa de distância invertida
- **GIVEN** `hideMinDistance` é maior que `hideMaxDistance`
- **WHEN** a config é carregada
- **THEN** o startup falha com mensagem clara e acionável
- **AND** o bot não sobe com configuração impossível

#### Scenario: Valores fora de faixa
- **GIVEN** `fakeSearches` é negativo, ou `countTo` é zero, ou
  `roundTimeoutMs` não é positivo
- **WHEN** a config é carregada
- **THEN** a validação recusa com mensagem apontando o campo

#### Scenario: Busca falsa dentro do alcance de visão
- **GIVEN** `fakeSearchMinDistanceFromOwner` é menor que `touchDistance`
- **WHEN** a config é carregada
- **THEN** o startup falha — uma busca falsa desse tamanho encostaria no jogador
  e acabaria a brincadeira antes de começar

#### Scenario: Nada de segredo novo
- **GIVEN** o bloco `games`
- **WHEN** a config é validada contra `FORBIDDEN_YAML_KEYS`
- **THEN** nenhum campo novo é segredo
- **AND** o bloco pode ir para o `config.yaml` sem restrição

---

## MODIFIED

### Requirement: `config.example.yaml` documentado

O arquivo de exemplo ganha o bloco `games` comentado, explicando cada parâmetro
pelo efeito na brincadeira, não pelo nome técnico.

#### Scenario: Pai ajustando a dificuldade
- **GIVEN** a criança acha o bot fácil demais
- **WHEN** o pai abre `config.example.yaml`
- **THEN** os comentários deixam claro que aumentar `hideMaxDistance` deixa o
  esconderijo mais longe, e aumentar `fakeSearches` faz o bot demorar mais para
  achar

---

## REMOVED

(Nenhum)
