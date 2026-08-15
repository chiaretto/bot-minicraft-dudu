# Proposal: Bot Companheiro de Minecraft com IA

**Change ID:** `add-minecraft-companion-bot`
**Created:** 2026-08-15
**Status:** Draft

---

## Problem Statement

### Que problema estamos resolvendo?

Jogar Minecraft sozinho é solitário. O jogador quer um companheiro constante no
mundo — alguém que converse, que ande junto, que ajude em tarefas e que tenha
personalidade própria. Hoje as alternativas são:

- **Mobs domesticados** (lobo, gato): seguem, mas não conversam nem entendem pedidos.
- **Multiplayer com amigos reais**: depende de outra pessoa estar online.
- **Mods de NPC**: diálogos fixos por script, sem adaptação ao contexto.

Nenhuma entrega ao mesmo tempo *conversa natural* e *obediência a comandos no mundo*.

### Quem é afetado?

O jogador dono (`ownerPlayer`, configurável) — o único a quem o bot obedece.
Outros jogadores no mesmo servidor podem ver o bot e conversar com ele, mas não
podem comandá-lo.

### Qual é a dor atual?

Não existe repositório ainda. Este é o **change inicial** do projeto: define a
arquitetura, o esqueleto e o primeiro conjunto funcional de comportamentos.

---

## Proposed Solution

Um processo Node.js que roda no PC do jogador e conecta ao mundo Minecraft como
um cliente comum, usando `mineflayer`.

Toda mensagem do dono desce por uma **cascata de resolução em 3 níveis**. Cada
nível só passa adiante o que não conseguiu resolver — a IA é o último recurso,
não o primeiro:

```
   chat in-game
        │
        ▼
  ┌─────────────────────┐   reconheceu?   ┌──────────────────────┐
  │ 1. Parser de        │────── sim ─────►│  Máquina de Estados  │
  │    Comandos (regex) │                 │  IDLE / FOLLOW /     │──► ações
  └──────────┬──────────┘                 │  STAY / ACTION /     │    mineflayer
             │ não                        │  DEFEND / EMERGENCY  │
             ▼                            └──────────▲───────────┘
  ┌─────────────────────┐   casou?                   │
  │ 2. Repertório Local │────── sim ──► fala no chat │  dano no dono
  │    (catálogo YAML)  │               (~0 ms, R$0) │  (gatilho direto,
  └──────────┬──────────┘                            │   sem IA)
             │ não / confiança baixa                 │
             ▼                                       │
  ┌─────────────────────┐                            │
  │ 3. LlmProvider      │────────────► fala no chat  │
  │    Ollama │ Gemini  │              ou Intent ────┘
  │    persona+contexto │
  └─────────────────────┘
             │
             ▼
  ┌───────────────────────────────────────────────────┐
  │  Memória de Conversa                              │
  │  RAM: janela curta  │  Disco: 1 arquivo por dia   │
  └───────────────────────────────────────────────────┘
        ▲ toda troca é gravada, venha de qualquer nível
```

**Por que essa ordem importa:** a maior parte do que uma criança fala com um
companheiro de jogo é repetitiva — "oi", "o que você sabe fazer", "quem te fez",
"vem cá". Resolver isso localmente deixa a resposta instantânea, gratuita,
consistente com a persona e imune a queda de API. O modelo fica reservado para o
que é realmente imprevisível.

### Componentes principais

1. **`config/`** — carrega `config.yaml` + `.env`, valida com schema. Define
   `ownerPlayer`, dados do servidor, persona do bot e escolha do provider de IA.

2. **`minecraft/`** — wrapper fino sobre `mineflayer`: conexão, reconexão com
   backoff, eventos normalizados (chat, spawn, dano, morte) e um *snapshot* do
   estado do mundo (posição, vida, fome, inventário, hora do dia, entidades próximas).

3. **`dialogue/`** — o **repertório local**: um catálogo em YAML de situações
   comuns (saudação, identidade, capacidades, cortesia, afeto, reações a eventos
   do jogo, recusas). Cada entrada tem padrões de gatilho e **várias** respostas
   alternativas, com placeholders (`{owner}`, `{botName}`) resolvidos a partir da
   config e do snapshot. Fica em arquivo de dados, não em código — dá para editar
   e ampliar sem recompilar nada.

4. **`ai/`** — interface `LlmProvider` com duas responsabilidades separadas:
   - **Conversa**: gera a fala do bot a partir da persona + memória curta + contexto.
   - **Interpretação**: quando o parser determinístico não reconhece o comando,
     traduz linguagem natural em uma **intenção estruturada** (JSON validado por
     schema). A IA nunca chama a API do jogo diretamente.

   Duas implementações, escolhidas por config: **`ollama`** (modelo local, padrão)
   e **`gemini`** (nuvem). Timeout, retry e circuit breaker são um decorador
   único aplicado sobre qualquer provider, não reimplementados em cada um.

5. **`memory/`** — histórico de conversa em dois níveis:
   - **RAM**: janela curta das últimas N trocas, usada como contexto do provider de IA.
   - **Disco**: um arquivo JSONL **por dia** em `data/conversations/YYYY-MM-DD.jsonl`,
     append-only, uma linha por troca, registrando quem falou, o que falou, de
     qual nível veio a resposta (`command` / `repertoire` / `llm`, com o nome do
     provider) e o estado do bot na hora. Ao subir, o bot relê o arquivo de hoje
     para retomar a conversa de onde parou.

6. **`behaviors/`** — máquina de estados (`IDLE`, `FOLLOW`, `STAY`, `ACTION`,
   `DEFEND`, `EMERGENCY`) mais o catálogo de ações executáveis. Toda ação é
   cancelável e tem timeout.

7. **`behaviors/defense/`** — vigia de ameaças que roda em loop curto,
   independente do chat: detecta hostis atacando o dono ou dentro do raio de
   proteção e força a transição para `DEFEND`. **Não passa pela IA** — o
   tempo de resposta precisa ser de milissegundos, não de segundos.

8. **`app/`** — composition root: monta as dependências, sobe o processo,
   trata sinais de encerramento.

### Resultados esperados

O jogador digita no chat e o bot responde com personalidade e age no mundo:

| Jogador digita | Bot faz | Nível |
|----------------|---------|-------|
| `dudu, oi` | responde a saudação na hora, variando a resposta | repertório |
| `quem te criou?` | `Seu pai me criou pra jogar com você!` | repertório |
| `o que você sabe fazer?` | lista as capacidades em linguagem de criança | repertório |
| `dudu, você acha que existe vida em outro planeta?` | o modelo responde | IA |
| `dudu, vem` / `dudu, me segue` | entra em `FOLLOW`, mantém 3 blocos de distância | comando |
| `dudu, fica aqui` | entra em `STAY`, memoriza a coordenada, não sai dela | comando |
| `dudu, para` | cancela o que estiver fazendo, volta para `IDLE` | comando |
| `dudu, não briga` | desliga a defesa automática até nova ordem | comando |
| `dudu, pega essa madeira pra mim` | o modelo interpreta → `COLLECT_BLOCK{oak_log}` → executa | IA |
| *(zumbi ataca o jogador)* | sem comando: entra em `DEFEND`, saca a espada e revida | reflexo |

---

## Scope

### In Scope

- Conexão com **Minecraft Java Edition** via `mineflayer` (servidor local ou LAN).
- Configuração de um **jogador dono** único, com filtro de autorização de comandos.
- **Repertório local de conversa**: catálogo em YAML com 21 entradas cobrindo as
  situações comuns (saudação, despedida, identidade, origem, capacidades, estado
  do bot, inventário, cortesia, afeto, elogio, provocação, humor, perguntas sobre
  o jogo, presença, recusas, não-entendi, mais 4 falas espontâneas por evento),
  cada uma com no mínimo 4 variações de resposta. Catálogo completo no apêndice
  de `local_dialogue_delta.md`.
- Cascata de resolução: comando → repertório → IA. O modelo só é chamado quando
  os dois primeiros níveis falham.
- **Provider de IA plugável**: `ollama` (modelo local, padrão) ou `gemini`
  (nuvem), atrás de uma interface única. Inclui `provider: "none"`, para rodar o
  bot inteiramente sem IA.
- Fallback opcional entre providers (ex.: local primário, nuvem reserva),
  desligado por padrão e com aviso explícito de privacidade quando ativado.
- Conversa natural no chat do jogo, com personalidade configurável.
- Memória curta de conversa em RAM (janela deslizante das últimas N interações).
- **Histórico persistente em disco, um arquivo por dia**, em JSONL, com quem
  falou, o que falou, de qual nível veio a resposta e o estado do bot.
- Retomada do contexto do dia ao reiniciar o bot (relê o arquivo de hoje).
- Estados de obediência: **seguir**, **ficar parado**, **parar/cancelar**.
- Catálogo inicial de ações: coletar bloco, largar item para o dono, ir até
  coordenada, olhar para o dono, equipar item.
- **Defesa do jogador**: o bot detecta hostis atacando o dono (ou dentro do raio
  de proteção dele) e revida em corpo a corpo, sem precisar de comando.
- Tratamento especial de creeper: nunca engajar em corpo a corpo perto do dono.
- Auto-preservação: vida crítica interrompe qualquer coisa e o bot recua avisando
  no chat.
- Retomada de contexto: terminado o combate, o bot volta ao que estava fazendo
  (seguindo, parado no ponto, ou executando a ação interrompida).
- Reconexão automática com backoff exponencial.
- Rate limiting e fallback offline da IA (repertório assume quando o provider falha).

### Out of Scope

- **Bedrock Edition** — protocolo diferente, sem pathfinding maduro.
- **Combate ofensivo / caçada** — o bot só luta contra o que ameaça o dono
  dentro do raio de proteção. Não sai atrás de mob, não farma XP, não limpa spawner.
- **PvP** — o bot nunca ataca outro jogador, sob nenhuma circunstância.
- **Combate a distância** (arco, besta, poção) — só corpo a corpo neste change.
- **Crafting ou reparo de equipamento** — o bot usa a melhor arma que já tiver
  no inventário; não fabrica nem conserta.
- **Construção de estruturas** — coloca blocos avulsos no máximo, não constrói.
- **Voz / TTS** — decidido: interação só por chat do jogo.
- **Interface gráfica** — o bot roda como processo de terminal.
- **Recall entre dias** — o histórico é gravado e legível, mas o bot só carrega
  o dia corrente como contexto. Perguntar "o que a gente fez semana passada?"
  não busca nos arquivos antigos (busca semântica / RAG fica para outro change).
- **Banco de dados** — arquivos JSONL simples bastam; nada de SQLite/Postgres.
- **Interface de leitura do histórico** — os arquivos são lidos com qualquer
  editor de texto; não há visualizador próprio neste change.
- **Aprendizado do repertório** — o catálogo é editado à mão; o bot não cria
  nem ajusta entradas sozinho a partir das conversas.
- **Múltiplos donos ou múltiplos bots** simultâneos.
- **Crafting automático** e gerenciamento de baú.

---

## Impact Analysis

| Component | Change Required | Details |
|-----------|-----------------|---------|
| Database | Sim | Sem SGBD: histórico em JSONL append-only, um arquivo por dia |
| Dados | Sim | `data/conversations/YYYY-MM-DD.jsonl` + catálogo `dialogue/repertoire.yaml` |
| API | Sim | Interface `LlmProvider` com duas implementações: Ollama (HTTP local) e Google Gemini (`@google/genai`) |
| Infra local | Sim | Servidor Ollama rodando na mesma máquina do Minecraft (ou em outra da LAN) |
| State | Sim | Máquina de estados com prioridade + pilha de retomada + snapshot do mundo |
| Combate | Sim | Loop de vigia de ameaças por tick, fora do caminho da IA |
| UI | Não | Só chat do jogo; terminal apenas para logs |
| Build | Sim | Projeto novo: TypeScript, vitest, eslint, prettier |
| Config | Sim | `config.yaml` + `.env` com schema de validação |
| Segurança | Sim | Chave de API e credenciais só via env; nunca logadas |

---

## Architecture Considerations

### Encaixe com padrões existentes

Projeto novo — este change **estabelece** os padrões descritos em
`openspec/project.md`. Nada preexistente a respeitar.

### Padrões introduzidos

1. **IA propõe, código dispõe.** O modelo devolve JSON validado contra um schema
   de intenções. Uma intenção desconhecida, malformada ou fora do catálogo é
   descartada, e o bot responde no chat que não entendeu. Isso impede que uma
   alucinação vire uma ação destrutiva no mundo do jogador.

2. **Cascata de resolução, IA por último.** Comandos por regex, depois repertório
   local, e só então o modelo. Cada nível é mais barato, mais rápido e mais
   previsível que o seguinte. Efeito prático: com a IA fora do ar o bot continua
   sendo um companheiro utilizável, não um boneco mudo.

   Essa ordem é o que **viabiliza o modelo local**. Como o repertório absorve a
   maior parte das falas, sobra para a IA só a cauda imprevisível — e para a
   cauda, um modelo de 4B na máquina do jogador basta. Sem o repertório, seria
   preciso um modelo grande para tudo, e aí só a nuvem daria conta.

3. **Repertório em dados, não em código.** O catálogo é um YAML editável. Um
   pai que quer ensinar uma piada nova ao bot edita um arquivo e reinicia —
   sem tocar em TypeScript, sem recompilar.

4. **Variação obrigatória.** Toda entrada do repertório tem várias respostas
   alternativas, e o seletor nunca repete a última usada daquela entrada. Sem
   isso, o bot vira uma URA de call center e a ilusão de amigo morre na terceira
   saudação idêntica.

5. **Histórico append-only, particionado por dia.** Uma linha JSON por troca,
   `fsync` no encerramento, arquivo novo à meia-noite. Formato que sobrevive a
   crash (uma linha corrompida não invalida as outras), que dá para ler com
   `grep` e que não exige nenhum serviço rodando junto.

6. **Máquina de estados explícita.** Um estado ativo por vez, com transições
   declaradas. Evita o bug clássico de bot com dois loops de movimento brigando
   pelo controle do pathfinder.

7. **Ações canceláveis.** Toda ação recebe um `AbortSignal`. `dudu, para`, a
   defesa e o modo de emergência cancelam de verdade, não esperam terminar.

8. **Combate é reflexo, não decisão.** O loop de defesa é 100% determinístico e
   roda a cada tick, fora do caminho da IA. Uma chamada de IA leva segundos;
   um zumbi mata em segundos. A IA entra só *depois*, para narrar no chat
   ("corre que tem um esqueleto atirando em você!"). Se a IA estiver fora do
   ar, a defesa continua funcionando integralmente.

9. **Prioridade de estados declarada.** `EMERGENCY` > `DEFEND` > `ACTION` >
   `FOLLOW`/`STAY` > `IDLE`. Um estado de prioridade maior sempre interrompe o
   menor, e o estado interrompido é empilhado para ser retomado depois. Sem essa
   ordem explícita, defesa e comando do jogador brigam pelo pathfinder.

### Dependências externas

- Conta Minecraft válida para o bot (segunda conta, ou modo offline em servidor local).
- **Provider de IA**, conforme a config:
  - `ollama` (padrão): Ollama instalado e `ollama serve` rodando, com o modelo já
    baixado (`ollama pull qwen3:4b`). Sem chave, sem conta, sem internet.
  - `gemini`: chave de API do Google Gemini com cota disponível.
  - `none`: nenhuma dependência — o bot roda só com comandos e repertório.
- **Folga de máquina** para o modelo local: ~2,5 GB de VRAM para o padrão
  `qwen3:4b`, disputados com o Minecraft. Ver o apêndice de
  `llm_provider_delta.md` para a tabela de recomendação por hardware.
- Servidor Minecraft acessível — mundo em LAN ou servidor dedicado local.
  *Nota:* mundo single-player fechado não aceita conexão; o jogador precisa
  abrir para LAN ou rodar um servidor local.

---

## Success Criteria

- [ ] O bot conecta ao servidor, aparece no mundo e cumprimenta o dono no chat.
- [ ] O bot responde a uma mensagem livre no chat em até 5 s, com personalidade consistente.
- [ ] `oi`, `quem te criou?` e `o que você sabe fazer?` são respondidos pelo repertório
      em menos de 100 ms, sem nenhuma chamada ao provider de IA.
- [ ] `quem te criou?` responde a frase de origem configurada (padrão:
      `Seu pai me criou pra jogar com você!`).
- [ ] Repetir a mesma saudação 3 vezes seguidas produz 3 respostas diferentes.
- [ ] O repertório cobre as 21 entradas do catálogo inicial, com ≥ 100 respostas
      distintas e no mínimo 4 variações por entrada.
- [ ] Com a IA totalmente fora do ar, o bot ainda conversa pelo repertório.
- [ ] O mesmo roteiro de conversa funciona com `llm.provider: "ollama"` e com
      `llm.provider: "gemini"`, sem mudar nenhuma linha fora da config.
- [ ] Com `llm.provider: "ollama"` e sem `.env` nenhum, o bot sobe e conversa.
- [ ] Com `llm.provider: "none"`, o bot sobe e opera por comandos e repertório.
- [ ] Com o modelo local rodando junto do Minecraft, o jogo não engasga de forma
      perceptível durante uma conversa (verificação manual com `qwen3:4b`).
- [ ] Resposta demorando mais de 2 s dispara a fala de espera no chat.
- [ ] Uma inferência por vez: duas mensagens seguidas não geram duas gerações
      concorrentes competindo com o jogo.
- [ ] Ollama fora do ar não impede o bot de iniciar nem de obedecer comandos.
- [ ] Numa sessão típica de 30 min, o repertório resolve a maioria das falas
      (meta: ≥ 60% das mensagens de conversa não chegam ao provider de IA).
- [ ] Cada dia de conversa gera um arquivo `data/conversations/YYYY-MM-DD.jsonl`.
- [ ] Cada linha do histórico registra horário, quem falou, o texto, o nível que
      respondeu (`command`/`repertoire`/`gemini`) e o estado do bot.
- [ ] Reiniciar o bot no mesmo dia retoma o contexto da conversa daquele dia.
- [ ] Virar a meia-noite com o bot rodando cria o arquivo do dia seguinte sozinho.
- [ ] `dudu, me segue` faz o bot seguir o dono mantendo ~3 blocos, atravessando terreno irregular.
- [ ] `dudu, fica aqui` mantém o bot na coordenada mesmo com o dono se afastando.
- [ ] `dudu, para` cancela qualquer ação em andamento em menos de 1 s.
- [ ] Pelo menos um comando em linguagem natural livre é interpretado corretamente e executado.
- [ ] Comandos de jogadores que não são o dono são ignorados (com resposta educada no chat).
- [ ] Um zumbi atacando o dono faz o bot revidar em menos de 1 s, sem comando nenhum.
- [ ] O bot equipa a melhor arma do inventário antes de engajar.
- [ ] Terminado o combate, o bot volta sozinho ao estado anterior (seguindo/parado/ação).
- [ ] O bot **não** engaja creeper em corpo a corpo perto do dono.
- [ ] O bot nunca ataca outro jogador nem mob passivo/domesticado.
- [ ] Com vida crítica o bot recua mesmo em combate, e avisa no chat.
- [ ] `dudu, não briga` desliga a defesa; `dudu, pode brigar` religa.
- [ ] A defesa continua funcionando com a IA fora do ar.
- [ ] Queda do servidor dispara reconexão automática sem intervenção manual.
- [ ] Falha do provider de IA não derruba o bot: ele continua obedecendo comandos determinísticos.
- [ ] Cobertura de testes nas camadas de config, parser de comandos e máquina de estados.

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Modelo alucina intenção destrutiva (quebrar a casa do jogador) | Média | Alto | Catálogo fechado de intenções + validação por schema + allowlist de blocos coletáveis |
| Latência da IA quebra a imersão | Alta | Médio | Parser e repertório atendem o comum sem tocar no modelo; timeout por provider com fallback do repertório; fala de espera após 2 s |
| **Modelo local fazendo o Minecraft engasgar** | Alta | Alto | Padrão conservador (4B quantizado); uma inferência por vez; `keepAlive` para não recarregar; tabela de recomendação por hardware no README; opção de apontar para outra máquina da LAN |
| **Qualidade do modelo local decepcionar em português** | Média | Médio | Repertório cobre o grosso, sobrando só a cauda para o modelo; provider plugável permite migrar para nuvem trocando uma linha de config |
| **Primeira resposta lenta por carregamento do modelo** | Alta | Baixo | `warmUpOnStart` carrega o modelo na inicialização; `keepAlive` de 30 min evita descarregamento entre conversas |
| **Fallback de nuvem vazando conversa da criança sem o pai perceber** | Média | Alto | Fallback desligado por padrão; ao ativar, aviso explícito no log e no `config.example.yaml`; o histórico registra qual provider respondeu |
| Custo/cota da API estourando (só com provider de nuvem) | Média | Médio | Provider local é o padrão e não tem custo; repertório absorve a maior parte das falas; rate limit por jogador, debounce de chat, janela curta limitada |
| **Repertório soando robótico e repetitivo** | Alta | Alto | Mínimo de 4 variações por entrada, nunca repetir a última usada, placeholders com contexto do mundo |
| **Repertório respondendo por engano no lugar da IA** (falso positivo de match) | Alta | Médio | Limiar de confiança configurável; abaixo dele vai para a IA. Entradas ambíguas exigem match mais estrito |
| **Repertório e persona da IA divergindo de personalidade** | Média | Médio | O mesmo bloco `persona` alimenta os dois; frases-chave (origem, nome) ficam só no repertório e entram no system prompt da IA |
| **Histórico crescendo sem limite no disco** | Baixa | Baixo | ~KB por dia; política de retenção configurável e documentada |
| **Conversa da criança gravada em texto puro no PC** | Alta | Médio | Decisão consciente: é o objetivo do pedido. Arquivo local, nunca enviado a lugar nenhum, `data/` no gitignore, retenção configurável e documentada no README |
| **Perda de histórico por crash** | Média | Baixo | JSONL append-only com flush por escrita; uma linha corrompida não invalida o arquivo |
| `mineflayer-pathfinder` travando em terreno complexo | Alta | Médio | Timeout por ação, detecção de "sem progresso", teleporte de recuperação opcional, aviso no chat |
| Servidor tratar o bot como cheat e banir | Baixa | Alto | Escopo declarado é servidor próprio/LAN; documentar que o uso em servidor de terceiros depende das regras dele |
| Versão do Minecraft incompatível com o mineflayer | Média | Alto | Fixar versão suportada em `config.yaml`, validar no startup e falhar com mensagem clara |
| Chave de API vazando em log ou commit | Baixa | Alto | `.env` no gitignore, redaction no logger, sem segredo em mensagem de erro |
| Bot morre e perde inventário do jogador | Média | Médio | Modo de emergência foge com vida baixa; bot não carrega itens do jogador por padrão |
| **Bot mata o dono ao explodir um creeper perto dele** | Alta | Alto | Creeper nunca vai para corpo a corpo: o bot recua e avisa. Regra codificada, não decidida pela IA |
| **Bot morre em combate e piora a situação** | Alta | Médio | `EMERGENCY` tem prioridade sobre `DEFEND`: vida crítica sempre desengaja. Bot não engaja sem arma |
| **Bot ataca mob passivo, pet ou outro jogador** | Média | Alto | Allowlist fechada de alvos hostis. Jogadores e mobs domesticados bloqueados por código |
| **Bot puxa aggro de mobs extras para cima do dono** | Média | Médio | Raio de proteção limitado; sem caçada; desengaja quando o alvo se afasta |
| **Combate briga com o pathfinder do FOLLOW/ACTION** | Alta | Médio | Prioridade de estados declarada + pilha de retomada; um único dono do pathfinder por vez |
| **Bot fica preso em loop de combate infinito** | Média | Médio | Timeout de engajamento por alvo + limite de alvos simultâneos + desengate por distância |
| Escopo inflar para "bot que joga sozinho" | Alta | Médio | Combate, construção e crafting explicitamente fora de escopo neste change |
