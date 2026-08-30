# Delta: Configuração

**Change ID:** `add-survival-instincts`
**Affects:** `config/schema.ts`, `config.example.yaml`

---

## MODIFIED

### Requirement: Configuração do comportamento

O bloco `behavior` ganha sete chaves, todas dos instintos de sobrevivência:

| Chave | Padrão | O que faz |
|---|---|---|
| `autoEat` | `true` | Comer sozinho quando a fome apertar |
| `eatBelowFood` | `14` | Fome (0-20) a partir da qual ele come |
| `autoTorch` | `true` | Acender tocha sozinho no escuro |
| `torchBelowLight` | `7` | Luz (0-15) abaixo da qual o lugar merece tocha |
| `torchMinIntervalMs` | `20000` | Espera mínima entre duas tochas |
| `torchMinDistance` | `5` | Distância mínima da última tocha |
| `survivalTickMs` | `3000` | De quanto em quanto tempo ele checa |

#### Scenario: Os instintos vêm ligados
- **GIVEN** um `config.yaml` sem o bloco `behavior`
- **WHEN** a configuração é carregada
- **THEN** `autoEat` e `autoTorch` são `true`
- **AND** os limiares são os da tabela

#### Scenario: Dá para desligar sem mexer em código
- **GIVEN** `autoEat: false` e `autoTorch: false`
- **WHEN** o bot roda
- **THEN** ele não come nem acende tocha sozinho
- **AND** o comportamento volta a ser o de antes desta mudança
