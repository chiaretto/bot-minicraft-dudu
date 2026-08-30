# Delta: Comandos do jogador (`player_commands`)

**Change ID:** `fix-attack-on-command`
**Affects:** `src/behaviors/commands.ts`, `src/domain/intent.ts`,
`src/domain/mobs.ts`, `src/behaviors/actions/`, `src/ai/prompt.ts`

---

## ADDED

### Requirement: Comando de ataque

A criança pode mandar o bot atacar um monstro. O comando mora no **nível 1** da
cascata — parser determinístico — e a IA **não** recebe a intenção
correspondente.

A razão é a regra do projeto: combate e defesa são determinísticos e nunca
dependem de uma chamada de IA. Escolher em quem bater é decisão de combate.

Antes desta mudança não existia nenhum caminho para atacar sob comando, e o
sintoma era o pior possível: a IA, sem ação para propor, **prometia** ("já tô
indo te ajudar!") e nada acontecia.

#### Scenario: Atacar o que está mais perto
- **GIVEN** um zumbi ameaça o dono
- **WHEN** a criança diz "ataca"
- **THEN** o parser resolve como ataque, sem consultar a IA
- **AND** o bot engaja o zumbi

#### Scenario: Atacar um tipo nomeado
- **GIVEN** há um zumbi a 3 blocos e um esqueleto a 8
- **WHEN** a criança diz "ataca o esqueleto"
- **THEN** o bot mira o **esqueleto**, não o zumbi mais perto

#### Scenario: O tipo pedido não está por perto
- **GIVEN** há um zumbi perto, mas nenhum esqueleto
- **WHEN** a criança diz "ataca o esqueleto"
- **THEN** o bot **não** mira o zumbi
- **AND** diz que não está vendo aquele bicho

> Mirar outro alvo seria atender um pedido que a criança não fez.

#### Scenario: Nada por perto
- **GIVEN** não há nenhuma criatura atacável por perto
- **WHEN** a criança manda atacar
- **THEN** o bot diz que não está vendo monstro nenhum
- **AND** não promete nada

#### Scenario: Nome de bicho fora do catálogo
- **GIVEN** a criança nomeia um bicho que o catálogo em português não conhece
- **WHEN** o comando é interpretado
- **THEN** **não** vira comando de ataque
- **AND** a frase desce na cascata como qualquer outra

> **Corrigido na implementação.** A proposta dizia que o pedido viraria ataque
> genérico ao mais perto. É perigoso: `mata a saudade` e `mata o tempo` são
> frases comuns, e com o comportamento antigo o bot sairia batendo em alguma
> coisa. Atacar o bicho errado é pior que não atacar — e a frase que desce na
> cascata vira conversa, que é o certo. A rotina diária colhe os nomes que
> faltam no catálogo.

#### Scenario: Frase que não é pedido de ataque continua sendo conversa
- **GIVEN** a criança diz "mata a saudade"
- **WHEN** o comando é interpretado
- **THEN** nenhum ataque acontece
- **AND** a frase desce para o repertório ou para a IA

#### Scenario: Comandos de controle da defesa não viram ataque
- **GIVEN** a criança diz "pode atacar" ou "nao ataca"
- **WHEN** o comando é interpretado
- **THEN** eles continuam ligando e desligando a **defesa automática**
- **AND** nenhum ataque é disparado

---

### Requirement: Catálogo de nomes de criatura em português

O comando de ataque traduz o nome falado pela criança para o nome do mob por um
**catálogo fechado**, a quinta lista fechada do projeto (junto de intenções,
plantas, jogos e intenções aprendíveis). Existe pelo mesmo motivo: limitar o que
o bot decide sozinho.

O catálogo cobre **hostis e pacíficos**. Incluir os pacíficos é o que faz a
recusa funcionar — sem `vaca` mapeada, "ataca a vaca" viraria um ataque genérico
ao monstro mais perto.

#### Scenario: Hostil reconhecido pelo nome em português
- **GIVEN** a criança diz "ataca a aranha"
- **WHEN** o comando é interpretado
- **THEN** o alvo pedido é a aranha

#### Scenario: Escrita errada e sem acento continua funcionando
- **GIVEN** a criança escreve sem acento, em maiúscula ou com pontuação repetida
- **WHEN** o comando é interpretado
- **THEN** o nome é reconhecido do mesmo jeito

> Escrita errada é o caso **normal** de entrada, não a exceção.

---

### Requirement: Recusa honesta de alvo proibido

Pedido de ataque a criatura protegida é recusado com frase **escrita à mão**, com
o mínimo de variações do repertório — nunca improviso da IA, nunca silêncio.

Isto não afrouxa nenhuma proteção: a denylist absoluta continua idêntica. O que
muda é a criança passar a **entender** a recusa.

#### Scenario: Bicho pacífico
- **GIVEN** há uma vaca por perto
- **WHEN** a criança diz "ataca a vaca"
- **THEN** o bot recusa com frase de criança, explicando que não machuca bichinho
- **AND** a vaca não recebe nenhum golpe

#### Scenario: Jogador nunca é alvo
- **GIVEN** a criança nomeia um jogador
- **WHEN** o comando é interpretado
- **THEN** nenhum ataque acontece, em nenhuma circunstância
- **AND** o bot diz que não briga com gente

#### Scenario: Bicho domesticado
- **GIVEN** há um lobo domesticado por perto
- **WHEN** a criança manda atacar ele
- **THEN** o bot recusa
- **AND** a guarda de domesticado é conferida de novo no instante do golpe

---

## MODIFIED

### Requirement: Catálogo de ações executáveis

O catálogo ganha `ATTACK`, com uma diferença que nenhuma outra intenção tem:
**ela é executável mas não é proponível pela IA**.

A IA precisa **saber que o comando existe** — sem isso ela continua improvisando
promessa quando a criança pede para atacar. Mas ela não ganha a ação: quem
resolve ataque é o parser.

`ATTACK` também fica **fora** das intenções aprendíveis, pela mesma regra que
mantém `GOTO_COORDS` fora: o parâmetro é um bicho daquele momento, não
vocabulário.

#### Scenario: A IA sabe do comando, mas não o propõe
- **GIVEN** a criança pede para atacar em linguagem livre
- **WHEN** a mensagem chega à IA
- **THEN** ela não devolve `ATTACK` como ação
- **AND** ela não promete atacar
- **AND** ela indica a frase de comando que funciona

#### Scenario: `ATTACK` não é decorado
- **GIVEN** um ataque sob comando terminou com sucesso
- **WHEN** o histórico de comandos aprendidos é atualizado
- **THEN** nenhuma entrada de `ATTACK` é gravada

---

## REMOVED

(Nenhum)
