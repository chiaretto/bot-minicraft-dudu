# Proposal: Aplicativo de desktop para ligar e desligar o bot

**Change ID:** `add-desktop-launcher`
**Created:** 2026-08-29
**Status:** Implementation Complete
**Completed:** 2026-08-29

---

## Problem Statement

Hoje só existe um jeito de o bot entrar no mundo: alguém abre um terminal,
navega até a pasta do repositório e digita `npm run dev`. Para desligar,
`Ctrl+C`. Para reiniciar depois de trocar a porta do LAN, as duas coisas em
sequência — com uma edição de `config.yaml` no meio.

Quem quer o bot é uma criança de 7 anos. Ela não abre terminal, não sabe o que é
`npm` e não vai editar YAML. Na prática isso significa que **o bot só existe
quando um adulto está disponível**, e o adulto vira o botão de ligar.

E o adulto também paga um preço, todo dia:

| Atrito | Hoje |
|---|---|
| Ligar | abrir terminal, `cd`, `npm run dev` |
| A porta do LAN mudou | abrir `config.yaml` no editor, achar `server.port`, salvar, reiniciar |
| Saber se conectou | ler o backoff do `pino` rolando no terminal |
| Desligar | achar a janela do terminal certa e dar `Ctrl+C` |

A armadilha da porta é a pior: ela **muda toda vez** que o mundo é aberto para
LAN (documentado no `CLAUDE.md`), então a edição de `config.yaml` não é evento
raro de instalação — é rotina de toda sessão de jogo.

## Proposed Solution

Um aplicativo de desktop em Electron, com ícone próprio na área de trabalho, que
**supervisiona** o processo do bot: liga, desliga, reinicia, mostra em que pé
está a conexão e deixa corrigir a porta do LAN sem abrir editor de texto.

```
+-- Odraude ----------------------------+
|                                       |
|              (  o  )                  |  <- estado, em palavra de crianca
|        O Odraude ta com voce!         |
|                                       |
|   +---------------+ +---------------+ |
|   |    Chamar o   | |     Mandar    | |  <- dois botoes grandes
|   |    Odraude    | |     dormir    | |
|   +---------------+ +---------------+ |
|         +-------------------+         |
|         |  Acordar de novo  |         |
|         +-------------------+         |
|                                       |
|   > Coisas de adulto                  |  <- recolhido: porta e log
+---------------------------------------+
```

### A tela é da criança; o detalhe é do adulto

A **regra número um vale para a janela também**. A tela principal tem estado em
frase curta, dois botões grandes e cor. Nenhuma palavra técnica: não aparece
"processo", "porta", "stdout", "conectando ao servidor".

Log ao vivo e edição de porta **existem**, mas moram atrás de um bloco recolhido
("Coisas de adulto"), fechado por padrão. É o mesmo espírito do cartão de
startup: o público ali é o adulto que sobe o processo, não a criança.

O nome nos botões vem de `persona.name` do `config.yaml` — quem renomear o bot
vê o novo nome na janela.

### Estados, e como cada um soa

O supervisor não adivinha o estado lendo log: o bot **conta** o que está
acontecendo (ver "Canal de status", abaixo).

| Estado | Frase na janela | Cor | Quem sabe |
|---|---|---|---|
| `parado` | "O Odraude tá dormindo." | cinza | supervisor |
| `ligando` | "Acordando o Odraude..." | amarelo | bot |
| `procurando` | "Procurando seu mundo..." | amarelo | bot |
| `no_mundo` | "O Odraude tá com você!" | verde | bot |
| `parando` | "O Odraude tá indo dormir..." | amarelo | supervisor |
| `desistiu` | "Não achei seu mundo! Abriu ele pra LAN?" | vermelho suave | bot |
| `caiu` | "O Odraude foi embora. Quer chamar de novo?" | vermelho suave | supervisor |

A coluna "quem sabe" saiu da implementação e vale a regra: **um processo não
anuncia a própria morte**. O bot emite quatro estados; `parado`, `parando` e
`caiu` só o supervisor pode observar.

`desistiu` é o caso comum de porta errada, e a frase já ensina o passo seguinte —
como as respostas de "não entendi" fazem no chat.

### Canal de status e canal de parada

Duas adições pequenas em `src/app/main.ts`, ambas **atrás da variável de
ambiente `DUDU_LAUNCHER=1`**, para que `npm run dev` no terminal continue
idêntico ao de hoje:

1. **Status para fora.** O bot escreve uma linha JSON por transição em `stdout`,
   com um prefixo reservado (`@dudu-status {...}`). O supervisor lê o `stdout`
   do filho, separa as linhas de status e trata o resto como log.

2. **Parada para dentro.** O supervisor escreve `parar` no `stdin` do filho, e o
   bot trata isso exatamente como `SIGINT`: `bot.stop()`, desconecta limpo, sai.

O canal de parada não é preciosismo — é **necessidade do Windows**. `SIGTERM`
enviado a um processo filho no Windows não é sinal de verdade: o Node o traduz
para `TerminateProcess`, e o handler de `shutdown` que já existe no `main.ts`
**não roda**. Sem isso, "mandar dormir" deixa o bot como fantasma no mundo até o
servidor derrubá-lo por timeout. Com o canal, a saída é graciosa nas duas
plataformas; `kill` fica só como último recurso, depois de um tempo de espera.

> **Descoberto na implementação:** o canal funciona — a parada medida ficou em
> **849 ms**, muito abaixo do teto de `kill`, o que só acontece se o handler do
> bot tiver rodado de verdade.
>
> Apareceu uma segunda armadilha na mesma vizinhança: num aplicativo
> empacotado, `process.execPath` é o binário do **Electron**, não o do Node. Sem
> `ELECTRON_RUN_AS_NODE=1` o bot subia como uma segunda instância do
> aplicativo, que o `requestSingleInstanceLock` matava no mesmo instante — o
> sintoma era o bot "cair" menos de um segundo depois de ser chamado. Com a
> variável, o mesmo binário roda como Node puro, e nem é preciso ter um `node`
> no PATH da máquina.

### Editar a porta sem perder o arquivo

O bloco de adulto tem um campo de porta que grava direto em `config.yaml`, com
três cuidados:

- **Comentário sobrevive.** A escrita usa a API de documento do `yaml`
  (`parseDocument` -> `setIn` -> `toString`), nunca `parse` + `stringify` — que
  apagaria todo o comentário do arquivo, incluindo o que explica cada bloco.
- **Escrita atômica**, arquivo temporário e `rename`, como o `learned-store.ts`
  já faz. Um crash no meio não pode corromper a configuração do bot.
- **A validação de verdade continua sendo o `configSchema`.** O supervisor faz só
  uma guarda rasa (inteiro entre 1 e 65535); configuração inválida por outro
  motivo aparece como falha de start com a mensagem do próprio bot.

Porta trocada com o bot de pé pede reinício para valer — a janela avisa isso em
uma frase, com o botão de reiniciar ao lado.

### Onde o código mora

O supervisor **não é uma camada do bot**: é um processo de fora que o executa.
Fica em `launcher/`, na raiz do repositório, **com `package.json` próprio**.

A razão é dependência: o Electron pesa ~150 MB, e o bot não pode passar a
depender dele. Com pacote separado, `npm install` na raiz continua instalando
exatamente o que instala hoje, `npm run dev` continua subindo sem Electron
nenhum, e uma máquina headless (ou o CI) nunca baixa um runtime de GUI para
rodar `npm test`.

```
launcher/
  package.json          electron + electron-builder, isolados
  src/main.ts           processo principal: janela, IPC, ciclo de vida
  src/preload.ts        ponte com contextIsolation (sem Node no renderer)
  src/runner.ts         dono do processo do bot: spawn, escuta, parada
  src/supervisor.ts     estado do filho - logica pura, testavel
  src/status.ts         parser das linhas @dudu-status - puro
  src/config-port.ts    leitura/escrita da porta preservando comentario
  src/phrases.ts        estado -> frase de crianca (a regra numero um mora aqui)
  src/repo-path.ts      onde esta a copia do repositorio
  ui/                   index.html + renderer.js
  build/icon.ico        icone, gerado por make-icon.mjs versionado
  scripts/pack.mjs      empacota gravando o caminho do repositorio
```

`supervisor.ts`, `status.ts`, `config-port.ts`, `phrases.ts` e `repo-path.ts`
são funções puras testadas com `vitest`; `main.ts` e `runner.ts` ficam finos, só
ligando as pontas. É a mesma divisão de "regra pura na função, I/O na borda" que
o projeto já usa em `dialogue/` versus `loader.ts`.

A regra número um virou **teste**: `phrases.test.ts` varre toda frase e todo
botão atrás de palavra técnica e de frase comprida demais.

### O que o executável executa

O aplicativo empacotado roda o bot **a partir da cópia do repositório**, não de
um bot embutido. Isso não é preguiça de empacotamento — é o que mantém a rotina
diária funcionando: `data/conversations/`, `data/repertoire.yaml` e o
`/upgrade-repertoire` dependem de `data/` estar na pasta do projeto. Um bot
embutido escrevendo em `AppData` quebraria a análise de log do dia seguinte.

O instalador NSIS do `electron-builder` cria o atalho na área de trabalho e no
menu iniciar, com ícone próprio.

## Scope

### In Scope

- Aplicativo Electron em `launcher/`, com `package.json` próprio.
- Ligar, parar e reiniciar o processo do bot pela janela.
- Tela principal em linguagem de criança, com nome vindo de `persona.name`.
- Indicador de estado que distingue "processo vivo" de "dentro do mundo".
- Canal de status (`stdout`) e canal de parada (`stdin`) em `src/app/main.ts`,
  ambos atrás de `DUDU_LAUNCHER=1`.
- Log ao vivo em bloco recolhido, com teto de linhas na memória.
- Edição de `server.port` no `config.yaml`, preservando comentário, com escrita
  atômica.
- Empacotamento Windows (NSIS) com ícone e atalho na área de trabalho.
- Testes das partes puras: máquina de estados, parser de status, escrita da
  porta.
- Documentação: `README.md` e `CLAUDE.md` (a armadilha da porta ganha a saída
  nova).

### Out of Scope

- **Editar o resto da configuração** pela janela (provider de IA, persona,
  `ownerPlayer`). Só a porta, que é a que muda toda sessão.
- **Ler ou responder o chat do jogo** pela janela. A conversa é no Minecraft.
- **Iniciar junto com o Windows**, bandeja do sistema, minimizar para bandeja.
- **Instalar Node ou dependências** pelo aplicativo. A máquina já tem o repo
  clonado e instalado.
- **Distribuir para outras máquinas.** O instalador é para o computador da casa;
  nada de assinatura de código nem atualização automática.
- **Empacotar o bot dentro do aplicativo** (ver a razão acima).
- macOS e Linux. O alvo é a máquina onde o Minecraft roda.
- Abrir o Minecraft ou o mundo em LAN automaticamente.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `launcher/` (novo pacote) | Sim | Aplicativo inteiro |
| `src/app/main.ts` | Sim | Canal de status e parada por `stdin`, atrás de env |
| `startup_console` (spec) | Sim | Requisitos novos: protocolo com o supervisor |
| `config.yaml` | Sim | Passa a ser escrito por outro processo (só `server.port`) |
| Núcleo do bot (`behaviors/`, `ai/`, `dialogue/`, `memory/`) | Não | Nenhuma linha |
| `minecraft/client.ts` | Não | O status sai dos eventos que ele já emite |
| Repertório | Não | Nada do que a janela mostra chega ao chat |
| `package.json` da raiz | Sim | Só scripts (`launcher:dev`, `launcher:build`) |
| CI / `npm test` | Não | O pacote do launcher instala em separado |

## Architecture Considerations

- **O supervisor está fora da cascata de camadas**, como `tools/` está. A
  diferença é que ele nem importa do bot: fala com ele por processo, `stdout` e
  `stdin`. Acoplamento mínimo, e o bot continua rodável sem ele.
- **O bot não sabe que existe uma janela.** Ele descreve o que está acontecendo;
  quem traduz isso para frase de criança é o supervisor. Se amanhã a interface
  virar outra coisa, o protocolo continua servindo.
- **A frase é do supervisor, o estado é do bot.** Mesma divisão do
  `startup-banner.ts`: dado estruturado de um lado, texto do outro.
- **Regra número um vale para a janela.** É a primeira superfície do projeto que
  a criança lê fora do chat do jogo, e a regra não é sobre o chat — é sobre quem
  lê.
- **`contextIsolation` ligado e `nodeIntegration` desligado** no renderer, com
  `preload` expondo só o que a janela precisa. A janela não spawna processo nem
  escreve arquivo direto.
- **Falha do supervisor nunca é falha do bot.** Fechar a janela com o bot de pé
  desliga o bot (é o supervisor dele); mas nada no aplicativo pode impedir o
  `npm run dev` de funcionar como sempre funcionou.

## Success Criteria

- [x] Um duplo clique no ícone da área de trabalho abre a janela sem terminal
- [x] "Chamar" sobe o bot e ele entra no mundo, sem `npm` no meio
- [x] "Mandar dormir" desconecta **limpo** no Windows: o bot sai do mundo, não
      fica fantasma até o timeout do servidor
- [x] "Acordar de novo" para e sobe de novo, aplicando a porta corrigida
- [x] A janela distingue "tentando conectar" de "dentro do mundo"
- [x] Porta errada aparece como frase que ensina o passo seguinte, não como
      backoff rolando
- [x] Trocar a porta pela janela preserva **todos** os comentários do
      `config.yaml`
- [x] Nenhuma palavra técnica na tela principal
- [x] `npm run dev` no terminal continua idêntico, sem Electron instalado
- [x] `npm install` e `npm test` na raiz não baixam Electron
- [x] Fechar a janela não deixa processo de bot órfão
- [x] `npx eslint src test` e `npm test` passam

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `SIGTERM` no Windows mata o filho sem desconectar, e o bot vira fantasma no mundo | **Alta** | Alto | Canal de parada por `stdin`; `kill` só depois do tempo de espera |
| Processo de bot órfão se o supervisor morrer ou a janela fechar | Média | Alto | Parada no `before-quit` e no `window-all-closed`; `kill` como rede de segurança |
| Escrita da porta apagar os comentários do `config.yaml` | **Alta** se feita com `parse`+`stringify` | Alto | API de documento do `yaml`; teste que compara o arquivo antes e depois |
| Escrita simultânea (janela grava enquanto o bot lê o arquivo) | Baixa | Médio | Escrita atômica; o bot lê a configuração só no start |
| Electron pesar no repositório e no CI | Alta se ficar na raiz | Médio | `package.json` separado em `launcher/` |
| Interface encher de opção e virar painel de adulto | Média | Médio | Escopo travado em três botões + bloco recolhido; resto explicitamente fora |
| Criança clicar "chamar" várias vezes e subir dois bots | **Alta** | Médio | Botão desabilitado fora do estado `parado`; supervisor recusa segundo spawn |
| Log ao vivo consumir memória numa sessão longa | Média | Baixo | Teto de linhas em memória, descartando as mais antigas |
| Caminho do repositório mudar e o aplicativo empacotado não achar o bot | Média | Médio | Caminho resolvido na configuração do supervisor, com mensagem clara se sumir |
| Antivírus barrar `.exe` não assinado | Média | Baixo | Instalação local, uma vez; sem assinatura de código no escopo |

---

## Archive Information

**Archived:** 2026-08-29
**Duration:** proposta, implementação e arquivamento no mesmo dia
**Outcome:** implementado e verificado em execução real

### Arquivos criados

Bot (o único ponto em que `src/` foi tocado):

- `src/app/status-channel.ts` — protocolo com o supervisor, nas duas mãos
- `test/status-channel.test.ts`

Aplicativo (pacote separado):

- `launcher/package.json`, `launcher/tsconfig.json`
- `launcher/src/{main,preload,runner,supervisor,status,config-port,phrases,repo-path}.ts`
- `launcher/ui/{index.html,renderer.js}`
- `launcher/build/{make-icon.mjs,icon.ico}`
- `launcher/scripts/pack.mjs`
- `launcher/test/{status,supervisor,config-port,phrases,repo-path}.test.ts`

### Arquivos modificados

- `src/app/main.ts` — canal de status e de parada, atrás de `DUDU_LAUNCHER=1`
- `src/app/bot.ts` — `onLifecycle()` e as transições nos eventos de conexão
- `package.json` — scripts `launcher:*`
- `.gitignore` — `launcher/release/`
- `README.md`, `CLAUDE.md`, `openspec/project.md`

### Specs atualizadas

- `openspec/specs/desktop_launcher.md` — **nova**
- `openspec/specs/startup_console.md` — dois requisitos novos (canal de status,
  parada pelo supervisor) e escopo ampliado para "quem executa o bot pode ser um
  programa"

### Verificação

Raiz: `tsc --noEmit` limpo, `eslint src test` limpo, 736 testes.
Launcher: `tsc --noEmit` limpo, 61 testes.

Verificado em execução real, não só por teste: aplicativo empacotado subindo o
bot, parada graciosa medida em **849 ms** (bem abaixo do teto de `kill`, o que só
acontece se o handler do bot tiver rodado), e fechar a janela com o bot de pé
deixando **zero** processos órfãos.

### Ressalvas registradas

- `npm run lint` na raiz inclui `prettier --check`, que acusa 58 arquivos de
  desalinho **pré-existente**, em arquivos que esta mudança não tocou. Os
  arquivos desta mudança passam.
- `test/dialogue.test.ts` → "três saudações seguidas dão três respostas
  diferentes" é **instável por construção** (sorteio): falhou uma vez durante o
  arquivamento e passou nas quatro execuções seguintes. Já era instável antes
  desta mudança, que não toca em `dialogue/`.
