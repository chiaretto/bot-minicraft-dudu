# Delta: Aplicativo de desktop (`desktop_launcher`)

**Change ID:** `add-desktop-launcher`
**Affects:** componente novo — nenhum requisito existente é tocado por este delta

---

## ADDED

### Requirement: Ligar o bot pela janela

O aplicativo sobe o processo do bot sem que ninguém precise abrir terminal. Um
bot por vez: enquanto houver um de pé, o botão de chamar fica indisponível.

#### Scenario: Chamar o bot com o mundo aberto em LAN
- **GIVEN** a janela está aberta e o estado é `parado`
- **AND** o Minecraft está com o mundo aberto na porta que o `config.yaml` espera
- **WHEN** a criança clica em "Chamar o Odraude"
- **THEN** o aplicativo sobe o processo do bot a partir da pasta do repositório
- **AND** o estado passa por "Acordando..." e "Procurando seu mundo..."
- **AND** ao entrar no mundo o estado vira "O Odraude tá com você!" em verde

#### Scenario: Clique repetido não sobe dois bots
- **GIVEN** o bot já está ligado
- **WHEN** a criança clica de novo no botão de chamar
- **THEN** nenhum processo novo é criado
- **AND** o botão está desabilitado enquanto o estado não for `parado`

#### Scenario: Pasta do bot não encontrada
- **GIVEN** a pasta do repositório foi movida ou apagada
- **WHEN** a criança clica em chamar
- **THEN** o aplicativo não trava nem fecha
- **AND** a janela mostra uma frase curta dizendo que não achou o bot

---

### Requirement: Desligar o bot com saída limpa

Parar pela janela desconecta o bot do mundo do mesmo jeito que `Ctrl+C` no
terminal: ele avisa o servidor e sai. Matar o processo sem aviso deixaria um
fantasma parado no mundo até o servidor derrubá-lo por timeout, e a criança
veria um "Odraude" imóvel que não responde.

#### Scenario: Mandar dormir no Windows
- **GIVEN** o bot está dentro do mundo
- **WHEN** a criança clica em "Mandar dormir"
- **THEN** o aplicativo pede a parada pelo canal de parada, não por sinal
- **AND** o bot desconecta limpo e some do mundo
- **AND** o estado vira "O Odraude tá dormindo." em cinza

#### Scenario: Bot não responde ao pedido de parada
- **GIVEN** a parada foi pedida
- **AND** o processo não terminou dentro do tempo de espera
- **WHEN** o tempo de espera acaba
- **THEN** o aplicativo encerra o processo à força
- **AND** o estado vira `parado`

#### Scenario: Fechar a janela com o bot de pé
- **GIVEN** o bot está ligado
- **WHEN** a janela é fechada
- **THEN** o bot é parado pelo mesmo caminho gracioso
- **AND** nenhum processo do bot fica órfão na máquina

---

### Requirement: Reiniciar o bot

Reiniciar é parar por inteiro e subir de novo — é assim que uma porta corrigida
passa a valer.

#### Scenario: Acordar de novo depois de trocar a porta
- **GIVEN** o bot está ligado e a porta foi corrigida na janela
- **WHEN** a criança clica em "Acordar de novo"
- **THEN** o bot para com saída limpa
- **AND** só depois de o processo antigo terminar um novo é iniciado
- **AND** o novo processo usa a porta corrigida

#### Scenario: Reiniciar com o bot já parado
- **GIVEN** o estado é `parado`
- **WHEN** o botão de reiniciar é usado
- **THEN** o bot simplesmente é iniciado, sem erro

---

### Requirement: Estado em palavra de criança

A tela principal é lida por uma criança de 7 anos. Vale a regra número um
(`openspec/project.md` → "Público do bot"): frase curta, palavra simples, tom de
amigo, e quando algo dá errado a frase ensina o passo seguinte.

A janela distingue **processo vivo** de **dentro do mundo** — as duas coisas
parecem iguais de fora e significam coisas muito diferentes para quem espera o
bot aparecer.

#### Scenario: Nenhuma palavra técnica na tela principal
- **GIVEN** a janela está aberta em qualquer estado
- **WHEN** a tela principal é lida
- **THEN** não aparece "processo", "porta", "servidor", "conexão", "stdout",
  "erro", "exception" nem código de erro
- **AND** cada estado tem uma frase de uma linha e uma cor

#### Scenario: Tentando conectar não é o mesmo que conectado
- **GIVEN** o processo do bot subiu
- **AND** ele ainda não entrou no mundo
- **WHEN** a criança olha a janela
- **THEN** a frase é "Procurando seu mundo..." e a cor é de espera
- **AND** só depois de o bot entrar no mundo a frase vira "tá com você"

#### Scenario: Mundo não encontrado ensina o passo seguinte
- **GIVEN** as tentativas de conexão se esgotaram
- **WHEN** o estado vira `desistiu`
- **THEN** a frase pergunta se o mundo está aberto para LAN
- **AND** não mostra tentativa, tempo de espera nem mensagem de biblioteca

#### Scenario: O bot é chamado pelo nome dele
- **GIVEN** o `config.yaml` tem `persona.name: "Odraude"`
- **WHEN** a janela é aberta
- **THEN** os botões e as frases usam "Odraude"

---

### Requirement: Corrigir a porta do LAN sem editor de texto

A porta do LAN muda toda vez que o mundo é aberto. A janela deixa corrigir
`server.port` no `config.yaml`, preservando o arquivo — inclusive todo o
comentário, que é o que explica a configuração para quem for mexer nela depois.

Este campo mora no bloco recolhido de adulto, fechado por padrão.

#### Scenario: Trocar a porta preserva o arquivo
- **GIVEN** o `config.yaml` tem comentários explicando os blocos
- **WHEN** a porta é alterada pela janela e salva
- **THEN** o arquivo passa a ter o novo valor em `server.port`
- **AND** todos os comentários continuam onde estavam
- **AND** nenhum outro valor do arquivo muda

#### Scenario: Porta fora da faixa é recusada
- **GIVEN** o campo de porta está aberto
- **WHEN** um valor que não é inteiro entre 1 e 65535 é digitado
- **THEN** a gravação não acontece
- **AND** a janela avisa em uma frase curta

#### Scenario: Porta trocada com o bot de pé
- **GIVEN** o bot está ligado
- **WHEN** a porta é salva
- **THEN** a janela avisa que precisa reiniciar para valer
- **AND** o bot em execução não é derrubado sozinho

#### Scenario: Escrita interrompida não corrompe a configuração
- **GIVEN** a gravação da porta é interrompida no meio
- **WHEN** o bot é iniciado depois
- **THEN** o `config.yaml` continua legível e válido

---

### Requirement: Log ao vivo para o adulto

O log existe para o adulto descobrir por que o bot não conectou sem abrir
terminal. Fica no bloco recolhido, nunca na tela principal.

#### Scenario: Ver o log durante uma sessão
- **GIVEN** o bot está ligado
- **WHEN** o bloco "Coisas de adulto" é aberto
- **THEN** a saída do bot aparece numa área rolável, linha a linha
- **AND** as linhas do canal de status não aparecem como log

#### Scenario: Sessão longa não estoura a memória
- **GIVEN** o bot está de pé há horas, produzindo log
- **WHEN** o número de linhas passa do teto
- **THEN** as linhas mais antigas são descartadas
- **AND** a janela continua respondendo

---

### Requirement: Ícone e atalho na área de trabalho

#### Scenario: Instalar o aplicativo
- **GIVEN** o instalador gerado é executado no Windows
- **WHEN** a instalação termina
- **THEN** existe um atalho na área de trabalho com ícone próprio
- **AND** existe uma entrada no menu iniciar

#### Scenario: Abrir pelo atalho
- **GIVEN** o atalho existe
- **WHEN** ele recebe um duplo clique
- **THEN** a janela abre no estado `parado`
- **AND** nenhuma janela de terminal aparece

---

### Requirement: O bot continua rodável sem o aplicativo

O aplicativo é conveniência, não dependência. O caminho do terminal continua
existindo, e o pacote do bot não passa a depender de um runtime de interface
gráfica.

#### Scenario: Subir pelo terminal como sempre
- **GIVEN** o aplicativo nunca foi instalado
- **WHEN** alguém roda `npm run dev` na raiz
- **THEN** o bot sobe exatamente como subia antes desta mudança

#### Scenario: Instalação da raiz não carrega o Electron
- **GIVEN** um clone novo do repositório
- **WHEN** `npm install` roda na raiz
- **THEN** o Electron não é baixado
- **AND** `npm test` roda sem nenhuma dependência de interface gráfica

---

## MODIFIED

(Nenhum — componente novo. As mudanças no bot estão em
`startup_console_delta.md`.)

---

## REMOVED

(Nenhum)
