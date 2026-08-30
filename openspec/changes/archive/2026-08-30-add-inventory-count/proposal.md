# Proposal: Ele sabe dizer quanto tem na mochila

**Change ID:** `add-inventory-count`
**Created:** 2026-08-30
**Status:** Draft

---

## Problem Statement

No log de 20/08 a criança perguntou:

> *"quantos blocos de madeira voce tem ?"*

E a IA respondeu *"Isso eu não sei ver, mas posso pegar pra você!"* — uma
resposta honesta e **errada**. O `WorldSnapshot` carrega `inventory` desde o
primeiro dia, e o placeholder `{inventorySummary}` já existe no repertório.

Dois buracos, um em cada nível da cascata:

1. **A IA responde no escuro.** `worldContext()` manda vida, fome, posição,
   hora e monstros — e não manda a mochila. Ela não tinha como saber.
2. **Não existe comando.** A pergunta é sobre um item específico, e padrão de
   repertório é texto literal: não dá para capturar "madeira" numa entrada.

## Proposed Solution

**`COUNT_ITEM`**, com o material como parâmetro. Ele conta o que tem e responde
exato, sem rede: *"Tenho 12 de madeira aqui comigo!"*.

E `worldContext()` passa a mandar a mochila, para a IA parar de responder no
escuro quando a pergunta vier torta.

### O catálogo fechado outra vez

O que vem depois do "quanto" é capturado e precisa estar num catálogo de
materiais falados (`madeira`, `pedra`, `terra`, `areia`, `cascalho`, mais os
plurais e os nomes técnicos). Nome fora dele **não vira comando** e desce na
cascata.

É a mesma regra do ataque nomeado, e pelo mesmo motivo: sem ela,
*"quantos amigos você tem?"* viraria a contagem de um bloco que não existe.

### Mochila vazia responde e oferece

*"Não tenho madeira nenhuma agora. Quer que eu busque?"* — a regra número um
manda oferecer o que funciona quando a resposta é não.

## Scope

### In Scope

- `COUNT_ITEM` no catálogo, schema e aprendíveis (o parâmetro é vocabulário).
- `materialFromSpokenName()` em `domain/materials.ts`, catálogo fechado.
- Padrões de captura em `commands.ts`, no molde do ataque nomeado.
- A mochila no bloco de mundo do prompt.
- Testes e README.

### Out of Scope

- **Contar item que não é material** (espada, comida, tocha). O catálogo cobre
  o que o bot coleta e usa em obra; o resto viria com a lista de itens inteira
  do jogo.
- **Listar a mochila inteira por comando.** `inventario_social` já responde isso
  pelo repertório, com `{inventorySummary}`.
- Mostrar durabilidade, encantamento ou slot.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `domain/materials.ts` | Sim | Catálogo de nomes falados |
| `domain/intent.ts` | Sim | `COUNT_ITEM` |
| `behaviors/actions/index.ts` | Sim | `countItem()` |
| `behaviors/commands.ts` | Sim | Captura, como no ataque nomeado |
| `ai/prompt.ts` | Sim | Mochila no bloco de mundo; descrição da ação |
| Repertório | Não | `inventario_social` continua respondendo a pergunta geral |

## Architecture Considerations

- **Pergunta que o snapshot responde não deveria ir para a IA.** Cada uma que
  sobe a cascata é latência, dinheiro e uma frase da criança saindo da máquina.
- **Ação que só fala continua sendo ação.** `LOOK_AT_OWNER` já era assim: o
  pipeline é o mesmo, e a resposta sai como resultado da ação.
- **Catálogo fechado**, como bicho, planta e jogo. É a terceira vez que a mesma
  regra evita a mesma classe de erro.

## Success Criteria

- [ ] `quantos blocos de madeira voce tem` responde com o número exato, sem IA
- [ ] `quantos amigos voce tem` **não** vira comando
- [ ] Mochila vazia responde e oferece buscar
- [ ] A IA passa a receber a mochila no prompt
- [ ] `npm test` e `npx eslint src test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Padrão de captura roubar pergunta que não é de item | Média | Médio | Catálogo fechado: nome desconhecido não vira comando |
| Mochila no prompt inchar o contexto | Baixa | Baixo | Só os cinco maiores, uma linha |
| Criança pedir contagem de item fora do catálogo | Média | Baixo | Desce para a IA, que agora enxerga a mochila e responde |

---

## Archive Information

**Archived:** 2026-08-30
**Duration:** implementado e arquivado no mesmo dia
**Outcome:** implementado; ver a ressalva de verificação abaixo

### Specs atualizadas

- `player_commands.md` — "Contar item da mochila" e o catálogo de materiais falados
- `ai_companion.md` — a mochila no bloco de mundo

### Ressalva de verificação

**Nada deste change foi provado em jogo.** As tarefas em aberto no `tasks.md`
continuam em aberto, e o arquivamento foi decisão do dono do projeto.

A pergunta nunca foi feita em jogo, com a mochila cheia nem vazia.

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

---

## Verificado em jogo

**2026-08-30 — o dono testou e aprovou.**

A ressalva acima descreve o estado em que este change foi arquivado, algumas
horas antes. Fica registrada como histórico: é ela que explica por que os itens
de "em jogo" do `tasks.md` continuam sem marca.

As caixas **não** foram marcadas uma a uma de propósito. O que houve foi
aprovação da sessão inteira; dizer qual cenário específico foi exercitado seria
inventar detalhe que ninguém observou.
