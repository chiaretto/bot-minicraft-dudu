# Delta: Comandos do jogador

**Change ID:** `add-death-spot`
**Affects:** `minecraft/client.ts`, `app/bot.ts`, `domain/intent.ts`,
`behaviors/commands.ts`

---

## ADDED

### Requirement: Voltar onde o dono morreu

O bot guarda onde o dono morreu da última vez e leva ele de volta com
`GO_TO_DEATH_SPOT`.

A intenção **não tem parâmetro**: a coordenada mora na memória do bot, não no
pedido. É o contrário exato de `GOTO_COORDS`, e é o que permite a frase ser
decorada sem mentir amanhã.

#### Scenario: A morte é vista e guardada
- **GIVEN** o dono morre perto do bot
- **WHEN** o evento chega
- **THEN** o lugar e o horário ficam guardados
- **AND** o bot fala uma variação de `evento_dono_morreu`
- **AND** a promessa dessa fala ("eu marquei onde foi") passa a ser verdade

#### Scenario: Ele leva de volta
- **GIVEN** existe um lugar guardado
- **WHEN** a criança digita `me leva onde eu morri`
- **THEN** o parser resolve no nível 1, sem IA
- **AND** o bot vai até a coordenada guardada
- **AND** avisa que sabe onde foi

#### Scenario: Depois de cinco minutos ele avisa antes de ir
- **GIVEN** a morte foi há mais de cinco minutos
- **WHEN** o pedido chega
- **THEN** o bot diz quantos minutos faz e que as coisas podem ter sumido
- **AND** vai assim mesmo — quem decide se vale a pena é a criança

#### Scenario: Sem morte nenhuma vista
- **GIVEN** o bot ainda não viu o dono morrer, ou acabou de reconectar
- **WHEN** o pedido chega
- **THEN** ele diz que não viu e não sabe para onde levar
- **AND** oferece o que funciona: ficar por perto para ver a próxima

#### Scenario: A frase pode ser decorada, o lugar não
- **GIVEN** a IA resolveu um pedido em `GO_TO_DEATH_SPOT`
- **WHEN** o cache avalia a gravação
- **THEN** a frase pode ser decorada
- **AND** a razão é que os parâmetros são vazios: o lugar sai da memória do
  bot na hora do replay, e é sempre o mais recente

---

## MODIFIED

### Requirement: Catálogo de ações executáveis

O catálogo ganha `GO_TO_DEATH_SPOT`, proposta pela IA e aprendível.

#### Scenario: Pedido em palavras livres
- **WHEN** a criança diz "cadê minhas coisas que eu perdi?"
- **THEN** a IA pode propor `GO_TO_DEATH_SPOT`
- **AND** a ação passa pela mesma validação de sempre
