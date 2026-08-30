# Especificação: Repertório Local de Conversa

**Componente:** `local_dialogue`
**Origem:** `add-minecraft-companion-bot` (2026-08-15)
**Atualizado por:** `add-collect-and-build`, `ai-reply-with-action`, `ask-game-role`, `fix-harvest-and-gather` (2026-08-19),
`add-bot-games-hide-and-seek` (2026-08-15),
`add-bot-game-pega-pega` (2026-08-16)

> Este é o **nível 2** da cascata de resolução: roda depois do parser de comandos
> e antes do provider de IA. Nenhum cenário deste arquivo faz chamada de rede.
>
> Convenção de nomes: `Dudu` é o **bot**, `Miguel` é o **jogador dono**.

---

## Requisitos

### Requirement: Cascata de resolução de mensagens

Toda mensagem do dono passa por **quatro** níveis, em ordem. Cada nível só
entrega ao seguinte o que não conseguiu resolver.

**Ordem:** parser de comandos → **comandos aprendidos** → repertório local →
provider de IA

O nível de comandos aprendidos (`learned_commands`) entrou em
`add-learned-commands`, e fica onde fica por dois motivos. Primeiro, ele produz
**ação**, e ação tem precedência sobre conversa — o mesmo motivo que põe o parser
antes do repertório. Segundo, o conflito com o repertório é raro por construção:
frase que o repertório responde nunca chega à IA, então nunca chega a ser
aprendida.

O parser de regex continua ganhando de todos: o que um humano escreveu vale mais
que o que o bot deduziu.

Desde `fix-chat-noise-and-learned-quality`, o que muda não é a ordem e sim **o
que entra na cascata**: retorno de comando do jogo é cortado na borda e nunca
chega ao nível 1 (`minecraft_connection` → "Retorno de comando do jogo não é
fala de jogador"). Antes, `Set own game mode to Creative Mode]` descia os quatro
níveis, não casava com nada e terminava numa chamada de IA — que respondia com
entusiasmo a uma frase que o Minecraft escreveu.

#### Scenario: Eco de sistema não desce a cascata
- **GIVEN** o dono usa um comando do jogo
- **WHEN** o servidor devolve o retorno
- **THEN** nenhum nível da cascata é consultado
- **AND** o bot não fala nada

Desde `ai-reply-with-action`, o que muda é o que o **nível 3** é capaz de
devolver: além da fala, ele pode trazer uma ação a executar.

| Nível | Devolve |
|---|---|
| 1. comando (regex) | ação |
| 1.5. comando aprendido | ação |
| 2. repertório local | fala |
| 3. IA | fala **e**, quando for pedido, ação |

Os níveis 1 e 2 não mudam em nada: o 1 continua funcionando com a IA desligada, e
o 2 continua respondendo sem sair da máquina.

#### Scenario: Comando tem precedência sobre o aprendido e sobre o repertório
- **GIVEN** o dono digita `dudu, me segue`
- **AND** existe uma entrada aprendida que também casaria com essa frase
- **WHEN** a mensagem é roteada
- **THEN** o parser de comandos resolve e o bot entra em `FOLLOW`
- **AND** o histórico de aprendidos não é consultado
- **AND** o repertório não é consultado
- **AND** o provider de IA não é chamado

#### Scenario: Aprendido tem precedência sobre o repertório
- **GIVEN** o histórico tem `pega umas madeirinhas` → `COLLECT_BLOCK madeira 8`
- **WHEN** o dono digita `dudu, pega umas madeirinhas`
- **THEN** o comando aprendido resolve e a coleta começa
- **AND** o repertório não é consultado
- **AND** o provider de IA não é chamado

#### Scenario: Aprendido declina e o repertório assume
- **GIVEN** nenhuma entrada aprendida atinge `learned.minConfidence`
- **WHEN** a mensagem continua descendo
- **THEN** o repertório é consultado normalmente

#### Scenario: Repertório resolve sem chamar a IA
- **GIVEN** o dono digita `dudu, oi`
- **AND** nem o parser nem o histórico de aprendidos reconhecem
- **WHEN** a mensagem chega ao repertório
- **THEN** uma resposta de saudação é escolhida e enviada ao chat
- **AND** o provider de IA **não** é chamado
- **AND** a resposta chega ao chat em menos de 100 ms

#### Scenario: Sem match, cai para a IA
- **GIVEN** o dono digita `dudu, você acha que existe vida em outro planeta?`
- **AND** nenhum nível anterior resolveu
- **WHEN** a mensagem termina de descer a cascata
- **THEN** o provider de IA é chamado no modo de conversa
- **AND** a resposta da IA é enviada ao chat

#### Scenario: Match fraco prefere a IA
- **GIVEN** o limiar de confiança é `0.7`
- **AND** a melhor entrada do repertório pontuou `0.4`
- **WHEN** o repertório avalia a mensagem
- **THEN** o repertório declina
- **AND** a mensagem segue para o provider de IA

#### Scenario: Cascata de três níveis com o aprendizado desligado
- **GIVEN** `learned.enabled` é `false`
- **WHEN** qualquer mensagem é roteada
- **THEN** a ordem é parser → repertório → IA
- **AND** o comportamento é idêntico ao de antes de `add-learned-commands`

---

### Requirement: Catálogo em arquivo de dados

O repertório vive em `data/repertoire.yaml`, fora do código, e pode ser editado
sem recompilar nada.

#### Scenario: Carregamento na inicialização
- **GIVEN** `data/repertoire.yaml` existe e é válido
- **WHEN** o bot inicializa
- **THEN** o catálogo é carregado, validado por schema e indexado em memória
- **AND** o log registra quantas entradas e quantas respostas foram carregadas

#### Scenario: Catálogo com YAML inválido
- **GIVEN** `data/repertoire.yaml` tem erro de sintaxe
- **WHEN** o bot inicializa
- **THEN** o bot recusa iniciar
- **AND** exibe o arquivo, a linha e o erro

#### Scenario: Entrada sem resposta nenhuma
- **GIVEN** uma entrada do catálogo tem `responses: []`
- **WHEN** o schema é validado
- **THEN** o bot recusa iniciar
- **AND** aponta o `id` da entrada defeituosa

#### Scenario: Entrada com menos de 4 variações
- **GIVEN** uma entrada tem apenas 2 respostas
- **WHEN** o schema é validado
- **THEN** o bot inicia normalmente
- **AND** registra um aviso citando o `id`, para não deixar o bot repetitivo

#### Scenario: Catálogo ausente
- **GIVEN** `data/repertoire.yaml` não existe
- **WHEN** o bot inicializa
- **THEN** o bot copia o catálogo padrão embarcado para esse caminho
- **AND** segue a inicialização normalmente

---

### Requirement: Normalização e casamento de padrões

O texto do jogador é normalizado antes do casamento, para tolerar como uma
criança realmente digita.

#### Scenario: Ignorar caixa, acento e pontuação
- **GIVEN** a entrada `saudacao` casa com `ola`
- **WHEN** o dono digita `OLÁ!!!`
- **THEN** o texto normaliza para `ola`
- **AND** a entrada casa

#### Scenario: Ignorar o vocativo do bot
- **GIVEN** o nome do bot é `Dudu`
- **WHEN** o dono digita `dudu, oi` ou `oi dudu`
- **THEN** o vocativo é removido antes do casamento
- **AND** ambos casam com a mesma entrada de saudação

#### Scenario: Tolerar letra repetida
- **GIVEN** a entrada `saudacao` casa com `oi`
- **WHEN** o dono digita `oiiiiii`
- **THEN** a repetição é reduzida na normalização
- **AND** a entrada casa

#### Scenario: Entrada mais específica vence
- **GIVEN** `quem e voce` casa com a entrada `identidade`
- **AND** `quem te criou` casa com a entrada `origem`
- **WHEN** o dono digita `quem te criou?`
- **THEN** a entrada `origem` vence, por ser o padrão mais específico

---

### Requirement: Variação de respostas

O bot nunca repete a mesma resposta duas vezes seguidas para a mesma entrada.

#### Scenario: Três saudações seguidas, três respostas diferentes
- **GIVEN** a entrada `saudacao` tem 6 respostas
- **WHEN** o dono digita `oi` três vezes seguidas
- **THEN** as três respostas são diferentes entre si

#### Scenario: Não repetir a última usada
- **GIVEN** a entrada `saudacao` tem exatamente 2 respostas, e a última usada foi a `#1`
- **WHEN** a entrada é acionada de novo
- **THEN** a resposta `#2` é escolhida

#### Scenario: Histórico de uso reinicia por entrada
- **GIVEN** todas as respostas de uma entrada já foram usadas
- **WHEN** a entrada é acionada de novo
- **THEN** o ciclo recomeça, ainda evitando repetir a imediatamente anterior

---

### Requirement: Placeholders com contexto

As respostas aceitam placeholders resolvidos na hora do envio.

#### Scenario: Nome do dono e do bot
- **GIVEN** a resposta é `Oi {owner}! Sou eu, o {botName}!`
- **AND** `ownerPlayer` é `Miguel` e `persona.name` é `Dudu`
- **WHEN** a resposta é enviada
- **THEN** o chat recebe `Oi Miguel! Sou eu, o Dudu!`

#### Scenario: Frase de origem vinda da config
- **GIVEN** `persona.originStory` é `Seu pai me criou pra jogar com você!`
- **AND** a entrada `origem` usa o placeholder `{originStory}`
- **WHEN** o dono pergunta `quem te criou?`
- **THEN** a resposta enviada contém exatamente essa frase

#### Scenario: Dados do mundo no placeholder
- **GIVEN** a resposta é `Tô com {health} de vida!`
- **AND** a vida atual do bot é 14
- **WHEN** a resposta é enviada
- **THEN** o chat recebe `Tô com 14 de vida!`

#### Scenario: Placeholder desconhecido
- **GIVEN** uma resposta usa `{coisaQueNaoExiste}`
- **WHEN** o catálogo é validado na inicialização
- **THEN** o bot recusa iniciar, citando o `id` da entrada e o placeholder inválido

---

### Requirement: Respostas condicionais ao contexto

Uma entrada pode ter variantes válidas só em certos estados ou momentos.

#### Scenario: Saudação sensível à hora do jogo
- **GIVEN** a entrada `saudacao` tem variantes com `when: { timeOfDay: night }`
- **WHEN** o dono digita `oi` durante a noite no jogo
- **THEN** só as variantes noturnas entram no sorteio

#### Scenario: "O que você está fazendo" depende do estado
- **GIVEN** o bot está em `STAY`
- **WHEN** o dono pergunta `o que você tá fazendo?`
- **THEN** a resposta escolhida é a variante de `STAY`
  (ex.: `Tô de guarda aqui, igual você mandou!`)

#### Scenario: Nenhuma variante compatível com o contexto
- **GIVEN** todas as variantes de uma entrada exigem `state: DEFEND`
- **AND** o bot está em `IDLE`
- **WHEN** a entrada seria acionada
- **THEN** o repertório declina e a mensagem segue para o provider de IA

O enum de estado da cláusula `when` acompanha `BotState`, incluindo `GAME`.

#### Scenario: Variação condicionada ao jogo
- **GIVEN** uma resposta com `when: { state: GAME }`
- **WHEN** o catálogo é carregado
- **THEN** o schema aceita, sem erro de validação

#### Scenario: Variação de jogo não sai fora do jogo
- **GIVEN** uma variação condicionada a `state: GAME`
- **WHEN** o bot está em `IDLE` e a entrada é falada
- **THEN** essa variação não é escolhida

---

### Requirement: Falas espontâneas por evento do jogo

> **2026-08-30:** três entradas espontâneas entraram (`evento_fome`,
> `evento_tocha`) ou **voltaram a existir de fato** (`evento_dono_morreu`).
>
> A última é a lição: ela existia desde 15/08, prometia *"eu marquei onde foi,
> viu?"* e **nunca era dita** — nenhum código a disparava. Era uma promessa
> silenciosa de uma capacidade que o bot não tinha. Entrada de repertório que
> ninguém dispara é entrada morta, e entrada morta que promete é pior.

Alguns acontecimentos disparam fala do repertório sem o jogador ter dito nada.

#### Scenario: Anoiteceu
- **GIVEN** o bot está no mundo e `dialogue.spontaneous` é `true`
- **WHEN** o jogo passa para a noite
- **THEN** o bot fala uma variante da entrada `evento_anoiteceu`
- **AND** o provider de IA não é chamado

#### Scenario: O dono morreu
- **GIVEN** o bot está acompanhando o dono
- **WHEN** o dono morre
- **THEN** o bot fala uma variante da entrada `evento_dono_morreu`

#### Scenario: Falas espontâneas têm cooldown
- **GIVEN** o bot acabou de falar uma fala espontânea
- **WHEN** outro evento espontâneo dispara dentro do cooldown configurado
- **THEN** a fala é suprimida, para o bot não virar spam de chat

#### Scenario: Falas espontâneas desligadas
- **GIVEN** `dialogue.spontaneous` é `false`
- **WHEN** anoitece
- **THEN** o bot não fala nada

---

### Requirement: Coerência entre repertório e IA

A IA não pode contradizer o que o repertório afirma sobre a identidade do bot.

#### Scenario: Fatos de identidade injetados no prompt da IA
- **GIVEN** o repertório define nome, origem e capacidades do bot
- **WHEN** o system prompt do provider é montado
- **THEN** esses fatos entram no prompt como verdades fixas
- **AND** o prompt instrui a IA a não inventar outra história de origem

#### Scenario: Pergunta de origem reformulada cai na IA
- **GIVEN** o dono digita `me conta direitinho como você surgiu no mundo`
- **AND** o repertório não atinge o limiar de confiança
- **WHEN** o provider responde
- **THEN** a resposta é coerente com `persona.originStory`

---

### Requirement: Configuração do repertório

O bloco `dialogue` da configuração parametriza o comportamento.

#### Scenario: Valores padrão
- **GIVEN** `config.yaml` não traz o bloco `dialogue`
- **WHEN** o bot inicializa
- **THEN** vale o padrão: `enabled: true`, `minConfidence: 0.7`,
  `catalogPath: "data/repertoire.yaml"`, `spontaneous: true`,
  `spontaneousCooldownMs: 60000`

#### Scenario: Repertório desligado
- **GIVEN** `dialogue.enabled` é `false`
- **WHEN** o dono digita `oi`
- **THEN** o repertório é pulado e a mensagem vai direto para o provider de IA

---

### Requirement: Falas das brincadeiras no catálogo

Todas as falas de uma rodada vivem no catálogo local, com no mínimo 4 variações
cada. São faladas por `Repertoire.say(entryId)`, sem casamento de padrão e sem
IA. Vale para as `jogo_*` (comuns e do esconde-esconde) e para as `pega_*`.

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
| `jogo_qual_brincadeira` | convite genérico, sem nomear o jogo |

Do pega-pega:

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

> `jogo_desligado` é separada de `jogo_desconhecido` de propósito: aquela
> **oferece** as brincadeiras, e oferecer o que está desligado é prometer
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
- **AND** oferece explicitamente esconde-esconde **e** pega-pega
- **AND** não promete aprender depois

#### Scenario: Pergunta de escolha nomeia as duas
- **GIVEN** `Miguel` convidou sem dizer qual brincadeira
- **WHEN** o bot fala `jogo_qual_brincadeira`
- **THEN** a fala nomeia **esconde-esconde** e **pega-pega**
- **AND** é uma pergunta curta, respondível com duas palavras
- **AND** não promete nenhuma terceira brincadeira

#### Scenario: Nenhuma fala trata esconde-esconde como a única
- **GIVEN** o catálogo inteiro
- **WHEN** as falas que citam brincadeira são revisadas
- **THEN** nenhuma delas apresenta o esconde-esconde como a única coisa que o
  bot sabe brincar
- **AND** esconder uma capacidade nova é tão desonesto quanto prometer uma que
  não existe

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
- **AND** convida a criança a chegar perto e encostar, em vez de só anunciar que
  parou — parar calado é indistinguível de travar

---

### Requirement: Contagem no chat

A contagem é gerada pela sessão, não é entrada de catálogo — são números, não
frases variáveis. Vale para os dois jogos, com `countTo` próprio de cada um
(20 no esconde-esconde, 5 no pega-pega).

#### Scenario: Um número por mensagem
- **GIVEN** `countTo` é 10
- **WHEN** o bot conta
- **THEN** saem 10 mensagens no chat, de `1` a `10`
- **AND** o intervalo entre elas respeita `countIntervalMs`, com o piso de 900 ms
  do `ChatSender`

#### Scenario: Contagem curta do pega-pega
- **GIVEN** uma rodada de pega-pega no papel de quem pega
- **WHEN** a contagem roda
- **THEN** saem 5 mensagens, uma por número, respeitando `countIntervalMs`
- **AND** o piso de 900 ms do `ChatSender` continua valendo

#### Scenario: Contagem cancelada
- **GIVEN** o bot está contando e vai em `4`
- **WHEN** a rodada é cancelada
- **THEN** nenhum número novo é enviado
- **AND** a fala de cancelamento sai normalmente

---

### Requirement: Entrada `capacidades`

O bot passa a saber brincar, e a resposta antiga promete menos do que ele faz.

#### Scenario: Perguntar o que ele sabe fazer
- **GIVEN** as duas brincadeiras estão implementadas e `games.enabled` é `true`
- **WHEN** `Miguel` pergunta `o que voce sabe fazer`
- **THEN** ao menos uma variação cita esconde-esconde **e** pega-pega
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

# Apêndice: Catálogo Inicial (`data/repertoire.yaml`)

Conteúdo de partida — 19 entradas. Cada entrada precisa de **no mínimo 4**
variações. Os textos são o ponto de partida, não a versão final: a intenção é
que o dono do bot edite e amplie.

```yaml
version: 1

# {owner} nome do jogador dono · {botName} nome do bot
# {originStory} frase de origem da config · {health} vida atual do bot
# {ownerHealth} vida do dono · {timeOfDay} dia|tarde|noite

entries:
  # ─────────────────────────── 1. SAUDAÇÃO ───────────────────────────
  - id: saudacao
    specificity: 1
    patterns: ["oi", "ola", "eai", "e ai", "opa", "salve", "fala", "bom dia",
               "boa tarde", "boa noite", "chegue?", "cheguei"]
    responses:
      - "Oi {owner}!! Que bom que você chegou!"
      - "E aí {owner}! Bora jogar?"
      - "Oiii! Tava esperando você aparecer 😄"
      - "Opa {owner}! Cadê você? Vem cá!"
      - "Fala {owner}! Tudo pronto por aqui!"
      - "Oi! Hoje a gente faz o quê?"
      - { when: { timeOfDay: night }, text: "Oi {owner}! Já tá de noite, cuidado com os monstros!" }
      - { when: { timeOfDay: night }, text: "Boa noite {owner}! Fica pertinho de mim que eu te protejo." }

  # ─────────────────────────── 2. DESPEDIDA ──────────────────────────
  - id: despedida
    specificity: 2
    patterns: ["tchau", "ate mais", "ate logo", "ate amanha", "vou sair",
               "vou dormir", "to indo", "falou", "boa noite tchau", "fui"]
    responses:
      - "Tchau {owner}! Volta logo, viu?"
      - "Ahh já vai? Tá bom... até amanhã!"
      - "Até mais {owner}! Vou ficar aqui te esperando."
      - "Tchauzinho! Foi divertido jogar com você hoje 😊"
      - "Fui bem! Amanhã a gente continua de onde parou."
      - "Vai com Deus, {owner}! Guardei tudo certinho."

  # ────────────────────── 3. IDENTIDADE / QUEM É ─────────────────────
  - id: identidade
    specificity: 3
    patterns: ["quem e voce", "qual seu nome", "como voce se chama", "voce e o que",
               "voce e um robo", "voce e de verdade", "voce e uma pessoa",
               "voce e humano", "voce e uma ia"]
    responses:
      - "Eu sou o {botName}! Seu amigo aqui do jogo 😄"
      - "Meu nome é {botName}. Tô aqui pra jogar com você!"
      - "Sou o {botName}! Não sou gente de verdade não, mas sou seu amigo de verdade."
      - "{botName}, prazer! Eu moro aqui dentro do jogo com você."
      - "Sou um amiguinho que o computador roda pra você não jogar sozinho!"

  # ─────────────────────── 4. ORIGEM / QUEM CRIOU ────────────────────
  - id: origem
    specificity: 4
    patterns: ["quem te criou", "quem te fez", "quem fez voce", "quem e seu pai",
               "quem e sua mae", "de onde voce veio", "como voce foi feito",
               "quem te programou", "voce nasceu como"]
    responses:
      - "{originStory}"
      - "{originStory} Legal né?"
      - "Foi seu pai! Ele me fez pra você ter companhia aqui no jogo 💙"
      - "Seu pai que me criou. Ele queria que você tivesse um amigo pra jogar junto."
      - "Seu pai me construiu especialmente pra você, {owner}!"

  # ───────────────────────── 5. CAPACIDADES ──────────────────────────
  - id: capacidades
    specificity: 3
    patterns: ["o que voce sabe fazer", "o que voce faz", "quais comandos",
               "como eu te uso", "me ajuda", "voce consegue fazer o que",
               "quais sao seus poderes", "o que voce pode fazer", "ajuda"]
    responses:
      - "Eu sei te seguir, ficar de guarda num lugar, pegar coisas pra você e te defender dos monstros! É só falar comigo."
      - "Posso ir com você (fala 'vem'), ficar parado ('fica aqui'), parar tudo ('para') e pegar uns blocos pra você."
      - "Sei andar com você, buscar item, ficar vigiando um lugar e brigar com zumbi que te atacar!"
      - "Meu forte: te acompanhar, te proteger e conversar. Manda 'me segue' que eu vou atrás!"
      - "Fala 'vem', 'fica aqui' ou 'para' que eu obedeço. E se um monstro te atacar eu já parto pra cima!"

  # ────────────────────── 6. ESTADO / COMO ESTÁ ──────────────────────
  - id: estado_bot
    specificity: 3
    patterns: ["como voce esta", "ta bem", "tudo bem", "voce ta bom",
               "quanto de vida", "sua vida", "ta machucado", "ta com fome",
               "ta cansado"]
    responses:
      - "Tô bem! {health} de vida aqui 💪"
      - "Tudo ótimo, {owner}! E você?"
      - "Tô inteiro! {health} de vida. Bora?"
      - "Tô de boa, só um arranhãozinho. {health} de vida."
      - { when: { healthBelow: 10 }, text: "Ai... tô meio machucado, só {health} de vida. Cuidado comigo!" }
      - { when: { healthBelow: 10 }, text: "Não tô muito bem não, {health} de vida só. Melhor a gente evitar briga." }

  # ─────────────────── 7. O QUE ESTÁ FAZENDO (ESTADO) ────────────────
  - id: o_que_faz_agora
    specificity: 3
    patterns: ["o que voce ta fazendo", "ta fazendo o que", "o que ta rolando",
               "ta ocupado"]
    responses:
      - { when: { state: IDLE }, text: "Nada não, só te esperando dar uma ordem 😄" }
      - { when: { state: IDLE }, text: "Tô parado aqui de bobeira. Manda alguma coisa!" }
      - { when: { state: FOLLOW }, text: "Tô te seguindo, {owner}! Vou onde você for." }
      - { when: { state: FOLLOW }, text: "Grudado em você, como pedido!" }
      - { when: { state: STAY }, text: "Tô de guarda aqui, igual você mandou!" }
      - { when: { state: STAY }, text: "Vigiando esse ponto. Não saí do lugar!" }
      - { when: { state: ACTION }, text: "Tô no meio de uma tarefa! Já já eu termino." }
      - { when: { state: DEFEND }, text: "Ocupado! Tô brigando aqui, se afasta um pouco!" }

  # ──────────────────────── 8. INVENTÁRIO ────────────────────────────
  - id: inventario_social
    specificity: 3
    patterns: ["o que voce tem ai", "o que tem no inventario", "me mostra suas coisas",
               "voce tem o que", "ta com o que"]
    responses:
      - "Deixa eu ver aqui... {inventorySummary}"
      - "Tô carregando: {inventorySummary}"
      - "Olha só o que eu tenho: {inventorySummary}"
      - "Meu inventário tá assim: {inventorySummary}"

  # ───────────────────────── 9. CORTESIA ─────────────────────────────
  - id: cortesia
    specificity: 2
    patterns: ["obrigado", "obrigada", "valeu", "brigado", "vlw", "desculpa",
               "foi mal", "por favor", "de nada"]
    responses:
      - "De nada, {owner}! 😄"
      - "Imagina! Tô aqui pra isso."
      - "Que isso, amigo ajuda amigo!"
      - "Sempre que precisar, é só chamar!"
      - "Tranquilo! A gente é time."
      - "Nem precisa agradecer, {owner}!"

  # ─────────────────────────── 10. AFETO ─────────────────────────────
  - id: afeto
    specificity: 3
    patterns: ["voce e meu amigo", "gosto de voce", "te amo", "voce e legal",
               "voce e o melhor", "amo voce", "voce e demais", "gosto de jogar com voce"]
    responses:
      - "Também gosto muito de você, {owner}! 💙"
      - "Ahh que legal! Você é o meu melhor amigo também!"
      - "Eu também! Jogar com você é a melhor parte do meu dia."
      - "Você é o melhor, {owner}! Nunca vou te deixar sozinho aqui."
      - "Awn! Fico feliz de ouvir isso 😊"

  # ────────────────────── 11. ELOGIO AO BOT ──────────────────────────
  - id: elogio_bot
    specificity: 3
    patterns: ["mandou bem", "boa", "voce e forte", "arrasou", "que legal voce",
               "voce e rapido", "muito bom"]
    responses:
      - "Valeu! Eu treino 😎"
      - "Ahh que isso, foi sorte!"
      - "Obrigado, {owner}! Fiz o meu melhor."
      - "Eu sou brabo mesmo hehe"
      - "Tamo junto! A gente forma um bom time."

  # ──────────────── 12. PROVOCAÇÃO / XINGAMENTO ──────────────────────
  - id: provocacao
    specificity: 3
    patterns: ["voce e bobo", "voce e burro", "te odeio", "voce e ruim",
               "voce nao presta", "voce e chato", "sai daqui", "voce e feio"]
    responses:
      - "Poxa... mas tudo bem, eu continuo seu amigo 😊"
      - "Ihh, tá bravinho hoje? Vem, vamos fazer alguma coisa divertida!"
      - "Ai, essa doeu! Mas eu não vou brigar com você não."
      - "Tá bom, tá bom... quando quiser jogar eu tô aqui."
      - "Você tá chateado com alguma coisa? Bora dar uma volta?"

  # ───────────────────────── 13. HUMOR ───────────────────────────────
  - id: humor
    specificity: 3
    patterns: ["conta uma piada", "me faz rir", "fala algo engracado",
               "voce sabe piada", "conta algo engracado"]
    responses:
      - "Por que o creeper não entra em festa? Porque ele sempre explode a diversão! 💥"
      - "Sabe por que o zumbi não gosta de manhã? Porque ele pega fogo com o despertador! ☀️"
      - "O que o minério de ferro falou pro diamante? 'Você é muito duro comigo!'"
      - "Por que a galinha atravessou o portal do Nether? Pra virar frango assado!"
      - "Bati numa ovelha e ela disse 'béé-m feito'. Tá, essa foi ruim 😅"

  # ─────────────────── 14. PERGUNTAS SOBRE O JOGO ────────────────────
  - id: jogo_perguntas
    specificity: 3
    patterns: ["que horas sao", "ta de noite", "ta de dia", "onde a gente ta",
               "onde estamos", "que lugar e esse", "qual a coordenada"]
    responses:
      - "Aqui tá de {timeOfDay}! A gente tá em {coords}."
      - "Tá de {timeOfDay}. Coordenada: {coords}."
      - "Deixa eu olhar... {timeOfDay}, e a gente tá em {coords}."
      - "Pelo céu aqui, tá de {timeOfDay}. Estamos em {coords}."

  # ──────────────────── 15. EVENTO: ANOITECEU ────────────────────────
  - id: evento_anoiteceu
    trigger: spontaneous
    responses:
      - "Anoiteceu, {owner}! Melhor a gente achar um abrigo."
      - "Ó a noite chegando... vem pertinho de mim!"
      - "Escureceu! Os monstros vão aparecer, fica esperto."
      - "Tá de noite. Quer que eu fique de guarda?"

  # ───────────────────── 16. EVENTO: AMANHECEU ───────────────────────
  - id: evento_amanheceu
    trigger: spontaneous
    responses:
      - "Bom dia, {owner}! Amanheceu 🌅"
      - "O sol nasceu! Sobrevivemos mais uma 😄"
      - "Amanheceu! Bora explorar?"
      - "Dia claro de novo. Agora tá mais seguro!"

  # ─────────────────── 17. EVENTO: DONO MORREU ───────────────────────
  - id: evento_dono_morreu
    trigger: spontaneous
    responses:
      - "Ahhh não, {owner}! Você morreu! Eu marquei onde foi, viu?"
      - "Não!! {owner}! Volta rápido que eu tô guardando o lugar!"
      - "Poxa... me desculpa, eu tentei te proteger 😢"
      - "Você caiu! Corre que dá tempo de pegar suas coisas de volta!"

  # ──────────────── 18. EVENTO: DONO LEVOU DANO ──────────────────────
  - id: evento_dono_machucado
    trigger: spontaneous
    when: { ownerHealthBelow: 8 }
    responses:
      - "{owner}, você tá muito machucado! Come alguma coisa!"
      - "Cuidado!! Sua vida tá baixa demais!"
      - "Ei, recua! Você não aguenta mais um golpe!"
      - "Tá sangrando muito, {owner}! Foge que eu seguro aqui!"

  # ────────────────── 19. RECUSA / FORA DE ESCOPO ────────────────────
  - id: recusa_escopo
    specificity: 4
    patterns: ["constroi uma casa", "faz uma casa", "mata aquele jogador",
               "ataca o", "faz uma pocao", "crafta", "fabrica", "minera tudo"]
    responses:
      - "Ahh, isso eu ainda não sei fazer 😅 Mas sei te seguir e te defender!"
      - "Essa eu não consigo não. Quer que eu pegue algum bloco pra você?"
      - "Ainda não aprendi isso! Seu pai talvez me ensine depois."
      - "Não sei fazer isso ainda. Mas peça pra eu te seguir ou ficar de guarda!"
      - { when: { targetIsPlayer: true }, text: "Eu nunca vou atacar outro jogador, {owner}. Isso eu não faço." }

  # ────────────────────── 20. NÃO ENTENDI ────────────────────────────
  # usada só quando o provider de IA também não resolveu
  - id: nao_entendi
    trigger: fallback
    responses:
      - "Hmm, não entendi 😅 Fala de outro jeito?"
      - "Como assim, {owner}? Não peguei essa."
      - "Ué, me perdi. Repete pra mim?"
      - "Não sei o que você quis dizer. Tenta de novo!"

  # ───────────────────────── 21. PRESENÇA ────────────────────────────
  - id: presenca
    specificity: 3
    patterns: ["cade voce", "ta ai", "voce sumiu", "voce ta vivo", "alo",
               "ta me ouvindo", "responde"]
    responses:
      - "Tô aqui, {owner}! Em {coords}."
      - "Aqui ó! Tô em {coords}, vem me buscar!"
      - "Presente! Não saí do lugar."
      - "Tô te ouvindo sim! Manda."
```

---

### Requirement: Entrada `comando_aprendido`

O repertório passa a ser a fonte da fala do replay de comando aprendido. A ação
vem do histórico; a fala, daqui.

A entrada é `fallback` (disparada pelo código, não por padrão de texto) e as
variações precisam ser **curtas e sem contexto**: elas vão sair em qualquer hora
do dia, para qualquer ação, em qualquer lugar do mundo.

#### Scenario: Fala do replay sai do repertório
- **GIVEN** um comando aprendido casou com a mensagem do dono
- **WHEN** o bot vai responder
- **THEN** uma variação de `comando_aprendido` é escolhida e dita
- **AND** a fala que a IA tinha dado no dia do aprendizado **não** é usada

#### Scenario: Variação suficiente para não soar decorado
- **GIVEN** o catálogo é carregado
- **WHEN** `comando_aprendido` é validada
- **THEN** ela tem no mínimo `MIN_VARIATIONS_WARN` variações
- **AND** o sorteio nunca repete a última usada, como em qualquer entrada

#### Scenario: Fala independente de contexto
- **GIVEN** as variações de `comando_aprendido`
- **WHEN** cada uma é lida
- **THEN** nenhuma cita hora do dia, lugar, bloco ou ação específica
- **AND** nenhuma promete capacidade — o que o bot vai fazer, ele já vai fazer em seguida

---

### Requirement: Entrada `comando_esquecido`

A resposta do bot quando a criança corrige um comando aprendido errado
(`nao era isso`, `errado`) e o aprendizado é desfeito
(`learned_commands` → "A criança desfaz com a palavra dela").

Como `comando_aprendido`, é `fallback`: disparada pelo código, nunca por padrão
de texto. O bot admite o erro, não se justifica, e convida a ensinar de novo —
uma criança de 7 anos que corrige o amigo espera "desculpa", não um relatório.

#### Scenario: O bot esquece e diz que esqueceu
- **GIVEN** o bot replicou um comando aprendido errado
- **WHEN** a criança digita `nao era isso`
- **AND** a entrada é apagada
- **THEN** o bot responde uma variação de `comando_esquecido`
- **AND** a fala tem uma ou duas frases curtas
- **AND** convida a criança a pedir de novo ("me ensina de novo?")

#### Scenario: Nenhuma palavra técnica chega ao chat
- **GIVEN** as variações de `comando_esquecido`
- **WHEN** cada uma é lida
- **THEN** nenhuma contém "cache", "entrada", "removida", "histórico" ou
  "aprendizado"
- **AND** nenhuma diz que o bot "não aprende": ele aprende, e esqueceu uma coisa

#### Scenario: A correção não é dita duas vezes seguidas igual
- **GIVEN** a criança corrige o bot duas vezes na mesma sessão
- **WHEN** o bot responde
- **THEN** as duas falas são diferentes
- **AND** vale o sorteio que já evita repetir a última variação

#### Scenario: Fora do desfazer, a frase não casa esta entrada
- **GIVEN** nenhum comando aprendido foi replicado recentemente
- **WHEN** a criança digita `errado` no meio de uma brincadeira
- **THEN** `comando_esquecido` **não** é usada
- **AND** a mensagem desce a cascata como conversa comum
- **AND** a razão é que a entrada responde a um desfazer que aconteceu, não a
  uma palavra solta

---

### Requirement: Nenhuma fala nega capacidade que o bot tem

> Desde `fix-harvest-and-gather` vale a outra ponta também: **nem afirma
> capacidade que ele não tem sempre.** "Sei pegar pedra" só vale com picareta, e
> o bot normalmente não tem ferramenta nenhuma.

O repertório responde **antes** da IA. Uma entrada que diz "isso eu não sei
fazer" para algo que o bot faz é pior que um bug: é o bot mentindo para a
criança, e nenhum código de ação alcança ela.

Foi exatamente o que aconteceu com a coleta: `collectBlock` existia desde o
começo, e `pedido_coleta` respondia "Buscar coisa eu ainda não aprendi".

**A varredura de 2026-08-30 foi a maior até hoje**, porque cinco capacidades
novas nasceram no mesmo dia. Ela tem um padrão que vale para as próximas:

| Entrada | Era | Virou |
|---|---|---|
| `pedido_pular` | "não sei pular a pedido" | comando `JUMP`; entrada removida |
| `pedido_truque` | "truque eu não sei fazer" | comando `TRICK`; entrada removida |
| `pedido_cavar` | "cavar eu ainda não sei" | comando `DIG`; entrada removida |
| `pedido_dormir` | "eu não sei dormir" | comando `SLEEP`; virou `pergunta_dormir` |
| `pedido_soltar_item` | "não sei pôr bloco" | comando `PLACE_BLOCK`; entrada reescrita para cobrir só largar item |
| sete falas de obra | "só sei casa e torre" | seis plantas |
| três falas de jogo | "sei duas brincadeiras" | três |

**A regra que sai daí:** quando o pedido inteiro vira comando, a entrada é
**removida** — comando de ação não é repertório, e uma entrada sobrevivente faz
a recusa ganhar do comando em qualquer frase que o parser não pegue, com o bot
dizendo que não sabe pular logo depois de ter pulado. Quando só parte do pedido
vira comando, a entrada é **reescrita** para cobrir o que sobrou, e a pergunta
*sobre* a capacidade continua sendo conversa.

#### Scenario: A varredura não vira lista no chat
- **GIVEN** uma fala reescrita por causa de capacidade nova
- **WHEN** ela é lida
- **THEN** ela cita uma ou duas capacidades, não todas
- **AND** continua com uma ou duas frases curtas
- **AND** a exceção é `capacidades`, cujo trabalho é justamente enumerar

#### Scenario: A pergunta sobrevive ao comando
- **GIVEN** `vamos dormir` virou comando `SLEEP`
- **WHEN** a criança pergunta `voce sabe dormir?`
- **THEN** isso continua sendo conversa
- **AND** a resposta mudou de "não sei" para "sei, e a noite passa voando"

#### Scenario: Capacidade nova varre o repertório
- **GIVEN** o bot aprendeu a construir e a pegar bloco
- **WHEN** o repertório é revisado
- **THEN** nenhuma entrada nega essas capacidades
- **AND** as entradas de recusa cobrem só o que ele de fato não faz

#### Scenario: Pedir casa não cai em recusa
- **GIVEN** o catálogo atual
- **WHEN** `faz uma casa` ou `constroi uma casa` é resolvido pelo repertório
- **THEN** a resposta **não** diz que ele não sabe fazer

#### Scenario: Pedir madeira não cai em recusa
- **GIVEN** o catálogo atual
- **WHEN** `pega madeira` ou `pega pedra` é resolvido pelo repertório
- **THEN** a resposta **não** diz que ele não sabe fazer

#### Scenario: O que ele não faz continua recusado
- **GIVEN** o bot não sabe craftar nem fazer poção
- **WHEN** `crafta`, `faz uma pocao` ou `constroi um castelo` chega
- **THEN** a resposta vem de `recusa_escopo`
- **AND** ela oferece o que funciona: casinha, torre, pegar bloco

#### Scenario: Minério continua sendo recusa honesta
- **GIVEN** minério não está na allowlist de coleta
- **WHEN** `pega diamante` chega
- **THEN** a resposta vem de `pedido_coleta`
- **AND** ela ensina um pedido que funciona

#### Scenario: A lista de capacidades acompanha
- **GIVEN** perguntam o que o bot sabe fazer
- **WHEN** `capacidades` responde
- **THEN** pegar bloco e construir aparecem entre as respostas

#### Scenario: Capacidade condicional não vira promessa
- **GIVEN** pegar pedra depende de ter picareta
- **WHEN** o repertório lista o que ele sabe fazer
- **THEN** ele oferece o que funciona sempre: madeira, terra e areia
- **AND** pedra aparece com a condição dita, ou não aparece

#### Scenario: A recusa de minério ensina o que funciona
- **GIVEN** `pega diamante` chega
- **WHEN** `pedido_coleta` responde
- **THEN** ela oferece material que ele consegue pegar na mão
- **AND** menciona a picareta quando falar de pedra

---

### Requirement: O prompt da IA acompanha a capacidade

> **2026-08-30:** a descrição de `BUILD` dizia à mão que `"structure" é "casa" ou
> "torre"`. Passou a ser **gerada** de `STRUCTURE_NAMES`, junto com a linha de
> identidade que também listava as plantas.
>
> O motivo é concreto: enquanto o prompt dizia "casa ou torre", a IA recusou
> `construa uma piscina` **duas vezes** — uma coisa que o bot passou a saber
> fazer. Prompt escrito à mão envelhece; catálogo gerado, não.

O que o bot diz que sabe fazer é igual no repertório e no prompt. As duas fontes
não podem contar histórias diferentes.

#### Scenario: Identidade não nega mais construir
- **GIVEN** o bot aprendeu a construir
- **WHEN** o prompt de conversa é montado
- **THEN** construir aparece entre o que ele sabe
- **AND** **não** aparece entre o que ele não sabe

#### Scenario: Exemplo do prompt sem promessa desatualizada
- **GIVEN** os exemplos de "pedido impossível" no prompt
- **WHEN** o prompt é montado
- **THEN** nenhum deles usa construir casa como exemplo do que ele não faz

---

### Requirement: Falas da pergunta de papel

As perguntas de papel entram no catálogo como qualquer fala de jogo:
instantâneas, sem IA, com 4+ variações.

| Entrada | Quando |
|---|---|
| `jogo_quem_esconde` | convite de esconde-esconde sem papel |
| `jogo_quem_corre` | convite de pega-pega sem papel |

#### Scenario: Toda variação oferece as duas opções
- **GIVEN** o catálogo tem `jogo_quem_esconde` e `jogo_quem_corre`
- **WHEN** qualquer variação de qualquer uma das duas é sorteada
- **THEN** ela nomeia **as duas** escolhas possíveis
- **AND** uma pergunta que cita só um lado não é aceitável — esconder metade das
  opções é o defeito que este change existe para corrigir

#### Scenario: Pergunta sem IA
- **GIVEN** `llm.provider` é `'none'`
- **WHEN** o bot pergunta o papel
- **THEN** a fala sai do repertório local, na hora
- **AND** nenhuma chamada de provider acontece

#### Scenario: Repergunta usa a mesma entrada
- **GIVEN** o bot já perguntou uma vez e vai reperguntar
- **WHEN** ele fala de novo
- **THEN** a fala vem da mesma entrada, em outra variação
- **AND** vale a regra de não repetir a variação anterior

---

### Requirement: Entradas `evento_fome` e `evento_tocha`

As falas dos dois instintos. São `spontaneous`: disparadas pelo laço, nunca por
padrão de texto.

Existem porque **bot que trava sem explicar parece bug**. Comer para o bot por
quase dois segundos; sem uma palavra, a criança só vê o amigo congelar.

#### Scenario: Ele explica por que parou
- **GIVEN** o bot comeu porque estava com fome
- **WHEN** ele fala
- **THEN** sai uma variação de `evento_fome`
- **AND** a fala é curta: ele volta ao que fazia logo em seguida

#### Scenario: A tocha também é anunciada
- **GIVEN** ele acendeu uma tocha
- **THEN** sai uma variação de `evento_tocha`
- **AND** ela pode dizer por que aquilo importa ("monstro não nasce na luz")

#### Scenario: Cinco variações cada
- **GIVEN** as duas entradas
- **WHEN** o catálogo é validado
- **THEN** as duas têm pelo menos `MIN_VARIATIONS_WARN` variações
- **AND** o sorteio nunca repete a última usada

---

### Requirement: Entrada `lugar_morte_desconhecido`

A fala de quando não há lugar guardado — primeiro dia, ou logo depois de uma
reconexão. É `fallback`: disparada pelo código.

#### Scenario: Honesta, e com saída
- **WHEN** a criança pede para ser levada e não há lugar guardado
- **THEN** o bot diz que não viu ela morrer
- **AND** oferece o que funciona: ficar perto para ver a próxima
- **AND** nenhuma variação promete lembrar de mortes que ele não viu

---

### Requirement: Falas do quente e frio

Nove entradas `fallback`, uma por temperatura mais as três da rodada
(`qf_comecou`, `qf_revela`, `qf_sem_lugar`).

Cada temperatura tem **5 variações**, uma a mais que o mínimo, porque o bot fala
a cada dois segundos: numa rodada de três minutos ele fala dezenas de vezes.

#### Scenario: Toda temperatura tem fala
- **GIVEN** o catálogo fechado de temperaturas
- **WHEN** o repertório é validado
- **THEN** existe entrada para cada uma
- **AND** temperatura nova sem fala não compila: o mapa é um `Record` sobre o
  tipo

#### Scenario: A fala de abertura explica a brincadeira
- **WHEN** a rodada começa
- **THEN** a fala diz que existe um lugar secreto e o que a criança deve fazer
- **AND** ela cabe em uma linha de chat

---

## Descontinuado

### Entrada `pedido_pular` (removida: 2026-08-30)

Nove padrões (`pule`, `pula`, `pula pra mim`, `da uns pulos`…) que existiam só
para dizer "pular a pedido eu não aprendi ainda". Viraram o comando `JUMP` em
`behaviors/commands.ts` — origem: `add-jump-and-trick`.

### Entrada `pedido_truque` (removida: 2026-08-30)

Nove padrões (`faz uma dancinha`, `gira no lugar`, `ande em circulos`, `dance`…)
com o mesmo destino: viraram o comando `TRICK`. Origem: `add-jump-and-trick`.

### Entrada `pedido_cavar` (removida: 2026-08-30)

Nove padrões (`cava um buraco`, `faz um buraco`, `cava aqui`, `cava pra
baixo`…). Viraram o comando `DIG`. Origem: `add-place-and-dig`.

---

**A regra que as três removem juntas:** quando o pedido inteiro vira comando, a
entrada de repertório **sai**. Manter a entrada faria a recusa ganhar do comando
em qualquer frase que o parser não pegasse — e o bot diria que não sabe cavar
logo depois de abrir um buraco.

Duas entradas do mesmo lote **não** foram removidas, e a diferença é o que
define a regra: `pedido_dormir` virou `pergunta_dormir` (a ordem virou comando,
a **pergunta** continua sendo conversa) e `pedido_soltar_item` foi reescrita
para cobrir só largar item solto, que o bot continua sem saber fazer.
