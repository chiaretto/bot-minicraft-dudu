# Implementation Tasks: Quatro plantas novas

**Change ID:** `add-more-blueprints`
**Implementado:** 2026-08-30 — fases 1 a 5 completas; fase 6 **pendente de prova
em jogo**

---

## Fase 1: Geometria

- [x] 1.1 `STRUCTURE_NAMES` ganha `piscina`, `ponte`, `escada`, `cerca`
- [x] 1.2 Gerador de cada planta, com a ordem de colocação pensada
      - `PLANS` deixou de ser um `Record` de parâmetros e virou um `Record` de
        **geradores**. A caixa com telhado (casa e torre) ficou no `planRoom`,
        intacta; cada planta nova traz a própria ordem.
- [x] 1.3 `finishedLine` e `partialLine` por estrutura, junto da geometria
- [x] 1.4 `casa` e `torre` saem intactas
- [x] 1.5 Testes de forma das quatro novas (20 testes)

**Quality Gate: PASSOU**
- [x] O invariante de apoio passa para as seis — o teste já rodava para todo o
      catálogo, então as quatro novas nasceram cobertas
- [x] "De baixo para cima" passa para as seis
- [x] Maior planta nova: 46 blocos (teto do teste: 80; teto de config: 120)
- [x] Nenhuma repete posição

---

## Fase 2: A obra fala certo

- [x] 2.1 `build.ts` usa `finishedLine` e `partialLine` da planta
- [x] 2.2 A frase de falha total continua uma só
- [x] 2.3 Teste: as quatro novas terminam com a fala delas

**Quality Gate: PASSOU**
- [x] Teste trava que `piscina`, `ponte` e `escada` **não** dizem "entra"
- [x] Teste trava que a fala da piscina fala em água e balde
- [x] Fala de fim limitada a 70 caracteres, por planta

---

## Fase 3: Como a criança pede

- [x] 3.1 Padrões das quatro em `commands.ts`
- [x] 3.2 `repertoire:check` com as frases antigas
- [x] 3.3 Testes do parser

### Decisão: a palavra "escada" já tinha dono

`faz uma escada` e `faz uma escadinha` são padrões de **`ESCAPE_HOLE`** desde
`add-escape-hole` — é assim que quem caiu num buraco pede socorro.

O log deu a saída: a criança pediu obra com o verbo **"construa"**
(`construa uma piscina`, 29/08). Então a escadaria ficou com a família do verbo
de obra (`constroi`, `construa`, `monta`, `quero`, `me faz`), e as frases
ambíguas continuam sendo socorro. Perder uma escadaria é chato; ficar preso num
buraco é pior. Está travado por teste e escrito como comentário no `commands.ts`.

**Quality Gate: PASSOU**
- [x] `faz uma casa`, `faz uma torre`, `faz uma escada` e `sobe` caem onde caíam
- [x] `cava um buraco`, `fiz uma escada`, `constroi um castelo` e `faz uma pocao`
      continuam no repertório — nenhum padrão novo roubou frase

---

## Fase 4: A IA sabe o que ele sabe

- [x] 4.1 O catálogo de estruturas do prompt sai de `STRUCTURE_NAMES`
      - Eram **dois** lugares escritos à mão, não um: a descrição de `BUILD` e a
        linha de identidade ("construir casinha e torre"). Os dois passaram a
        ser gerados.
- [x] 4.2 Teste que prova que toda planta do catálogo aparece no prompt

**Quality Gate: PASSOU**
- [x] O prompt cita as seis
- [x] A descrição de `BUILD` avisa que a piscina sai vazia, para a IA não
      prometer água

---

## Fase 5: Nenhuma promessa desatualizada

- [x] 5.1 Varridas as seis falas (e um comentário) que diziam "casinha e torre"
- [x] 5.2 Reescritas sem virar lista comprida — só `capacidades`, cujo trabalho
      é justamente enumerar, cita as seis numa frase; as outras citam uma ou
      duas e convidam
- [x] 5.3 `npm run repertoire:sync` nas duas cópias
- [x] 5.4 README: tabela de comandos, seção de construir, e os dois avisos
      (piscina vazia, `faz uma escada` é socorro)

**Quality Gate: PASSOU**
- [x] `repertoire:sync -- --check` diz `iguais`
- [x] `grep` não acha mais nenhuma fala prometendo só casa e torre
- [x] 79 entradas, 388 respostas carregadas sem aviso

---

## Fase 6: Validação

- [x] 6.1 `npm test` (853 testes) e `npx eslint src test` limpos
- [x] 6.2 `repertoire:check` com as frases das quatro plantas
- [ ] 6.3 Em jogo: pedir cada uma das quatro e ver de pé
- [ ] 6.4 Em jogo: a piscina aceita água de balde sem vazar

**Quality Gate: PENDENTE**
- [x] Cenários de geometria, fala e parser cobertos por teste
- [ ] 6.3 e 6.4 observados no mundo aberto

> As duas provas em jogo não foram feitas — o bot não subiu nesta sessão. A
> 6.4 importa mais do que parece: a bacia é testada como geometria, mas só a
> água mostra se a borda segura.

---

## Completion Checklist

- [x] Fases 1 a 5 completas
- [x] Repertório sincronizado nas duas cópias
- [x] `BACKLOG.md`: item 3 marcado
- [ ] Prova em jogo antes de `/openspec-archive`
