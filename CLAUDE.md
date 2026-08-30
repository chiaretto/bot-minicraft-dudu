# bot-minicraft-dudu — instruções para o Claude

Convenções de arquitetura ficam em `openspec/project.md`. Este arquivo cobre o
que muda a forma de trabalhar no dia a dia.

## Regra número um: o dono é uma criança de 7 anos

**Toda fala do bot é lida por uma criança de 7 anos.** Antes de escrever ou
revisar qualquer texto que chegue ao chat — repertório, prompt de IA, mensagem
de erro — leia `openspec/project.md` → **"Público do bot"**.

Resumo operacional: frase curta, palavra simples, tom de amigo, honesta sobre o
que não sabe fazer, e quando não entender deve sugerir um comando que funciona.

Isso vale também para mensagens de falha. "Não consegui chegar lá, desculpa!" é
correto; "pathfinder: no path found" nunca chega ao chat.

## Rotina diária: analisar o log e ampliar o repertório

Enquanto `llm.provider` estiver em `'none'`, o repertório local é a **única**
fonte de conversa — não existe IA para cobrir o que ele não previu. Por isso a
manutenção é recorrente, e o dono do projeto pede essa análise todo dia.

Quando pedirem "analise os logs e incremente o repertório", o caminho pronto é
o comando **`/upgrade-repertoire`** (`.claude/commands/upgrade-repertoire.md`),
que já traz esta rotina inteira e roda em qualquer máquina com o repo clonado.
À mão, a ordem é esta:

1. **Levantar as falhas** — o relatório cruza cada fala do jogador com a
   resposta seguinte e separa em `miss` (caiu em `nao_entendi`) e `ai` (só a IA
   resolveu; é o que internalizar para depender menos de rede). Ele também
   lista os **comandos aprendidos** da IA, ordenados por uso: os mais repetidos
   são candidatos a virar regex em `src/behaviors/commands.ts` — promovida a
   frase, a entrada sai do cache sozinha no startup seguinte.

   ```bash
   npm run repertoire:gaps              # histórico todo
   npm run repertoire:gaps -- --days 3  # só os 3 dias de log mais recentes
   ```

   Ele já esconde o que comando ou repertório passaram a resolver depois, e
   aponta a entrada mais parecida com cada frase órfã.

2. **Agrupar por assunto**, não por frase. Cinco jeitos de perguntar a mesma
   coisa viram **uma** entrada com cinco padrões — não cinco entradas.

3. **Decidir onde entra**: assunto novo vira entrada nova em
   `data/repertoire.yaml`; variação de assunto existente vira padrão a mais na
   entrada que já existe. Comando de ação (seguir, ficar, parar) **não** é
   repertório: vai em `src/behaviors/commands.ts`.

4. **Escrever as respostas** seguindo a regra número um. Mínimo de 4 variações
   por entrada (`MIN_VARIATIONS_WARN`), senão o bot fica repetitivo — e criança
   percebe repetição rápido.

5. **Padrões já normalizados**: minúsculas, sem acento, sem pontuação. Um padrão
   com acento nunca casa. Confira com `prepare()` de `dialogue/normalize.ts`.

6. **Nunca prometer o que o bot não faz.** Buscar item só funciona com IA
   ligada; com `provider: 'none'` a resposta honesta é que ainda não aprendeu.
   Se mudar uma capacidade, varra o repertório atrás de promessa desatualizada.

7. **Validar** antes de encerrar: `npm test` e conferir onde cada frase do log
   cai agora na cascata, sem subir o bot:

   ```bash
   npm run repertoire:check -- "frase do log" "oi" "para"
   ```

   Rode também com frases antigas que já funcionavam: padrão largo demais rouba
   frase de outra entrada.

8. **Sincronizar as DUAS cópias do repertório.** Isto é fácil de esquecer e
   custa o trabalho do dia:

   | Arquivo | Papel | Git |
   |---|---|---|
   | `data/repertoire.yaml` | o que o bot lê em execução | **ignorado** |
   | `src/dialogue/default-repertoire.yaml` | semente versionada, copiada para `data/` na primeira execução | versionado |

   (`data/learned-commands.json`, o histórico de comandos aprendidos, é cache:
   não tem cópia versionada e não precisa de sincronia.)

   `data/` está no `.gitignore` inteiro (por causa das conversas do jogador).
   Editar só o `data/repertoire.yaml` deixa o repertório fora do controle de
   versão e sem backup. Ao terminar a rodada do dia:

   ```bash
   npm run repertoire:sync              # data/ -> semente versionada
   npm run repertoire:sync -- --check   # só compara (bom antes de commitar)
   ```

   Numa máquina onde o bot nunca rodou, `data/repertoire.yaml` não existe: edite
   a semente direto e use `npm run repertoire:sync -- --from-seed` se quiser a
   cópia de execução.

Cada entrada nascida de log leva um comentário com a data de origem, para dar
para rastrear depois por que ela existe.

## Comandos aprendidos: o que o bot decora sozinho

Desde 2026-08-20 existe um **nível 1.5** na cascata: quando a IA traduz um
pedido em ação e a ação dá certo, o par `frase → intenção` fica em
`data/learned-commands.json` e é replicado sem rede na próxima vez.

O que muda no dia a dia:

- **Não escreva no arquivo à mão** esperando que ele valha para sempre. É cache:
  entrada que virou regex em `commands.ts` é descartada no startup, e `para`
  logo depois de um replay apaga a entrada.
- **Cache é sugestão, código é lei.** O parser de regex vem antes e sempre
  ganha. Ao promover uma frase aprendida para `commands.ts`, não precisa limpar
  nada — a sombra do parser cuida disso.
- **Só ação bem-sucedida é aprendida.** Se um pedido não está sendo decorado,
  confira se a ação realmente terminou com `ok` (recusa e cancelamento não
  ensinam).
- **`GOTO_COORDS` nunca é aprendível** — os parâmetros dela são um lugar de um
  momento. Vale a regra: só entra intenção cujos parâmetros são vocabulário.
- Para depurar, `source: 'learned'` no histórico de conversa separa o que foi
  replicado do que a IA respondeu de verdade.

## Armadilhas conhecidas do ambiente

Custaram tempo a descobrir; não re-investigue do zero.

- **Teto de versão do Minecraft.** `mineflayer` 4.37.1 / `minecraft-protocol`
  1.66.2 suportam até **1.21.11**. O jogo já está em 26.x — abrir o mundo numa
  versão mais nova faz o bot falhar com `unsupported protocol version`, e não
  existe `npm update` que resolva. O mundo precisa ser aberto pela instalação
  1.21.11 do launcher.
- **Nome de instalação do launcher mente.** A instalação chamada "1.21.11"
  estava configurada como `latest-release`. Confirme a versão real pelo
  processo (`--version` na linha de comando do `javaw`) ou pelo F3, nunca pelo
  nome na lista.
- **A porta do LAN muda a cada vez** que o mundo é aberto para LAN. Se o bot não
  conecta, confira `server.port` antes de suspeitar de qualquer outra coisa.
  Desde 2026-08-29 dá para corrigir sem editor: o aplicativo de desktop
  (`launcher/`) tem o campo da porta em "Coisas de adulto", e ele grava no
  `config.yaml` preservando os comentários.
- **"Mostrar apenas bate-papo seguro" esconde o bot.** Como ele conecta em
  `auth: 'offline'`, as falas saem sem assinatura e o cliente com essa opção
  ligada as descarta em silêncio — servidor entrega, jogador não vê. Se o
  histórico em `data/conversations/` mostra resposta que o jogador jura não ter
  recebido, é isso.
- **`config.yaml` não está no git** (só `config.example.yaml`). Mudança de
  configuração não aparece no `git diff`.

## Diagnóstico

- `data/conversations/AAAA-MM-DD.jsonl` registra o que o bot **decidiu**
  responder, não o que chegou ao jogador. Entrega é outra coisa — ver a
  armadilha do chat seguro acima.
- O log da aplicação (pino) vai só para o stdout do terminal, não para arquivo.
  Quando o bot sobe pelo aplicativo de desktop, esse mesmo stdout aparece em
  "Coisas de adulto" — é onde procurar quando alguém diz que "não funcionou" e
  não tem terminal aberto.

## Atacar é comando, nunca intenção da IA

Desde 2026-08-29 existe `ATTACK`, e ele é a **única intenção executável que a IA
não pode propor**. Combate é determinístico (`project.md`), e escolher em quem
bater é decisão de combate — quem resolve é o parser de `commands.ts`.

Três coisas que decorrem disso, e que quebram se alguém mexer sem saber:

- **`AI_PROPOSABLE_INTENTS`** existe só para tirar `ATTACK` do schema entregue
  ao provider. Se ele voltar ao enum, a IA passa a propor ataque.
- **O catálogo de nomes de bicho em português inclui os pacíficos.** Não é
  sobrecarga: sem `vaca` mapeada, "ataca a vaca" cairia no padrão genérico e o
  bot bateria num zumbi qualquer.
- **Nome fora do catálogo NÃO vira comando.** É o que impede "mata a saudade" de
  virar ataque de verdade. Atacar errado é pior que não atacar.

E a armadilha que custou uma rodada de depuração: **o schema compartilhado não
aceita `action: null`**, embora o prompt mande responder exatamente isso. Ollama
e Gemini toleram omitindo o campo; a saída estruturada do Claude Code é estrita e
preenche com uma ação válida qualquer — chegou a devolver `STOP` para pedido de
ataque, que cancelaria o que a criança tinha mandado fazer. Por isso o provider
Claude passa um schema com `action` anulável.

## O provider Claude Code

`src/ai/providers/claude.ts` é o único arquivo que conhece o
`@anthropic-ai/claude-agent-sdk`. Ele existe para usar a **assinatura**
(`claude setup-token`) em vez de chave de API cobrada por token.

O Agent SDK é o harness do Claude Code — loop de agente, ferramentas de arquivo
e bash. Nada disso serve para responder uma frase no chat, e o provider inteiro
é o trabalho de **desligar** isso. Quatro coisas que custaram tempo:

- **`tools: []` é o que desliga ferramenta**, não `allowedTools: []`. Esta é
  lista de auto-aprovação, já vem vazia por padrão e mesmo assim deixa a
  ferramenta no contexto do modelo. Não é ajuste de performance: é a garantia de
  que a IA continua sem poder agir direto na máquina.
- **`settingSources: []` é obrigatório.** Sem isso o SDK lê o `CLAUDE.md` deste
  repositório do disco e ele entra como prompt em toda fala da criança.
- **`maxTurns` conta fala E resposta.** Com `1` a chamada estoura em
  `error_max_turns` — derruba o aquecimento e, de vez em quando, uma fala no
  meio da conversa. O mínimo que funciona é `2`.
- **`query()` é preguiçoso.** Criar a sessão não sobe processo nenhum; o spawn
  (~14 s) só acontece na primeira mensagem. Por isso o `warmUp()` manda uma fala
  de mentira — sem ela o aquecimento não aquece nada.

E a regra que amarra tudo: **a sessão fixa o system prompt na criação**. Por isso
`prompt.ts` tem `staticPrompt()` (persona, catálogo, exemplos) separado de
`worldBlock()` (estado do mundo, que vai em cada fala). Uma sessão aquecida com
prompt genérico responde a conversa inteira como assistente genérico — sem
persona, sem catálogo de ação, sem a regra número um.

## O aplicativo de desktop

`launcher/` é um pacote **separado** (`package.json` próprio, Electron), fora da
cascata de camadas — como `tools/`, mas ainda mais longe: ele não importa nada
do bot, fala com ele por processo. `npm install` na raiz não baixa Electron.

Duas coisas que custam tempo se forem esquecidas:

- **`SIGTERM` não para o bot no Windows.** Mandado a um processo filho, o Node o
  traduz para `TerminateProcess` e o handler de encerramento não roda — o bot
  sai sem desconectar e fica de fantasma no mundo. Por isso o supervisor manda a
  linha `parar` no `stdin`, e o `main.ts` do bot a trata como `SIGINT`.
- **O protocolo é uma constante repetida nos dois lados** (`@dudu-status`), em
  `src/app/status-channel.ts` e `launcher/src/status.ts`. São processos
  separados de propósito; um `import` entre eles amarraria o launcher ao build
  do bot. Mudou de um lado, mude do outro.

Tudo que dá para testar sem abrir janela mora em módulo puro
(`supervisor`, `status`, `phrases`, `config-port`, `repo-path`), e as frases da
janela seguem a **regra número um** igual às falas do chat.
