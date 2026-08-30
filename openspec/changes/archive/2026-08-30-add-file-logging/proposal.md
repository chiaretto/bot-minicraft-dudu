# Proposal: O log da aplicação também em arquivo

**Change ID:** `add-file-logging`
**Created:** 2026-08-30
**Status:** Draft

---

## Problem Statement

O `CLAUDE.md` já registra o buraco, na seção de Diagnóstico:

> *"O log da aplicação (pino) vai só para o stdout do terminal, não para
> arquivo. Quando o bot sobe pelo aplicativo de desktop, esse mesmo stdout
> aparece em 'Coisas de adulto' — é onde procurar quando alguém diz que 'não
> funcionou' e não tem terminal aberto."*

O problema é o que acontece **depois**: a janela fecha e o stdout vai junto.
Quem diz "não funcionou" no dia seguinte não tem o que mostrar, e quem cuida do
bot investiga no escuro.

O histórico de conversa já resolveu isso do lado da criança
(`data/conversations/AAAA-MM-DD.jsonl`). Falta o lado da máquina.

## Proposed Solution

Um arquivo por dia em `data/logs/AAAA-MM-DD.log`, **junto** com o stdout — não
no lugar dele. O aplicativo de desktop continua mostrando o que sempre mostrou.

### O dia é decidido a cada escrita

Uma sessão que começa às 23h50 e vai até de madrugada precisa trocar de arquivo
sozinha. Abrir o arquivo uma vez, no startup, deixaria a madrugada inteira no
arquivo do dia anterior — que é justamente onde ninguém vai procurar.

### Falha de log nunca derruba o bot

Disco cheio, pasta sem permissão, arquivo travado por outro processo: nada disso
pode derrubar um bot que está no meio de uma brincadeira. A escrita engole a
falha e avisa por callback; no pior caso, aquele pedaço do log se perde e o
stdout continua lá.

### O `redact` vale para o arquivo

Segredo que não pode aparecer no terminal também não pode ficar **gravado**. O
mesmo `REDACT_PATHS` cobre os dois destinos, e tem teste provando.

### Onde o arquivo mora

Dentro de `data/`, que está inteiro no `.gitignore` — junto do histórico de
conversa, e pelo mesmo motivo: **log de bot tem fala de criança**.

## Scope

### In Scope

- `logging/file-stream.ts`: stream que troca de arquivo à meia-noite.
- `createLogger` aceita pasta e escreve nos dois destinos.
- `logDir` na configuração, com `null` desligando.
- Testes, incluindo a virada de meia-noite e o redact em disco.
- README e `config.example.yaml`.

### Out of Scope

- **Apagar log velho por idade.** O histórico de conversa tem retenção; o log
  ainda não precisa, e escolher o prazo sem dado é chute.
- **Compactar.** Um dia de log de bot é pequeno.
- **Mandar log para fora da máquina.** Nunca.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `logging/file-stream.ts` | **Novo** | Stream diário tolerante a falha |
| `logging/logger.ts` | Sim | `multistream`; assinatura antiga preservada |
| `app/main.ts` | Sim | Passa a pasta e loga onde o log está |
| `config/schema.ts` + exemplo | Sim | `logDir` |
| Todo o resto | Não | Ninguém mais chama `createLogger` |

## Architecture Considerations

- **Somar destino, não trocar.** O launcher lê o stdout; tirar o stdout
  quebraria "Coisas de adulto".
- **Assinatura antiga preservada.** `createLogger('debug')` continua válido, e
  os testes que já existiam não mudaram.
- **Mesma convenção de nome do histórico de conversa** (`AAAA-MM-DD`, dia
  local): quem já sabe achar um sabe achar o outro.

## Success Criteria

- [ ] O log sai no terminal **e** em `data/logs/AAAA-MM-DD.log`
- [ ] Vira o dia no meio da sessão e o arquivo muda sozinho
- [ ] Sessão nova continua o arquivo do dia, sem sobrescrever
- [ ] Segredo redigido também no arquivo
- [ ] Falha de escrita não derruba o bot
- [ ] `logDir: null` volta ao comportamento antigo
- [ ] `npm test` e `npx eslint src test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Perder o stdout e quebrar o launcher | Baixa | Alto | `multistream`: stdout continua sendo destino |
| Falha de disco derrubar o bot | Média | Alto | Escrita tolerante, erro por callback |
| Segredo gravado em disco | Baixa | **Alto** | `redact` no logger, antes dos destinos; teste prova |
| Log crescer sem fim | Média | Baixo | Um arquivo por dia, dentro de `data/`; retenção fica para depois |

---

## Archive Information

**Archived:** 2026-08-30
**Duration:** implementado e arquivado no mesmo dia
**Outcome:** implementado; ver a ressalva de verificação abaixo

### Specs atualizadas

- `startup_console.md` — "Log da aplicação em arquivo"; nota em "Cartão sem segredo"

### Ressalva de verificação

**Nada deste change foi provado em jogo.** As tarefas em aberto no `tasks.md`
continuam em aberto, e o arquivamento foi decisão do dono do projeto.

Ninguém viu o arquivo do dia nascer numa sessão de verdade.

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
