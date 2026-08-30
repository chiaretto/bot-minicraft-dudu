# Proposal: Ele te leva de volta onde você morreu

**Change ID:** `add-death-spot`
**Created:** 2026-08-30
**Status:** Draft

---

## Problem Statement

Existe uma entrada de repertório, `evento_dono_morreu`, que diz:

> *"Ahhh não, {owner}! Você morreu! **Eu marquei onde foi**, viu?"*
> *"Não!! {owner}! Volta rápido que eu tô **guardando o lugar**!"*

Duas coisas erradas com isso, desde 15/08:

1. **É mentira.** O bot não marcava nada. Não existia nem o evento de morte do
   dono, nem lugar guardado, nem jeito de voltar lá.
2. **A entrada nunca era dita.** Ninguém a disparava no código — ela estava
   morta no catálogo, prometendo em silêncio.

E o momento é o pior possível: quando a criança morre, as coisas dela ficam
caídas **cinco minutos** e ela precisa achar o lugar de novo, geralmente longe
e no escuro.

## Proposed Solution

O bot passa a **ver** a morte do dono, guardar o lugar, e levar ele de volta.

- `MinecraftClient` ganha o evento `ownerDied`, com a posição.
- O bot guarda `{ pos, at }` e diz `evento_dono_morreu` — que finalmente é
  verdade.
- `GO_TO_DEATH_SPOT` leva a criança até lá.

### A intenção não tem parâmetro, e isso é o ponto

A coordenada mora **na memória do bot**, não no pedido. É o que permite a frase
ser decorada pelo cache de comandos aprendidos sem mentir amanhã: "me leva onde
eu morri" quer dizer a mesma coisa depois, com outro lugar.

É o contraste exato com `GOTO_COORDS`, que está fora dos aprendíveis justamente
porque carrega um lugar de um momento nos parâmetros.

### Ele avisa quando já passou da hora

Depois de cinco minutos as coisas somem. O bot **vai do mesmo jeito** — quem
decide se vale a pena é a criança — mas diz antes quantos minutos faz. Chegar
lá e não achar nada seria pior do que ouvir a verdade no começo.

### E quando ele não viu

No primeiro dia, ou depois de uma reconexão, não há lugar guardado. Entrada
nova, `lugar_morte_desconhecido`: honesta, e com o que fazer no lugar ("fica
perto que eu fico de olho").

## Scope

### In Scope

- Evento `ownerDied` no cliente, a partir do `entityDead` do mineflayer.
- Lugar da morte guardado no bot, com o horário.
- `GO_TO_DEATH_SPOT` no catálogo, schema, aprendíveis e prompt.
- 12 padrões em `commands.ts`.
- Aviso de "faz X minutos".
- Entrada `lugar_morte_desconhecido`; `evento_dono_morreu` passa a ser dita.
- Testes.

### Out of Scope

- **Pegar as coisas para a criança.** Ele leva ela até lá; catar item do chão e
  devolver é outra ação, e mexer no que caiu é o tipo de ajuda que pode
  atrapalhar.
- **Guardar mais de uma morte.** A última é a que importa.
- **Lembrar entre sessões.** Reconectou, esqueceu — e a entrada nova diz isso.
- **Marcar com bloco no mundo.** Seria construir onde a criança morreu, o que
  pode atrapalhar a volta dela.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `minecraft/client.ts` | Sim | Evento `ownerDied` |
| `app/bot.ts` | Sim | Lugar guardado, `goToDeathSpot()`, `sayFrom()` |
| `domain/intent.ts`, `ai/prompt.ts` | Sim | `GO_TO_DEATH_SPOT` |
| `behaviors/commands.ts` | Sim | 12 padrões |
| Repertório (as **duas** cópias) | Sim | Entrada nova; a antiga passa a ser dita |

## Architecture Considerations

- **Estado do mundo fica no bot, não na intenção.** É a mesma regra que mantém
  `GOTO_COORDS` fora dos aprendíveis, aplicada ao contrário: sem parâmetro, a
  frase vira vocabulário e pode ser decorada.
- **O cliente só normaliza o evento.** Ele não decide nada — quem guarda e quem
  fala é o `app/`, como em todos os outros eventos.
- **Promessa antiga vira capacidade.** A varredura do repertório costuma tirar
  promessa que envelheceu; desta vez a promessa é que puxou a feature.

## Success Criteria

- [ ] Quando o dono morre, o bot fala e guarda o lugar
- [ ] `me leva onde eu morri` leva ele até lá
- [ ] Sem nenhuma morte vista, ele diz que não sabe e o que fazer
- [ ] Depois de 5 minutos, ele avisa antes de ir
- [ ] A intenção não carrega coordenada
- [ ] `npm test` e `npx eslint src test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `entityDead` não disparar para o dono em alguma versão | Média | Médio | A entrada `lugar_morte_desconhecido` cobre: ele diz que não viu, em vez de calar |
| A criança pedir e as coisas já terem sumido | Alta | Baixo | Aviso de minutos antes de sair |
| O caminho até lá ser perigoso | Média | Médio | A defesa continua ligada durante o trajeto |
| Frase decorada com lugar velho | Baixa | Baixo | A intenção não tem parâmetro: o lugar é sempre o mais recente |
