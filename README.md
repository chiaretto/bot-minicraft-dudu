# bot-minicraft-dudu

Um amigo virtual para Minecraft Java Edition. O bot entra no seu mundo como
mais um jogador, conversa, obedece comandos e defende o dono de monstros.

Roda no mesmo computador do Minecraft. **Não precisa de internet nem de chave de
API** — a IA é opcional e local por padrão.

---

## Como o bot decide o que responder

Toda mensagem desce por uma cascata de três níveis. Cada um só passa adiante o
que não conseguiu resolver:

```
mensagem no chat
   │
   ├─ 1. Comando (regex)       → "vem", "fica aqui", "para"        ~0 ms
   ├─ 2. Repertório local      → "oi", "quem te criou?"            ~0 ms
   └─ 3. IA (opcional)         → o resto                        1 s – 12 s
```

A maior parte do que uma criança fala com um companheiro de jogo é repetitiva.
Resolver isso localmente deixa a resposta instantânea, gratuita, consistente com
a personalidade e imune a queda de API — e sobra para a IA só o imprevisível.

Consequência prática: **com a IA desligada o bot continua sendo um companheiro
utilizável**, não um boneco mudo.

---

## Instalação

### 1. Pré-requisitos

- **Node.js 20+**
- **Um servidor Minecraft acessível.** Um mundo single-player fechado não aceita
  conexão — abra o mundo para LAN (`Esc` → `Abrir para LAN`) ou rode um servidor
  local. Anote a porta.
- **Uma conta para o bot.** Ele entra como mais um jogador. Em servidor local
  com modo offline não precisa de conta real.

### 2. Instalar

```bash
npm install
cp config.example.yaml config.yaml
cp .env.example .env      # opcional: só é preciso se usar Gemini ou conta online
```

### 3. Configurar

Edite `config.yaml`. O mínimo é:

```yaml
ownerPlayer: 'SeuNomeNoMinecraft' # obrigatório
server:
  port: 25565 # a porta que o "Abrir para LAN" mostrou
  version: '1.21.4' # precisa bater com a do servidor
```

### 4. Rodar

```bash
npm run dev
```

O bot avisa que subiu e lembra o passo seguinte — abrir o mundo em LAN na porta
que ele está esperando:

```
╭──────────────────────────────────────────╮
│                                          │
│   Odraude está de pé!                    │
│   Só falta você abrir o mundo pra mim.   │
│                                          │
╰──────────────────────────────────────────╯

   1.  Abra o Minecraft na versão 1.21.11
   2.  Entre no mundo do FresherRobin90
   3.  Esc  ->  Abrir para LAN  ->  Iniciar mundo em LAN
   4.  Veja no chat a porta que o jogo mostrar

   Estou esperando em  localhost:55654

   A porta do LAN muda toda vez que você abre o mundo.
   Se o jogo mostrar outra, troque server.port no config.yaml.
```

O cartão é coisa de desenvolvimento: em produção (`NODE_ENV=production npm start`)
o `stdout` fica só com o log estruturado.

### Windows

O bot precisa rodar no **mesmo Windows onde o Minecraft está aberto** — um mundo
em LAN escuta em `localhost` do host, e o WSL não enxerga esse `localhost`.

```powershell
npm install        # rode pelo PowerShell; node_modules instalado no Linux não serve
npm run dev
```

Se o projeto estiver numa pasta do WSL (`\\wsl.localhost\...` ou um drive
mapeado), o watch do `tsx` falha com `EISDIR: watch` — o Windows não consegue
observar arquivos nesse compartilhamento. Use:

```powershell
npm run dev:once   # sem reload
```

Para ter reload, mova o repositório para um caminho nativo do Windows
(ex.: `C:\Users\<você>\bot-minicraft-dudu`) e rode `npm install` de novo lá.

> A versão máxima suportada pelo mineflayer hoje é **1.21.11**. Se o seu
> Minecraft for mais novo, crie uma instalação 1.21.11 no launcher e abra o mundo
> para LAN por ela — senão o servidor recusa a conexão na hora.

---

## Ligar o bot sem terminal

Quem vai jogar com o bot é uma criança, e criança não abre terminal. Existe um
aplicativo de desktop com um botão grande para chamar o bot, outro para mandar
ele dormir e um para acordar de novo.

```bash
npm run launcher:install   # uma vez: instala o Electron (só do launcher)
npm run launcher:build     # gera o instalador
```

O instalador sai em `launcher/release/Odraude Setup <versão>.exe`. Rode ele uma
vez: ele cria o atalho na área de trabalho e no menu iniciar. Daí em diante é
duplo clique no ícone.

A janela mostra em que pé está a conexão, em frase de criança:

| O que aparece | O que é |
|---|---|
| "O Odraude tá dormindo." | desligado |
| "Procurando seu mundo..." | ligado, ainda não entrou |
| "O Odraude tá com você!" | dentro do mundo |
| "Não achei seu mundo! Abriu ele pra LAN?" | não conseguiu entrar |

Em **"Coisas de adulto"** (fechado por padrão) ficam o log ao vivo e o campo da
**porta do LAN** — que muda toda vez que o mundo é aberto. Corrigir por ali
grava no `config.yaml` preservando os comentários; clique em "Acordar de novo"
para a porta nova valer.

O aplicativo executa o bot **a partir desta pasta do repositório**, não de uma
cópia embutida: é o que mantém `data/conversations/` e a rotina de repertório
funcionando. Se o repositório mudar de lugar, aponte a pasta nova pelo botão
"Escolher pasta do bot".

O terminal continua funcionando igual — `npm run dev` não mudou, e `npm install`
na raiz **não** baixa o Electron.

Para mexer no aplicativo:

```bash
npm run launcher:dev    # abre a janela a partir do código
npm run launcher:test   # testes das partes puras
```

---

## IA: local, nuvem ou nenhuma

O provider é plugável. Trocar é **uma linha** de `config.yaml`:

```yaml
llm:
  provider: 'ollama' # 'ollama' | 'gemini' | 'claude' | 'none'
```

### `ollama` — modelo local (padrão)

Sem custo, sem internet, nada sai da sua máquina.

```bash
# instale o Ollama: https://ollama.com
ollama pull qwen3:4b
ollama serve
```

**Escolha do modelo.** O modelo disputa CPU, RAM e GPU com o Minecraft — por
isso a recomendação é conservadora. Ela só funciona porque o repertório já
absorve a maior parte das falas.

| Modelo         | VRAM (Q4) | Português | Quando usar                             |
| -------------- | --------- | --------- | --------------------------------------- |
| `llama3.2:3b`  | ~2 GB     | razoável  | máquina apertada, GPU fraca             |
| **`qwen3:4b`** | ~2,5 GB   | bom       | **padrão recomendado**                  |
| `gemma3:4b`    | ~3 GB     | bom       | alternativa direta ao padrão            |
| `qwen3:8b`     | ~5 GB     | muito bom | GPU com folga (≥8 GB), sem shader pesado |

- **Abaixo de 3B não vale.** Em português esses modelos quebram a persona e
  alucinam de um jeito que a criança percebe.
- **Shader pesado + LLM na mesma GPU = engasgo.** Se o jogo travar, reduza o
  modelo antes de qualquer outra coisa.
- **CPU-only funciona com 3–4B**, custando 2–4 s por resposta.
- **Melhor cenário:** rodar o Ollama em **outra máquina da casa** e apontar
  `baseUrl` para ela. Zero disputa de recurso e dá para usar um modelo maior:

  ```yaml
  llm:
    ollama:
      baseUrl: 'http://192.168.0.20:11434'
  ```

O catálogo de modelos muda rápido — vale conferir `ollama.com/library` em vez de
tomar essa tabela como definitiva.

### `gemini` — nuvem

Respostas melhores na cauda longa, com custo e dependência de internet.

```yaml
llm:
  provider: 'gemini'
```

```bash
# no .env
GEMINI_API_KEY=sua-chave-aqui
```

### `claude` — nuvem, pela sua assinatura

Fala com o Claude pelo **Claude Code rodando local**, usando a credencial da
**assinatura** — não é chave de API cobrada por token.

```yaml
llm:
  provider: 'claude'
```

```bash
claude setup-token     # gera a credencial
# no .env
CLAUDE_CODE_OAUTH_TOKEN=a-credencial-gerada
```

Se você já usa o Claude Code nesta máquina, o login existente serve e o `.env`
nem é necessário.

**A cota é a sua.** Diferente de uma chave de API com crédito próprio, é a mesma
assinatura que você usa no Claude Code do dia a dia — uma criança conversando a
tarde inteira consome dela. O `maxCallsPerMinute` limita o ritmo.

**Latência medida** (5 frases reais do log, mesma máquina, mesmo dia):

| | mediana | pior caso | falhas |
|---|---|---|---|
| `claude` (haiku 4.5) | **1,6 s** | 2,4 s | 0/5 |
| `gemini` (flash-lite) | 11,2 s | 16,4 s | 0/5 |

O que faz a diferença não é o modelo, é a **sessão viva**: o Claude Code sobe um
subprocesso, e isso leva ~14 s. O bot paga essa subida no startup
(`warmUpOnStart`), longe da criança, e reaproveita a sessão nas falas seguintes.
Com o aquecimento desligado, a primeira frase da criança paga os 14 s.

### `none` — sem IA

O bot roda só com comandos e repertório. Nenhuma dependência externa.

### Fallback entre providers

```yaml
llm:
  provider: 'ollama'
  fallbackProvider: 'gemini' # desligado por padrão (null)
```

> ⚠️ **Privacidade:** com o primário local e reserva na nuvem, as mensagens do
> jogador **passam a sair da máquina** quando o Ollama falha. O bot avisa isso no
> log ao iniciar. Deixe `null` para que nada trafegue para fora, nunca.

---

## O que o bot entende

### Comandos (nível 1 — instantâneos, funcionam sem IA)

| Você diz                             | O bot faz                          |
| ------------------------------------ | ---------------------------------- |
| `dudu, vem` / `me segue` / `vem comigo` | segue você a 3 blocos           |
| `dudu, fica aqui` / `me espera`      | memoriza o ponto e fica de guarda  |
| `dudu, para` / `chega`               | cancela tudo em menos de 1 s       |
| `dudu, não briga`                    | desliga a defesa automática        |
| `dudu, pode brigar`                  | religa a defesa                    |
| `dudu, olha pra mim`                 | vira para você                     |
| `dudu, ataca` / `mata ele`           | ataca o monstro mais perto de você |
| `dudu, ataca o zumbi`                | ataca aquele tipo de monstro       |
| `dudu, vamos brincar`                | pergunta qual das duas brincadeiras |
| `dudu, abre a porta`                 | abre a porta, o portão ou o alçapão |
| `dudu, sai do buraco` / `sobe`       | faz escadinha de blocos e sobe     |
| `dudu, pega madeira` / `pega pedra`  | vai buscar o bloco e traz          |
| `dudu, faz uma casa`                 | constrói uma casinha ao lado dele  |
| `dudu, faz uma torre`                | constrói uma torre                 |
| `dudu, esconde esconde`              | pergunta quem se esconde           |
| `dudu, pega pega`                    | pergunta quem corre                |
| `dudu, se esconde`                   | esconde-esconde: ele se esconde    |
| `dudu, eu vou me esconder` / `conta até 10` | esconde-esconde: ele procura |
| `dudu, me pega` / `corre atrás de mim` | pega-pega: ele corre atrás       |
| `dudu, eu vou te pegar` / `você corre` | pega-pega: ele foge              |

O vocativo é opcional: `oi dudu`, `dudu, oi` e `oi` funcionam igual.

> **Atacar é comando, não conversa.** A IA nunca decide em quem bater — combate é
> determinístico. Se você pedir em linguagem livre ("mata aquele bicho ali"), o
> bot ensina a frase que funciona em vez de prometer e não fazer.
>
> Bicho pacífico (vaca, porco, galinha, ovelha) e jogador **nunca** são alvo, nem
> pedindo pelo nome. Ele recusa e diz por quê.

### Conversa (nível 2 — repertório local)

Saudação, despedida, quem ele é, quem o criou, o que sabe fazer, como está,
o que tem no inventário, cortesia, afeto, piada, onde vocês estão, e mais.

### Pedidos livres (nível 3 — só com IA ligada)

Pedido com palavras que o parser não reconhece vai para a IA — e ela responde
**e age**, na mesma resposta:

```
Você: dudu, será que dava pra você juntar umas madeirinhas pra mim?
Dudu: Já vou pegar!            ← fala primeiro
                               ← e então sai andando atrás de madeira
```

A IA recebe no prompt a lista do que o bot sabe fazer, e devolve a fala junto de
uma ação (ou nenhuma, quando é só conversa). A ação é **validada contra um
catálogo fechado** antes de virar efeito: pedido fora do catálogo é recusado com
educação, e a IA nunca executa nada diretamente.

Conversa continua sendo conversa: `dudu, você gosta de diamante?` tem resposta e
nenhuma ação.

---

## Ele abre portas

Fale `dudu, abre a porta` (ou `abre o portão`, `abre aí`). Ele acha a mais
próxima, vai até ela e abre. **Funciona sem IA ligada.**

E se você entrar em casa e fechar a porta, não precisa nem pedir: porta fechada
é parede para o pathfinder, então ele percebe que travou e resolve sozinho.

```
Você: dudu, vem
      (você entrou em casa e fechou a porta)
Dudu: Tem uma porta fechada no caminho! Já abro.
Dudu: Abri a porta!
      (entra e volta a te seguir)
```

**Porta de ferro ele não abre** — essa só abre com botão, alavanca ou placa de
pressão. Ele diz isso em vez de ficar clicando à toa.

Duas sutilezas que ele trata: uma porta ocupa **dois blocos**, e ele só clica na
metade de baixo (senão abriria e fecharia a mesma porta); e **porta já aberta
não é reaberta**, porque clicar de novo fecharia.

Ajuste o alcance da busca em `behavior.doorSearchRadius` (padrão 6).

> **Ele não fecha a porta atrás de si.** E não mexe em botão, alavanca nem placa
> de pressão — que é justamente o que abriria porta de ferro.

---

## Ele não fica preso em buraco

O bot caía numa caverna ou ravina, você mandava `dudu, vem` — e **nada
acontecia**. O `GoalFollow` do pathfinder não avisa quando não existe caminho:
ele simplesmente não anda. O bot ficava parado e mudo lá embaixo.

Agora, seguindo você, ele vigia a si mesmo. Se ficar **6 segundos sem sair do
lugar** e você estiver **3 ou mais blocos acima**, ele conclui que caiu:

```
Você: dudu, vem
      (6 segundos parado, você 14 blocos acima)
Dudu: Peraí, caí num buraco! Vou fazer uma escadinha.
Dudu: Saí do buraco! Tô indo aí!
```

Ele empilha blocos embaixo dos próprios pés até chegar ao seu nível e **volta a
te seguir sozinho** — sem precisar repetir o comando. Dá para pedir na mão
também: `dudu, sai do buraco`, `sobe`, `faz uma escadinha`.

**Sem bloco na mochila, ele cava as paredes** para arranjar degrau. Nunca o
chão, que só afundaria mais. E só cava o que pode cavar **e** usar como degrau —
a interseção de `collectAllowlist` e `buildAllowlist`, o que impede ele de
demolir a sua casa para subir.

Três coisas que ele **não** faz, de propósito:

- **Não sobe sem te ver.** Uma torre no meio do nada não leva a lugar nenhum.
- **Não sobe até o céu.** `escapeMaxHeight` (24) limita — se você estiver voando
  de criativo, ele sobe um pouco e avisa que ainda está fundo.
- **Não faz isso durante brincadeira.** Um bot empilhando blocos no
  esconde-esconde estragaria o jogo.

`dudu, para` interrompe a subida; os degraus já colocados ficam.

Ajuste em `behavior`: `escapeMinDrop`, `escapeMaxHeight`, `escapeMaxDigs` e
`escapeStuckMs`.

> **Ele não sai de sala fechada.** Se você estiver no mesmo nível e houver uma
> parede no caminho, não é altura que falta — é abrir caminho, e escavar túnel
> ele não faz.

---

## Pegar bloco e construir

### Pegar

`dudu, pega madeira` (ou `pega pedra`, `pega terra`, `pega areia`). Ele procura
num raio de 32 blocos, vai até lá, cava e avisa quanto trouxe. **Funciona sem IA
ligada** — é comando de nível 1.

O pedido vale pelo **grupo**: "madeira" é qualquer tronco. Numa floresta de
bétula, procurar só carvalho devolveria "não achei" num lugar cheio de árvore.

Só blocos da `collectAllowlist` podem ser cavados — é o que impede uma
alucinação da IA de virar a casa do jogador demolida. Minério fica de fora:
`pega diamante` continua sendo uma recusa honesta.

> **Pedra precisa de picareta.** Quebrada com a mão ela some sem dropar nada.
> Se o bot não tiver picareta, ele diz isso em vez de cavar à toa — e o número
> que ele fala é sempre o que entrou de verdade na mochila. Madeira, terra e
> areia ele pega na mão.

### Construir

| Você diz | Ele levanta |
| --- | --- |
| `dudu, faz uma casa` | 5x5, paredes de 2, porta, 3 janelas, telhado (52 blocos) |
| `dudu, faz uma torre` | 3x3, paredes de 4, porta, topo fechado (39 blocos) |

Pequenas de propósito: obra grande demora demais para uma criança assistir, e
cada bloco a mais é uma chance a mais de dar errado.

**Como ele escolhe o material:** o que tiver em maior quantidade na mochila. Se
faltar, ele vai buscar sozinho antes de começar (`buildAutoGather`). Se ainda
faltar, ele recusa **antes de levantar meia parede** e diz quantos blocos
faltam. Dá para pedir o material: `faz uma torre de pedra`.

**Ele nunca destrói nada para construir.** Posição que já tem bloco é pulada.

`dudu, para` interrompe a obra no meio — o que já subiu fica de pé.

Ajuste em `behavior`: `buildAllowlist` (o que pode virar parede),
`buildMaxBlocks` (teto de segurança) e `buildAutoGather`.

> **Terreno acidentado sai torto.** Ele não terraplana: constrói a partir do
> nível onde está e pula o que já existe. Num barranco, parte da casa pode
> ficar enterrada. Chame ele para um lugar plano antes de pedir.

---

## Brincadeiras

O bot sabe **duas**: esconde-esconde e pega-pega. Nos dois papéis de cada uma, e
sem precisar de IA nenhuma ligada.

Fale `dudu, vamos brincar` sem dizer qual e ele **pergunta** qual você quer — com
duas brincadeiras, escolher por você seria decidir no seu lugar. Responder
`esconde esconde` ou `pega pega` leva à pergunta de papel, logo abaixo.

---

## Quem faz o quê: ele pergunta

As duas brincadeiras têm dois papéis. Convite que **não diz** quem faz o quê
não escolhe por você — ele pergunta antes de começar:

```
Você: dudu, pega pega
Dudu: Quem corre: eu ou você?
Você: eu
Dudu: Então eu pego! Vou contar até 5...
```

| Você responde | Esconde-esconde | Pega-pega |
| --- | --- | --- |
| `eu` | você se esconde, ele procura | você corre, ele pega |
| `você` | ele se esconde, você procura | ele corre, você pega |

Frase que **já diz** o papel começa direto, sem pergunta: `me pega`,
`eu vou me esconder`, `se esconde`, `você corre`.

A pergunta espera 45 segundos (`games.roleQuestionTimeoutMs`). Passado o prazo,
um `eu` solto volta a ser conversa normal.

## Esconde-esconde

### Quando ele se esconde

Fale `dudu, se esconde` — ou `esconde esconde` e responda `você`. Ele pede que você feche o olho e
conte até 10, e então **anda procurando um esconderijo de verdade** por até 20
segundos: um ponto que você não esteja enxergando **e** que tenha alguma coisa
sólida em volta — uma parede, uma árvore, um barranco. Só quando chega lá é que
avisa `pode procurar`. Chegue perto dele (2 blocos) e ele admite a derrota. Se
você desistir, fale `desisto` ou `cadê você` que ele aparece.

Não basta estar fora do seu campo de visão: ficar parado no meio do campo aberto
só porque você está de costas **não** conta como esconderijo — você vira a cabeça
e acabou a brincadeira. Ele exige bloco sólido em volta, medido na altura real do
terreno, e confere de novo no lugar onde de fato parou de andar.

Se o lugar for aberto demais e ele não achar nada em 20 segundos, ele **desiste e
fala isso** em vez de se esconder mal. Num mundo muito descampado (deserto,
planície), aumente `hideSearchMs` ou brinque perto de construções e árvores.

### Quando ele procura

Fale `dudu, eu vou me esconder` — ou `esconde esconde` e responda `eu`. Ele **conta de 1 a 20** no
chat, um número por segundo — a contagem leva 20 segundos, o mesmo tempo que ele
leva procurando esconderijo, para você ter a mesma folga que ele. Depois sai
procurando, e **vai errar duas vezes de propósito** antes de procurar de verdade.
Quando conseguir te ver, vai até você e fala que achou.

### Por que ele erra de propósito

O bot recebe a posição de todos os jogadores pelo protocolo do jogo: **ele sabe
onde você está o tempo todo, e não há como tirar isso dele.** Se "achar" fosse só
chegar perto, a brincadeira acabaria no primeiro segundo.

Então o jogo tem regras que tornam a busca honesta:

- **Duas buscas erradas obrigatórias**, em lugares longe de você (`fakeSearches`).
- **Enquanto finge, ele é cego**: passar na frente dele nesse momento não conta.
- **"Achei" exige ver de verdade**: o caminho até você precisa estar livre. Atrás
  de uma parede sólida você não é achado, mesmo com ele sabendo a coordenada.

Ajuste a dificuldade no bloco `games.hideAndSeek` do `config.yaml`:
`hideMaxDistance` deixa o esconderijo mais longe, `fakeSearches` faz ele demorar
mais para achar.

---

## Pega-pega

Também chamado de pique-pega ou pira-pega — todas as variantes do nome funcionam.

### Quando ele pega

Fale `dudu, me pega` — ou `pega pega` e responda `eu`. Ele **conta até 5**
no chat, parado, e só então sai correndo atrás de você — a contagem é sua
vantagem de saída. Se encostar em você (2 blocos), ganhou.

Depois de **60 segundos correndo sem alcançar**, ele para, diz que cansou e
**perde**. Não é bug nem desistência silenciosa: ele fala no chat e para de se
mover.

### Quando ele foge

Fale `dudu, eu vou te pegar` — ou `pega pega` e responda `você`. Ele sai correndo **na hora**, sem
contar — quem conta é quem pega. Encoste nele e ele admite que foi pego.

Depois de **60 segundos fugindo sem ser pego**, ele para de propósito, avisa que
cansou e **se deixa pegar** — fica parado esperando você chegar.

### Por que ele corre atrás com sprint e foge sem

Esse desequilíbrio é a brincadeira inteira:

| Papel | Sprint | O que acontece |
| --- | --- | --- |
| ele pega | **ligado** | andando você é alcançado; correndo, escapa |
| ele foge | **desligado** | correndo você alcança; andando, não |

Com sprint nos dois lados ele ganha sempre e a criança desiste de brincar. Sem
sprint em nenhum, ele nunca pega ninguém e toda rodada acaba em "cansei". Ajuste
em `games.tag`: `chaseSprint`, `fleeSprint`, `chaseTimeoutMs`, `fleeTimeoutMs`.

Fugindo, ele nunca se afasta mais que `fleeMaxDistanceFromOwner` (40 blocos) de
você: sumir do seu campo de visão acabaria com a graça.

Em qualquer papel, `desisto` encerra a rodada — fugindo ele para e se entrega;
correndo atrás, ele entende que você parou e vai te pegar.

---

## O que interrompe uma brincadeira

Vale para as duas: `dudu, para`, um monstro aparecendo, vida crítica, morte do
bot, você sair do servidor ou trocar de dimensão. Ele **para de se mover na
hora** — inclusive no meio de uma corrida — e a rodada **não é retomada** depois:
o esconderijo já foi queimado e você já saiu do lugar, e recomeçar é mais claro
para uma criança que "voltar de onde parou".

Em lugar apertado (dentro de casa, túnel) pode não existir esconderijo válido. Ele
avisa no chat e sugere ir para um lugar aberto, em vez de ficar mudo.

---

## Defesa

Se um monstro atacar você, o bot revida sozinho. Sem comando, sem IA.

O laço de defesa é determinístico e roda a cada 250 ms. Uma chamada de modelo
leva segundos; um zumbi mata em segundos — por isso combate nunca passa pela IA.
Ela só narra depois, se estiver disponível.

Regras que valem sempre:

- **Creeper nunca vai para corpo a corpo perto de você.** O bot recua e avisa.
  Um bot "protetor" ingênuo mata exatamente quem deveria proteger.
- **Nunca ataca outro jogador.** Nem mob passivo, nem bicho domesticado.
- **Vida crítica desengaja.** Auto-preservação vence a defesa: um bot morto não
  protege ninguém.
- **Sem arma ele encara o que dá.** Zumbi, aranha, esqueleto e afins ele enfrenta
  de mão. Contra os fortes (ravager, bruxa, blaze) ele recusa e **pede uma
  espada**. A regra antiga era "desarmado nunca briga", e o efeito era um bot que
  nunca atacava nada: ele entra no mundo sem inventário e não sabe craftar.
- **Não sai caçando.** Só age dentro do raio de proteção (16 blocos por padrão).
- **Termina o combate e volta ao que fazia** — seguindo, ou de volta ao ponto do
  `fica aqui`, ou retomando a coleta de onde parou.

---

## Personalizar o repertório

O catálogo fica em `data/repertoire.yaml` (criado na primeira execução). É um
arquivo de dados: edite e reinicie, sem tocar em código.

```yaml
- id: minha_entrada
  specificity: 3
  patterns: ['qual seu bicho favorito', 'voce gosta de bicho']
  responses:
    - 'Adoro lobo! Queria um pra mim.'
    - 'Gato, com certeza! Eles espantam creeper.'
    - 'Gosto de todos, menos de aranha...'
    - 'Papagaio! Ele dança quando toca música.'
```

Regras que valem a pena conhecer:

- **Mínimo 4 variações por entrada.** O bot nunca repete a última usada; com
  menos que isso ele soa como URA de call center e a ilusão de amigo morre.
- `specificity` maior desempata quando duas entradas casam.
- Os padrões são comparados sem acento, sem caixa e sem pontuação — escreva-os
  já assim (`voce`, não `você`).
- Placeholders disponíveis: `{owner}` `{botName}` `{originStory}` `{health}`
  `{ownerHealth}` `{coords}` `{timeOfDay}` `{inventorySummary}`.
- `when:` restringe uma resposta a um contexto:
  `{ state: STAY }`, `{ timeOfDay: noite }`, `{ healthBelow: 10 }`.

Um placeholder inexistente derruba o bot no startup, apontando a entrada — de
propósito, para o erro aparecer na hora e não no meio de uma conversa.

### A frase de origem

`persona.originStory` alimenta **tanto** o repertório quanto o prompt da IA, para
as duas fontes não contarem histórias diferentes:

```yaml
persona:
  originStory: 'Seu pai me criou pra jogar com você!'
```

### Aprender com o histórico

O repertório melhora olhando o que a criança falou de verdade. O relatório de
lacunas cruza cada fala do jogador com a resposta que o bot deu e separa o que
faltou:

```bash
npm run repertoire:gaps              # histórico todo
npm run repertoire:gaps -- --days 3  # só os 3 dias de log mais recentes
npm run repertoire:gaps -- --kind ai # só o que a IA teve de resolver
```

- **miss** — caiu em `nao_entendi`: o bot não respondeu nada útil.
- **ai** — a IA salvou, mas custou rede e demora. Virar entrada de repertório é
  o que faz o bot responder sozinho na próxima.

Cada grupo mostra quantas vezes repetiu, como o jogador escreveu, a resposta que
a IA deu e a entrada existente mais parecida. O que comando ou repertório já
passaram a resolver fica escondido (`--include-resolved` mostra).

Depois de editar, confira onde cada frase cai — sem subir o bot:

```bash
npm run repertoire:check -- "sabe voar" "me segue" "oi"
#   "sabe voar"  -> REPERTÓRIO habilidade_fisica (confiança 1.00)
#   "me segue"   -> COMANDO FOLLOW
```

E sincronize as duas cópias antes de commitar — `data/` está no `.gitignore`, a
cópia versionada é `src/dialogue/default-repertoire.yaml`:

```bash
npm run repertoire:sync              # data/ -> semente versionada
npm run repertoire:sync -- --check    # só compara
```

Quem usa [Claude Code](https://claude.com/claude-code) tem a rotina inteira no
comando `/upgrade-repertoire`, versionado em `.claude/commands/`: ele roda o
relatório, agrupa por assunto, escreve as entradas seguindo as regras acima,
valida e sincroniza. Vale saber que, nesse caminho, as frases do log passam pelo
modelo — os scripts acima, sozinhos, não mandam nada para fora da máquina.

---

## Comandos aprendidos da IA

Um pedido em palavras livres custa uma chamada de IA na **primeira** vez. Da
segunda em diante, não custa nada.

```
Miguel: dudu, será que dava pra você juntar umas madeirinhas?
Dudu:   Já vou pegar umas madeirinhas pra você!   <- IA (Gemini), 3 s
Dudu:   Peguei 8 de madeira!

... no dia seguinte, mesma frase ...

Miguel: dudu, será que dava pra você juntar umas madeirinhas?
Dudu:   Deixa comigo!                             <- histórico, instantâneo
Dudu:   Peguei 8 de madeira!
```

É o **nível 1.5** da cascata: `comando → comando aprendido → repertório → IA`.

### O que ele aprende

Só com as três condições juntas: a IA **propôs ação**, a ação **executou** e
**deu certo**. Conversa não vira comando, e ação recusada, cancelada ou falha
não ensina nada — aprender o que deu errado é ensinar o bot a errar mais rápido.

Também não entra intenção cujos parâmetros sejam estado do mundo. `GOTO_COORDS`
está fora do catálogo por isso: "vem aqui" decorado como `x=104, y=64, z=-233`
mandaria o bot para o lugar errado amanhã.

### O que ele fala no replay

A **ação** vem do histórico; a **fala** vem do repertório (entrada
`comando_aprendido`, com 6 variações). A fala que a IA deu no dia do aprendizado
fica guardada no arquivo, mas não é dita: ela pode estar presa àquele momento
("tá escuro aqui, acende uma tocha") e sairia fora de hora.

### Quando ele erra

Duas saídas, e a primeira é da criança:

- **`para` logo depois desfaz.** `dudu, para` dentro de 15 segundos de um
  comando aprendido apaga a entrada, e o pedido volta a passar pela IA. É o
  jeito mais honesto que uma criança de 7 anos tem de dizer "não era isso" — e
  ela já sabe esse comando.
- **Apagar na mão:** com o bot parado, apague `data/learned-commands.json` (ou
  só a entrada errada, é JSON legível). Na volta ele começa do zero.

Entrada cuja frase virou padrão de regex em `behaviors/commands.ts` é descartada
no startup — é assim que a promoção pela rotina diária limpa o cache sozinha.

### Onde ver

O cartão de startup diz quantos comandos ele já sabe repetir, e
`npm run repertoire:gaps` lista os aprendidos por uso, marcando os que já
merecem virar regex. No histórico de conversa eles aparecem com
`source: "learned"` — dá para medir quanta chamada de IA foi economizada.

Desligar é uma linha em `config.yaml`:

```yaml
learned:
  enabled: false   # volta à cascata de três níveis
```

> **Privacidade:** o arquivo é derivado das falas da criança e mora em `data/`,
> que está inteiro no `.gitignore`. Ele nunca é enviado a provider nenhum — e
> cada acerto do histórico é uma frase que **deixa** de sair da máquina.

---

## Histórico de conversa

Cada dia gera um arquivo em `data/conversations/AAAA-MM-DD.jsonl`, uma linha por
troca:

```json
{"ts":"2026-08-15T13:24:31.902Z","speaker":"Miguel","text":"dudu, oi","source":"command","botState":"IDLE","sessionId":"..."}
```

O campo `source` diz qual nível respondeu: `command`, `repertoire`, `llm` (com
`provider`) ou `spontaneous`. Dá para ler com qualquer editor, ou com `grep`.

- Reiniciar o bot no mesmo dia **retoma o contexto** daquele dia.
- Dias anteriores ficam em disco mas **não** entram no contexto da IA.
- `data/` está no `.gitignore` — conversas nunca vão para um commit.

### Privacidade

São conversas de uma criança, gravadas em texto puro na sua máquina.

- Só a janela curta em RAM (10 trocas) vai para o provider de IA. **Os arquivos
  de histórico nunca são lidos nem enviados para fora.**
- Com `provider: "ollama"` em localhost e `fallbackProvider: null`, **nada da
  conversa sai do computador.**
- Retenção configurável:

  ```yaml
  memory:
    retentionDays: 90 # null = guardar para sempre (padrão)
  ```

---

## Desenvolvimento

```bash
npm run dev     # roda com reload
npm test        # 657 testes
npm run lint    # eslint + prettier
npm run build   # compila para dist/

npm run repertoire:gaps   # o que o repertório não cobriu no histórico
npm run repertoire:check  # em que nível da cascata cai uma frase
npm run repertoire:sync   # data/repertoire.yaml -> semente versionada
```

Arquitetura em camadas, sem dependência de cima para baixo:

```
config/ → minecraft/ → dialogue/ → memory/ → ai/ → behaviors/ → app/
```

Duas regras estruturais que o código mantém:

1. **Nada fora de `src/ai/providers/` conhece Ollama ou Gemini.** Existe um teste
   que falha se alguém quebrar isso — é o que mantém a troca de provider sendo
   uma linha de config.
2. **A IA propõe, o código dispõe.** Toda saída do modelo é validada contra um
   catálogo fechado antes de virar ação, e blocos só podem ser quebrados se
   estiverem na allowlist.

As especificações vivem em `openspec/`.

---

## Problemas comuns

**"arquivo de configuração não encontrado"**
`cp config.example.yaml config.yaml`

**"versão incompatível: configurado X, servidor Y"**
Ajuste `server.version` para bater com o servidor. O bot falha na hora em vez de
ficar tentando reconectar — protocolo incompatível não se resolve insistindo.

**"Ollama inacessível"**
Rode `ollama serve`. O bot **inicia mesmo assim** e opera por comandos e
repertório.

**"modelo 'qwen3:4b' não encontrado"**
`ollama pull qwen3:4b`

**O bot não conecta no meu mundo**
Mundo single-player fechado não aceita conexão. Abra para LAN e use a porta que
aparecer na tela.

**O jogo engasga quando o bot responde**
O modelo está disputando GPU com o Minecraft. Use um modelo menor, desligue
shaders, ou rode o Ollama em outra máquina da rede.

**O bot responde besteira em vez de conversar**
O repertório está casando padrão demais. Suba `dialogue.minConfidence` para 0.8.

**O bot chama a IA demais**
Baixe `dialogue.minConfidence`, ou adicione entradas ao repertório para as
perguntas que ele mais recebe.
