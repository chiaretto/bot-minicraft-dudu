# Especificação: Jogos do Bot

**Componente:** `bot_games`
**Origem:** `add-bot-games-hide-and-seek` (2026-08-15)
**Atualizado por:** `fix-hide-and-seek-cover` (2026-08-16)

> Toda fala de uma rodada sai do repertório local, nunca da IA — mesmo motivo
> dos avisos de combate. O catálogo está em `local_dialogue.md`.

---

## Requisitos

### Requirement: Registro de jogos conhecidos

O bot conhece um conjunto **fechado** de jogos, cada um com nome e papéis. Pedido
de jogo fora da lista nunca inicia rodada e nunca fica sem resposta.

#### Scenario: Jogo conhecido
- **GIVEN** o registro contém `esconde_esconde`
- **WHEN** a intenção `PLAY_GAME{game: "esconde_esconde"}` chega
- **THEN** a sessão correspondente é criada e o bot entra em `GAME`

#### Scenario: Jogo desconhecido
- **GIVEN** o registro não contém `xadrez`
- **WHEN** `Miguel` digita `dudu, vamos jogar xadrez`
- **THEN** nenhuma rodada é iniciada e o estado não muda
- **AND** o bot responde que ainda não aprendeu esse
- **AND** oferece o que ele sabe brincar

#### Scenario: Jogos desligados na configuração
- **GIVEN** `games.enabled` é `false`
- **WHEN** `Miguel` convida o bot para brincar
- **THEN** nenhuma rodada é iniciada
- **AND** o bot responde honestamente que agora não dá para brincar
- **AND** a resposta **não** oferece o esconde-esconde — oferecer o que está
  desligado é prometer capacidade que o bot não tem

---

### Requirement: Estado `GAME` e prioridade

Uma rodada em andamento é um estado próprio da máquina de estados, com
prioridade igual à de `ACTION`. Uma rodada interrompida é **descartada**, nunca
retomada.

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

---

### Requirement: Linha de visão

Toda decisão do jogo que envolve "ver" usa linha de visão real por raycast, nunca
só distância. A consulta é sob demanda, fora do snapshot que roda no laço de
defesa.

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

### Requirement: Fim de rodada por evento do mundo

Nenhuma rodada fica pendurada. Todo caminho de saída passa por uma fala no chat.

#### Scenario: Jogador sai do servidor
- **GIVEN** uma rodada está em andamento
- **WHEN** o dono desconecta
- **THEN** a rodada termina com resultado `cancelado`
- **AND** o bot volta para `IDLE`

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
- **WHEN** uma rodada de esconde-esconde acontece do início ao fim
- **THEN** todas as falas saem do repertório local
- **AND** nenhuma chamada de provider é feita em nenhuma fase

#### Scenario: Provider fora do ar no meio da rodada
- **GIVEN** `llm.provider` é `'ollama'` e o Ollama caiu
- **WHEN** a rodada continua
- **THEN** o jogo funciona integralmente, sem atraso e sem fala faltando
