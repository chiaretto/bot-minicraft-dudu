# Delta: Configuração

**Change ID:** `add-bot-game-pega-pega`
**Affects:** bloco `games`

---

## ADDED

### Requirement: Sub-bloco `games.tag`

Os parâmetros do pega-pega são configuráveis, com defaults que funcionam sem
ninguém mexer em nada. Os dois sprints são o que o pai ajusta se a rodada ficar
fácil ou impossível para a criança.

```yaml
games:
  enabled: true
  hideAndSeek:
    # ... inalterado ...
  tag:
    countTo: 5                     # ele conta 5 antes de sair correndo
    countIntervalMs: 1000          # 5 x 1 s = vantagem de saída de 5 s
    chaseTimeoutMs: 60000          # 60 s correndo atrás; depois cansa e perde
    fleeTimeoutMs: 60000           # 60 s fugindo; depois cansa e se entrega
    surrenderTimeoutMs: 30000      # entregue: quanto espera parado ser pego
    touchDistance: 2               # encostou nessa distância, pegou
    chaseFollowDistance: 1         # o quanto ele cola no jogador perseguindo
    chaseSprint: true              # perseguindo ele corre de verdade
    fleeSprint: false              # fugindo ele não corre, senão nunca é pego
    fleeStepMin: 8                 # salto mínimo de cada ponto de fuga
    fleeStepMax: 16                # salto máximo de cada ponto de fuga
    fleeMaxDistanceFromOwner: 40   # nunca some do campo de visão da criança
    fleeCandidateSamples: 16       # pontos avaliados por escolha de fuga
    roundTimeoutMs: 180000         # rede de segurança: rodada nunca fica presa
```

> **Os dois sprints não são simétricos de propósito.** Com sprint nos dois
> papéis o bot ganha sempre e a criança para de brincar; sem sprint em nenhum,
> o bot nunca pega ninguém e toda rodada acaba em "cansei". Ligado só na
> perseguição, cada lado tem uma chance real.

#### Scenario: Configuração ausente
- **GIVEN** `config.yaml` não tem o sub-bloco `games.tag`
- **WHEN** o bot inicia
- **THEN** os defaults acima são aplicados
- **AND** o pega-pega funciona sem nenhuma configuração

#### Scenario: Desligar os jogos desliga os dois
- **GIVEN** `games.enabled` é `false`
- **WHEN** `Miguel` convida para pega-pega
- **THEN** nenhuma rodada começa
- **AND** o parser continua reconhecendo o convite, para o bot responder
  honestamente em vez de cair em `nao_entendi`

#### Scenario: Faixa de fuga invertida
- **GIVEN** `fleeStepMin` é maior que `fleeStepMax`
- **WHEN** o bot inicia
- **THEN** a configuração é recusada com mensagem legível
- **AND** o bot não inicia com faixa impossível

#### Scenario: Fuga além do teto do jogador
- **GIVEN** `fleeStepMax` é maior que `fleeMaxDistanceFromOwner`
- **WHEN** o bot inicia
- **THEN** a configuração é recusada — um salto de fuga maior que o teto
  garantiria ponto inválido em toda escolha

#### Scenario: Toque maior que o salto de fuga
- **GIVEN** `touchDistance` é maior ou igual a `fleeStepMin`
- **WHEN** o bot inicia
- **THEN** a configuração é recusada: o bot chegaria ao ponto de fuga já dentro
  da distância de toque, e a rodada acabaria sozinha

#### Scenario: Tempo do jogo maior que a rede de segurança
- **GIVEN** `countTo × countIntervalMs + max(chaseTimeoutMs, fleeTimeoutMs) +
  surrenderTimeoutMs` passa de `roundTimeoutMs`
- **WHEN** o bot inicia
- **THEN** a configuração é recusada
- **AND** a mensagem explica que a rodada acabaria antes da regra do jogo valer

---

## MODIFIED

### Requirement: Bloco `games`

Os parâmetros das brincadeiras são configuráveis, com defaults que funcionam sem
ninguém mexer em nada. O bloco passa a ter **um sub-bloco por jogo**:
`hideAndSeek` e `tag`.

#### Scenario: Configuração parcial de um jogo só
- **GIVEN** `config.yaml` traz `games.tag.chaseSprint: false` e mais nada
- **WHEN** o bot inicia
- **THEN** só esse campo muda; todo o resto de `tag` e todo o `hideAndSeek` ficam
  nos defaults

#### Scenario: Jogo novo não quebra config antiga
- **GIVEN** um `config.yaml` escrito antes deste change, sem `games.tag`
- **WHEN** o bot inicia
- **THEN** ele inicia normalmente, com o pega-pega nos defaults
- **AND** nenhuma migração de arquivo é necessária

---

## REMOVED

(None)
