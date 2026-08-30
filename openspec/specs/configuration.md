# Especificação: Configuração

**Componente:** `configuration`
**Origem:** `add-minecraft-companion-bot` (2026-08-15)
**Atualizado por:** `add-collect-and-build`, `add-escape-hole`, `add-open-door`, `ask-game-role` (2026-08-19),
`add-bot-games-hide-and-seek` (2026-08-15), `fix-hide-and-seek-cover` (2026-08-16),
`add-bot-game-pega-pega` (2026-08-16), `add-claude-code-provider` (2026-08-29)

---

## Requisitos

### Requirement: Definição do jogador dono

O bot reconhece exatamente um jogador como dono, informado na configuração pelo
campo `ownerPlayer` (o nome de usuário Minecraft). Só esse jogador comanda o bot.

> **Convenção de nomes usada em toda a spec:** `Dudu` é o **bot**
> (`persona.name`, o nome pelo qual o jogador o chama no chat). `Miguel` é o
> **jogador dono** (`ownerPlayer`) nos exemplos. São pessoas diferentes.

#### Scenario: Dono configurado corretamente
- **GIVEN** `config.yaml` contém `ownerPlayer: "Miguel"`
- **WHEN** o bot inicializa
- **THEN** o bot carrega `"Miguel"` como dono
- **AND** registra no log `dono configurado: Miguel`

#### Scenario: Dono ausente na configuração
- **GIVEN** `config.yaml` não contém `ownerPlayer` (ou está vazio)
- **WHEN** o bot inicializa
- **THEN** o bot recusa iniciar
- **AND** exibe `configuração inválida: ownerPlayer é obrigatório`
- **AND** encerra com código de saída diferente de zero

---

### Requirement: Configuração de conexão com o servidor

A configuração define host, porta e versão do Minecraft do servidor alvo, mais
as credenciais da conta que o bot usará.

#### Scenario: Conexão local em LAN
- **GIVEN** `server.host: "localhost"`, `server.port: 25565`, `server.version: "1.21.4"`
- **WHEN** o bot inicializa
- **THEN** o bot tenta conectar em `localhost:25565` falando o protocolo da 1.21.4

#### Scenario: Versão do servidor diferente da configurada
- **GIVEN** a configuração declara `server.version: "1.21.4"`
- **AND** o servidor real roda 1.20.1
- **WHEN** o bot tenta conectar
- **THEN** o bot encerra com `versão incompatível: configurado 1.21.4, servidor 1.20.1`
- **AND** não entra em loop de reconexão

---

### Requirement: Configuração da persona

A personalidade do bot é configurável em texto livre e alimenta o system prompt
do Gemini em toda conversa.

#### Scenario: Persona customizada
- **GIVEN** `persona.description: "Você é o Dudu, um amigo animado e brincalhão"`
- **AND** `persona.name: "Dudu"`
- **WHEN** o bot gera qualquer resposta de conversa
- **THEN** o system prompt enviado ao Gemini inclui essa descrição

#### Scenario: Frase de origem configurável
- **GIVEN** `persona.originStory: "Seu pai me criou pra jogar com você!"`
- **WHEN** o dono pergunta quem criou o bot
- **THEN** o repertório local responde usando essa frase
- **AND** a mesma frase entra no system prompt do Gemini, para a IA não
  contar uma história de origem diferente

#### Scenario: Persona ausente
- **GIVEN** `persona` não está definida
- **WHEN** o bot inicializa
- **THEN** o bot usa a persona padrão de "amigo prestativo"
- **AND** registra um aviso no log

---

### Requirement: Segredos apenas por variável de ambiente

A chave da API do Gemini, a credencial da assinatura do Claude Code e a senha da
conta do bot são lidas exclusivamente do ambiente (`.env` ou variáveis do
sistema), nunca do `config.yaml`, e nunca aparecem em log ou mensagem de erro.

#### Scenario: Chave do Gemini fornecida
- **GIVEN** `GEMINI_API_KEY` está definida no ambiente
- **WHEN** o bot inicializa
- **THEN** o cliente Gemini é criado com essa chave
- **AND** a chave não aparece em nenhuma linha de log

#### Scenario: Chave do Gemini ausente com o provider Gemini ativo
- **GIVEN** `llm.provider` é `"gemini"`
- **AND** `GEMINI_API_KEY` não está definida
- **WHEN** o bot inicializa
- **THEN** o bot recusa iniciar
- **AND** exibe `variável de ambiente obrigatória ausente: GEMINI_API_KEY`

> A exigência é **condicional ao provider ativo**. Com o provider local o bot
> sobe sem segredo nenhum — ver `llm_provider.md`.

#### Scenario: Setup local não precisa de segredo nenhum
- **GIVEN** `llm.provider: "ollama"` e `llm.fallbackProvider: null`
- **WHEN** o bot inicializa sem nenhum `.env`
- **THEN** o bot inicia normalmente
- **AND** nenhuma variável de ambiente de IA é exigida

#### Scenario: Segredo colocado por engano no YAML
- **GIVEN** `config.yaml` contém uma chave `geminiApiKey`
- **WHEN** o bot valida a configuração
- **THEN** o bot recusa iniciar
- **AND** exibe `segredos não são permitidos em config.yaml; use variável de ambiente`

#### Scenario: Credencial da assinatura lida do ambiente
- **GIVEN** a variável de ambiente da credencial do Claude Code está definida
- **WHEN** o bot inicializa
- **THEN** ela fica disponível para o provider `claude`
- **AND** não aparece em nenhuma linha de log

#### Scenario: Credencial da assinatura no YAML é recusada
- **GIVEN** `config.yaml` contém a credencial do Claude Code em qualquer
  profundidade, ou uma chave genérica `token`
- **WHEN** o bot valida a configuração
- **THEN** o bot recusa iniciar
- **AND** aponta a chave proibida e o caminho dela

#### Scenario: Credencial ausente com o provider Claude ativo
- **GIVEN** `llm.provider` é `"claude"`
- **AND** a variável da credencial não está definida
- **WHEN** o bot inicializa
- **THEN** o bot **inicia mesmo assim**
- **AND** avisa que vai tentar o login do Claude Code já feito na máquina
- **AND** diz o comando que gera uma credencial própria

> Aqui a regra diverge do Gemini de propósito: o Agent SDK aceita o login
> existente na máquina, então a variável não é a única fonte possível. Recusar
> iniciar rejeitaria uma configuração que funciona.

---

### Requirement: Bloco `claude`

O provider Claude Code tem bloco próprio, ao lado de `ollama` e `gemini`. Além do
modelo e do tempo limite, ele carrega o que os outros não precisam: **os limites
da sessão viva**, porque é o primeiro provider do projeto com estado entre
chamadas.

#### Scenario: Padrões utilizáveis sem configurar nada
- **GIVEN** o `config.yaml` não traz o bloco `claude`
- **WHEN** a configuração é carregada
- **THEN** o modelo padrão é `claude-haiku-4-5`
- **AND** existem padrões para tempo limite e para os limites da sessão

#### Scenario: Limites da sessão são configuráveis
- **GIVEN** o bloco `claude` está presente
- **WHEN** a idade máxima da sessão e o número de falas antes de reciclar são
  definidos
- **THEN** os valores são validados como inteiros positivos
- **AND** o provider recicla a sessão por eles

#### Scenario: `claude` é escolha válida de provider e de fallback
- **GIVEN** o `config.yaml` define `llm.provider: 'claude'`
- **OR** define `llm.fallbackProvider: 'claude'`
- **WHEN** a configuração é carregada
- **THEN** ela é aceita

#### Scenario: `config.example.yaml` explica o caminho da credencial
- **GIVEN** alguém abre o `config.example.yaml`
- **WHEN** lê o bloco `claude`
- **THEN** ele diz que a credencial vem de `claude setup-token`, não de chave de
  API
- **AND** avisa que a cota é a da assinatura, compartilhada com o uso do adulto

---

### Requirement: Bloco `games`

Os parâmetros das brincadeiras são configuráveis, com defaults que funcionam sem
ninguém mexer em nada. As distâncias são o que o pai ajusta se a rodada ficar
fácil ou difícil demais para a criança. O bloco tem **um sub-bloco por jogo**:
`hideAndSeek` e `tag`.

```yaml
games:
  enabled: true
  hideAndSeek:
    hideMinDistance: 10                 # esconderijo nunca colado no jogador
    hideMaxDistance: 30                 # nem tão longe que vire caminhada
    hideCandidateSamples: 24            # pontos avaliados por volta da procura
    hideSearchMs: 20000                 # tempo andando atrás de um lugar coberto
    touchDistance: 2                    # encostou nessa distância, achou
    seeDistance: 20                     # alcance máximo do "ver" do bot
    countTo: 20                         # até quanto ele conta
    countIntervalMs: 1000               # 20 x 1 s = contagem de 20 s
    fakeSearches: 2                     # erros de propósito antes de procurar
    fakeSearchMinDistanceFromOwner: 8   # busca falsa longe do jogador
    roundTimeoutMs: 180000              # 3 min: rodada nunca fica pendurada
  tag:
    countTo: 5                          # conta 5 antes de sair correndo
    countIntervalMs: 1000               # 5 x 1 s = vantagem de saída de 5 s
    chaseTimeoutMs: 60000               # 60 s atrás; depois cansa e perde
    fleeTimeoutMs: 60000                # 60 s fugindo; depois se entrega
    surrenderTimeoutMs: 30000           # entregue: espera parado ser pego
    touchDistance: 2                    # encostou nessa distância, pegou
    chaseFollowDistance: 1              # o quanto ele cola perseguindo
    chaseSprint: true                   # perseguindo ele corre de verdade
    fleeSprint: false                   # fugindo não, senão nunca é pego
    fleeStepMin: 8                      # salto mínimo de cada rumo de fuga
    fleeStepMax: 16                     # salto máximo de cada rumo de fuga
    fleeMaxDistanceFromOwner: 40        # nunca some do campo de visão
    fleeCandidateSamples: 16            # destinos avaliados por escolha
    roundTimeoutMs: 180000              # rede de segurança
```

> **Os dois sprints não são simétricos de propósito.** Com sprint nos dois
> papéis o bot ganha sempre e a criança para de brincar; sem sprint em nenhum,
> ele nunca pega ninguém e toda rodada acaba em "cansei". Ligado só na
> perseguição, cada lado tem uma chance real.

#### Scenario: Configuração ausente
- **GIVEN** `config.yaml` não tem o bloco `games`
- **WHEN** o bot inicia
- **THEN** os defaults acima são aplicados
- **AND** as duas brincadeiras funcionam sem nenhuma configuração

#### Scenario: Jogo novo não quebra config antiga
- **GIVEN** um `config.yaml` escrito antes do pega-pega existir, sem `games.tag`
- **WHEN** o bot inicia
- **THEN** ele inicia normalmente, com o pega-pega nos defaults
- **AND** nenhuma migração de arquivo é necessária

#### Scenario: Configuração parcial de um jogo só
- **GIVEN** `config.yaml` traz `games.tag.chaseSprint: false` e mais nada
- **WHEN** o bot inicia
- **THEN** só esse campo muda; todo o resto de `tag` e todo o `hideAndSeek` ficam
  nos defaults

#### Scenario: Desligar os jogos
- **GIVEN** `games.enabled` é `false`
- **WHEN** o bot inicia
- **THEN** nenhum convite inicia rodada, em nenhum dos dois jogos
- **AND** o parser de comandos continua reconhecendo o convite, para o bot poder
  responder honestamente em vez de cair em `nao_entendi`

#### Scenario: Faixa de distância invertida
- **GIVEN** `hideMinDistance` é maior que `hideMaxDistance`
- **WHEN** a config é carregada
- **THEN** o startup falha com mensagem clara e acionável
- **AND** o bot não sobe com configuração impossível

#### Scenario: Valores fora de faixa
- **GIVEN** `fakeSearches` é negativo, ou `countTo` é zero, ou
  `roundTimeoutMs` não é positivo
- **WHEN** a config é carregada
- **THEN** a validação recusa com mensagem apontando o campo

#### Scenario: Busca falsa dentro do alcance de visão
- **GIVEN** `fakeSearchMinDistanceFromOwner` é menor que `touchDistance`
- **WHEN** a config é carregada
- **THEN** o startup falha — uma busca falsa desse tamanho encostaria no jogador
  e acabaria a brincadeira antes de começar

#### Scenario: Faixa de fuga invertida
- **GIVEN** `fleeStepMin` é maior que `fleeStepMax`
- **WHEN** a config é carregada
- **THEN** a validação recusa apontando o campo

#### Scenario: Fuga além do teto do jogador
- **GIVEN** `fleeStepMax` é maior que `fleeMaxDistanceFromOwner`
- **WHEN** a config é carregada
- **THEN** a validação recusa — um salto de fuga maior que o teto garantiria
  candidato inválido em toda escolha

#### Scenario: Toque maior que o salto de fuga
- **GIVEN** `touchDistance` é maior ou igual a `fleeStepMin`
- **WHEN** a config é carregada
- **THEN** a validação recusa: o bot chegaria ao destino de fuga já dentro da
  distância de ser pego, e a rodada acabaria sozinha

#### Scenario: Tempo do jogo maior que a rede de segurança
- **GIVEN** `countTo × countIntervalMs + max(chaseTimeoutMs, fleeTimeoutMs) +
  surrenderTimeoutMs` passa de `roundTimeoutMs`
- **WHEN** a config é carregada
- **THEN** a validação recusa
- **AND** a mensagem diz de quanto `roundTimeoutMs` precisa ser — senão a rede de
  segurança dispara antes da regra do jogo valer

#### Scenario: Nada de segredo novo
- **GIVEN** o bloco `games`
- **WHEN** a config é validada contra `FORBIDDEN_YAML_KEYS`
- **THEN** nenhum campo novo é segredo
- **AND** o bloco pode ir para o `config.yaml` sem restrição

---

### Requirement: Configuração dos instintos de sobrevivência

O bloco `behavior` carrega as chaves dos dois instintos — comer e acender tocha
—, que acontecem **sozinhos** e nunca passam por IA.

| Chave | Padrão | O que faz |
|---|---|---|
| `autoEat` | `true` | Comer sozinho quando a fome apertar |
| `eatBelowFood` | `14` | Fome (0-20) a partir da qual ele come |
| `autoTorch` | `true` | Acender tocha sozinho no escuro |
| `torchBelowLight` | `7` | Luz (0-15) abaixo da qual o lugar merece tocha |
| `torchMinIntervalMs` | `20000` | Espera mínima entre duas tochas |
| `torchMinDistance` | `5` | Distância mínima da última tocha |
| `survivalTickMs` | `3000` | De quanto em quanto tempo ele checa |

#### Scenario: Os instintos vêm ligados
- **GIVEN** um `config.yaml` sem o bloco `behavior`
- **WHEN** a configuração é carregada
- **THEN** `autoEat` e `autoTorch` são `true`
- **AND** os limiares são os da tabela

#### Scenario: Dá para desligar sem mexer em código
- **GIVEN** `autoEat: false` e `autoTorch: false`
- **WHEN** o bot roda
- **THEN** ele não come nem acende tocha sozinho
- **AND** o comportamento volta a ser o de antes de 2026-08-30

---

### Requirement: Chaves das capacidades de 2026-08-30

Quatro capacidades novas trouxeram chave própria. Ficam registradas aqui porque
a spec de configuração é o lugar onde se confere o que existe — e nenhum delta
daquele dia trouxe seção de configuração para elas.

| Chave | Bloco | Padrão | De onde veio |
|---|---|---|---|
| `digMaxBlocks` | `behavior` | `16` | `add-place-and-dig` — teto de blocos numa escavação |
| `logDir` | raiz | `data/logs` | `add-file-logging` — pasta do log em arquivo; `null` desliga |
| `hotCold` | `games` | ver abaixo | `add-hot-and-cold` — o terceiro jogo |

O bloco `games.hotCold` tem `hideMinDistance` (8), `hideMaxDistance` (30),
`candidateSamples` (24), `foundRadius` (3), `tickMs` (2000), `repeatEvery` (3) e
`roundTimeoutMs` (180000).

`repeatEvery` é o que impede o chat de encher: numa rodada o bot fala a cada
dois segundos, e repetir "frio" a cada passo faria a criança parar de ler.

#### Scenario: Toda chave nova tem padrão que serve sozinho
- **GIVEN** um `config.yaml` sem nenhuma dessas chaves
- **WHEN** a configuração é carregada
- **THEN** todas assumem os padrões da tabela
- **AND** o bot funciona sem ninguém editar nada

#### Scenario: O log em arquivo pode ser desligado
- **GIVEN** `logDir: null`
- **WHEN** o bot roda
- **THEN** o log vai só para o `stdout`, como antes de 2026-08-30

#### Scenario: O exemplo documenta todas
- **GIVEN** `config.example.yaml`
- **WHEN** ele é lido
- **THEN** cada chave nova aparece com comentário explicando o efeito na
  brincadeira, não o tipo do dado

---

### Requirement: `config.example.yaml` documentado

O arquivo de exemplo ganha o bloco `games` comentado, explicando cada parâmetro
pelo efeito na brincadeira, não pelo nome técnico.

#### Scenario: Pai ajustando a dificuldade
- **GIVEN** a criança acha o bot fácil demais
- **WHEN** o pai abre `config.example.yaml`
- **THEN** os comentários deixam claro que aumentar `hideMaxDistance` deixa o
  esconderijo mais longe, e aumentar `fakeSearches` faz o bot demorar mais para
  achar

#### Scenario: Exemplo cobre o bloco `learned`
- **GIVEN** `config.example.yaml`
- **WHEN** alguém procura como desligar o aprendizado
- **THEN** o bloco `learned` está lá, com `enabled` comentado
- **AND** cada campo tem uma linha explicando o efeito prático de mexer nele
- **AND** o comentário diz por que `minConfidence` é mais rígido que o do repertório

---

### Requirement: Bloco `learned`

O histórico de comandos aprendidos é configurável, com defaults que funcionam sem
ninguém mexer em nada. Os dois valores que um adulto realmente ajusta são
`enabled` — para desligar o aprendizado por completo — e `minConfidence`, se o bot
começar a replicar comando em frase parecida demais.

```yaml
learned:
  enabled: true                       # false volta à cascata de três níveis
  path: 'data/learned-commands.json'  # fora do git, como todo o data/
  minConfidence: 0.85                 # mais alto que o do repertório (0.7):
                                      # ação errada é pior que pergunta repetida
  maxEntries: 200                     # teto; a menos usada sai primeiro
  maxRepliesPerEntry: 4               # falas da IA guardadas por entrada,
                                      # material para o /upgrade-repertoire
  forgetAfterDays: null               # null = guardar para sempre
  unlearnOnStopMs: 15000              # 'para' nessa janela apaga o aprendizado
```

> **`minConfidence` é mais alto que o do repertório de propósito.** Em `0.7` o
> casamento aceita saco de palavras, e "não pega madeira" tem as mesmas palavras
> de "pega madeira". Para conversa isso custa uma resposta esquisita; para ação,
> custa o bot fazendo o contrário do que foi pedido.

#### Scenario: Configuração ausente
- **GIVEN** `config.yaml` não tem o bloco `learned`
- **WHEN** o bot inicia
- **THEN** os defaults acima são aplicados
- **AND** o aprendizado funciona sem nenhuma configuração

#### Scenario: Aprendizado desligado
- **GIVEN** `config.yaml` traz `learned.enabled: false`
- **WHEN** o bot inicia
- **THEN** o histórico não é carregado, consultado nem gravado
- **AND** a cascata volta a ter três níveis

#### Scenario: Config antiga continua válida
- **GIVEN** um `config.yaml` escrito antes desta mudança
- **WHEN** o bot inicia
- **THEN** ele inicia normalmente, com o aprendizado nos defaults
- **AND** nenhuma migração de arquivo é necessária

#### Scenario: Limiar fora da faixa é recusado
- **GIVEN** `learned.minConfidence` é `1.4`
- **WHEN** a configuração é validada
- **THEN** o startup falha apontando o campo
- **AND** a faixa aceita é de 0 a 1, como a do repertório

#### Scenario: Caminho do histórico dentro de `data/`
- **GIVEN** `learned.path` não foi configurado
- **WHEN** o default é aplicado
- **THEN** o arquivo fica em `data/`, que está inteiro no `.gitignore`
- **AND** o aprendizado derivado das falas da criança não vai para um commit

---

### Requirement: Configuração da construção

Três campos em `behavior` governam a obra.

| Campo | Padrão | Para quê |
|---|---|---|
| `buildAllowlist` | troncos, pedra, pedregulho, terra, areia | o que pode virar parede |
| `buildMaxBlocks` | `120` | teto de segurança do tamanho da obra |
| `buildAutoGather` | `true` | buscar material sozinho quando faltar |

> `buildAllowlist` é **separada** de `collectAllowlist` de propósito: o que o bot
> pode cavar não é necessariamente o que faz uma casa decente, e um dia uma pode
> mudar sem a outra.

#### Scenario: Valores padrão
- **GIVEN** `config.yaml` não traz nenhum dos três
- **WHEN** o bot inicia
- **THEN** valem os padrões acima
- **AND** nenhuma migração de arquivo é necessária

#### Scenario: Material proibido nunca vira parede
- **GIVEN** `tnt` não está em `buildAllowlist`
- **WHEN** a construção com `tnt` é pedida
- **THEN** a obra é recusada

#### Scenario: Teto de segurança
- **GIVEN** `buildMaxBlocks: 10`
- **WHEN** uma casa de 52 blocos é pedida
- **THEN** a obra é recusada antes do primeiro bloco

#### Scenario: Busca automática desligada
- **GIVEN** `buildAutoGather: false` e falta material
- **WHEN** a obra é pedida
- **THEN** o bot recusa dizendo quanto falta, sem sair para coletar

---

### Requirement: Configuração da saída de buraco

Quatro campos em `behavior` governam a subida.

| Campo | Padrão | Para quê |
|---|---|---|
| `escapeMinDrop` | `3` | desnível a partir do qual vale empilhar |
| `escapeMaxHeight` | `24` | teto de degraus por tentativa |
| `escapeMaxDigs` | `12` | teto de blocos cavados para arranjar degrau |
| `escapeStuckMs` | `6000` | tempo parado seguindo antes de suspeitar de buraco |

#### Scenario: Valores padrão
- **GIVEN** `config.yaml` não traz nenhum dos quatro
- **WHEN** o bot inicia
- **THEN** valem os padrões acima
- **AND** nenhuma migração de arquivo é necessária

#### Scenario: Vigia mais impaciente
- **GIVEN** `escapeStuckMs: 2000`
- **WHEN** o bot fica 2 s parado seguindo, com o dono acima
- **THEN** a subida começa

#### Scenario: Teto de altura menor
- **GIVEN** `escapeMaxHeight: 5`
- **WHEN** o dono está 30 blocos acima
- **THEN** o bot sobe no máximo 5 degraus e fala que ainda está fundo

#### Scenario: Valor inválido
- **GIVEN** qualquer um dos quatro é zero ou negativo
- **WHEN** a config é carregada
- **THEN** o startup falha com mensagem clara

---

### Requirement: Raio de busca de porta
`behavior.doorSearchRadius` define até onde o bot procura porta. Padrão: `6`.

#### Scenario: Valor padrão
- **GIVEN** `config.yaml` não traz o campo
- **WHEN** o bot inicia
- **THEN** o raio é 6 blocos
- **AND** nenhuma migração de arquivo é necessária

#### Scenario: Raio curto evita porta do vizinho
- **GIVEN** o raio padrão
- **WHEN** o bot procura porta
- **THEN** ele só considera o que está perto de verdade
- **AND** não sai abrindo porta de construção alheia

#### Scenario: Valor inválido
- **GIVEN** `doorSearchRadius` é zero ou negativo
- **WHEN** a config é carregada
- **THEN** o startup falha com mensagem clara

---

### Requirement: Prazo da pergunta de papel

`games.roleQuestionTimeoutMs` define quanto tempo uma escolha de papel fica
pendente antes de expirar. Padrão: `45000`.

#### Scenario: Valor padrão
- **GIVEN** `config.yaml` não traz `games.roleQuestionTimeoutMs`
- **WHEN** o bot inicia
- **THEN** o prazo é 45000 ms
- **AND** nenhuma migração de arquivo é necessária

#### Scenario: Valor customizado
- **GIVEN** `games.roleQuestionTimeoutMs: 20000`
- **WHEN** o bot pergunta o papel e ninguém responde por 20 s
- **THEN** a escolha pendente expira

#### Scenario: Valor inválido
- **GIVEN** `games.roleQuestionTimeoutMs` é zero ou negativo
- **WHEN** a config é carregada
- **THEN** o startup falha com mensagem clara e acionável
