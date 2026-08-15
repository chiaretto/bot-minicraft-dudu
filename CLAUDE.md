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

Quando pedirem "analise os logs e incremente o repertório", faça nesta ordem:

1. **Levantar as falhas** — cruzar cada mensagem do jogador com a resposta
   seguinte e separar as que caíram em `nao_entendi`:

   ```bash
   node -e "
   const fs=require('fs');
   const f=process.argv[1];
   const l=fs.readFileSync(f,'utf8').trim().split('\n').map(JSON.parse);
   for(let i=0;i<l.length;i++){
     if(l[i].speaker==='FresherRobin90'&&l[i+1]&&l[i+1].entryId==='nao_entendi')
       console.log(l[i].text);
   }" data/conversations/AAAA-MM-DD.jsonl
   ```

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

7. **Validar** antes de encerrar: `npm test` e uma checagem de que as frases do
   log agora casam com a entrada certa.

8. **Sincronizar as DUAS cópias do repertório.** Isto é fácil de esquecer e
   custa o trabalho do dia:

   | Arquivo | Papel | Git |
   |---|---|---|
   | `data/repertoire.yaml` | o que o bot lê em execução | **ignorado** |
   | `src/dialogue/default-repertoire.yaml` | semente versionada, copiada para `data/` na primeira execução | versionado |

   `data/` está no `.gitignore` inteiro (por causa das conversas do jogador).
   Editar só o `data/repertoire.yaml` deixa o repertório fora do controle de
   versão e sem backup. Ao terminar a rodada do dia:

   ```bash
   cp data/repertoire.yaml src/dialogue/default-repertoire.yaml
   ```

Cada entrada nascida de log leva um comentário com a data de origem, para dar
para rastrear depois por que ela existe.

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
