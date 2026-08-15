# Delta: Repertório Local de Conversa

**Change ID:** `add-minecraft-companion-bot`
**Affects:** `src/dialogue/`, `data/repertoire.yaml`, `src/config/`

> Este é o **nível 2** da cascata de resolução: roda depois do parser de comandos
> e antes do provider de IA. Nenhum cenário deste arquivo faz chamada de rede.
>
> Convenção de nomes: `Dudu` é o **bot**, `Miguel` é o **jogador dono**.

---

## ADDED

### Requirement: Cascata de resolução de mensagens

Toda mensagem do dono passa por três níveis, em ordem. Cada nível só entrega ao
seguinte o que não conseguiu resolver.

**Ordem:** parser de comandos → repertório local → provider de IA

#### Scenario: Comando tem precedência sobre o repertório
- **GIVEN** o dono digita `dudu, me segue`
- **WHEN** a mensagem é roteada
- **THEN** o parser de comandos resolve e o bot entra em `FOLLOW`
- **AND** o repertório não é consultado
- **AND** o provider de IA não é chamado

#### Scenario: Repertório resolve sem chamar a IA
- **GIVEN** o dono digita `dudu, oi`
- **AND** o parser de comandos não reconhece
- **WHEN** a mensagem chega ao repertório
- **THEN** uma resposta de saudação é escolhida e enviada ao chat
- **AND** o provider de IA **não** é chamado
- **AND** a resposta chega ao chat em menos de 100 ms

#### Scenario: Sem match, cai para a IA
- **GIVEN** o dono digita `dudu, você acha que existe vida em outro planeta?`
- **AND** nenhuma entrada do repertório atinge o limiar de confiança
- **WHEN** a mensagem termina de descer a cascata
- **THEN** o provider de IA é chamado no modo de conversa
- **AND** a resposta da IA é enviada ao chat

#### Scenario: Match fraco prefere a IA
- **GIVEN** o limiar de confiança é `0.7`
- **AND** a melhor entrada do repertório pontuou `0.4`
- **WHEN** o repertório avalia a mensagem
- **THEN** o repertório declina
- **AND** a mensagem segue para o provider de IA

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

---

### Requirement: Falas espontâneas por evento do jogo

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

## MODIFIED

(Nenhum — capacidade nova.)

## REMOVED

(Nenhum)

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
