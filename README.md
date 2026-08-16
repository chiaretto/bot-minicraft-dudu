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

## IA: local, nuvem ou nenhuma

O provider é plugável. Trocar é **uma linha** de `config.yaml`:

```yaml
llm:
  provider: 'ollama' # 'ollama' | 'gemini' | 'none'
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
| `dudu, vamos brincar` / `se esconde` | brinca de esconde-esconde (ele esconde) |
| `dudu, eu vou me esconder` / `conta até 10` | brinca de esconde-esconde (ele procura) |

O vocativo é opcional: `oi dudu`, `dudu, oi` e `oi` funcionam igual.

### Conversa (nível 2 — repertório local)

Saudação, despedida, quem ele é, quem o criou, o que sabe fazer, como está,
o que tem no inventário, cortesia, afeto, piada, onde vocês estão, e mais.

### Pedidos livres (nível 3 — só com IA ligada)

`dudu, pega umas madeiras pra mim` → o modelo traduz em uma intenção
estruturada, que é **validada contra um catálogo fechado** antes de virar ação.
Pedido fora do catálogo é recusado com educação — a IA nunca executa nada
diretamente.

---

## Brincadeiras

Por enquanto o bot sabe **uma**: esconde-esconde. Nos dois papéis, e sem precisar
de IA nenhuma ligada.

### Quando ele se esconde

Fale `dudu, vamos brincar` (ou `se esconde`). Ele pede que você feche o olho e
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

Fale `dudu, eu vou me esconder` (ou `conta até 10`). Ele **conta de 1 a 20** no
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

Ajuste a dificuldade no bloco `games` do `config.yaml`: `hideMaxDistance` deixa o
esconderijo mais longe, `fakeSearches` faz ele demorar mais para achar.

### O que interrompe a brincadeira

`dudu, para`, um monstro aparecendo, vida crítica, morte do bot, você sair do
servidor ou trocar de dimensão. A rodada **não é retomada** depois: o esconderijo
já foi queimado e você já saiu do lugar — recomeçar é mais claro para uma criança
que "voltar de onde parou".

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
- **Sem arma não engaja.** Avisa e recua junto com você.
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
npm test        # 211 testes
npm run lint    # eslint + prettier
npm run build   # compila para dist/
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
