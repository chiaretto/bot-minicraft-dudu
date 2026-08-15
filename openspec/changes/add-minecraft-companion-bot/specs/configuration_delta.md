# Delta: Configuração

**Change ID:** `add-minecraft-companion-bot`
**Affects:** `src/config/`, `config.yaml`, `.env`

---

## ADDED

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

A chave da API do Gemini e a senha da conta do bot são lidas exclusivamente do
ambiente (`.env` ou variáveis do sistema), nunca do `config.yaml`, e nunca
aparecem em log ou mensagem de erro.

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
> sobe sem segredo nenhum — ver `llm_provider_delta.md`.

#### Scenario: Segredo colocado por engano no YAML
- **GIVEN** `config.yaml` contém uma chave `geminiApiKey`
- **WHEN** o bot valida a configuração
- **THEN** o bot recusa iniciar
- **AND** exibe `segredos não são permitidos em config.yaml; use variável de ambiente`

---

## MODIFIED

(Nenhum — projeto novo, sem configuração preexistente.)

## REMOVED

(Nenhum)
