# Delta: Repertório local

**Change ID:** `fix-chat-noise-and-learned-quality`
**Affects:** `data/repertoire.yaml`, `src/dialogue/default-repertoire.yaml`

---

## ADDED

### Requirement: Entrada `comando_esquecido`

A resposta do bot quando a criança corrige um comando aprendido errado
(`nao era isso`, `errado`) e o aprendizado é desfeito.

Como toda entrada do repertório, tem no mínimo 4 variações e segue a regra
número um. O bot admite o erro, não se justifica, e convida a ensinar de novo —
uma criança de 7 anos que corrige o amigo espera "desculpa", não um relatório.

Nenhuma palavra técnica pode aparecer: "cache", "entrada", "removida",
"histórico" e "aprendizado" estão fora.

#### Scenario: O bot esquece e diz que esqueceu
- **GIVEN** o bot replicou um comando aprendido errado
- **WHEN** a criança digita `nao era isso`
- **AND** a entrada é apagada
- **THEN** o bot responde uma variação de `comando_esquecido`
- **AND** a fala tem uma ou duas frases curtas
- **AND** convida a criança a pedir de novo ("me ensina de novo?")

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

#### Scenario: As duas cópias em sincronia
- **GIVEN** a entrada foi escrita em `data/repertoire.yaml`
- **WHEN** a rodada termina
- **THEN** `npm run repertoire:sync -- --check` não acusa diferença
- **AND** a semente versionada tem a mesma entrada

---

## MODIFIED

### Requirement: Cascata de resolução de mensagens

A cascata continua com quatro níveis e nenhuma mudança de ordem. O que muda é
**o que entra nela**: retorno de comando do jogo é cortado na borda e nunca
chega ao nível 1 (ver `minecraft_connection_delta.md`).

Antes, `Set own game mode to Creative Mode]` descia a cascata inteira, não casava
com nada e terminava numa chamada de IA — que respondia com entusiasmo a uma
frase que o Minecraft escreveu.

#### Scenario: Eco de sistema não desce a cascata
- **GIVEN** o dono usa um comando do jogo
- **WHEN** o servidor devolve o retorno
- **THEN** nenhum nível da cascata é consultado
- **AND** o bot não fala nada

---

### Requirement: Nenhuma fala nega capacidade que o bot tem

*(Sem mudança de regra. Registrado porque a entrada nova entra na varredura: ao
escrever `comando_esquecido`, nenhuma variação pode dizer que o bot "não aprende"
ou "não sabe decorar" — ele aprende, e acabou de esquecer uma coisa só.)*

---

## REMOVED

(None)
