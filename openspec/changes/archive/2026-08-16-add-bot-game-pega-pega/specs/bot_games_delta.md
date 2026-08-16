# Delta: Jogos do Bot

**Change ID:** `add-bot-game-pega-pega`
**Affects:** registro de jogos, papéis, fases da rodada, sessão de pega-pega

> Toda fala de uma rodada sai do repertório local, nunca da IA — mesmo motivo
> dos avisos de combate. O catálogo está em `local_dialogue.md`.

---

## ADDED

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

> Cenário acrescentado durante a implementação (2026-08-16): sem essa garantia o
> laço rodava sem o relógio andar e sem ceder o processador — em teste travava
> para sempre, e em jogo teria virado 100% de CPU.

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

## MODIFIED

### Requirement: Registro de jogos conhecidos

O bot conhece um conjunto **fechado** de jogos, cada um com nome e papéis. Pedido
de jogo fora da lista nunca inicia rodada e nunca fica sem resposta.

O registro passa a ter **dois** jogos: `esconde_esconde` e `pega_pega`.

#### Scenario: Jogo conhecido
- **GIVEN** o registro contém `esconde_esconde` e `pega_pega`
- **WHEN** a intenção `PLAY_GAME{game: "pega_pega"}` chega
- **THEN** a sessão correspondente é criada e o bot entra em `GAME`

#### Scenario: Jogo desconhecido
- **GIVEN** o registro não contém `xadrez`
- **WHEN** `Miguel` digita `dudu, vamos jogar xadrez`
- **THEN** nenhuma rodada é iniciada e o estado não muda
- **AND** o bot responde que ainda não aprendeu esse
- **AND** oferece **as duas** brincadeiras que ele sabe

#### Scenario: Jogos desligados na configuração
- **GIVEN** `games.enabled` é `false`
- **WHEN** `Miguel` convida o bot para brincar
- **THEN** nenhuma rodada é iniciada
- **AND** o bot responde honestamente que agora não dá para brincar
- **AND** a resposta **não** oferece nenhuma das brincadeiras — oferecer o que
  está desligado é prometer capacidade que o bot não tem

---

### Requirement: Convite genérico escolhe entre as brincadeiras

Com duas brincadeiras no registro, `vamos brincar` sem nome de jogo deixa de
escolher pela criança.

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

#### Scenario: Resposta à pergunta inicia a rodada
- **GIVEN** o bot acabou de perguntar qual brincadeira
- **WHEN** `Miguel` digita `pega pega`
- **THEN** a rodada de pega-pega começa normalmente, pelo parser de comandos
- **AND** nenhuma chamada de IA acontece no caminho

---

### Requirement: Estado `GAME` e prioridade

Uma rodada em andamento é um estado próprio da máquina de estados, com
prioridade igual à de `ACTION`. Uma rodada interrompida é **descartada**, nunca
retomada. Vale igual para os dois jogos.

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

O pega-pega **não usa** linha de visão em nenhuma fase: ninguém está escondido,
e o que decide a rodada é distância e tempo. Os cenários de raycast continuam
valendo só para o esconde-esconde.

#### Scenario: Perseguição sem raycast
- **GIVEN** uma rodada de pega-pega em andamento
- **WHEN** o bot persegue ou foge
- **THEN** nenhuma consulta de linha de visão acontece
- **AND** a decisão usa a posição que o protocolo já entrega

---

### Requirement: Fim de rodada por evento do mundo

Nenhuma rodada fica pendurada. Todo caminho de saída passa por uma fala no chat
e pelo bot parando de se mover. Vale igual para os dois jogos.

#### Scenario: Jogador sai do servidor no meio da corrida
- **GIVEN** uma rodada de pega-pega está em andamento
- **WHEN** o dono desconecta
- **THEN** a rodada termina com resultado `cancelado`
- **AND** o bot para de correr, desliga o sprint e volta para `IDLE`

#### Scenario: Rede de segurança do tempo total
- **GIVEN** uma rodada em andamento
- **WHEN** `roundTimeoutMs` passa
- **THEN** a rodada termina com resultado `tempo_esgotado`
- **AND** o desfecho é **distinto** do `perdeu` por cansaço, que é regra do jogo

---

## REMOVED

(Nenhum requisito removido. O papel padrão global `DEFAULT_ROLE` deixa de existir
como constante única, substituído pelo mapa por jogo descrito em "Papel padrão
por jogo" — mudança de forma, não de comportamento do esconde-esconde.)
