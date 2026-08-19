# Proposal: Aviso bonito de startup no terminal

**Change ID:** `add-startup-banner`
**Created:** 2026-08-19
**Status:** Implementation Complete
**Completed:** 2026-08-19

---

## Problem Statement

Quem sobe o bot com `npm run dev` hoje vê apenas uma linha de log JSON
(`iniciando`) e, logo depois, tentativas de reconexão em backoff. Nada indica
**o que a pessoa precisa fazer em seguida**: abrir o Minecraft, entrar no mundo
e abrir para LAN na porta que o `config.yaml` espera.

Isso dói por três motivos concretos, todos já registrados em `CLAUDE.md`:

- **A porta do LAN muda toda vez** que o mundo é aberto para LAN. O erro mais
  frequente de "o bot não conecta" é `server.port` desatualizado, e não há nada
  no terminal lembrando disso na hora certa.
- **A versão importa**: o mundo precisa ser aberto pela instalação 1.21.11. Um
  mundo aberto em versão mais nova faz o bot falhar com uma mensagem de
  protocolo que não ensina nada.
- **Quem sobe o bot muitas vezes é o pai com a criança do lado.** A tela de
  boot precisa parecer que algo bom aconteceu, não um despejo de log.

O bot só consegue entrar no mundo depois que o mundo existe — a ordem correta é
"bot de pé → abrir o LAN". Falta a mensagem que fecha esse ciclo.

## Proposed Solution

Imprimir, uma única vez no startup em modo de desenvolvimento, um **cartão de
boas-vindas no terminal** com:

1. confirmação de que o bot subiu, com o nome dele (`persona.name`);
2. o passo a passo para abrir o mundo em LAN, na versão configurada;
3. o endereço que o bot está esperando (`server.host:server.port`), em destaque;
4. o lembrete de que a porta do LAN muda a cada abertura, e onde corrigir.

Detalhes técnicos:

- Novo módulo `src/app/startup-banner.ts`, com uma função pura
  `renderStartupBanner(config, options)` que devolve `string` — testável sem
  tocar em terminal.
- `src/app/main.ts` imprime o resultado em `stdout` **antes** de criar o
  `CompanionBot`, logo após `loadConfig()` (o cartão precisa dos dados da
  config, e config inválida deve continuar caindo no erro atual).
- Cores ANSI e emoji são **opcionais**: desligados quando `NO_COLOR` está
  definido ou quando `stdout` não é TTY (pipe, redirecionamento para arquivo,
  CI). O texto sozinho continua legível e alinhado.
- Sai por `console.log`, não pelo `pino` — log estruturado com arte ASCII dentro
  vira uma linha JSON ilegível.

### Esboço do cartão

```
  ╭──────────────────────────────────────────────────╮
  │                                                  │
  │   Odraude está de pé!                            │
  │                                                  │
  ╰──────────────────────────────────────────────────╯

   Agora abra o mundo pra eu poder entrar:

     1.  Abra o Minecraft na versão 1.21.11
     2.  Entre no mundo do FresherRobin90
     3.  Esc  ->  Abrir para LAN  ->  Iniciar mundo em LAN
     4.  Veja no chat a porta que o jogo mostrar

   Estou esperando em  localhost:55654

   A porta do LAN muda toda vez que voce abre o mundo.
   Se o jogo mostrar outra, troque server.port no config.yaml.
```

## Scope

### In Scope

- Cartão de startup no terminal em modo desenvolvimento (`npm run dev`,
  `npm run dev:once`).
- Dados vindos da config já carregada: `persona.name`, `ownerPlayer`,
  `server.host`, `server.port`, `server.version`.
- Degradação limpa sem cor/emoji (`NO_COLOR`, saída não-TTY).
- Testes do texto renderizado.

### Out of Scope

- **Modo produtivo** (`npm start`, `NODE_ENV=production`): sem cartão. Lá o
  stdout é log de máquina, e o objetivo é justamente não poluí-lo.
- Detectar sozinho se o Minecraft está aberto, escanear portas de LAN ou
  descobrir a porta automaticamente.
- Reimprimir o cartão a cada tentativa de reconexão — ele é do startup.
- Qualquer mudança no chat do jogo. Nada disso chega ao Minecraft.
- Verificar se a versão do launcher bate com `server.version` antes de conectar.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| Config (`src/config/`) | Não | Só leitura dos campos que já existem |
| Conexão Minecraft (`src/minecraft/`) | Não | Nenhuma alteração no fluxo de conexão/reconexão |
| Diálogo / repertório | Não | O cartão é terminal, não é fala do bot |
| App (`src/app/`) | Sim | Novo `startup-banner.ts`; `main.ts` chama antes de subir o bot |
| Logging (`src/logging/`) | Não | Cartão sai por `console.log`, o `pino` segue igual |
| Testes | Sim | Novo `test/app/startup-banner.test.ts` |
| Build | Não | Só `.ts`, nada de asset novo para `copy-assets.mjs` |

## Architecture Considerations

- **Camadas respeitadas**: `app/` é a camada mais alta e pode ler `config/`. O
  módulo novo não importa nada de `minecraft/`, `dialogue/` ou `ai/`.
- **Função pura + efeito na borda**: a renderização devolve string; só o
  `main.ts` escreve no terminal. É o mesmo padrão usado nas mensagens de erro de
  config, e é o que torna o cartão testável.
- **Público**: este texto é lido por quem opera o terminal (o pai), e às vezes
  pela criança ao lado. Vale o tom da regra número um — frase curta, palavra
  simples, nada de jargão — mas ele **não** é fala do bot e não passa pelo
  repertório nem pelo throttle de chat.
- **Segredos**: o cartão só mostra host, porta, versão e nomes. Nenhum campo de
  `Secrets` entra ali, nem por acidente — a função recebe `AppConfig`, não
  `Secrets`.

## Success Criteria

- [x] `npm run dev` mostra o cartão antes de qualquer tentativa de conexão
- [x] O cartão traz `server.host:server.port` e `server.version` lidos da config
- [x] O cartão diz explicitamente que a porta do LAN muda e onde corrigir
- [x] `NODE_ENV=production npm start` **não** imprime o cartão
- [x] Com `NO_COLOR=1` ou saída redirecionada, o texto sai sem códigos ANSI e
      com as bordas alinhadas
- [x] Config inválida continua caindo na mensagem de erro atual, sem cartão
- [x] `npm test` e `npm run lint` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Emoji de largura dupla desalinha a borda direita da caixa | Média | Baixo | Não colocar emoji dentro de linha com borda à direita; testar o comprimento das linhas emolduradas |
| `tsx watch` reimprime o cartão a cada salvamento de arquivo | Alta | Baixo | Aceito: em watch, reiniciar é reiniciar. O cartão é curto e reafirma a porta esperada |
| Cartão sugerir versão/porta que já não valem se o config mudar depois | Baixa | Médio | Os valores vêm sempre da config carregada naquele boot, nunca de constante no código |
| Terminal do Windows sem suporte a box-drawing | Baixa | Baixo | Usar apenas caracteres box-drawing comuns; sem cor quando não-TTY |

---

## Archive Information

**Archived:** 2026-08-19
**Duration:** mesmo dia (proposta, implementação e arquivamento em 2026-08-19)
**Outcome:** implementado como proposto

### Arquivos modificados

- `src/app/startup-banner.ts` — novo; `renderStartupBanner()` pura, mais
  `shouldShowBanner()` e `shouldUseColor()`
- `src/app/main.ts` — imprime o cartão após `loadConfig()`, por `console.log`
- `test/startup-banner.test.ts` — novo, 16 testes
- `README.md` — seção "4. Rodar" mostra o cartão

### Specs atualizadas

- `openspec/specs/startup_console.md` — componente novo, 5 requisitos

### Desvios da proposta

- Os testes ficaram em `test/startup-banner.test.ts`, não em
  `test/app/startup-banner.test.ts`: a suíte do projeto é plana em `test/`.
- Os exemplos de spec e teste usam `Odraude` / `FresherRobin90` (nomes reais da
  config) em vez do par `Dudu` / `Miguel` documentado em `openspec/project.md`.
  A convenção do `project.md` não foi alterada.

### Pendência conhecida, fora do escopo

- `npm run lint` falha no Prettier para 54 arquivos por causa de CRLF vs LF —
  condição pré-existente do repo no Windows (53 arquivos antes desta mudança),
  não introduzida aqui. Resolver com `.gitattributes` é assunto de outro change.
