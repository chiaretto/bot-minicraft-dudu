# Proposal: Pôr um bloco e cavar

**Change ID:** `add-place-and-dig`
**Created:** 2026-08-30
**Status:** Draft

---

## Problem Statement

Mais duas entradas de repertório que existem só para dizer que não:

- **`pedido_cavar`**, com nove padrões — é assunto recorrente. Em 19/08 a
  criança pediu `cave um buraco` e `cave um buraco de 10 blocos pra baixo`.
- **`pedido_soltar_item`**, criada depois de a IA dizer que tinha posto o bloco
  — e não ter posto.

Cavar é a operação que o bot mais faz (toda coleta é um `dig`) e a única que ele
não faz **quando pedem**.

## Proposed Solution

Duas intenções: `PLACE_BLOCK`, que põe **um** bloco à frente, e `DIG`, com
catálogo fechado de duas formas.

| Forma | O que é | Blocos |
|---|---|---|
| `buraco` | poço 2x2 e 2 de fundo, à frente do bot | 8 |
| `tunel` | passagem de 1 de largura, 2 de altura, 4 de comprimento | 8 |

### A regra que decide o desenho: ele nunca cava embaixo dos próprios pés

Cavar para baixo é o jeito mais rápido de o bot se enterrar — ele cai no buraco
que acabou de abrir, e sair de lá é **outro comando** (`ESCAPE_HOLE`), que
depende de a criança estar por perto e visível.

Por isso a planta nasce **à frente** dele, a dois blocos de folga do corpo. E
por isso `cava pra baixo` também vira o poço à frente: é a leitura segura do
pedido, e o resultado é o mesmo buraco que a criança queria ver.

`isUnderBot()` é a rede de segurança, checada antes do primeiro golpe: nenhuma
posição da planta pode ser a coluna do bot.

### Três recusas antes do primeiro golpe

Descobrir no meio é pior do que recusar na hora:

1. **Lava ou água encostada** em qualquer alvo. Um buraco meio aberto ao lado de
   lava é o pior dos dois mundos.
2. **Obra maior que `digMaxBlocks`.**
3. **A coluna do bot na planta**, que não deveria acontecer e por isso mesmo é
   checada.

Depois disso, bloco que ele não consegue levar é **pulado em silêncio**: o
buraco sai menor, e isso é melhor do que parar no meio com a criança olhando.

### O que ele nunca cava

Catálogo `NEVER_DIG`: bedrock, obsidiana, e as **coisas da criança** — baú,
fornalha, bancada, cama, spawner. A allowlist de coleta já limita muito; esta
lista é a segunda tranca, e é sobre não estragar o que ela construiu.

## Scope

### In Scope

- `domain/digging.ts`: catálogo, direção cardeal, plantas e as guardas — puro.
- `behaviors/actions/dig.ts`: a escavação, com mundo por interface estreita.
- `placeBlockAhead()`, reusando o adaptador da obra.
- `PLACE_BLOCK` e `DIG` no catálogo de intenções e no prompt.
- Padrões em `commands.ts`; `pedido_cavar` **removida** e `pedido_soltar_item`
  reescrita para cobrir só o que ele continua sem fazer.
- `digMaxBlocks` na configuração.
- Testes.

### Out of Scope

- **Cavar até achar minério.** Mineração é outro projeto: exige descer, iluminar
  e voltar. O túnel de 4 é uma passagem, não uma mina.
- **Profundidade pedida** ("cava 10 blocos pra baixo"). Número no pedido vira
  parâmetro com teto e, no caso de cavar, com risco: 10 blocos para baixo é o
  bot no fundo de um poço.
- **Encher o buraco de novo.** `PLACE_BLOCK` põe um bloco por pedido.
- **Largar item solto no chão.** Continua fora, e `pedido_soltar_item` continua
  dizendo isso — agora só sobre item, não sobre bloco.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `domain/digging.ts` | **Novo** | Catálogo, direção, plantas, guardas |
| `behaviors/actions/dig.ts` | **Novo** | Escavação com mundo estreito |
| `behaviors/actions/index.ts` | Sim | `placeBlockAhead`, `digWorldFrom`, `dig` |
| `domain/intent.ts` | Sim | Duas intenções, e `shape` no schema da IA |
| `behaviors/commands.ts` | Sim | 25 padrões |
| `config/schema.ts` | Sim | `digMaxBlocks` |
| Repertório (as **duas** cópias) | Sim | Uma entrada removida, uma reescrita |

## Architecture Considerations

- **Mesma forma de sempre:** geometria pura no domínio, regra com mundo estreito
  na ação, adaptador de `mineflayer` num lugar só. É o terceiro módulo assim
  (`build`, `escape`, agora `dig`).
- **Catálogo fechado** de formas, como plantas e jogos.
- **Duas trancas na destruição:** a allowlist de coleta diz o que ele pode
  quebrar; `NEVER_DIG` diz o que ninguém quebra. A segunda existe porque a
  primeira pode ser afrouxada por configuração.

## Success Criteria

- [ ] `cava um buraco` abre um poço à frente, e o bot continua em pé
- [ ] `cava um tunel` abre passagem de dois de altura
- [ ] `poe um bloco aqui` põe um bloco à frente
- [ ] Com lava por perto ele recusa **antes** de cavar
- [ ] Nenhuma planta inclui a coluna do bot, em nenhuma das quatro direções
- [ ] `npm test` e `npx eslint src test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| O bot cair no buraco que abriu | Média sem guarda | **Alto** | Planta à frente + `isUnderBot` travado por teste nas quatro direções |
| Cavar ao lado de lava | Média | **Alto** | Recusa antes do primeiro golpe |
| Estragar construção da criança | Média | Alto | Allowlist de coleta + `NEVER_DIG` |
| Buraco sair menor que o pedido | Alta | Baixo | É o desenho: bloco duro é pulado, e a fala diz que faltou |
| `cava pra baixo` não cavar para baixo | Alta | Baixo | Vira poço à frente, que é o mesmo buraco sem o bot dentro |
