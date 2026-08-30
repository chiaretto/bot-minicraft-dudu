# Implementation Tasks: A mochila do Dudu na janela

**Change ID:** `add-launcher-inventory`
**Implementado:** 2026-08-30 — falta prova com a janela aberta

> A ordem tinha um motivo: o catálogo de nomes veio primeiro porque **as quatro
> falas do chat dependiam dele e o painel também**. Fazer o painel antes
> deixaria a janela dizendo "carne assada" enquanto o chat dizia `cooked_beef`.

---

## Fase 1: O vocabulário

- [x] 1.1 `domain/item-names.ts` com `ITEM_NAMES` e `friendlyItemName(id)`
- [x] 1.2 Cobertura: blocos de obra e coleta, a comida de `FOOD_ITEMS`, tocha,
      as 16 camas, ferramenta, arma, balde
- [x] 1.3 Item fora do catálogo devolve o próprio id
- [x] 1.4 10 testes, incluindo a cobertura cruzada com `FOOD_ITEMS`,
      `buildAllowlist` e `collectAllowlist`

**Quality Gate: PASSOU**
- [x] Todo item que o bot come, equipa ou usa em obra tem nome em português
- [x] Nenhum nome traduzido contém `_`

---

## Fase 2: As quatro falas do chat

- [x] 2.1 `dropItemToOwner`: entrega e recusa
- [x] 2.2 `equipItem`: confirmação e recusa
      - A confirmação também mudou de forma: `"Equipei iron_sword!"` virou
        `"Peguei espada de ferro, tá na minha mão!"` — "equipei" é palavra de
        adulto, e a regra número um vale para o verbo também.
- [x] 2.3 Testes com um bot falso mínimo, provando que o id não chega ao chat

**Quality Gate: PASSOU**
- [x] Varredura por `[a-z]_[a-z]` nas falas de item

---

## Fase 3: O canal

- [x] 3.1 `INVENTORY_PREFIX` e `formatInventory()`
- [x] 3.2 `sendInventory()` engolindo repetição, comparando a linha inteira
- [x] 3.3 `groupItems()` no domínio: soma as pilhas e junta pelo nome que a
      criança lê
      - Não estava na proposta e apareceu na implementação: a mochila do jogo
        vem **por slot**, então três pilhas de carvalho seriam três linhas de
        "madeira 64". Agrupar no bot também melhora a dedup — trocar item de
        slot deixa de gerar linha nova.
- [x] 3.4 `onInventory()` no bot, na carona do laço dos instintos
- [x] 3.5 `main.ts` liga um ao outro
- [x] 3.6 Testes: sem supervisor não sai nada; igual não vira linha; vazia vira

**Quality Gate: PASSOU**
- [x] Mochila repetida três vezes gera **uma** linha

---

## Fase 4: O launcher entende

- [x] 4.1 `parseLine` reconhece a linha; JSON quebrado cai como log
- [x] 4.2 Item malformado é descartado e o resto passa
- [x] 4.3 `onInventory` opcional no runner
- [x] 4.4 Limpa no `onExit` — que cobre parada e queda

**Quality Gate: PASSOU**

---

## Fase 5: A regra do painel, pura

- [x] 5.1 `launcher/src/inventory.ts`: corte no teto e "e mais N coisas"
- [x] 5.2 Mochila vazia devolve o texto de vazia
- [x] 5.3 12 testes, sem abrir janela

**Quality Gate: PASSOU** — a política toda testada fora da janela, como
`voice.ts`

---

## Fase 6: A janela

- [x] 6.1 Painel na tela da criança, fora de "Coisas de adulto"
- [x] 6.2 Só aparece com mochila; some quando o bot sai
- [x] 6.3 Discreto: os botões continuam sendo o que salta

**Quality Gate: PASSOU** — `tsc` limpo nos dois pacotes

---

## Fase 7: Validação

- [x] 7.1 `npm test` (981) e `launcher: vitest` (88) limpos, quatro rodadas
      seguidas
- [ ] 7.2 Em jogo: pedir madeira e ver o painel mudar
- [ ] 7.3 Em jogo: `dudu, me da madeira` e conferir a fala em português
- [ ] 7.4 Em jogo: parar o bot e ver o painel limpar
- [ ] 7.5 Construir uma casa e conferir que o canal não encheu

**Quality Gate: PENDENTE** — 7.2 a 7.5 não observados: exigem o jogo e a janela
do Electron abertos.

### Dois consertos de fora do escopo, feitos porque bloqueavam a verificação

- **`dist/` estava velho** (de 20/08). O `module-loading.test.ts` sobe um Node
  de verdade sobre o `dist/` para pegar erro de ESM que o vitest esconde — e
  estava validando código de dez dias atrás. Rodei `npm run build`: os módulos
  novos (`item-names`, `digging`, `survival`, `sleeping`, `hot-cold`) passaram a
  ser carregados de verdade, e passam.
- **Dois testes instáveis sob carga**, que falhavam ~1 em 3 rodadas completas e
  atrapalhavam confiar no verde:
  - `log-file.test.ts` dormia 50 ms esperando o pino esvaziar (era meu, de
    ontem). Virou espera ativa com prazo.
  - `module-loading.test.ts` usava o prazo padrão de 5 s do vitest para testes
    que **sobem um processo Node** e importam `mineflayer`. Agora têm prazo
    próprio de 30 s.

---

## Completion Checklist

- [x] Fases 1 a 6 completas
- [x] README: o painel na seção do aplicativo
- [x] `CLAUDE.md`: o protocolo agora tem três canais, com a tabela de ritmos
- [ ] Prova com a janela aberta antes de `/openspec-archive`
