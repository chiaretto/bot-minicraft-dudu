# Proposal: O aplicativo lê as falas em voz alta

**Change ID:** `add-launcher-voice`
**Created:** 2026-08-30
**Status:** Draft

---

## Problem Statement

A dona do bot tem **7 anos e lê devagar**. O chat do Minecraft rola rápido, e
qualquer coisa que aconteça no jogo — um monstro, outro jogador falando, uma
mensagem de sistema — empurra a fala do Dudu para cima antes de ela terminar de
ler.

O projeto inteiro é construído em cima de uma restrição de leitura: frase curta,
palavra simples, sem lista, sem parágrafo. Tudo isso é para caber no tempo em
que uma criança de 7 anos lê uma linha de chat.

Ler em voz alta remove a restrição na origem.

## Proposed Solution

O bot anuncia cada fala numa linha própria do `stdout`, e o aplicativo de
desktop — que já supervisiona esse `stdout` — lê em voz alta com a voz do
sistema.

```
bot  ──stdout──>  @dudu-fala {"text":"Piscina pronta! Agora joga água..."}
                        │
                  launcher (política pura)
                        │
                  janela: speechSynthesis
```

### Canal separado do status

Status é ciclo de vida e muda meia dúzia de vezes por sessão; fala acontece o
tempo todo. Um canal só faria o supervisor ter que adivinhar qual é qual — e o
protocolo existe justamente para ele não adivinhar nada.

### Repetição, aqui, é de propósito

O canal de status engole repetição (`procurando` duas vezes não é transição). O
de fala **não pode**: numa rodada de quente e frio o bot repete "quente!", e a
criança precisa ouvir cada uma.

### A política é pura; só falar é da janela

`launcher/src/voice.ts` decide o que vale a pena ouvir e como: tira emoticon
(`:D` sai como "dois pontos, dê" em quase todo sintetizador), colapsa pontuação
repetida, corta fala longa na última palavra inteira.

A janela recebe o texto já pronto e faz a única coisa que exige navegador:
`speechSynthesis`. É a mesma divisão do resto do launcher — regra em módulo
testável, borda na janela.

### Fala nova cancela a anterior

Fila comprida faria a voz ficar meio minuto atrás do jogo. O que importa é o que
ele **acabou** de dizer.

### Ligado por padrão, com um clique para desligar

A voz existe para a criança; o padrão é o que serve a ela. O adulto desliga na
mesma tela, e a escolha é lembrada.

## Scope

### In Scope

- `SPEECH_PREFIX` e `speak()` no canal de status do bot.
- `onSpeech()` no `CompanionBot`, no ponto único de saída de fala.
- `parseLine` do launcher reconhece a linha nova.
- `launcher/src/voice.ts`: política pura, com teste.
- Caixa "Ler o que ele fala em voz alta" na janela, lembrada.
- Testes dos dois lados.

### Out of Scope

- **Voz da criança virar comando** (falar em vez de digitar). É o caminho
  inverso, precisa de microfone e permissão, e merece o próprio change.
- **Escolher a voz na interface.** Ele pega a voz pt-BR do sistema, se houver.
- **Ler a fala de outros jogadores.** Só o que o Dudu diz.
- **Voz no terminal** (`npm run dev`). Falar é do aplicativo.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `app/status-channel.ts` | Sim | `SPEECH_PREFIX`, `formatSpeech`, `speak()` |
| `app/bot.ts` | Sim | `onSpeech`, chamado no `say()` |
| `app/main.ts` | Sim | Liga o `onSpeech` ao canal |
| `launcher/src/status.ts` | Sim | Reconhece a linha de fala |
| `launcher/src/runner.ts`, `main.ts`, `preload.ts` | Sim | Repasse até a janela |
| `launcher/src/voice.ts` | **Novo** | Política pura |
| `launcher/ui/` | Sim | Caixa de voz e o `speechSynthesis` |
| Cascata, IA, jogos | Não | Nada disso sabe que existe voz |

## Architecture Considerations

- **O protocolo é contrato, e cresceu por soma.** Prefixo novo; quem não
  conhece trata como log e nada quebra — foi para isso que `parseLine` já caía
  em log no desconhecido.
- **A constante é repetida nos dois lados**, como o `@dudu-status`. São
  processos separados de propósito; um `import` amarraria o launcher ao build
  do bot.
- **Regra pura, borda na janela** — a mesma divisão de `supervisor`, `status`,
  `phrases`, `config-port` e `repo-path`.
- **O bot não sabe que existe voz.** Ele anuncia o que falou; quem lê em voz
  alta é problema de quem supervisiona.

## Success Criteria

- [ ] Com o aplicativo aberto, o que o Dudu fala sai pela caixa de som
- [ ] Desligar a caixa cala a voz e é lembrado na próxima abertura
- [ ] Emoticon não é lido letra por letra
- [ ] Fala nova corta a anterior
- [ ] Sem o aplicativo (`npm run dev`), nada muda no `stdout`
- [ ] `npm test` e os testes do launcher passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Voz atrasar em relação ao jogo | Alta sem guarda | Médio | Fala nova cancela a anterior |
| Sistema sem voz pt-BR | Média | Baixo | Cai na voz padrão; a fala continua saindo |
| A linha nova quebrar launcher antigo | Baixa | Médio | Prefixo desconhecido vira log, que é o comportamento que já existia |
| Poluir o `stdout` de quem roda no terminal | Baixa | Baixo | O canal inteiro só existe com `DUDU_LAUNCHER=1` |
| Voz cansar o adulto | Média | Baixo | Um clique desliga, e a escolha é lembrada |

---

## Archive Information

**Archived:** 2026-08-30
**Duration:** implementado e arquivado no mesmo dia
**Outcome:** implementado; ver a ressalva de verificação abaixo

### Specs atualizadas

- `desktop_launcher.md` — "Ler as falas em voz alta"
- `startup_console.md` — nota sobre os dois canais novos do lado do bot

### Ressalva de verificação

**Nada deste change foi provado em jogo.** As tarefas em aberto no `tasks.md`
continuam em aberto, e o arquivamento foi decisão do dono do projeto.

A voz nunca saiu pela caixa de som: exige abrir a janela do Electron.

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
