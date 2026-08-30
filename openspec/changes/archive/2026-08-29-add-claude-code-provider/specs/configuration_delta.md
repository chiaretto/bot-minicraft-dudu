# Delta: Configuração (`configuration`)

**Change ID:** `add-claude-code-provider`
**Affects:** `src/config/schema.ts`, `src/config/load.ts`, `config.example.yaml`

---

## ADDED

### Requirement: Bloco `claude`

O provider Claude Code tem bloco próprio, ao lado de `ollama` e `gemini`. Além do
modelo e do tempo limite, ele carrega o que os outros não precisam: **os limites
da sessão viva**, porque este é o primeiro provider do projeto com estado entre
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
- **THEN** os valores são validados como positivos
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

## MODIFIED

### Requirement: Segredos apenas por variável de ambiente

A regra não muda: segredo nunca entra no YAML, nunca vai para o git, nunca sai no
log. A lista de segredos reconhecidos ganha a credencial da assinatura.

A exigência continua **condicional ao provider ativo** — quem roda só com Ollama
sobe o bot sem segredo nenhum, como sempre.

#### Scenario: A credencial da assinatura é lida do ambiente
- **GIVEN** a variável de ambiente da credencial do Claude Code está definida
- **WHEN** os segredos são lidos
- **THEN** ela fica disponível para o provider `claude`
- **AND** não aparece em nenhum log

#### Scenario: Credencial no YAML é recusada
- **GIVEN** o `config.yaml` traz a credencial do Claude Code em qualquer
  profundidade
- **WHEN** a configuração é carregada
- **THEN** o bot recusa com mensagem que aponta a chave proibida e o caminho dela

#### Scenario: Exigência só quando o provider é usado
- **GIVEN** `provider: 'ollama'` e `fallbackProvider: null`
- **AND** nenhuma credencial da Anthropic no ambiente
- **WHEN** o bot inicia
- **THEN** ele sobe normalmente

#### Scenario: Provider `claude` sem credencial falha cedo e explica
- **GIVEN** `provider: 'claude'` ou `fallbackProvider: 'claude'`
- **AND** a credencial não está no ambiente
- **WHEN** o bot inicia
- **THEN** ele falha antes de tentar conectar ao Minecraft
- **AND** a mensagem nomeia a variável e o comando que a gera

---

## REMOVED

(Nenhum. O bloco `gemini` e o `GEMINI_API_KEY` continuam válidos.)
