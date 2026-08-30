# Especificação: Configuração

**Componente:** `configuration`
**Origem:** `add-minecraft-companion-bot` (2026-08-15)
**Atualizado por:** `add-bot-games-hide-and-seek` (2026-08-15), `fix-hide-and-seek-cover` (2026-08-16),
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

### Requirement: `config.example.yaml` documentado

O arquivo de exemplo ganha o bloco `games` comentado, explicando cada parâmetro
pelo efeito na brincadeira, não pelo nome técnico.

#### Scenario: Pai ajustando a dificuldade
- **GIVEN** a criança acha o bot fácil demais
- **WHEN** o pai abre `config.example.yaml`
- **THEN** os comentários deixam claro que aumentar `hideMaxDistance` deixa o
  esconderijo mais longe, e aumentar `fakeSearches` faz o bot demorar mais para
  achar
