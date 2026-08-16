# Delta: Jogos do Bot

**Change ID:** `fix-hide-and-seek-cover`
**Affects:** `src/behaviors/games/`, `src/minecraft/visibility.ts`, `src/app/bot.ts`

---

## ADDED

### Requirement: Cobertura sólida no esconderijo

Estar fora da linha de visão não basta. O esconderijo precisa ter **bloco sólido
em volta** — parede, tronco, barranco —, medido nas duas alturas do corpo do bot.

> Sem isto, um ponto no descampado passa por esconderijo enquanto o jogador
> estiver olhando para outro lado. Ele vira a cabeça e a brincadeira acaba.

#### Scenario: Descampado não é esconderijo
- **GIVEN** um ponto sem bloco sólido nenhum em volta
- **AND** o jogador não tem linha de visão até ele neste instante
- **WHEN** o bot avalia o ponto
- **THEN** o ponto é recusado

#### Scenario: Cobertura zero nunca é aceita
- **GIVEN** todo ponto fora da linha de visão está em campo aberto
- **WHEN** `hideSearchMs` se esgota
- **THEN** o bot recusa a rodada com fala honesta
- **AND** **não** se esconde em nenhum deles

#### Scenario: Cobertura fraca serve de reserva
- **GIVEN** nenhum ponto atinge a cobertura ideal (2 direções)
- **AND** existe ponto com cobertura de ao menos 1 direção
- **WHEN** `hideSearchMs` se esgota
- **THEN** o bot se esconde no de maior cobertura entre eles

#### Scenario: Folhagem não esconde
- **GIVEN** um ponto cercado só de folhas ou placas
- **WHEN** a cobertura é medida
- **THEN** ela conta zero — o critério é a caixa de colisão, a mesma que o
  pathfinder usa para obstáculo

#### Scenario: Degrau de um bloco não esconde
- **GIVEN** um ponto ao lado de um bloco solitário na altura dos pés
- **WHEN** a cobertura é medida
- **THEN** ela conta zero — o bot tem dois blocos de altura

---

### Requirement: Candidato medido no chão de verdade

Cada ponto candidato é resolvido até a superfície em que o bot ficaria **de pé**
antes de qualquer medição de visão ou cobertura.

> O candidato nasce com a altura do jogador. Num morro, medir nessa altura
> acontece **dentro da terra**: cobertura máxima, raio bloqueado, esconderijo
> perfeito no papel — e o pathfinder larga o bot no topo, à vista de todos.

#### Scenario: Ponto num morro acima do jogador
- **GIVEN** um candidato cujo terreno está 6 blocos acima do jogador
- **WHEN** o bot avalia visibilidade e cobertura
- **THEN** a medição acontece na altura da superfície do morro
- **AND** não na altura do jogador

#### Scenario: Ponto numa depressão
- **GIVEN** um candidato cujo terreno está abaixo do jogador
- **WHEN** o bot avalia o ponto
- **THEN** a medição acompanha o terreno para baixo

#### Scenario: Espaço insuficiente
- **GIVEN** uma coluna com apenas um bloco de ar entre sólidos
- **WHEN** o chão é resolvido
- **THEN** nenhuma posição é devolvida — o bot não cabe

#### Scenario: Chunk fora de alcance
- **GIVEN** um candidato numa área não carregada
- **WHEN** o chão é resolvido
- **THEN** o candidato é descartado, sem derrubar a rodada

---

### Requirement: Busca com orçamento de tempo

O bot anda pelo entorno procurando esconderijo por até `hideSearchMs`, trocando
de ponto de observação a cada volta.

> Andar não é enfeite: o raycast só enxerga chunk carregado, então avaliar sem
> sair do lugar devolve sempre a mesma resposta.

#### Scenario: Procurar andando
- **GIVEN** nenhum candidato avaliado daqui tem cobertura
- **WHEN** o bot termina a volta
- **THEN** ele caminha para outro ponto de observação e avalia de novo

#### Scenario: Parar no prazo
- **GIVEN** a busca está em andamento
- **WHEN** `hideSearchMs` se esgota
- **THEN** o bot para de procurar
- **AND** usa a melhor reserva, ou recusa a rodada se não houver

#### Scenario: Caminhada travada não fura o prazo
- **GIVEN** o pathfinder emperra a caminho de um ponto de observação
- **WHEN** o teto por caminhada se esgota
- **THEN** a caminhada é abandonada e a busca continua
- **AND** o prazo total é respeitado

---

## MODIFIED

### Requirement: Linha de visão

O alcance do raycast que testa a visão do jogador **cobre toda a faixa de
esconderijo**, com folga sobre `hideMaxDistance`.

#### Scenario: Distância nunca substitui oclusão
- **GIVEN** um ponto a 28 blocos do jogador, em campo aberto
- **AND** `seeDistance` é 20 e `hideMaxDistance` é 30
- **WHEN** a visibilidade é consultada para fins de esconderijo
- **THEN** o ponto é considerado **visível**
- **AND** não "escondido" só por estar além de `seeDistance`

> Este era o defeito original: com o alcance em `seeDistance`, todo ponto entre
> 20 e 30 blocos voltava "não visível" por aritmética. Como o desempate preferia
> o mais distante, o bot ia sempre parar nessa faixa, no descampado.

---

### Requirement: Esconde-esconde — o bot se esconde

A ordenação dos esconderijos passa a ser **cobertura primeiro**, e a conferência
de chegada passa a olhar cobertura além de visão.

#### Scenario: Cobertura ganha de distância
- **GIVEN** um ponto a 28 blocos sem cobertura e outro a 12 blocos com cobertura
- **WHEN** o bot ordena os candidatos
- **THEN** o de 12 blocos vence

#### Scenario: Onde ele parou é o que vale
- **GIVEN** o bot chegou perto do esconderijo, mas não exatamente nele
- **WHEN** a posição final é avaliada
- **THEN** visão **e** cobertura são medidas na posição real do bot
- **AND** se ela estiver exposta ou descoberta, a rodada é recusada

---

### Requirement: Esconde-esconde — o bot procura

A contagem vai até 20.

#### Scenario: Contar até 20 no chat
- **GIVEN** a rodada começou no papel de quem procura
- **WHEN** o bot conta
- **THEN** ele conta de 1 até 20, um número por mensagem
- **AND** a contagem inteira leva 20 segundos
- **AND** o mesmo tempo que ele levaria procurando esconderijo, para os dois
  lados da brincadeira terem a mesma folga

---

## REMOVED

(Nenhum requisito removido. O comportamento de "aceitar o menos ruim" foi
**restringido**, não retirado: a reserva continua existindo, mas nunca aceita
cobertura zero.)
