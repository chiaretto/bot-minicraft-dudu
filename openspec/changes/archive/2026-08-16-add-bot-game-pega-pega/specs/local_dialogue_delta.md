# Delta: Repertório Local

**Change ID:** `add-bot-game-pega-pega`
**Affects:** catálogo de falas de jogo, falas que ofertam brincadeira

---

## ADDED

### Requirement: Falas do pega-pega no catálogo

Todas as falas da rodada vivem no catálogo local, com no mínimo 4 variações cada.
São faladas por `Repertoire.say(entryId)`, sem casamento de padrão e sem IA.

| Entrada | Quando sai |
|---|---|
| `pega_aceito_pego` | o bot aceita e avisa que vai contar antes de correr |
| `pega_aceito_fujo` | o bot aceita no papel de quem foge e já sai correndo |
| `pega_vou_pegar` | a contagem até 5 acabou e ele vai atrás |
| `pega_te_peguei` | ele encostou no jogador |
| `pega_cansei_pegando` | 60 s correndo atrás sem pegar; ele para e perde |
| `pega_fui_pego` | o jogador encostou nele enquanto fugia |
| `pega_cansei_fugindo` | 60 s fugindo; ele para e se deixa pegar |
| `pega_me_entrego` | o jogador desistiu e ele encerra a rodada |
| `jogo_qual_brincadeira` | convite genérico, sem nomear o jogo |

#### Scenario: Toda entrada nova tem variação suficiente
- **GIVEN** o catálogo é carregado
- **WHEN** as entradas `pega_*` são validadas
- **THEN** cada uma tem ao menos `MIN_VARIATIONS_WARN` (4) respostas
- **AND** o load não emite nenhum aviso

#### Scenario: Derrota por cansaço sem drama
- **GIVEN** o bot correu 60 s e não pegou o jogador
- **WHEN** ele fala `pega_cansei_pegando`
- **THEN** a fala admite a derrota com graça e anima a jogar de novo
- **AND** não reclama do jogador correr rápido demais, não discute e não corrige
- **AND** não fala de cansaço de um jeito que soe doente ou triste

#### Scenario: Entrega sem parecer defeito
- **GIVEN** o bot cansou de fugir e parou
- **WHEN** ele fala `pega_cansei_fugindo`
- **THEN** a fala deixa claro que ele **parou de propósito** e pode ser pego
- **AND** a criança entende que é para chegar perto, não que o bot travou

#### Scenario: Linguagem de criança de 7 anos
- **GIVEN** qualquer fala nova do pega-pega
- **WHEN** ela chega ao chat
- **THEN** tem uma ou duas frases, palavra simples e tom de amigo
- **AND** não usa termo técnico (`pathfinder`, `timeout`, `sprint`, `sessão`)

#### Scenario: Pergunta de escolha nomeia as duas
- **GIVEN** `Miguel` convidou sem dizer qual brincadeira
- **WHEN** o bot fala `jogo_qual_brincadeira`
- **THEN** a fala nomeia **esconde-esconde** e **pega-pega**
- **AND** é uma pergunta curta, respondível com duas palavras
- **AND** não promete nenhuma terceira brincadeira

---

## MODIFIED

### Requirement: Falas do esconde-esconde no catálogo

O requisito passa a valer para **as falas de jogo** em geral: as `jogo_*` comuns
aos dois jogos, mais as `pega_*` do pega-pega, mantendo o mínimo de 4 variações
por entrada.

As entradas que **ofertam** brincadeira mudam de conteúdo:

| Entrada | Como fica |
|---|---|
| `jogo_desconhecido` | oferece as **duas** brincadeiras, não só esconde-esconde |
| `jogo_desligado` | continua não oferecendo **nenhuma** — está tudo desligado |
| `jogo_ja_rolando` | continua igual, valendo para qualquer rodada em andamento |

> `jogo_desligado` segue separada de `jogo_desconhecido` de propósito: aquela
> **oferece**, e oferecer o que está desligado é prometer capacidade que o bot
> não tem. Ver `openspec/project.md` → "Público do bot".

#### Scenario: Recusa honesta de jogo desconhecido
- **GIVEN** `Miguel` pede um jogo que o bot não conhece
- **WHEN** o bot fala `jogo_desconhecido`
- **THEN** ele diz que ainda não aprendeu esse
- **AND** oferece explicitamente esconde-esconde **e** pega-pega
- **AND** não promete aprender depois

#### Scenario: Nenhuma fala trata esconde-esconde como a única
- **GIVEN** o catálogo inteiro depois deste change
- **WHEN** as falas que citam brincadeira são revisadas
- **THEN** nenhuma delas apresenta o esconde-esconde como a única coisa que o
  bot sabe brincar
- **AND** esconder uma capacidade nova é tão desonesto quanto prometer uma que
  não existe

---

### Requirement: Contagem no chat

A contagem é gerada pela sessão, não é entrada de catálogo — são números, não
frases variáveis. Vale para os dois jogos, com `countTo` próprio de cada um
(20 no esconde-esconde, 5 no pega-pega).

#### Scenario: Contagem curta do pega-pega
- **GIVEN** uma rodada de pega-pega no papel de quem pega
- **WHEN** a contagem roda
- **THEN** saem 5 mensagens, uma por número, respeitando `countIntervalMs`
- **AND** o piso de 900 ms do `ChatSender` continua valendo

---

## REMOVED

(None)
