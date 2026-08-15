# Delta: Repertório Local

**Change ID:** `add-bot-games-hide-and-seek`
**Affects:** `data/repertoire.yaml`, `src/dialogue/default-repertoire.yaml`, `src/dialogue/schema.ts`

---

## ADDED

### Requirement: Falas do esconde-esconde no catálogo

Todas as falas da rodada vivem no catálogo local, com no mínimo 4 variações cada.
São faladas por `Repertoire.say(entryId)`, sem casamento de padrão e sem IA.

| Entrada | Quando sai |
|---|---|
| `jogo_aceito` | o bot aceita o convite |
| `jogo_mande_contar` | o bot pede que o jogador feche o olho e conte |
| `jogo_pode_procurar` | o bot chegou ao esconderijo e liberou a procura |
| `jogo_fui_achado` | o jogador encostou nele |
| `jogo_me_entrego` | o jogador desistiu, ou o tempo acabou com o bot escondido |
| `jogo_contando_fim` | a contagem até 10 acabou e ele vai procurar |
| `jogo_busca_errada` | ele chegou a um dos pontos de busca falsa |
| `jogo_achei` | ele chegou perto do jogador depois de vê-lo |
| `jogo_nao_achei` | o tempo acabou sem achar |
| `jogo_sem_esconderijo` | não existe ponto válido para se esconder ali |
| `jogo_cancelado_monstro` | a defesa cancelou a rodada |
| `jogo_cancelado` | o jogador parou o jogo, ou um evento do mundo encerrou |
| `jogo_desconhecido` | o jogo pedido não está no registro |
| `jogo_desligado` | `games.enabled` é `false` |
| `jogo_ja_rolando` | convite chegando com rodada em andamento |

> `jogo_desligado` é separada de `jogo_desconhecido` de propósito: aquela
> **oferece** o esconde-esconde, e oferecer o que está desligado é prometer
> capacidade que o bot não tem. Ver `openspec/project.md` → "Público do bot".

#### Scenario: Toda entrada nova tem variação suficiente
- **GIVEN** o catálogo é carregado
- **WHEN** as entradas de jogo são validadas
- **THEN** cada uma tem ao menos `MIN_VARIATIONS_WARN` (4) respostas
- **AND** o load não emite nenhum aviso

#### Scenario: Fala de jogo nunca repete a anterior
- **GIVEN** o bot fala `jogo_busca_errada` na primeira busca falsa
- **WHEN** ele fala `jogo_busca_errada` de novo na segunda
- **THEN** a variação escolhida é diferente da anterior

#### Scenario: Linguagem de criança de 7 anos
- **GIVEN** qualquer fala nova do jogo
- **WHEN** ela chega ao chat
- **THEN** tem uma ou duas frases, palavra simples e tom de amigo
- **AND** não usa termo técnico (`pathfinder`, `timeout`, `raycast`, `sessão`)

#### Scenario: Derrota sem tristeza e sem discussão
- **GIVEN** o jogador encostou no bot escondido
- **WHEN** o bot fala `jogo_fui_achado`
- **THEN** a fala admite a derrota com graça e anima a jogar de novo
- **AND** nunca discute, nunca reclama e nunca corrige a criança

#### Scenario: Recusa honesta de jogo desconhecido
- **GIVEN** `Miguel` pede um jogo que o bot não conhece
- **WHEN** o bot fala `jogo_desconhecido`
- **THEN** ele diz que ainda não aprendeu esse
- **AND** oferece explicitamente o esconde-esconde
- **AND** não promete aprender depois

---

### Requirement: Contagem no chat

A contagem é gerada pela sessão, não é entrada de catálogo — são números, não
frases variáveis.

#### Scenario: Um número por mensagem
- **GIVEN** `countTo` é 10
- **WHEN** o bot conta
- **THEN** saem 10 mensagens no chat, de `1` a `10`
- **AND** o intervalo entre elas respeita `countIntervalMs`, com o piso de 900 ms
  do `ChatSender`

#### Scenario: Contagem cancelada
- **GIVEN** o bot está contando e vai em `4`
- **WHEN** a rodada é cancelada
- **THEN** nenhum número novo é enviado
- **AND** a fala de cancelamento sai normalmente

---

## MODIFIED

### Requirement: Cláusula `when` das respostas

O enum de estado da cláusula `when` passa a aceitar `GAME`, acompanhando
`BotState`.

#### Scenario: Variação condicionada ao jogo
- **GIVEN** uma resposta com `when: { state: GAME }`
- **WHEN** o catálogo é carregado
- **THEN** o schema aceita, sem erro de validação

#### Scenario: Variação de jogo não sai fora do jogo
- **GIVEN** uma variação condicionada a `state: GAME`
- **WHEN** o bot está em `IDLE` e a entrada é falada
- **THEN** essa variação não é escolhida

---

### Requirement: Entrada `capacidades`

O bot passa a saber brincar, e a resposta antiga promete menos do que ele faz.

#### Scenario: Perguntar o que ele sabe fazer
- **GIVEN** o esconde-esconde está implementado e `games.enabled` é `true`
- **WHEN** `Miguel` pergunta `o que voce sabe fazer`
- **THEN** ao menos uma variação da resposta cita brincar de esconde-esconde
- **AND** nenhuma variação promete jogo que o bot não tem

---

### Requirement: Duas cópias do catálogo em sincronia

Regra que já vale no projeto e que este change torna a errar mais caro, por
mexer em muitas entradas de uma vez.

#### Scenario: Fim da implementação
- **GIVEN** as entradas de jogo foram escritas em `data/repertoire.yaml`
- **WHEN** o change é dado por concluído
- **THEN** `src/dialogue/default-repertoire.yaml` está idêntico
- **AND** o `git diff` mostra a cópia versionada atualizada

---

## REMOVED

(Nenhum)
