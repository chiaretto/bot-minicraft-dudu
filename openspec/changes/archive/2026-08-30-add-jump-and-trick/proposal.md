# Proposal: Pular e fazer graça a pedido

**Change ID:** `add-jump-and-trick`
**Created:** 2026-08-30
**Status:** Draft

---

## Problem Statement

Duas entradas do repertório existem **só para dizer que não**:

- `pedido_pular`, criada em 2026-08-19 depois de `pule` aparecer 3x no log e a
  IA responder que tinha pulado — mentira.
- `pedido_truque` (`faz uma dancinha`, `gira no lugar`, `ande em circulos`).

São 18 padrões de pedido, todos respondidos com "ainda não aprendi". E são os
pedidos mais baratos do backlog inteiro: pular é uma tecla, girar é um `look`.

Para uma criança de 7 anos, um amigo que pula quando ela pede vale mais do que
um que constrói uma casa em três minutos. É o item com melhor retorno por linha
do projeto.

## Proposed Solution

Duas intenções novas, no molde das que já existem — catálogo fechado, ação em
`behaviors/actions/`, padrão determinístico no nível 1.

- **`JUMP`** — três pulos no lugar. Sem parâmetro: "pula" não tem quantidade.
- **`TRICK`** — gira 360° em passos curtos e termina com um pulo.

As duas são **interrompíveis** como qualquer ação: `dudu, para` corta no meio.
E as duas são rápidas de propósito — graça que demora deixa de ser graça.

### As duas entradas de repertório somem

Elas viraram comando, e comando não é repertório (`CLAUDE.md`). Todos os 18
padrões passam para `commands.ts`; as entradas são removidas inteiras, como
`constroi uma casa` saiu de `recusa_escopo` quando o bot aprendeu a construir.

A pergunta *sobre* pular (`voce sabe pular?`) continua sendo conversa, em
`habilidade_fisica` — e essa fala é atualizada: ele passou a pular a pedido.

## Scope

### In Scope

- `JUMP` e `TRICK` no catálogo de intenções, no schema e nos aprendíveis.
- Ações em `behaviors/actions/index.ts`, com abort entre cada passo.
- Padrões dos 18 pedidos em `commands.ts`.
- Remoção de `pedido_pular` e `pedido_truque` das **duas** cópias do repertório.
- `habilidade_fisica` deixa de dizer que ele não pula a pedido.
- Descrição das duas no prompt da IA (o teste de cobertura exige).
- README e testes.

### Out of Scope

- **Pular quantidade pedida** ("pula 10 vezes"). Número no pedido é parâmetro, e
  parâmetro pede validação de teto; três pulos é a graça inteira.
- **Dancinha com passos de verdade** (andar em círculo pelo mundo). Girar no
  lugar é seguro em qualquer terreno; andar em círculo cai em buraco.
- Emote e animação de item — o protocolo tem, mas o bot não.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `domain/intent.ts` | Sim | `JUMP` e `TRICK` no catálogo, schema e aprendíveis |
| `behaviors/actions/index.ts` | Sim | Duas ações novas e dois casos no `runIntent` |
| `behaviors/commands.ts` | Sim | 18 padrões |
| `ai/prompt.ts` | Sim | Descrição das duas ações |
| Repertório (as **duas** cópias) | Sim | Duas entradas removidas, uma reescrita |
| `README.md` | Sim | Tabela de comandos |
| Configuração | Não | Nenhuma chave nova |

## Architecture Considerations

- **Ação curta também respeita o `para`.** O `checkAborted` entra entre cada
  pulo e cada passo do giro: sem isso, `para` só teria efeito depois da graça
  terminar, e a criança aprende que o `para` não funciona.
- **Nada de tempo fixo grande.** Cada pulo é um controle ligado e desligado; o
  giro são 8 passos de 45°. A ação inteira leva menos de 3 segundos.
- **Aprendíveis.** As duas entram em `LEARNABLE_INTENTS`: os parâmetros são
  vazios, então não há estado do mundo para decorar errado.

## Success Criteria

- [ ] `dudu, pula` faz o bot pular três vezes e falar
- [ ] `dudu, faz uma dancinha` faz o bot girar e falar
- [ ] `dudu, para` no meio corta a graça
- [ ] Nenhuma fala do repertório diz mais que ele não sabe pular ou girar
- [ ] `npm test` e `npx eslint src test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Pular perto de buraco derrubar o bot | Baixa | Médio | Pulo é no lugar, sem controle de andar ligado |
| Giro atrapalhar o pathfinder no meio de outra ação | Baixa | Baixo | A ação roda como qualquer outra, uma de cada vez |
| `dance` roubar frase de outra entrada | Baixa | Baixo | `repertoire:check` antes de fechar |

---

## Archive Information

**Archived:** 2026-08-30
**Duration:** implementado e arquivado no mesmo dia
**Outcome:** implementado; ver a ressalva de verificação abaixo

### Specs atualizadas

- `player_commands.md` — "Pular a pedido" e "Fazer graça a pedido"
- `local_dialogue.md` — duas entradas no `Descontinuado`

### Ressalva de verificação

**Nada deste change foi provado em jogo.** As tarefas em aberto no `tasks.md`
continuam em aberto, e o arquivamento foi decisão do dono do projeto.

Ninguém viu o bot pular nem dançar, nem provou que `para` corta a graça no meio.

O que sustenta o arquivamento é teste unitário, medição sobre os arquivos reais
de log e de cache, e a prova de que os módulos carregam em Node de verdade sobre
o `dist/`.

### Nota do arquivamento em lote

Os dez changes de 29 e 30/08 foram arquivados na mesma sessão, em ordem
cronológica de implementação. Duas coisas apareceram na conferência e valem
para os próximos deltas:

- **`MODIFIED` que não acha alvo.** Vários deltas apontavam para requisitos que
  não existem com aquele nome (`Configuração do comportamento`,
  `Privacidade do que aparece no terminal`, `Comportamento de emergência` no
  componente errado). Foram escritos do ponto de vista da feature, não do índice
  da spec. **Confira o índice antes de escrever um `MODIFIED`.**
- **Configuração sem delta.** Quatro changes criaram chave de configuração e
  nenhum trouxe delta de `configuration`. As chaves entraram na spec durante o
  arquivamento, num requisito próprio — sem isso, a fonte da verdade ficaria sem
  metade do que o `config.example.yaml` tem.

O merge foi por acréscimo e conferido por contagem: nenhum cenário perdido em
nenhuma das oito specs. As únicas cinco linhas removidas em todo o lote são as
frases que os requisitos `MODIFIED` reescreveram.
