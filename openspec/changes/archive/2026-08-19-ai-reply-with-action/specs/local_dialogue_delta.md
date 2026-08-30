# Delta: Repertório local

**Change ID:** `ai-reply-with-action`
**Affects:** `src/behaviors/router.ts`

> Requisito de outro componente (`local_dialogue`). Ao arquivar, aplicar em
> `openspec/specs/local_dialogue.md` → "Cascata de resolução de mensagens".

---

## MODIFIED

### Requirement: Cascata de resolução de mensagens

A ordem continua a mesma — comando → repertório → IA — e cada nível só passa
adiante o que não resolveu. O que muda é o que o **nível 3** é capaz de
devolver: além da fala, ele pode trazer uma ação a executar.

| Nível | Devolve |
|---|---|
| 1. comando (regex) | ação |
| 2. repertório local | fala |
| 3. IA | fala **e**, quando for pedido, ação |

Os níveis 1 e 2 não mudam em nada. Nível 1 continua funcionando com a IA
desligada, e nível 2 continua respondendo sem sair da máquina.

#### Scenario: Comando resolvido no nível 1
- **GIVEN** o dono digita `dudu, me segue`
- **WHEN** a mensagem entra na cascata
- **THEN** o parser resolve e nenhuma chamada de IA acontece

#### Scenario: Conversa resolvida no nível 2
- **GIVEN** o dono digita `oi`
- **WHEN** a mensagem entra na cascata
- **THEN** o repertório responde e nenhuma chamada de IA acontece

#### Scenario: Pedido livre resolvido no nível 3
- **GIVEN** o dono digita um pedido que nem o parser nem o repertório resolveram
- **WHEN** a IA responde
- **THEN** o bot fala a resposta
- **AND** executa a ação, se a IA tiver proposto uma válida

#### Scenario: IA fora do ar
- **GIVEN** o provider falhou ou está desligado
- **WHEN** a mensagem chega ao nível 3
- **THEN** o bot responde pelo `nao_entendi` do repertório
- **AND** nenhuma ação é executada

---

## ADDED

(Nenhum requisito novo.)

---

## REMOVED

(Nenhum)
