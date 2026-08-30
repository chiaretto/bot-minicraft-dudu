# Proposal: Abrir portas

**Change ID:** `add-open-door`
**Created:** 2026-08-19
**Status:** Implementation Complete
**Completed:** 2026-08-19

---

## Problem Statement

O bot não abre portas. Consequências práticas para a criança:

- Ela entra em casa e fecha a porta. Chama `dudu, vem` — ele fica do lado de
  fora, **parado e mudo**, porque para o pathfinder uma porta fechada é parede.
- Ela pede `dudu, abre a porta` — cai no `nao_entendi`.

## Duas descobertas que definiram o desenho

Investigando `mineflayer-pathfinder@2.4.5` antes de codar:

### 1. `movements.canOpenDoors` não abre portas

O conjunto `openable` é montado assim (`lib/movements.js:94`):

```js
if (this.interactableBlocks.has(block.name)
    && block.name.toLowerCase().includes('gate')
    && !block.name.toLowerCase().includes('iron')) {
  this.openable.add(block.id)
}
```

Só entra bloco com **"gate"** no nome. A flag cobre **portão de cerca**, não
porta — o comentário no ponto de uso é literalmente `// Open fence gates`.

### 2. O autor da lib desaconselha ligar a flag no nosso cenário

```js
this.canOpenDoors = false // Causes issues. Probably due to none paper servers.
```

O mundo do projeto é aberto em LAN pelo cliente vanilla — exatamente o caso
"non-Paper" que ele aponta.

**Conclusão: a flag fica `false`.** Ligar não resolveria portas e traria o risco
que o próprio autor documentou. Porta se resolve clicando, com
`bot.activateBlock`.

## Proposed Solution

### Pedido explícito

`dudu, abre a porta` vira comando de **nível 1**: acha a porta mais próxima,
caminha até ela e clica. Funciona com `llm.provider: 'none'`.

### Automático, quando a porta trava o caminho

O vigia de "preso" que já existe (criado para sair de buraco) ganha mais uma
causa. Ao ficar `escapeStuckMs` sem sair do lugar em `FOLLOW`:

1. **porta fechada por perto** → abre e volta a seguir;
2. senão, **dono bem acima** → escadinha de blocos.

Porta vem primeiro: é causa mais comum, muito mais barata de resolver, e
acontece **no mesmo nível** — onde a regra do buraco (dono acima) nem se aplica.

```
Miguel: dudu, vem
        (você entrou em casa e fechou a porta)
Dudu:   Tem uma porta fechada no caminho! Já abro.
Dudu:   Abri a porta!
        (entra e volta a te seguir)
```

### Porta de ferro é recusa honesta

Ferro só abre com botão, alavanca ou placa de pressão. O bot **não tenta**: diz
o motivo. Ficar clicando numa porta que não vai abrir pareceria bot quebrado.

### Detalhes que o código trata

- **As duas metades.** Uma porta ocupa dois blocos e as duas aparecem na busca.
  Só a de baixo conta — tratar as duas como portas diferentes faria o bot abrir
  e **fechar** a mesma na sequência.
- **Porta já aberta não é reaberta**, pelo mesmo motivo: clicar de novo fecha.
- **Confere o resultado.** Depois de clicar, relê o estado. Anunciar "abri!" com
  a porta fechada é o bot mentindo.

## Scope

### In Scope

- Ação de abrir porta, portão e alçapão.
- Comando de nível 1 e intenção `OPEN_DOOR`.
- Porta como causa de travamento no vigia de `FOLLOW`.
- Recusa honesta para porta de ferro.
- `behavior.doorSearchRadius`.
- Testes.

### Out of Scope

- **Fechar a porta atrás de si.**
- Botão, alavanca e placa de pressão — que é o que abriria porta de ferro.
- Baú, fornalha e o resto dos blocos interagíveis.
- Arrombar porta trancada: não existe porta trancada no Minecraft vanilla.
- Ligar `movements.canOpenDoors` — ver as descobertas acima.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| Domínio | Sim | `doors.ts` novo; `OPEN_DOOR` em `intent.ts` |
| Ações | Sim | `doors.ts` novo; adaptador `DoorWorld` |
| App (`bot.ts`) | Sim | Porta entra no vigia, antes do buraco |
| Comandos | Sim | Padrões de nível 1 |
| Prompt da IA | Sim | `OPEN_DOOR` no catálogo de ações |
| Configuração | Sim | `doorSearchRadius` |
| Repertório | Sim | `capacidades` cita a habilidade nova |
| Pathfinder (`client.ts`) | **Não** | `canOpenDoors` continua `false`, de propósito |
| Brincadeiras | Não | O vigia não roda com rodada em andamento |

## Architecture Considerations

- **Regra pura, efeito na borda**, como em `build.ts` e `escape.ts`: o domínio
  não conhece `mineflayer`.
- **O vigia reaproveita a infraestrutura da saída de buraco** — mesma detecção
  de "parado", mesma guarda de reentrada, mesma retomada do seguir.
- **Prioridade preservada**: a abertura usa `state.signal`, então `dudu, para`
  e a defesa cancelam.
- **Esconde-esconde intacto.** A garantia de "quem se lacrou não é achado" vem
  de o pathfinder não conseguir entrar; a sessão de jogo não abre portas, e o
  vigia não roda durante rodada. Abrir porta continua sendo decisão do jogador.

## Success Criteria

- [x] `dudu, abre a porta` abre a porta mais próxima, sem IA
- [x] Chamado com porta fechada no caminho, ele abre sozinho e continua vindo
- [x] Porta de ferro: explica que precisa de botão, e não tenta
- [x] Porta já aberta não é reaberta (senão ele a fecharia)
- [x] Clica na metade de baixo, nunca na de cima
- [x] Depois de clicar, confere se abriu mesmo
- [x] `dudu, para` cancela a abertura
- [x] `npm test` e `npx eslint src test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `activateBlock` recusado pelo servidor sem erro | Média | Médio | Relê o estado depois de clicar e fala a verdade |
| Bot abre porta e o pathfinder ainda não passa | Média | Médio | O seguir é reemitido depois de abrir, forçando recálculo |
| Abrir e fechar a mesma porta em sequência | Baixa | Alto | Só a metade de baixo conta; porta aberta nunca é reaberta |
| Abrir porta do vizinho por engano | Baixa | Baixo | Raio de busca curto (6) e só quando pedido ou travado |
| Falso positivo do vigia com porta longe do caminho | Média | Baixo | Só dispara com o bot parado há 6 s em `FOLLOW` |
| Abrir porta durante esconde-esconde entregar a criança | Baixa | Médio | O vigia não roda com rodada em andamento |

---

## Archive Information

**Archived:** 2026-08-29
**Outcome:** implementado; ver a ressalva de verificação abaixo

### Ressalva de verificação

Os cenários de **prova em jogo** do `tasks.md` **não foram verificados na sessão
que arquivou**. O arquivamento foi decisão do dono do projeto, em lote com os
outros changes de 2026-08-19.

A lógica está coberta por teste unitário; o que falta é a observação no mundo
aberto. Quem for mexer nesta área deve tratar esses cenários como não
confirmados.

### Nota sobre o merge

As seções `MODIFIED` foram mescladas **à mão**, requisito por requisito, com
conferência de cenários perdidos arquivo por arquivo. Neste projeto `MODIFIED` de
delta é **acréscimo**, não substituição — mesclar por script apaga cenário.
