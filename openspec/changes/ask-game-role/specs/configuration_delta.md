# Delta: Configuração

**Change ID:** `ask-game-role`
**Affects:** `src/config/schema.ts`, `config.example.yaml`

> Requisito de outro componente (`configuration`). Ao arquivar, aplicar em
> `openspec/specs/configuration.md`.

---

## ADDED

### Requirement: Prazo da pergunta de papel

`games.roleQuestionTimeoutMs` define quanto tempo uma escolha de papel fica
pendente antes de expirar. Padrão: `45000`.

#### Scenario: Valor padrão
- **GIVEN** `config.yaml` não traz `games.roleQuestionTimeoutMs`
- **WHEN** o bot inicia
- **THEN** o prazo é 45000 ms
- **AND** nenhuma migração de arquivo é necessária

#### Scenario: Valor customizado
- **GIVEN** `games.roleQuestionTimeoutMs: 20000`
- **WHEN** o bot pergunta o papel e ninguém responde por 20 s
- **THEN** a escolha pendente expira

#### Scenario: Valor inválido
- **GIVEN** `games.roleQuestionTimeoutMs` é zero ou negativo
- **WHEN** a config é carregada
- **THEN** o startup falha com mensagem clara e acionável

---

## MODIFIED

(Nenhum requisito existente muda.)

---

## REMOVED

(Nenhum)
