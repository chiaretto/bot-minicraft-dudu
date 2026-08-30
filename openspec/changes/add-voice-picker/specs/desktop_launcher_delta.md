# Delta: Aplicativo de desktop

**Change ID:** `add-voice-picker`
**Affects:** `launcher/src/voice.ts`, `launcher/src/preload.ts`, `launcher/ui/`

---

## ADDED

### Requirement: Escolher a voz do bot

"Coisas de adulto" ganha três controles — voz, velocidade e tom — e um botão de
ouvir. A escolha é lembrada entre sessões.

Ficam do lado do adulto porque quem ajusta timbre é quem instalou o bot; a caixa
de ligar e desligar a voz continua na tela da criança.

#### Scenario: A lista mostra o que dá para usar
- **GIVEN** o sistema tem vozes em vários idiomas
- **WHEN** a lista é montada
- **THEN** só as em português aparecem
- **AND** as `pt-BR` vêm antes das `pt-PT`
- **AND** a razão é que uma voz em inglês lendo "tá esquentando!" sai como outra
  língua, e a criança não reconhece nada

#### Scenario: Escolher fala na hora
- **WHEN** o adulto escolhe outra voz na lista
- **THEN** o bot fala a frase de teste com a voz nova
- **AND** a razão é que nome de voz do Windows não diz nada sobre como ela soa

#### Scenario: A escolha é lembrada
- **GIVEN** uma voz foi escolhida
- **WHEN** o aplicativo é fechado e aberto de novo
- **THEN** ela continua escolhida

#### Scenario: Voz que sumiu não cala o bot
- **GIVEN** a voz salva foi desinstalada, ou o perfil é de outro computador
- **WHEN** o bot vai falar
- **THEN** ele usa a melhor voz em português disponível
- **AND** não avisa nada: calar seria pior que trocar

#### Scenario: Sem voz em português, ele ainda fala
- **GIVEN** o sistema não tem nenhuma voz em português
- **WHEN** o bot fala
- **THEN** a voz padrão do sistema é usada
- **AND** a lista diz que não há voz em português instalada

#### Scenario: Velocidade e tom mudam a fala
- **WHEN** o adulto arrasta os controles
- **THEN** a fala seguinte usa os valores novos
- **AND** o bot só fala quando o dedo sai do controle — falar a cada pixel
  arrastado cortaria a própria fala

#### Scenario: Valor impossível não emudece o bot
- **GIVEN** um valor fora da faixa aceita, vindo do armazenamento
- **WHEN** ele é lido
- **THEN** ele é trazido para dentro da faixa
- **AND** a razão é que `speechSynthesis` ignora a fala **inteira** quando o
  valor é inválido: o sintoma seria o bot emudecer sem motivo aparente

#### Scenario: O padrão é o que já era
- **GIVEN** um aplicativo que nunca teve a voz ajustada
- **WHEN** ele abre
- **THEN** velocidade e tom são 1
- **AND** mudar sozinho a voz de quem já estava usando seria surpresa

#### Scenario: A lista chega depois
- **GIVEN** `getVoices()` devolve vazio na primeira chamada, como em quase todo
  Chromium
- **WHEN** o sistema termina de carregar as vozes
- **THEN** a lista é redesenhada sozinha

---

## MODIFIED

### Requirement: Ler as falas em voz alta

A escolha da voz deixa de ser automática. O que este requisito descreve continua
valendo — inclusive a fala nova cancelando a anterior; o que muda é **qual** voz
e em que velocidade.

#### Scenario: A fala do bot usa a voz escolhida
- **GIVEN** o adulto escolheu uma voz e ajustou velocidade e tom
- **WHEN** o bot fala no chat
- **THEN** a leitura usa essa voz e esses ajustes

---

## REMOVED

(None)
