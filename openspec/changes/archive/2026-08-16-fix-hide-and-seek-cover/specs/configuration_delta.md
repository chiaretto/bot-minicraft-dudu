# Delta: Configuração

**Change ID:** `fix-hide-and-seek-cover`
**Affects:** `src/config/schema.ts`, `config.example.yaml`

---

## ADDED

### Requirement: Tempo de busca por esconderijo

`games.hideAndSeek.hideSearchMs` controla quanto tempo o bot anda procurando um
esconderijo com cobertura antes de desistir. Padrão: **20000** (20 s).

#### Scenario: Ausente na configuração
- **GIVEN** `config.yaml` não define `hideSearchMs`
- **WHEN** o bot inicia
- **THEN** o padrão de 20 s é aplicado

#### Scenario: Valor inválido
- **GIVEN** `hideSearchMs` é zero ou negativo
- **WHEN** a config é carregada
- **THEN** o startup falha apontando o campo

#### Scenario: Mundo aberto demais
- **GIVEN** o mundo é descampado e o bot está recusando rodadas
- **WHEN** o pai aumenta `hideSearchMs`
- **THEN** o bot procura por mais tempo antes de desistir

---

## MODIFIED

### Requirement: Parâmetros da contagem

`countTo` passa de 10 para **20**, e `countIntervalMs` de 2000 para **1000**.

#### Scenario: Padrões da contagem
- **GIVEN** `config.yaml` não define os dois campos
- **WHEN** o bot inicia
- **THEN** `countTo` é 20 e `countIntervalMs` é 1000
- **AND** a contagem inteira leva 20 segundos
- **AND** esse total bate com `hideSearchMs`, para os dois lados da brincadeira
  terem a mesma folga para se esconder

#### Scenario: Piso do chat continua valendo
- **GIVEN** `countIntervalMs` é 1000
- **WHEN** o bot conta
- **THEN** o intervalo fica acima do piso de 900 ms do `ChatSender`
- **AND** nenhuma mensagem é engolida por throttle

---

### Requirement: `config.example.yaml` documentado

O bloco `games` explica o que a cobertura significa na prática e o que fazer em
mundo aberto.

#### Scenario: Pai lendo o exemplo
- **GIVEN** a criança reclama que o bot desiste de se esconder
- **WHEN** o pai abre `config.example.yaml`
- **THEN** os comentários dizem que o bot exige algo sólido para se esconder
  atrás, e que `hideSearchMs` é o que dá mais tempo de procura

---

## REMOVED

(Nenhum)
