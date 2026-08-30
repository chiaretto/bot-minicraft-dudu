# Delta: Configuração

**Change ID:** `add-collect-and-build`
**Affects:** `src/config/schema.ts`, `config.example.yaml`

> Requisito de outro componente (`configuration`). Ao arquivar, aplicar em
> `openspec/specs/configuration.md`.

---

## ADDED

### Requirement: Configuração da construção

Três campos em `behavior` governam a obra.

| Campo | Padrão | Para quê |
|---|---|---|
| `buildAllowlist` | troncos, pedra, pedregulho, terra, areia | o que pode virar parede |
| `buildMaxBlocks` | `120` | teto de segurança do tamanho da obra |
| `buildAutoGather` | `true` | buscar material sozinho quando faltar |

> `buildAllowlist` é **separada** de `collectAllowlist` de propósito: o que o bot
> pode cavar não é necessariamente o que faz uma casa decente, e um dia uma pode
> mudar sem a outra.

#### Scenario: Valores padrão
- **GIVEN** `config.yaml` não traz nenhum dos três
- **WHEN** o bot inicia
- **THEN** valem os padrões acima
- **AND** nenhuma migração de arquivo é necessária

#### Scenario: Material proibido nunca vira parede
- **GIVEN** `tnt` não está em `buildAllowlist`
- **WHEN** a construção com `tnt` é pedida
- **THEN** a obra é recusada

#### Scenario: Teto de segurança
- **GIVEN** `buildMaxBlocks: 10`
- **WHEN** uma casa de 52 blocos é pedida
- **THEN** a obra é recusada antes do primeiro bloco

#### Scenario: Busca automática desligada
- **GIVEN** `buildAutoGather: false` e falta material
- **WHEN** a obra é pedida
- **THEN** o bot recusa dizendo quanto falta, sem sair para coletar

---

## MODIFIED

(Nenhum requisito existente muda.)

---

## REMOVED

(Nenhum)
