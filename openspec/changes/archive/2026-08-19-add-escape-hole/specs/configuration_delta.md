# Delta: Configuração

**Change ID:** `add-escape-hole`
**Affects:** `src/config/schema.ts`, `config.example.yaml`

> Requisito de outro componente (`configuration`). Ao arquivar, aplicar em
> `openspec/specs/configuration.md`.

---

## ADDED

### Requirement: Configuração da saída de buraco

Quatro campos em `behavior` governam a subida.

| Campo | Padrão | Para quê |
|---|---|---|
| `escapeMinDrop` | `3` | desnível a partir do qual vale empilhar |
| `escapeMaxHeight` | `24` | teto de degraus por tentativa |
| `escapeMaxDigs` | `12` | teto de blocos cavados para arranjar degrau |
| `escapeStuckMs` | `6000` | tempo parado seguindo antes de suspeitar de buraco |

#### Scenario: Valores padrão
- **GIVEN** `config.yaml` não traz nenhum dos quatro
- **WHEN** o bot inicia
- **THEN** valem os padrões acima
- **AND** nenhuma migração de arquivo é necessária

#### Scenario: Vigia mais impaciente
- **GIVEN** `escapeStuckMs: 2000`
- **WHEN** o bot fica 2 s parado seguindo, com o dono acima
- **THEN** a subida começa

#### Scenario: Teto de altura menor
- **GIVEN** `escapeMaxHeight: 5`
- **WHEN** o dono está 30 blocos acima
- **THEN** o bot sobe no máximo 5 degraus e fala que ainda está fundo

#### Scenario: Valor inválido
- **GIVEN** qualquer um dos quatro é zero ou negativo
- **WHEN** a config é carregada
- **THEN** o startup falha com mensagem clara

---

## MODIFIED

(Nenhum requisito existente muda.)

---

## REMOVED

(Nenhum)
