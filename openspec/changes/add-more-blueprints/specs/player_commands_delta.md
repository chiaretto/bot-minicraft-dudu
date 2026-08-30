# Delta: Comandos do jogador

**Change ID:** `add-more-blueprints`
**Affects:** `domain/blueprints.ts`, `behaviors/actions/build.ts`,
`behaviors/commands.ts`

---

## ADDED

### Requirement: Catálogo de plantas com seis estruturas

`STRUCTURE_NAMES` passa a ter `casa`, `torre`, `piscina`, `ponte`, `escada` e
`cerca`. Continua fechado: nome fora da lista nunca vira obra.

As quatro novas foram escolhidas por serem **distintas entre si** — nada de
variação de tamanho da mesma caixa.

| Planta | Forma | Blocos |
|---|---|---|
| `piscina` | Bacia 5x5, fundo fechado e borda de 1, **sem tampa** | 41 |
| `ponte` | Passarela 3x9 com guarda-corpo dos dois lados | 45 |
| `escada` | Escadaria de 5 degraus, 2 de largura, subindo em cheio | 30 |
| `cerca` | Curral 7x7 de 2 de altura, com um vão de portão | 46 |

#### Scenario: Piscina é bacia, não caixa fechada
- **GIVEN** a planta da `piscina`
- **WHEN** ela é gerada
- **THEN** o fundo é uma laje 5x5 inteira
- **AND** a borda tem 1 bloco de altura em todo o perímetro
- **AND** **não** existe bloco nenhum por cima: piscina com tampa não é piscina

#### Scenario: Ponte tem por onde andar e de onde não cair
- **GIVEN** a planta da `ponte`
- **WHEN** ela é gerada
- **THEN** o tabuleiro tem 3 de largura por 9 de comprimento, todo no mesmo nível
- **AND** os dois lados têm guarda-corpo de 1 bloco
- **AND** o meio do tabuleiro fica livre em toda a extensão

#### Scenario: Escada sobe de verdade
- **GIVEN** a planta da `escada`
- **WHEN** ela é gerada
- **THEN** cada degrau é 1 bloco mais alto que o anterior
- **AND** o degrau é maciço até o chão, para não ficar degrau flutuando
- **AND** ela tem 2 de largura, para a criança subir sem cair na beirada

#### Scenario: Cerca é curral com portão
- **GIVEN** a planta da `cerca`
- **WHEN** ela é gerada
- **THEN** o perímetro 7x7 tem 2 blocos de altura
- **AND** existe um vão de 1 bloco de largura, da altura inteira, para entrar
- **AND** o miolo fica vazio: é onde os bichos ficam

#### Scenario: Planta fora do catálogo continua recusada
- **GIVEN** a criança pede `castelo`
- **WHEN** o pedido é avaliado
- **THEN** nenhuma obra começa
- **AND** o bot recusa com educação, como já fazia

---

### Requirement: Cada obra termina com a fala dela

A planta carrega duas frases junto da geometria: a de obra completa
(`finishedLine`) e a de obra parcial (`partialLine`). Ficam ali, e não num mapa
em outro arquivo, para a planta nova nascer completa — mapa paralelo é o que
alguém esquece de estender.

A frase de fracasso total continua sendo uma só: quando nada foi levantado, não
há obra sobre a qual falar.

#### Scenario: A piscina é honesta sobre a água
- **GIVEN** a bacia da piscina ficou pronta
- **WHEN** o bot fala
- **THEN** ele avisa que falta jogar água com o balde
- **AND** a razão é que ele não tem balde, e prometer piscina cheia seria
  quebrar a regra número um

#### Scenario: Nenhuma fala convida a entrar onde não se entra
- **GIVEN** as falas de conclusão das seis plantas
- **WHEN** cada uma é lida
- **THEN** nenhuma manda "entrar pra ver" numa escada, numa ponte ou numa
  piscina
- **AND** cada fala combina com a coisa que acabou de ficar de pé

#### Scenario: Obra pela metade fala da obra certa
- **GIVEN** faltaram pedaços da ponte
- **WHEN** o bot fala
- **THEN** a frase é a `partialLine` da ponte
- **AND** ela não promete que a ponte está atravessável

---

### Requirement: As quatro plantas novas no parser

Cada estrutura nova tem padrão determinístico em `commands.ts`, com os apelidos
que a criança usa de verdade: `curral` para a cerca, `escadinha`, `pontezinha`,
`piscininha`.

#### Scenario: Pedido direto vira obra sem IA
- **GIVEN** o provider está em `none`
- **WHEN** a criança digita `dudu, faz uma piscina`
- **THEN** o parser devolve `BUILD` com `structure: 'piscina'`
- **AND** nenhuma chamada de IA acontece

#### Scenario: O apelido vale igual
- **GIVEN** a criança digita `faz um curral`
- **WHEN** o parser lê
- **THEN** a intenção é `BUILD` com `structure: 'cerca'`

#### Scenario: Os pedidos antigos continuam onde estavam
- **GIVEN** `faz uma casa` e `faz uma torre`
- **WHEN** o parser lê
- **THEN** as duas caem no `BUILD` de sempre
- **AND** nenhum padrão novo rouba frase de entrada do repertório

---

## MODIFIED

### Requirement: Construir coisa simples

O requisito continua valendo inteiro — âncora que não enterra a criança, obra
que nunca derruba o que já existe, material escolhido pelo que há na mochila,
obra interrompível. O que muda é **quantas** plantas existem: duas viram seis.

#### Scenario: O catálogo cresce sem mexer no contrato da IA
- **GIVEN** uma planta nova entra em `STRUCTURE_NAMES`
- **WHEN** o schema entregue ao provider é montado
- **THEN** ela aparece no enum automaticamente
- **AND** ninguém precisa editar o schema nem o prompt à mão

---

## REMOVED

(None)
