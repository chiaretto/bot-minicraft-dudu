# Especificação: Jogos do Bot

**Componente:** `bot_games`
**Origem:** `add-bot-games-hide-and-seek` (2026-08-15)
**Atualizado por:** `ask-game-role` (2026-08-19),
`fix-hide-and-seek-cover` (2026-08-16),
`add-bot-game-pega-pega` (2026-08-16)

> Toda fala de uma rodada sai do repertório local, nunca da IA — mesmo motivo
> dos avisos de combate. O catálogo está em `local_dialogue.md`.

---

## Requisitos

### Requirement: Registro de jogos conhecidos

O bot conhece um conjunto **fechado** de jogos, cada um com nome e papéis. Pedido
de jogo fora da lista nunca inicia rodada e nunca fica sem resposta.

O registro tem **três** jogos: `esconde_esconde`, `pega_pega` e `quente_frio`.

O terceiro entrou em 2026-08-30 e provou que o registro era extensível de
verdade: `GAME_ROLES` ganhou `bot_esconde_ponto`, `GAME_PHASES` ganhou duas
fases, e **nada** do esconde-esconde ou do pega-pega mudou — nem o contrato
`GameWorld`, que era a evidência de que ele estava no tamanho certo.

Ele é também o primeiro jogo que **não é de correr**: ninguém persegue ninguém,
não há linha de visão nem esconderijo a avaliar. O que ele entrega é conversa.

#### Scenario: Jogo conhecido
- **GIVEN** o registro contém `esconde_esconde` e `pega_pega`
- **WHEN** a intenção `PLAY_GAME{game: "pega_pega"}` chega
- **THEN** a sessão correspondente é criada e o bot entra em `GAME`

#### Scenario: Jogo desconhecido
- **GIVEN** o registro não contém `xadrez`
- **WHEN** `Miguel` digita `dudu, vamos jogar xadrez`
- **THEN** nenhuma rodada é iniciada e o estado não muda
- **AND** o bot responde que ainda não aprendeu esse
- **AND** oferece **as três** brincadeiras que ele sabe

#### Scenario: Jogos desligados na configuração
- **GIVEN** `games.enabled` é `false`
- **WHEN** `Miguel` convida o bot para brincar
- **THEN** nenhuma rodada é iniciada
- **AND** o bot responde honestamente que agora não dá para brincar
- **AND** a resposta **não** oferece nenhuma das brincadeiras — oferecer o que
  está desligado é prometer capacidade que o bot não tem

---

### Requirement: Papel padrão por jogo

Cada jogo tem seu próprio papel padrão, e papel de um jogo não vale em outro.

#### Scenario: Convite sem papel no pega-pega
- **GIVEN** o registro conhece `pega_pega`
- **WHEN** chega `PLAY_GAME{game: "pega_pega"}` sem papel
- **THEN** o papel padrão é `bot_pega` — o bot conta e corre atrás
- **AND** o padrão do esconde-esconde continua sendo `bot_esconde`

#### Scenario: Papel de outro jogo
- **WHEN** chega `PLAY_GAME{game: "pega_pega", role: "bot_esconde"}`
- **THEN** nenhuma rodada começa
- **AND** o bot responde no chat, sem termo técnico, e volta para `IDLE`

---

### Requirement: Convite genérico escolhe entre as brincadeiras

Com duas brincadeiras no registro, `vamos brincar` sem nome de jogo não escolhe
pela criança.

#### Scenario: Convite sem nomear o jogo
- **GIVEN** `games.enabled` é `true` e o registro tem dois jogos
- **WHEN** `Miguel` digita `dudu, vamos brincar`
- **THEN** nenhuma rodada começa e o estado não muda
- **AND** o bot pergunta qual das duas ela quer, nomeando as duas
- **AND** **não** fica nenhum estado pendente esperando resposta — o nome de
  cada jogo já é um convite válido sozinho

#### Scenario: Convite genérico com os jogos desligados
- **GIVEN** `games.enabled` é `false`
- **WHEN** `Miguel` digita `dudu, vamos brincar`
- **THEN** o bot responde que agora não dá para brincar
- **AND** **não** nomeia nenhuma das brincadeiras

#### Scenario: Resposta à pergunta leva à pergunta do papel
- **GIVEN** o bot acabou de perguntar qual brincadeira
- **WHEN** `FresherRobin90` digita `pega pega`
- **THEN** o bot pergunta quem corre, pelo parser de comandos
- **AND** nenhuma chamada de IA acontece no caminho

> Desde `ask-game-role`, responder qual brincadeira leva a **outra** pergunta, a
> do papel. Duas perguntas seguidas são o preço de não escolher pela criança — a
> alternativa, adivinhar o papel, é o defeito que originou aquele change.

---

### Requirement: Estado `GAME` e prioridade

Uma rodada em andamento é um estado próprio da máquina de estados, com
prioridade igual à de `ACTION`. Uma rodada interrompida é **descartada**, nunca
retomada. Vale igual para os dois jogos.

> A prioridade entre estados está definida em `player_commands.md` →
> "Prioridade entre estados". Aqui fica só o que é específico do jogo.

#### Scenario: Início da rodada
- **GIVEN** o bot está em `IDLE`, `FOLLOW` ou `STAY`
- **WHEN** uma rodada começa
- **THEN** o bot transiciona para `GAME` por ordem do jogador
- **AND** a pilha de retomada é limpa

#### Scenario: Ameaça durante a rodada
- **GIVEN** o bot está em `GAME` escondido
- **WHEN** um hostil entra no raio de proteção do dono
- **THEN** a defesa interrompe o estado `GAME`
- **AND** a sessão de jogo é cancelada pelo `AbortSignal`
- **AND** o bot avisa no chat, com palavra de criança, que tem monstro e o jogo
  fica para depois

#### Scenario: Fim do combate não retoma o jogo
- **GIVEN** uma rodada foi cancelada por um combate
- **WHEN** o combate termina
- **THEN** o bot volta para `IDLE`
- **AND** **não** recomeça a rodada sozinha
- **AND** não fala `pode procurar` nem retoma contagem

#### Scenario: Vida crítica durante a rodada
- **GIVEN** o bot está em `GAME`
- **WHEN** a vida cai abaixo do limite configurado
- **THEN** `EMERGENCY` interrompe o jogo, a rodada é cancelada
- **AND** o bot recua na direção do dono avisando no chat

#### Scenario: Parada por ordem do jogador
- **GIVEN** o bot está em `GAME`, em qualquer fase
- **WHEN** `Miguel` digita `dudu, para`
- **THEN** a rodada é cancelada em menos de 1 s
- **AND** o bot confirma no chat e volta para `IDLE`

#### Scenario: Comando de movimento durante a rodada
- **GIVEN** o bot está escondido em `GAME`
- **WHEN** `Miguel` digita `dudu, me segue`
- **THEN** a rodada é cancelada e o bot entra em `FOLLOW`
- **AND** o bot avisa no chat que saiu do jogo

#### Scenario: Interrupção com o bot correndo
- **GIVEN** o bot está em `GAME`, perseguindo ou fugindo
- **WHEN** a rodada é cancelada por `dudu, para`, pela defesa, por vida crítica
  ou por comando de movimento
- **THEN** o bot para de se mover e desliga o sprint em menos de 1 s
- **AND** avisa no chat, com palavra de criança
- **AND** **não** volta a correr quando a interrupção termina

> Parar de correr é parte do cancelamento, não consequência dele: um bot que
> continua correndo depois de `dudu, para` é indistinguível de bug para uma
> criança de 7 anos.

---

### Requirement: Linha de visão

Toda decisão do jogo que envolve "ver" usa linha de visão real por raycast, nunca
só distância. A consulta é sob demanda, fora do snapshot que roda no laço de
defesa.

O pega-pega **não usa** linha de visão em nenhuma fase: ninguém está escondido, e
o que decide a rodada é distância e tempo. Os cenários abaixo valem para o
esconde-esconde.

#### Scenario: Perseguição sem raycast
- **GIVEN** uma rodada de pega-pega em andamento
- **WHEN** o bot persegue ou foge
- **THEN** nenhuma consulta de linha de visão acontece
- **AND** a decisão usa a posição que o protocolo já entrega

#### Scenario: Caminho livre
- **GIVEN** não há bloco sólido entre os olhos do jogador e o ponto candidato
- **WHEN** a visibilidade é consultada
- **THEN** o ponto é considerado visível

#### Scenario: Caminho bloqueado
- **GIVEN** há uma parede de pedra entre os olhos do jogador e o ponto candidato
- **WHEN** a visibilidade é consultada
- **THEN** o ponto é considerado escondido

#### Scenario: Alvo além do alcance
- **GIVEN** o alvo está além de `seeDistance`
- **WHEN** a visibilidade é consultada
- **THEN** o alvo é considerado não visível, mesmo com caminho livre

#### Scenario: Consulta sem afetar a defesa
- **GIVEN** o laço de defesa roda a cada 250 ms
- **WHEN** o jogo consulta linha de visão
- **THEN** a consulta acontece só nas transições de fase do jogo
- **AND** nenhum raycast entra na montagem do `WorldSnapshot`

#### Scenario: Pontos coincidentes se enxergam
- **GIVEN** o bot e o jogador estão praticamente no mesmo ponto
- **WHEN** a visibilidade é consultada
- **THEN** o resultado é "enxerga", sem consultar o mundo — não há o que
  obstruir entre um ponto e ele mesmo

> **Dependência não óbvia:** por causa do cenário acima, a garantia de "quem se
> lacrou não é achado" depende de o pathfinder **não conseguir entrar**. Quem
> assegura isso é `movements.canDig = false` em `minecraft/client.ts`: com
> escavação ligada, o bot cavaria até o esconderijo, ficaria em cima do jogador
> e a linha de visão passaria a ser trivial. Ligar `canDig` quebra o jogo.

---

### Requirement: Esconde-esconde — o bot se esconde

O bot procura um lugar que o jogador não enxergue, vai até lá, e só então libera
a procura. Quem encosta nele ganha.

#### Scenario: Aceitar o convite
- **GIVEN** o bot está em `IDLE` e o dono está visível
- **WHEN** `Miguel` digita `dudu, vamos brincar de esconde esconde`
- **THEN** o bot aceita no chat e pede que o jogador feche o olho e conte
- **AND** transiciona para `GAME` no papel de quem se esconde

#### Scenario: Escolher o esconderijo
- **GIVEN** a rodada começou com o bot se escondendo
- **WHEN** o bot escolhe o ponto
- **THEN** o ponto está entre `hideMinDistance` e `hideMaxDistance` do jogador
- **AND** o jogador **não** tem linha de visão até o ponto
- **AND** o ponto tem **cobertura sólida** em ao menos 2 direções
- **AND** entre dois pontos válidos, vence o de mais cobertura; empatados, vence
  o que está fora do cone de visão atual; empatados de novo, o mais distante
- **AND** o ponto é alcançável pelo pathfinder

> **Cobertura é obrigatória, e distância nunca substitui oclusão.** O alcance do
> raycast que testa a visão do jogador cobre toda a faixa de esconderijo. Com um
> alcance menor que `hideMaxDistance`, todo ponto além dele voltaria "não
> visível" por aritmética, e o bot pararia no campo aberto achando que estava
> escondido — foi exatamente esse o defeito relatado em jogo em 2026-08-16.

#### Scenario: Procurar andando até achar cobertura
- **GIVEN** o bot aceitou se esconder
- **WHEN** nenhum ponto avaliado a partir da posição atual tem cobertura
- **THEN** o bot caminha para outro ponto de observação e avalia de novo
- **AND** repete até achar cobertura ou estourar `hideSearchMs` (padrão 20 s)
- **AND** só então segue para o esconderijo escolhido

#### Scenario: Estar fora do campo de visão não basta
- **GIVEN** um ponto sem cobertura nenhuma, no descampado
- **AND** o jogador está de costas para ele
- **WHEN** o bot avalia o ponto
- **THEN** o ponto **não** é aceito como esconderijo
- **AND** o bot continua procurando

#### Scenario: Mundo aberto sem esconderijo nenhum
- **GIVEN** o jogador enxerga qualquer ponto da faixa, a qualquer distância
- **WHEN** `hideSearchMs` se esgota
- **THEN** o bot recusa a rodada com fala honesta
- **AND** **não** fala `pode procurar`

#### Scenario: Cobertura fraca serve de reserva
- **GIVEN** nenhum ponto atinge a cobertura ideal (2 direções)
- **AND** existe ponto com cobertura de ao menos 1 direção
- **WHEN** `hideSearchMs` se esgota
- **THEN** o bot se esconde no de maior cobertura entre eles
- **AND** a brincadeira continua normalmente

#### Scenario: Cobertura zero nunca é aceita
- **GIVEN** todo ponto fora da linha de visão está em campo aberto
- **WHEN** `hideSearchMs` se esgota
- **THEN** o bot **não** se esconde em nenhum deles
- **AND** recusa a rodada com fala honesta

> Estar fora da linha de visão **naquele instante** não é esconderijo: o jogador
> vira a cabeça e acabou. Aceitar cobertura zero como reserva foi o que manteve
> o defeito de pé mesmo depois da primeira correção.

#### Scenario: Candidato é medido no chão de verdade
- **GIVEN** um ponto candidato num morro acima do jogador
- **WHEN** o bot avalia visibilidade e cobertura
- **THEN** a medição acontece na altura em que ele ficaria **de pé** ali
- **AND** não na altura do jogador — que cairia dentro da terra do morro,
  dando "cobertura máxima, invisível" para um lugar totalmente exposto
- **AND** candidato sem chão conhecido (chunk fora de alcance) é descartado

#### Scenario: Onde ele parou é o que vale
- **GIVEN** o bot chegou perto do esconderijo, mas não exatamente nele
- **WHEN** a posição final é avaliada
- **THEN** a checagem usa a posição **real** do bot, não a pedida
- **AND** confere visão **e** cobertura nessa posição
- **AND** se ela estiver exposta ou descoberta, a rodada é recusada em vez de
  começar errada

#### Scenario: Avisar só depois de escondido
- **GIVEN** o bot está a caminho do esconderijo
- **WHEN** ele ainda não chegou
- **THEN** ele **não** fala `pode procurar`
- **AND** ao chegar, para de se mover e só então avisa que pode procurar

#### Scenario: Ficar parado enquanto escondido
- **GIVEN** o bot está escondido e já avisou
- **WHEN** o jogador anda pelo mundo procurando
- **THEN** o bot permanece no esconderijo, sem seguir e sem se reposicionar

#### Scenario: Ser encontrado pelo toque
- **GIVEN** o bot está escondido
- **WHEN** o jogador chega a `touchDistance` ou menos do bot
- **THEN** o bot declara que perdeu, em menos de 1 s
- **AND** a rodada termina com resultado `perdeu`
- **AND** o bot volta para `IDLE`

#### Scenario: Jogador desiste
- **GIVEN** o bot está escondido
- **WHEN** `Miguel` digita `dudu, desisto` ou `cade voce`
- **THEN** o bot se entrega, diz onde estava e a rodada termina
- **AND** o bot volta para `IDLE`

#### Scenario: Ninguém acha dentro do tempo
- **GIVEN** o bot está escondido
- **WHEN** `roundTimeoutMs` passa sem o jogador chegar perto
- **THEN** o bot fala que ninguém achou e sai do esconderijo
- **AND** a rodada termina com resultado `tempo_esgotado`

#### Scenario: Não existe esconderijo válido
- **GIVEN** o bot está num túnel, e nenhuma amostra produz ponto sem linha de
  visão e alcançável
- **WHEN** ele tenta escolher o esconderijo
- **THEN** ele recusa a rodada com fala honesta, sugerindo um lugar mais aberto
- **AND** volta para `IDLE` sem ficar preso em `GAME`

#### Scenario: Pathfinder não chega ao esconderijo
- **GIVEN** o bot está indo até o ponto escolhido
- **WHEN** o deslocamento estoura o timeout sem chegar
- **THEN** o bot não fica em silêncio: ou se esconde onde está, ou cancela a
  rodada avisando no chat

---

### Requirement: Esconde-esconde — o bot procura

O bot conta até 10 no chat, erra de propósito duas vezes e só depois procura de
verdade. Achar exige ver.

#### Scenario: Contar até 10 no chat
- **GIVEN** `Miguel` digita `dudu, eu vou me esconder`
- **WHEN** a rodada começa no papel de quem procura
- **THEN** o bot conta de 1 até `countTo` (padrão **20**) no chat
- **AND** manda um número por mensagem, respeitando `countIntervalMs`
- **AND** a contagem inteira leva **20 segundos** com os padrões (20 x 1 s) — o
  mesmo tempo que o bot leva procurando esconderijo, para os dois lados da
  brincadeira terem a mesma folga para se esconder
- **AND** avisa quando termina a contagem, antes de sair procurando

#### Scenario: Duas buscas erradas de propósito
- **GIVEN** a contagem terminou
- **WHEN** o bot começa a procurar
- **THEN** ele visita **exatamente** `fakeSearches` pontos (padrão 2) antes de
  qualquer aproximação real do jogador
- **AND** cada ponto está a pelo menos `fakeSearchMinDistanceFromOwner` do
  jogador
- **AND** em cada um ele fala algo de quem está procurando e não achou

#### Scenario: Cegueira deliberada durante o fingimento
- **GIVEN** o bot está indo para a primeira busca falsa
- **WHEN** o jogador passa na frente dele, com linha de visão limpa
- **THEN** o bot **não** declara que achou
- **AND** completa as duas buscas falsas antes de procurar de verdade

#### Scenario: Achar o jogador
- **GIVEN** as buscas falsas terminaram
- **WHEN** o bot ganha linha de visão limpa do jogador, dentro de `seeDistance`
- **THEN** ele caminha até o jogador
- **AND** só declara `achei` depois de chegar perto dele
- **AND** a rodada termina com resultado `ganhou`

#### Scenario: Jogador bem escondido atrás de parede
- **GIVEN** o jogador está atrás de um bloco sólido, a 6 blocos do bot
- **WHEN** o bot procura de verdade
- **THEN** ele **não** declara ter achado
- **AND** continua procurando até ver ou estourar o tempo

#### Scenario: Não achar dentro do tempo
- **GIVEN** o bot procura de verdade
- **WHEN** `roundTimeoutMs` passa sem linha de visão do jogador
- **THEN** o bot desiste com fala amigável e pede uma dica
- **AND** a rodada termina com resultado `tempo_esgotado`
- **AND** o bot volta para `IDLE`

---

### Requirement: Pega-pega — o bot pega

O bot conta até 5 no chat, sai correndo atrás do jogador e ganha ao encostar
nele. Se passar `chaseTimeoutMs` sem alcançar, ele para, diz que cansou e perde.

#### Scenario: Aceitar o convite para pegar
- **GIVEN** o bot está em `IDLE` e o dono está visível
- **WHEN** `Miguel` digita `dudu, vamos brincar de pega pega`
- **THEN** o bot aceita no chat avisando que vai contar
- **AND** transiciona para `GAME` no papel `bot_pega`

#### Scenario: Contar 5 segundos antes de sair
- **GIVEN** a rodada começou no papel de quem pega
- **WHEN** a fase `contando` roda
- **THEN** o bot conta de 1 até `countTo` (padrão **5**) no chat
- **AND** manda um número por mensagem, respeitando `countIntervalMs`
- **AND** avisa que vai começar antes de dar o primeiro passo
- **AND** **não** se move enquanto conta — a contagem é a vantagem de saída da
  criança, e correr durante ela não é pega-pega, é emboscada

#### Scenario: Correr atrás do jogador que se move
- **GIVEN** a contagem terminou
- **WHEN** a fase `perseguindo` começa
- **THEN** o bot persegue com objetivo **dinâmico**, recalculando enquanto o
  jogador foge
- **AND** o sprint fica ligado durante toda a perseguição, se `chaseSprint`
- **AND** nenhuma consulta de linha de visão é feita: em pega-pega ninguém está
  escondido, e o raycast só custaria caro

#### Scenario: Encostar no jogador
- **GIVEN** o bot está perseguindo
- **WHEN** a distância até o jogador chega a `touchDistance` ou menos
- **THEN** o bot declara que pegou, em menos de 1 s
- **AND** para de se mover e desliga o sprint
- **AND** a rodada termina com resultado `ganhou`

#### Scenario: Cansar sem pegar
- **GIVEN** o bot está perseguindo
- **WHEN** `chaseTimeoutMs` (padrão **60 s**) passa sem encostar no jogador
- **THEN** o bot para de correr e desliga o sprint
- **AND** fala que está cansado e que perdeu, com bom humor
- **AND** a rodada termina com resultado `perdeu`

> O desfecho é `perdeu`, não `tempo_esgotado`: cansar é **regra do jogo**, não
> rodada dando errado. `tempo_esgotado` fica reservado para o `roundTimeoutMs`.

#### Scenario: Jogador para de correr e se entrega
- **GIVEN** o bot está perseguindo
- **WHEN** `Miguel` digita `dudu, desisto`
- **THEN** o bot alcança o jogador e declara que pegou
- **AND** a rodada termina com resultado `ganhou`

#### Scenario: Jogador foge para longe demais
- **GIVEN** o bot está perseguindo
- **WHEN** o jogador se afasta além do mundo carregado, mas continua no servidor
- **THEN** o bot continua perseguindo até o tempo acabar — a posição vem do
  protocolo, e desistir cedo pareceria desistir sem motivo
- **AND** se o jogador sumir de vez, vale o cenário de jogador ausente

---

### Requirement: Pega-pega — o bot foge

O bot sai correndo na hora, sem contagem, e se deixa pegar quando cansa. Quem
encosta nele ganha.

#### Scenario: Aceitar o convite para fugir
- **GIVEN** o bot está em `IDLE` e o dono está visível
- **WHEN** `Miguel` digita `dudu, eu vou te pegar`
- **THEN** o bot aceita no chat avisando que já vai correr
- **AND** transiciona para `GAME` no papel `bot_foge`
- **AND** **não** conta: quem conta é quem pega, e aqui quem pega é a criança

#### Scenario: Escolher para onde fugir
- **GIVEN** a fase `fugindo` está em andamento
- **WHEN** o bot escolhe o próximo ponto
- **THEN** o ponto está entre `fleeStepMin` e `fleeStepMax` da posição atual
  **do bot**
- **AND** está a no máximo `fleeMaxDistanceFromOwner` do jogador
- **AND** aumenta a distância até o jogador
- **AND** tem chão resolvido — candidato sem chão conhecido é descartado

> O teto de distância até o jogador existe porque fugir mundo afora tira o bot
> do campo de visão da criança, e a brincadeira vira caminhada solitária.

#### Scenario: Fuga no teto de distância
- **GIVEN** o bot já está em `fleeMaxDistanceFromOwner` do jogador
- **AND** todo ponto que aumentaria a distância está fora do teto
- **WHEN** ele escolhe o próximo ponto
- **THEN** ele corre **de lado**, para o ponto mais distante do jogador que
  ainda cabe no teto
- **AND** nunca escolhe um ponto que corra para os braços de quem persegue
- **AND** **não** fica parado esperando ser pego só porque o teto travou o
  critério principal

#### Scenario: Trocar de rumo quando o jogador chega perto
- **GIVEN** o bot está indo para um ponto de fuga
- **WHEN** o jogador se aproxima a menos de `fleeStepMin`
- **THEN** o bot escolhe um novo ponto de fuga antes de chegar ao anterior
- **AND** continua correndo sem parar no caminho

#### Scenario: Encurralado sem ponto de fuga
- **GIVEN** o bot está num canto, e nenhum candidato válido aparece
- **WHEN** ele tenta escolher para onde fugir
- **THEN** ele **não** fica parado em silêncio: ou tenta de novo no próximo
  passo, ou se entrega falando no chat
- **AND** a rodada nunca fica pendurada por falta de ponto

#### Scenario: Todo trecho de fuga faz o tempo passar
- **GIVEN** o bot está fugindo
- **WHEN** um trecho termina sem sair do lugar — destino já invalidado pelo
  jogador, ou caminhada que falha no primeiro instante
- **THEN** o trecho seguinte só começa depois de um passo de espera
- **AND** a rodada chega ao fim do tempo normalmente, sem girar em falso

> Sem essa garantia o laço rodava sem o relógio andar e sem ceder o processador:
> em teste travava para sempre, e em jogo teria virado 100% de CPU.

#### Scenario: Ser pego pelo jogador
- **GIVEN** o bot está fugindo
- **WHEN** o jogador chega a `touchDistance` ou menos
- **THEN** o bot para na hora e declara que foi pego, em menos de 1 s
- **AND** a rodada termina com resultado `perdeu`

#### Scenario: Cansar de fugir e se deixar pegar
- **GIVEN** o bot está fugindo
- **WHEN** `fleeTimeoutMs` (padrão **60 s**) passa sem o jogador encostar
- **THEN** o bot para de correr e fala que cansou
- **AND** entra na fase `entregue`, parado, e **não** volta a fugir
- **AND** a rodada termina com resultado `perdeu` — ao ser tocado, ou quando
  `surrenderTimeoutMs` passa sem ninguém chegar

#### Scenario: Jogador desiste de pegar
- **GIVEN** o bot está fugindo
- **WHEN** `Miguel` digita `dudu, desisto` ou `nao te pego`
- **THEN** o bot para, volta perto do jogador e se entrega
- **AND** a rodada termina com resultado `perdeu`

#### Scenario: Fuga sem sprint por padrão
- **GIVEN** `fleeSprint` é `false` (padrão)
- **WHEN** o bot foge
- **THEN** ele corre sem sprint, e uma criança correndo consegue alcançá-lo
- **AND** com `chaseSprint` ligado no outro papel, os dois lados têm chance de
  ganhar — que é a única coisa que faz a brincadeira valer a pena

---

### Requirement: Fim de rodada por evento do mundo

Nenhuma rodada fica pendurada. Todo caminho de saída passa por uma fala no chat e
pelo bot parando de se mover. Vale igual para os dois jogos.

#### Scenario: Jogador sai do servidor
- **GIVEN** uma rodada está em andamento
- **WHEN** o dono desconecta
- **THEN** a rodada termina com resultado `cancelado`
- **AND** o bot para de correr, desliga o sprint e volta para `IDLE`

#### Scenario: Rede de segurança do tempo total
- **GIVEN** uma rodada está em andamento
- **WHEN** `roundTimeoutMs` passa
- **THEN** a rodada termina com resultado `tempo_esgotado`
- **AND** o desfecho é **distinto** do `perdeu` por cansaço, que é regra do jogo

#### Scenario: Jogador troca de dimensão
- **GIVEN** uma rodada está em andamento no overworld
- **WHEN** o dono entra no Nether
- **THEN** a rodada termina com fala no chat
- **AND** o bot volta para `IDLE`

#### Scenario: Bot morre durante a rodada
- **GIVEN** uma rodada está em andamento
- **WHEN** o bot morre
- **THEN** a rodada termina, o bot avisa que morreu
- **AND** volta para `IDLE` no respawn, sem retomar o jogo

#### Scenario: Convite de outro jogador
- **GIVEN** `ownerPlayer` é `"Miguel"`
- **WHEN** o jogador `Fulano` digita `dudu, vamos brincar de esconde esconde`
- **THEN** nenhuma rodada é iniciada e o estado não muda
- **AND** o bot responde com educação que só brinca com o Miguel

#### Scenario: Convite com uma rodada já em andamento
- **GIVEN** o bot está escondido em `GAME`
- **WHEN** `Miguel` convida de novo para brincar
- **THEN** nenhuma rodada nova começa
- **AND** o bot lembra, no chat, que a rodada atual ainda está valendo

---

### Requirement: Falas do jogo vêm do repertório local

Toda fala de uma rodada é instantânea e não depende de provider de IA — mesmo
motivo das falas de combate.

> As entradas do catálogo estão em `local_dialogue.md`.

#### Scenario: Rodada completa sem IA
- **GIVEN** `llm.provider` é `'none'`
- **WHEN** uma rodada de esconde-esconde ou de pega-pega acontece do início ao
  fim
- **THEN** todas as falas saem do repertório local
- **AND** nenhuma chamada de provider é feita em nenhuma fase

#### Scenario: Provider fora do ar no meio da rodada
- **GIVEN** `llm.provider` é `'ollama'` e o Ollama caiu
- **WHEN** a rodada continua
- **THEN** o jogo funciona integralmente, sem atraso e sem fala faltando

---

---

### Requirement: Quente e frio

O terceiro jogo. O bot escolhe um ponto secreto perto do jogador e vai dizendo,
a cada `tickMs`, se ele está esquentando ou esfriando.

É o primeiro jogo do registro que **não** é de correr: ninguém persegue ninguém,
não há linha de visão nem esconderijo a avaliar. O que ele entrega é conversa.

#### Scenario: A rodada começa sem pergunta de papel
- **WHEN** a criança digita `dudu, quente e frio`
- **THEN** a rodada começa direto
- **AND** nenhuma pergunta de papel é feita
- **AND** a razão é que o jogo tem um papel só: perguntar seria uma pergunta de
  uma resposta só

#### Scenario: Aproximou, esquentou
- **GIVEN** a rodada está em andamento
- **WHEN** o jogador anda na direção do ponto
- **THEN** o bot diz que está esquentando

#### Scenario: Afastou, esfriou
- **WHEN** o jogador anda para longe do ponto
- **THEN** o bot diz que esfriou
- **AND** longe demais vira "gelado"

#### Scenario: Parada no lugar é "morno", não "frio"
- **GIVEN** o jogador parou para pensar
- **WHEN** o passo é avaliado
- **THEN** o bot diz "morno" e pede que ela ande
- **AND** a razão é que dizer "frio" seria mentira: ela não se afastou

#### Scenario: Pertinho é "pelando", mesmo tendo se afastado
- **GIVEN** o jogador está a menos de duas vezes e meia o raio de acerto
- **WHEN** ele dá um passo para trás
- **THEN** o bot continua dizendo "pelando"
- **AND** a razão é que essa dica faz a criança olhar em volta, que é o que
  resolve

#### Scenario: Achou
- **GIVEN** o jogador chegou a `foundRadius` do ponto
- **THEN** o bot comemora
- **AND** a rodada termina

#### Scenario: A mesma palavra não sai toda vez
- **GIVEN** a temperatura continua a mesma por vários passos
- **WHEN** o bot fala
- **THEN** a repetição sai a cada `repeatEvery` passos, não a cada passo
- **AND** mudança de temperatura sai sempre
- **AND** a razão é que repetir "frio" oito vezes seguidas faz a criança parar
  de ler

#### Scenario: Desistiu ou acabou o tempo: ele mostra onde era
- **WHEN** o jogador desiste, ou o `roundTimeoutMs` estoura
- **THEN** o bot fala que vai mostrar
- **AND** anda até o ponto
- **AND** a razão é que rodada de esconder sem revelação deixa a criança sem
  fecho — e sem saber se havia mesmo um lugar

#### Scenario: O ponto nunca é dito
- **GIVEN** qualquer fala do jogo
- **WHEN** ela é lida
- **THEN** nenhuma contém coordenada
- **AND** contar onde é acabaria com a brincadeira

#### Scenario: Sem lugar para esconder, recusa honesta
- **GIVEN** não há nenhum ponto com chão e alcançável por perto
- **WHEN** a rodada tenta começar
- **THEN** o bot diz que não achou lugar bom e sugere mudar de canto
- **AND** nenhuma rodada começa

---

### Requirement: Jogo de um papel só não pergunta

Quando `ROLES_BY_GAME` tem um único papel para o jogo, o `app/` escolhe esse
papel em vez de perguntar.

#### Scenario: A pergunta é pulada
- **GIVEN** o jogo pedido tem um papel só
- **WHEN** o convite chega sem papel
- **THEN** a rodada começa com o único papel possível
- **AND** nenhuma pendência de pergunta é criada

#### Scenario: Jogo de dois papéis continua perguntando
- **GIVEN** o jogo pedido tem dois papéis
- **WHEN** o convite chega sem papel
- **THEN** a pergunta é feita, como sempre foi

---
## Descontinuado

### Papel padrão global (2026-08-16, `add-bot-game-pega-pega`)

O papel padrão era uma constante única, valendo para qualquer jogo. Com dois
jogos no registro isso deixou de fazer sentido: virou um mapa `jogo → papel`, e
papel de um jogo aplicado a outro passou a ser recusado antes de virar sessão.
Mudança de forma — o comportamento do esconde-esconde não mudou.

---

### Requirement: Papel ausente é pergunta, não padrão

Convite sem papel nunca inicia rodada: o bot pergunta quem faz o quê e espera a
escolha do jogador. Convite **com** papel explícito começa direto — perguntar
ali seria repetir o que a criança acabou de falar.

| Jogo | Pergunta | `eu` → papel do bot | `você` → papel do bot |
|---|---|---|---|
| esconde-esconde | `Quem se esconde: eu ou você?` | `bot_procura` | `bot_esconde` |
| pega-pega | `Quem corre: eu ou você?` | `bot_pega` | `bot_foge` |

> A **mesma palavra significa papéis opostos** nos dois jogos. Por isso a
> escolha pendente guarda o jogo, e o parser de resposta recebe o jogo como
> parâmetro.

#### Scenario: A resposta só usa o verbo que a pergunta citou
- **GIVEN** o bot perguntou `Quem corre: eu ou você?`
- **WHEN** o jogador responde `voce pega`
- **THEN** isso **não** é lido como resposta da pergunta
- **AND** vale como convite com papel explícito: a rodada começa em `bot_pega`
- **AND** o mesmo vale para `voce procura` respondendo `Quem se esconde?`

> Ler `voce pega` como resposta inverteria o papel: `voce` na pergunta "quem
> corre" significa o bot correndo (`bot_foge`), mas `voce pega` significa o bot
> pegando. Frase com o verbo do outro papel é comando, não resposta.

#### Scenario: Convite pelo nome do jogo pergunta o papel
- **GIVEN** `games.enabled` é `true` e nenhuma rodada está em andamento
- **WHEN** `FresherRobin90` digita `dudu, pega pega`
- **THEN** nenhuma rodada começa e o bot **não** entra em `GAME`
- **AND** o bot pergunta no chat `Quem corre: eu ou você?`
- **AND** a pergunta nomeia **as duas** opções

#### Scenario: A resposta inicia a rodada no papel escolhido
- **GIVEN** o bot acabou de perguntar quem corre, no pega-pega
- **WHEN** `FresherRobin90` responde `eu`
- **THEN** a rodada começa no papel `bot_pega` — quem corre é a criança
- **AND** o bot entra em `GAME` e conta antes de sair

#### Scenario: A mesma resposta no outro jogo dá o papel oposto
- **GIVEN** o bot acabou de perguntar quem se esconde, no esconde-esconde
- **WHEN** `FresherRobin90` responde `eu`
- **THEN** a rodada começa no papel `bot_procura` — quem se esconde é a criança
- **AND** o bot conta até `countTo` antes de procurar

#### Scenario: Escolher o bot para o papel
- **GIVEN** o bot perguntou quem se esconde
- **WHEN** `FresherRobin90` responde `voce`
- **THEN** a rodada começa no papel `bot_esconde`

#### Scenario: Convite com papel explícito não pergunta
- **GIVEN** `games.enabled` é `true`
- **WHEN** `FresherRobin90` digita `dudu, me pega`
- **THEN** a rodada começa direto no papel `bot_pega`
- **AND** nenhuma pergunta de papel é feita
- **AND** o mesmo vale para `eu vou me esconder`, `se esconde`, `voce corre` e
  as demais frases que já dizem o papel

#### Scenario: Convite genérico encadeia as duas perguntas
- **GIVEN** o registro tem dois jogos
- **WHEN** `FresherRobin90` digita `dudu, vamos brincar`
- **THEN** o bot pergunta qual das duas brincadeiras
- **AND** ao ela responder `pega pega`, o bot pergunta quem corre
- **AND** só depois da segunda resposta a rodada começa

#### Scenario: `PLAY_GAME` sem papel vindo da IA
- **GIVEN** a IA devolveu `PLAY_GAME{game: "esconde_esconde"}` sem papel
- **WHEN** a intenção é validada e despachada
- **THEN** o bot pergunta o papel, igual ao convite pelo nome do jogo
- **AND** nenhum papel é escolhido pelo código

---

### Requirement: Escolha de papel pendente

A pergunta de papel deixa uma escolha pendente — jogo e prazo. Ela **não** é
estado da máquina de estados: o bot continua em `IDLE` (ou no que estava),
livre para seguir, parar, conversar e se defender.

#### Scenario: Esperar sem travar o bot
- **GIVEN** o bot perguntou quem corre e ninguém respondeu ainda
- **WHEN** `FresherRobin90` digita `dudu, me segue`
- **THEN** o bot entra em `FOLLOW` normalmente
- **AND** a escolha pendente é descartada
- **AND** nenhuma rodada começa depois disso sozinha

#### Scenario: Parada e defesa durante a espera
- **GIVEN** existe uma escolha de papel pendente
- **WHEN** chega `dudu, para`, ou a defesa assume por causa de um hostil
- **THEN** o comportamento é o normal de cada um
- **AND** a escolha pendente é descartada

#### Scenario: Resposta fora da lista repergunta uma vez
- **GIVEN** o bot perguntou quem se esconde
- **WHEN** `FresherRobin90` responde algo que não é resposta nem comando
- **THEN** a mensagem desce a cascata normal e é respondida
- **AND** o bot repergunta **uma** vez, de forma mais simples
- **AND** não repergunta uma terceira vez

#### Scenario: Ninguém responde
- **GIVEN** o bot perguntou o papel
- **WHEN** `games.roleQuestionTimeoutMs` (padrão 45 s) passa sem resposta
- **THEN** a escolha pendente expira em silêncio
- **AND** nenhuma rodada começa
- **AND** o bot não fica preso esperando

#### Scenario: `eu` sem pergunta pendente é conversa
- **GIVEN** nenhuma escolha de papel está pendente
- **WHEN** `FresherRobin90` digita `eu`
- **THEN** nenhuma rodada começa
- **AND** a mensagem desce a cascata normal — parser, repertório, IA

#### Scenario: Pendência não sobrevive à rodada
- **GIVEN** a criança respondeu e a rodada começou
- **WHEN** a rodada termina, por qualquer desfecho
- **THEN** não existe escolha pendente nenhuma
- **AND** um `eu` depois disso volta a ser conversa

#### Scenario: Convite novo durante a espera
- **GIVEN** o bot perguntou quem corre, no pega-pega
- **WHEN** `FresherRobin90` digita `dudu, esconde esconde`
- **THEN** a pendência anterior é substituída pela nova
- **AND** o bot pergunta quem se esconde
- **AND** responder `eu` aí inicia o esconde-esconde, nunca o pega-pega

---

## Descontinuado

### Requirement: Papel padrão por jogo (removido: 2026-08-19)

O mapa `jogo → papel padrão` (`DEFAULT_ROLE_BY_GAME`) deixou de existir em
`ask-game-role`, com os dois cenários que sustentava:

- **Convite sem papel no pega-pega** — o padrão era `bot_pega`; passou a ser
  pergunta.
- **Papel de outro jogo** — continua recusado, mas por `isRoleValidForGame`, que
  não depende do padrão.

**Motivo:** o padrão era uma escolha do código no lugar da criança, e era
inalcançável de outro jeito — quem digitava o nome do jogo levava sempre o mesmo
papel, sem nunca ser perguntado.
