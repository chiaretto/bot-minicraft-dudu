# Delta: Defesa e cuidado do bot

**Change ID:** `add-survival-instincts`
**Affects:** `domain/survival.ts`, `behaviors/actions/index.ts`, `app/bot.ts`

---

## ADDED

### Requirement: Instintos de sobrevivência

O bot come quando está com fome e acende tocha quando está escuro. As duas
coisas são **determinísticas e periódicas**, como a defesa, e nunca passam por
IA: fome e escuro são estado do mundo, não assunto de conversa.

O laço é próprio, com passo de `survivalTickMs` — fome e escuro mudam devagar, e
olhar para eles quatro vezes por segundo seria desperdício.

#### Scenario: Come quando a fome aperta
- **GIVEN** `autoEat` é `true` e a fome do bot chegou em `eatBelowFood`
- **AND** ele tem pão na mochila
- **WHEN** o laço de instintos roda
- **THEN** ele come
- **AND** fala uma variação de `evento_fome`, para a criança entender por que
  ele parou

#### Scenario: De barriga cheia não come
- **GIVEN** a fome está acima do limiar
- **WHEN** o laço roda
- **THEN** nada acontece
- **AND** a razão é que comer cheio desperdiça comida que a criança pode
  precisar depois

#### Scenario: Acende tocha no escuro
- **GIVEN** `autoTorch` é `true`, a luz onde ele está é menor que
  `torchBelowLight` e ele tem tocha
- **WHEN** o laço roda
- **THEN** uma tocha é posta no chão onde ele está
- **AND** ele fala uma variação de `evento_tocha`

#### Scenario: Uma tocha, não uma fileira
- **GIVEN** ele acabou de acender uma tocha
- **WHEN** o laço roda de novo no mesmo lugar
- **THEN** nada acontece
- **AND** só volta a acender depois de `torchMinIntervalMs` **e** a
  `torchMinDistance` da última

#### Scenario: No meio de uma briga, o instinto espera
- **GIVEN** o bot está em `DEFEND`, `GAME` ou `EMERGENCY`
- **WHEN** o laço roda com fome e escuro
- **THEN** nada acontece
- **AND** a razão é que comer trava o bot por quase dois segundos: quem foge de
  creeper não para para comer pão

#### Scenario: Uma coisa por vez
- **GIVEN** ele está com fome **e** no escuro
- **WHEN** o laço roda
- **THEN** ele come nesta passada e acende na seguinte
- **AND** fazer as duas juntas deixaria a criança falando sozinha

#### Scenario: Instinto nunca derruba o bot
- **GIVEN** o servidor recusa o `consume` ou o `placeBlock`
- **WHEN** a falha acontece
- **THEN** ela é engolida e registrada em `debug`
- **AND** o bot continua fazendo o que estava fazendo

---

### Requirement: Catálogo fechado de comida

Só entra no cardápio o que está em `FOOD_ITEMS`. Fechado pelo mesmo motivo dos
outros catálogos do projeto: sem ele o bot come o que a criança lhe deu para
guardar.

#### Scenario: Item raro não vira lanche
- **GIVEN** o bot carrega uma maçã dourada que a criança pediu para guardar
- **WHEN** ele fica com fome
- **THEN** ele **não** come a maçã dourada
- **AND** procura pão, carne assada, cenoura — o que estiver no catálogo

#### Scenario: Comida que faz mal fica de fora
- **GIVEN** o bot carrega carne crua e carne podre
- **WHEN** ele fica com fome
- **THEN** nenhuma das duas é comida
- **AND** a razão é que as duas tiram vida em vez de dar

---

## MODIFIED

### Requirement: Comportamento de emergência

*(Sem mudança de regra. Registrado porque o instinto **respeita** a emergência:
em `EMERGENCY` o bot não come nem acende tocha — a emergência manda, e comer
travaria o bot justamente quando ele precisa se afastar.)*

---

## REMOVED

(None)
