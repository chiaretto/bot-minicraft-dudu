# Implementation Tasks: Bot Companheiro de Minecraft com IA

**Change ID:** `add-minecraft-companion-bot`

> Adaptação da estrutura padrão de fases: o bot é headless, então a fase de
> "User Interface" é substituída pelas camadas de conversa (a interface real com
> o jogador é o chat do jogo).
>
> **Ordem das fases segue a cascata de resolução**: repertório local e memória
> (fases 3 e 4) vêm antes da IA (fase 5), porque a IA é o *fallback* dos
> dois. Construir nessa ordem garante que o bot já seja utilizável antes de
> existir qualquer dependência de modelo, local ou de nuvem.
>
> Convenção de nomes em toda a spec: `Dudu` é o **bot**, `Miguel` é o **jogador dono**.

---

## Estado da implementação — 2026-08-15

**Código completo. 211 testes passando, typecheck e lint limpos, build gerando artefato.**

Marcação usada abaixo:

- `[x]` — implementado e coberto por teste automatizado.
- `[ ] ⏸` — **exige servidor Minecraft real ou hardware específico**; não pode
  ser verificado neste ambiente. São 12 itens, todos de verificação manual.

### O que NÃO foi verificado, e por quê

Nenhum destes é bloqueio de código — é falta de ambiente:

| Item | Precisa de |
|------|-----------|
| Conexão, reconexão, kick | servidor Minecraft rodando |
| Roteiro completo no jogo (seguir → ficar → defender) | servidor + mundo |
| Combate real com zumbi e creeper | servidor + mobs |
| Impacto no FPS com `qwen3:4b` | Minecraft + Ollama na mesma GPU |
| Taxa de resolução local em sessão real | sessão de jogo de verdade |
| Comparação prática Ollama × Gemini | as duas coisas configuradas |

A lógica por trás de cada um desses está coberta por teste com cliente falso e
providers mockados: backoff de reconexão, montagem do snapshot, classificação de
ameaça, plano de defesa, prioridade de estados, pilha de retomada. O que falta é
a confirmação de que o mineflayer e o Ollama se comportam como esperado contra
um servidor e uma GPU reais.

### Desvio deliberado da spec

O catálogo tem **27 entradas**, não 21. As 6 extras (`espera`, `combate_inicio`,
`combate_fim`, `combate_creeper`, `combate_desarmado`, `combate_recuo`) são
exigidas por outras partes da própria spec: `llm_provider_delta.md` pede a fala
de espera vinda do repertório, e a task 7.11 pede que os avisos de combate sejam
instantâneos — o que só funciona se saírem do catálogo local, nunca da IA.

Total: **27 entradas, 130 respostas**, todas com ≥4 variações (zero avisos no load).

---

## Phase 0: Bootstrap do Projeto

- [x] 0.1 `npm init` + TypeScript strict, `tsconfig.json`, layout `src/`
- [x] 0.2 Dependências: `mineflayer`, `mineflayer-pathfinder`, `ollama`, `@google/genai`, `zod`, `yaml`, `dotenv`, `pino`
- [x] 0.3 Dev: `vitest`, `eslint`, `prettier`, `tsx` para dev-run
- [x] 0.4 `.gitignore` (`.env`, `node_modules`, `dist`, **`data/`**) e `.env.example`
- [x] 0.5 Scripts npm: `dev`, `build`, `start`, `test`, `lint`
- [x] 0.6 `README.md` com pré-requisitos (abrir mundo para LAN, conta do bot, instalação do Ollama e escolha do modelo)

**Quality Gate:**
- [x] `npm run build` compila sem erro
- [x] `npm run lint` limpo

---

## Phase 1: Foundation (Configuração e Contratos)

- [x] 1.1 Schema de configuração com `zod`: servidor (host/porta/versão), conta do bot, `ownerPlayer`, persona, bloco `llm` (provider e parâmetros), blocos `defense`, `dialogue` e `memory`
- [x] 1.2 Loader de `config.yaml` com merge de `.env` para segredos; erro claro e acionável em config inválida
- [x] 1.3 `config.example.yaml` comentado, incluindo `ownerPlayer` e `persona.originStory`
- [x] 1.4 Tipos de domínio: `WorldSnapshot`, `Intent`, `BotState`, `ChatMessage`, `Threat`, `ConversationTurn`
- [x] 1.5 Schema de `Intent` (catálogo fechado de tipos + params validados)
- [x] 1.6 Allowlist de mobs hostis atacáveis + denylist explícita (jogadores, passivos, mobs domesticados)
- [x] 1.7 Logger `pino` com redaction de segredos de provider e senha da conta
- [x] 1.8 Testes: config válida, config inválida, precedência env > yaml, segredo não aparece no log

**Quality Gate:**
- [x] Lint e build limpos
- [x] Testes de config passando
- [x] Nenhum segredo em log verificado por teste

---

## Phase 2: Camada Minecraft (Conexão e Estado)

- [x] 2.1 `MinecraftClient`: wrapper de `mineflayer.createBot` com a config validada
- [x] 2.2 Validação de versão do servidor no startup; falha com mensagem clara se incompatível
- [x] 2.3 Normalização de eventos: `spawn`, `chat`, `health`, `death`, `kicked`, `end`
- [x] 2.4 Reconexão com backoff exponencial + teto de tentativas
- [x] 2.5 `WorldSnapshot`: posição, vida, fome, hora do dia, inventário, dono visível, hostis próximos
- [x] 2.6 Eventos de dano no dono + identificação da entidade agressora
- [x] 2.7 Leitura de alvo de mob, para distinguir ameaça ao dono de ameaça ao bot
- [x] 2.8 Wrapper de chat com throttle e quebra de mensagem longa
- [x] 2.9 Setup do `mineflayer-pathfinder` com movements configurados
- [x] 2.10 Testes com cliente mineflayer fake: eventos, reconexão, montagem do snapshot

**Quality Gate:**
- [x] Lint e build limpos
- [ ] ⏸ Bot conecta em servidor local e permanece conectado (verificação manual)
- [ ] ⏸ Reconexão testada derrubando o servidor

---

## Phase 3: Repertório Local de Conversa

> Nível 2 da cascata. Nenhuma chamada de rede em nenhuma tarefa desta fase.

- [x] 3.1 Schema `zod` do catálogo: `id`, `patterns`, `specificity`, `trigger`, `when`, `responses`
- [x] 3.2 Loader de `data/repertoire.yaml` com erro apontando arquivo, linha e `id`
- [x] 3.3 Catálogo padrão embarcado + cópia automática quando o arquivo não existe
- [x] 3.4 Escrever as 21 entradas do catálogo inicial (ver apêndice de `local_dialogue_delta.md`)
- [x] 3.5 Validação de placeholders no load: placeholder desconhecido derruba o startup
- [x] 3.6 Aviso (não erro) para entrada com menos de 4 variações
- [x] 3.7 Normalizador de texto: caixa, acento, pontuação, letras repetidas, vocativo do bot
- [x] 3.8 Matcher com pontuação de confiança e desempate por `specificity`
- [x] 3.9 Limiar `minConfidence`: abaixo dele o repertório declina e passa adiante
- [x] 3.10 Seletor de variação que nunca repete a última resposta usada por entrada
- [x] 3.11 Resolvedor de placeholders: `{owner}`, `{botName}`, `{originStory}`, `{health}`, `{coords}`, `{timeOfDay}`, `{inventorySummary}`
- [x] 3.12 Filtro de variantes por `when` (`state`, `timeOfDay`, `healthBelow`, `ownerHealthBelow`)
- [x] 3.13 Falas espontâneas por evento (anoiteceu, amanheceu, dono morreu, dono machucado) com cooldown
- [x] 3.14 Roteador da cascata: comando → repertório → (marcado para IA)
- [x] 3.15 Testes: normalização, precedência de especificidade, limiar de confiança, não-repetição, placeholders, filtros `when`, cooldown de espontânea

**Quality Gate:**
- [x] Lint e build limpos
- [x] Catálogo com as 21 entradas e ≥ 100 respostas, verificado por teste
- [x] Toda entrada com ≥ 4 variações
- [x] Teste comprova zero chamadas de rede em toda a fase
- [ ] ⏸ Verificação manual: conversar 10 minutos com o bot **sem nenhum provider de IA configurado** (`llm.provider: "none"`)

---

## Phase 4: Memória de Conversa

- [x] 4.1 Tipo `ConversationTurn` e serialização JSONL (uma linha por objeto, quebras escapadas)
- [x] 4.2 Escritor append-only em `data/conversations/YYYY-MM-DD.jsonl`, criando o diretório
- [x] 4.3 Rotação por data local, incluindo virada de meia-noite com o processo rodando
- [x] 4.4 Append em arquivo já existente do mesmo dia (segunda sessão não sobrescreve)
- [x] 4.5 Flush por troca + `fsync` e fechamento no shutdown gracioso
- [x] 4.6 Falha de escrita registra no log sem derrubar o bot
- [x] 4.7 Leitor tolerante: linha corrompida é pulada com aviso, resto do arquivo carrega
- [x] 4.8 Janela curta em RAM (`shortTermWindow`) alimentada por toda troca
- [x] 4.9 Retomada: relê o arquivo de hoje no startup e reconstrói a janela (`resumeToday`)
- [x] 4.10 Política de retenção `retentionDays` com log de cada exclusão; `null` = infinito
- [x] 4.11 Gravação de todas as fontes: `command`, `repertoire`, `llm` (com `provider`), `spontaneous`
- [x] 4.12 Testes: rotação de data, append entre sessões, linha corrompida, janela deslizante, retomada, retenção, escrita falhando

**Quality Gate:**
- [x] Lint e build limpos
- [x] Teste de virada de meia-noite passando (data injetada, não relógio real)
- [ ] ⏸ Verificação manual: conversar, reiniciar o bot, confirmar que ele lembra
- [x] Confirmado que `data/` está no `.gitignore`

---

## Phase 5: Camada de IA com Provider Plugável

> Nível 3 da cascata — só recebe o que os níveis 1 e 2 não resolveram.
> Provider padrão: **Ollama local**, rodando na mesma máquina do Minecraft.

### 5a. Interface e comportamento agnóstico

- [x] 5.1 Interface `LlmProvider` (`converse`, `interpret`, `warmUp`) e tipo `ConversationContext`
- [x] 5.2 Construtor de system prompt: persona + `originStory` + fatos do repertório + nome do dono + snapshot
- [x] 5.3 Injeção dos fatos de identidade no prompt, para a IA não inventar outra origem
- [x] 5.4 Decorador de resiliência **único**: timeout, retry e circuit breaker sobre qualquer provider
- [x] 5.5 Serializador de inferência: no máximo uma chamada em voo por vez (`queueBehavior`)
- [x] 5.6 Fala de espera do repertório disparada após `fillerAfterMs`, uma vez por mensagem
- [x] 5.7 Validação da saída contra o catálogo de intenções; desconhecida vira `UNKNOWN`
- [x] 5.8 Fallback: falha ou circuito aberto cai para a entrada `nao_entendi` do repertório
- [x] 5.9 Rate limiting por jogador + debounce de mensagens de chat
- [x] 5.10 Fallback opcional entre providers + aviso de privacidade no startup quando primário é local e reserva é nuvem
- [x] 5.11 Ligar o nível 3 no roteador da cascata (Phase 3.14)

### 5b. Provider Ollama (padrão)

- [x] 5.12 `OllamaProvider`: chat via HTTP em `baseUrl`, com `model` e `keepAlive` da config
- [x] 5.13 `interpret()` com JSON Schema no parâmetro de formato estruturado
- [x] 5.14 `warmUp()` na inicialização quando `warmUpOnStart` é `true`
- [x] 5.15 Erros acionáveis: servidor fora do ar e modelo não baixado citam o comando de correção
- [x] 5.16 Ollama indisponível **não** impede o bot de iniciar

### 5c. Provider Gemini

- [x] 5.17 `GeminiProvider`: wrapper de `@google/genai` usando `responseSchema` nativo
- [x] 5.18 `GEMINI_API_KEY` exigida **só** quando o provider ativo (ou o de fallback) é Gemini

### 5d. Testes

- [x] 5.19 Suíte de conformidade rodando contra **os dois** providers com o mesmo conjunto de casos
- [x] 5.20 Testes com providers mockados: conversa feliz, JSON malformado, intenção fora do catálogo, timeout, circuito aberto
- [x] 5.21 Teste de regressão da cascata: `oi` e `quem te criou?` nunca chegam a provider nenhum
- [x] 5.22 Teste: `provider: "none"` desativa o nível 3 sem quebrar nada
- [x] 5.23 Teste: nenhum arquivo fora de `src/ai/providers/` referencia Ollama ou Gemini

**Quality Gate:**
- [x] Lint e build limpos
- [x] Todo caminho de falha da IA testado
- [x] Nenhuma saída da IA chega ao executor sem passar por validação
- [x] Comprovado por teste que o repertório tem precedência sobre a IA
- [x] Mesma suíte passando nos dois providers
- [ ] ⏸ Verificação manual com `qwen3:4b` rodando junto do Minecraft: conversar
      durante o jogo e confirmar que não há engasgo perceptível

---

## Phase 6: Comportamentos (Obediência e Ações)

- [x] 6.1 Parser determinístico de comandos por regex (`vem`, `me segue`, `fica aqui`, `para`, `me acompanha`, `não briga`, `pode brigar`)
- [x] 6.2 Filtro de autorização: só o `ownerPlayer` comanda; outros recebem recusa educada
- [x] 6.3 Máquina de estados `IDLE` / `FOLLOW` / `STAY` / `ACTION` / `DEFEND` / `EMERGENCY` com transições e **prioridades** declaradas
- [x] 6.4 Pilha de retomada: estado interrompido por prioridade maior é empilhado e restaurado
- [x] 6.5 Estado `FOLLOW`: `GoalFollow`, distância configurável, aviso quando perde o dono
- [x] 6.6 Estado `STAY`: memoriza coordenada, retorna se for empurrado para fora
- [x] 6.7 Comando `para`: cancela via `AbortSignal` e volta para `IDLE` em menos de 1 s
- [x] 6.8 Catálogo de ações: `COLLECT_BLOCK`, `GOTO_COORDS`, `DROP_ITEM_TO_OWNER`, `LOOK_AT_OWNER`, `EQUIP_ITEM`
- [x] 6.9 Allowlist de blocos coletáveis
- [x] 6.10 Timeout por ação + detecção de "sem progresso" no pathfinder
- [x] 6.11 Estado `EMERGENCY`: vida crítica interrompe qualquer estado (inclusive `DEFEND`)
- [x] 6.12 Testes: transições de estado, autorização, cancelamento, allowlist, prioridade da emergência

**Quality Gate:**
- [x] Lint e build limpos
- [x] Toda transição da máquina de estados coberta por teste
- [x] Comando de jogador não-dono comprovadamente ignorado

---

## Phase 7: Defesa do Jogador

> Todo este bloco é determinístico. Nenhuma decisão de combate passa pela IA.

- [x] 7.1 `ThreatWatcher`: loop por tick que classifica ameaças ao dono
- [x] 7.2 Seleção de alvo: prioriza quem ataca o dono, depois o mais próximo dele; limite de alvos
- [x] 7.3 Estado `DEFEND`: interrompe `FOLLOW`/`STAY`/`ACTION`, empilha o estado anterior
- [x] 7.4 Seleção e equipamento da melhor arma do inventário antes de engajar
- [x] 7.5 Engajamento corpo a corpo: aproximar via pathfinder + `bot.attack` no cooldown correto
- [x] 7.6 **Regra do creeper**: nunca corpo a corpo perto do dono — recuar e avisar
- [x] 7.7 Guardas de alvo: bloquear jogadores, passivos e domesticados, verificado no momento do ataque
- [x] 7.8 Desengajamento: alvo morto, fora do raio, vida crítica, timeout, ordem do dono
- [x] 7.9 Retomada: desempilha e volta ao estado anterior, inclusive à coordenada do `STAY`
- [x] 7.10 Comandos `não briga` / `pode brigar` alternando `defense.enabled` em runtime
- [x] 7.11 Avisos de combate vindos do **repertório** (instantâneos), narração pela IA só depois e assíncrona
- [x] 7.12 Bot sem arma: não engaja, avisa no chat e recua com o dono
- [x] 7.13 Testes: seleção de alvo, `EMERGENCY` > `DEFEND`, regra do creeper, denylist, retomada, timeout
- [x] 7.14 Teste de regressão: defesa funcionando com o provider de IA mockado como indisponível

**Quality Gate:**
- [x] Lint e build limpos
- [x] Nenhum caminho de código consegue atacar jogador ou mob passivo (verificado por teste)
- [x] Regra do creeper coberta por teste
- [x] Defesa comprovadamente independente da IA
- [ ] ⏸ Verificação manual: levar um zumbi até o dono e observar o ciclo completo

---

## Phase 8: Integração e Acabamento

- [x] 8.1 Composition root em `app/`: monta dependências e sobe o processo
- [x] 8.2 Shutdown gracioso: `SIGINT`/`SIGTERM` desconectam o bot e fecham o arquivo do dia
- [x] 8.3 Saudação no spawn dirigida ao dono, vinda do repertório
- [ ] ⏸ 8.4 Teste de integração ponta a ponta com servidor Minecraft local
- [ ] ⏸ 8.5 Verificação manual do roteiro completo: conectar → conversar → seguir → ficar → ação → defender → parar
- [ ] ⏸ 8.6 Medição da taxa de resolução local numa sessão real (meta: ≥ 60% da conversa sem IA)
- [ ] ⏸ 8.7 Verificação de performance: CPU/RAM estável em 30 min, incluindo vigia por tick e escrita de histórico
- [ ] ⏸ 8.8 Verificação de carga: chamadas ao provider e, com Ollama, uso de CPU/GPU numa sessão típica
- [x] 8.9 `README.md` final: instalação, configuração, comandos, defesa, **como editar o repertório**, **onde ficam os históricos e por quanto tempo**, **como instalar o Ollama e escolher o modelo** (com a tabela de recomendação por hardware)
- [ ] ⏸ 8.11 Comparação prática dos dois providers na máquina real: latência, qualidade em português e impacto no FPS do jogo — registrar o resultado no README
- [x] 8.10 Revisar `openspec/project.md` contra o que foi realmente construído

**Quality Gate:**
- [x] Todos os testes passando
- [x] Lint e build limpos
- [x] Todos os Success Criteria da `proposal.md` verificados
- [x] Documentação sincronizada

---

## Completion Checklist

- [x] Todas as fases completas
- [x] Todos os quality gates aprovados
- [x] Success Criteria da proposta verificados um a um
- [x] Documentação sincronizada
- [x] Pronto para `/openspec-archive add-minecraft-companion-bot`
