# Proposal: Instintos — comer com fome e acender tocha no escuro

**Change ID:** `add-survival-instincts`
**Created:** 2026-08-30
**Status:** Draft

---

## Problem Statement

Duas coisas que qualquer jogador de Minecraft faz sem pensar, e que o bot não
fazia:

- **Comer.** Não existe nada de `eat` no código. Ele anda com fome até a barra
  esvaziar, começa a perder vida e não entende por quê.
- **Acender tocha.** No log de 15/08 a **própria IA** sugeriu isso sozinha —
  *"Opa {owner}, tá muito escuro aqui, acende uma tocha aí!"* — mandando a
  criança fazer o que o bot tinha na mochila e não sabia usar.

As duas são do mesmo tipo: **estado do mundo, não assunto de conversa**. Fome
não se resolve perguntando à IA, e escuro também não.

## Proposed Solution

Um laço próprio de instintos, no molde da defesa: determinístico, periódico, e
**nunca** passando por IA.

- **`autoEat`** — abaixo de `eatBelowFood` (14 de 20), ele come a primeira
  comida do catálogo que tiver.
- **`autoTorch`** — com luz abaixo de `torchBelowLight` (7 de 15), ele acende
  uma tocha no chão onde está.

### Três guardas, e todas contra o mesmo tipo de erro

1. **Só quando está calmo.** `IDLE`, `FOLLOW` ou `STAY`. Comer trava o bot por
   quase dois segundos: quem está fugindo de creeper não para para comer pão, e
   quem está no meio do esconde-esconde não some para acender tocha.
2. **Uma coisa por tick.** Comer e acender na mesma passada deixaria a criança
   falando sozinha por quatro segundos.
3. **Tempo e distância entre tochas.** Escuro basta para acender **uma**; sem as
   outras duas guardas ele viraria uma fábrica de tochas andando.

### Catálogo fechado de comida

Pelo mesmo motivo dos outros catálogos do projeto: sem ele o bot come o que a
criança lhe deu para guardar. **Maçã dourada fica de fora** — item raro que ela
está guardando não vira lanche do bot. Carne crua e carne podre também: tiram
vida.

### Ele avisa por que parou

Bot que trava sem explicar parece bug. Duas entradas novas de repertório,
`evento_fome` e `evento_tocha`, com 5 variações cada — curtas, porque ele volta
ao que estava fazendo logo em seguida.

## Scope

### In Scope

- `domain/survival.ts`: catálogo de comida e as duas regras, puras.
- `eatSomething()` e `placeTorch()` em `actions/`, que **nunca lançam** —
  instinto não pode derrubar o que o bot estava fazendo.
- Laço próprio com passo de `survivalTickMs` (3 s).
- Sete chaves novas em `behavior`, documentadas no `config.example.yaml`.
- Entradas `evento_fome` e `evento_tocha` nas **duas** cópias do repertório.
- Testes das regras puras.

### Out of Scope

- **Cozinhar, plantar ou colher comida.** Ele come o que tem; conseguir comida
  é outro assunto.
- **Pedir comida à criança quando acabar.** Boa ideia, mas é conversa: entra
  numa rodada de repertório, não aqui.
- **Iluminar uma área inteira** ou caverna. Uma tocha onde ele está, quando
  está escuro, e mais nada.
- **Comer para curar.** Vida baixa já tem o comportamento de emergência.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `domain/survival.ts` | **Novo** | Catálogo e as duas regras puras |
| `behaviors/actions/index.ts` | Sim | `eatSomething()` e `placeTorch()` |
| `app/bot.ts` | Sim | `tickSurvival()` e o laço próprio |
| `config/schema.ts` + exemplo | Sim | Sete chaves em `behavior` |
| Repertório (as **duas** cópias) | Sim | `evento_fome` e `evento_tocha` |
| IA, cascata, cache aprendido | Não | Instinto não passa por nenhum deles |

## Architecture Considerations

- **Instinto é como defesa, não como comando.** Determinístico, periódico, sem
  IA — `project.md` já manda isso para combate, e a razão é a mesma.
- **Nunca lança.** As duas ações engolem a falha e voltam `null`/`false`: no
  pior caso ele passa fome mais um tick. Instinto que derruba a ação em curso é
  pior que instinto nenhum.
- **Laço separado do vigia de ameaça.** Fome e escuro mudam devagar; olhar para
  eles quatro vezes por segundo seria desperdício.
- **Regra pura, efeito na borda** — o par de sempre.

## Success Criteria

- [ ] Com fome e pão na mochila, ele come sozinho e avisa
- [ ] De barriga cheia, não come
- [ ] No escuro e com tocha, ele acende e avisa
- [ ] Não acende duas tochas seguidas no mesmo lugar
- [ ] Brigando ou brincando, nenhum dos dois acontece
- [ ] `autoEat: false` e `autoTorch: false` desligam
- [ ] `npm test` e `npx eslint src test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Comer no meio de uma ação e travar o bot | Média | Médio | Só em estado calmo; uma coisa por tick |
| Comer a comida especial da criança | Média | Alto | Catálogo fechado, sem maçã dourada |
| Virar fábrica de tochas | Alta sem guarda | Médio | Tempo mínimo + distância mínima |
| Falha ao colocar tocha derrubar outra ação | Média | Médio | As duas ações nunca lançam |
| Fala de instinto encher o chat | Média | Baixo | Uma fala por evento, e os eventos são raros |
