# Implementation Tasks: Aplicativo de desktop para ligar e desligar o bot

**Change ID:** `add-desktop-launcher`
**Concluído:** 2026-08-29

---

## Fase 1: Protocolo do bot (o lado de dentro)

Feito primeiro porque o supervisor não tem o que ler enquanto isso não existe. E
é a única parte que toca no código do bot — depois disso, `src/` fica quieto.

- [x] 1.1 `src/app/status-channel.ts`: emissor das linhas `@dudu-status {...}`,
      ativo só com `DUDU_LAUNCHER=1`. Função pura de formatação + um `write`
      isolado, como o `startup-banner.ts` separa render de impressão
- [x] 1.2 Ligar as transições em `src/app/main.ts`: `ligando` no start,
      `procurando` na tentativa de conexão, `no_mundo` no `spawn`, `desistiu` no
      `giveUp`, `caiu` no `end` sem reconexão
      - Ajuste: `caiu` saiu do lado do bot. **Um processo não anuncia a própria
        morte** — quem percebe é o supervisor, pelo `exit`. O bot emite quatro
        estados; `parado`, `parando` e `caiu` são só do supervisor.
      - `CompanionBot` ganhou `onLifecycle()`: os eventos de conexão moram no
        `MinecraftClient`, que é privado, e vazá-lo para o `main.ts` seria pior
        que um observador de uma linha.
- [x] 1.3 Canal de parada: com `DUDU_LAUNCHER=1`, ler `stdin` e tratar a linha
      `parar` pelo mesmo `shutdown()` que o `SIGINT` já usa
- [x] 1.4 Testes: formatação das linhas de status; silêncio total sem a variável
      de ambiente; `parar` no `stdin` dispara o mesmo caminho de encerramento

**Quality Gate: PASSOU**
- [x] `npx eslint src test` limpo
- [x] `npm test` — 736 testes, 23 arquivos
- [x] Sem `DUDU_LAUNCHER` o canal fica mudo e o `stdin` intocado (coberto por
      teste); confirmado em execução real, onde o cartão de startup saiu igual

---

## Fase 2: Pacote do launcher e lógica pura

- [x] 2.1 `launcher/package.json` com `electron`, `electron-builder`, `vitest`,
      `typescript` — isolado da raiz; `.gitignore` para `launcher/release`
      (`node_modules/` e `dist/` já caem nas regras do topo)
- [x] 2.2 `launcher/src/status.ts`: parser das linhas do filho — separa status de
      log, ignora linha malformada sem derrubar nada
- [x] 2.3 `launcher/src/supervisor.ts`: máquina de estados
      (`parado` → `ligando` → `procurando` → `no_mundo`, mais `parando`,
      `desistiu` e `caiu`), com as transições legais e a recusa de start duplicado
- [x] 2.4 `launcher/src/config-port.ts`: ler e gravar `server.port` com
      `parseDocument` do `yaml` + escrita atômica
- [x] 2.5 `launcher/src/phrases.ts`: estado → frase de criança e clima
- [x] 2.6 Testes das quatro: parser, máquina de estados, escrita de porta
      (incluindo o teste que prova que **só a linha da porta muda**), frases
      (incluindo varredura por palavra técnica)

**Quality Gate: PASSOU**
- [x] `npm test` em `launcher/` — 61 testes, 5 arquivos
- [x] `npm install` na raiz não baixa Electron (o launcher não é workspace)
- [x] Nenhum módulo desta fase importa `electron`

---

## Fase 3: Processo principal do Electron

- [x] 3.1 `launcher/src/main.ts`: janela única (`requestSingleInstanceLock`),
      `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, ícone
- [x] 3.2 Spawn do bot com `DUDU_LAUNCHER=1` e `cwd` na raiz do repositório;
      captura de `stdout` e `stderr` linha a linha
      - **Armadilha achada em execução:** `process.execPath` num app empacotado
        é o binário do **Electron**, não o do Node. Sem `ELECTRON_RUN_AS_NODE=1`
        o filho subia como segunda instância do aplicativo, e o
        `requestSingleInstanceLock` a matava no mesmo instante — o sintoma era o
        bot "cair" menos de um segundo depois de ser chamado.
- [x] 3.3 Parada graciosa: escreve `parar` no `stdin`, espera o `exit`, e só
      então `kill` como último recurso (teto de 5 s)
- [x] 3.4 Reiniciar: parar completo (esperando o `exit`, não o timeout) e subir
      de novo
- [x] 3.5 Ciclo de vida do app: parar o filho em `before-quit` e
      `window-all-closed`; nenhum bot órfão
- [x] 3.6 `launcher/src/preload.ts`: superfície mínima de IPC
- [x] 3.7 Resolução do caminho do repositório (`repo-path.ts`), com mensagem
      clara se a pasta não existir mais
      - Acrescentado além do previsto: o caminho é **gravado no empacotamento**
        (`scripts/pack.mjs` → `extraMetadata.duduHome`). Sem isso o aplicativo
        instalado não achava o bot no primeiro duplo clique e exigia um ritual
        de configuração — o oposto do que a mudança existe para resolver.

**Quality Gate: PASSOU** (verificado ao vivo, não só por teste)
- [x] Chamar sobe o bot: status `ligando` → `procurando` observados na janela
- [x] Parada graciosa medida em **849 ms**, bem abaixo do teto de kill — prova
      que a linha `parar` chegou ao `shutdown` do bot, o que `SIGTERM` não faria
- [x] Fechar a janela com o bot de pé: **0 processos** `Odraude` e **0** `node`
      sobrando

---

## Fase 4: Interface

- [x] 4.1 `launcher/ui/index.html` + CSS: tela de criança — fonte grande, alvo de
      clique grande, alto contraste
- [x] 4.2 Indicador de estado com cor e a frase de `phrases.ts`; nome do bot
      lido de `persona.name` (confirmado: a janela mostrou "Odraude")
- [x] 4.3 Botões desabilitados fora do estado que os permite
- [x] 4.4 Bloco recolhido "Coisas de adulto", fechado por padrão: campo de porta
      e log ao vivo com teto de 500 linhas
- [x] 4.5 Aviso de "precisa reiniciar" quando a porta muda com o bot de pé
- [x] 4.6 Revisão da regra número um — virou **teste**: `phrases.test.ts` varre
      toda frase e todo botão atrás de palavra técnica e de frase longa demais

**Quality Gate: PASSOU**
- [x] Nenhuma palavra técnica na tela principal (garantido por teste)
- [x] "Não achei seu mundo! Abriu ele pra LAN?" no lugar do backoff
- [x] "Procurando seu mundo..." (âmbar, pulsando) ≠ "O Odraude tá com você!"

---

## Fase 5: Empacotamento e ícone

- [x] 5.1 `launcher/build/icon.ico` — bloco de grama em pixel art, gerado por
      `make-icon.mjs` versionado, para o desenho não virar binário opaco
- [x] 5.2 Configuração do `electron-builder`: alvo NSIS, atalho na área de
      trabalho e no menu iniciar
- [x] 5.3 Scripts na raiz: `launcher:install`, `launcher:dev`, `launcher:build`,
      `launcher:test`
- [x] 5.4 Instalador gerado e o app empacotado executado de verdade
      - `release/Odraude Setup 0.1.0.exe` (106 MB)
      - **Armadilha:** `spawnSync` de `npx.cmd` falha silenciosamente desde a
        correção da CVE-2024-27980 (o Node recusa `.cmd` sem `shell: true`). O
        `pack.mjs` chama o `cli.js` do electron-builder pelo `node`.

**Quality Gate: PASSOU**
- [x] O `.exe` abre a janela sem terminal aparecendo
- [x] O app empacotado leu `config.yaml` do repositório (porta 55555, persona
      "Odraude") e subiu o bot de lá

---

## Fase 6: Documentação

- [x] 6.1 `README.md`: seção "Ligar o bot sem terminal"
- [x] 6.2 `CLAUDE.md`: a armadilha da porta ganhou a saída nova; seção nova
      sobre o launcher, com as duas armadilhas (`SIGTERM` no Windows e a
      constante repetida dos dois lados do protocolo)
- [x] 6.3 `openspec/project.md`: `launcher/` registrado como pacote fora da
      cascata, ao lado da nota sobre `tools/`
- [x] 6.4 Repertório conferido: a janela não fala no chat, nada a mudar

**Quality Gate: PASSOU**
- [x] `npx tsc --noEmit`, `npx eslint src test` e `npm test` limpos na raiz
- [x] `npx tsc --noEmit` e `npm test` limpos em `launcher/`
- [x] Documentação sincronizada

> **Ressalva:** `npm run lint` na raiz inclui `prettier --check`, que acusa 58
> arquivos — **desalinho pré-existente**, em arquivos que esta mudança não
> tocou (ex.: `src/behaviors/state-machine.ts`). Os arquivos desta mudança
> passam no `prettier --check`. Formatar o resto do repositório é decisão de
> outra rodada, não desta.

---

## Completion Checklist

- [x] Todas as fases completas
- [x] Todos os quality gates passados
- [x] Success criteria da proposta conferidos um a um
- [x] Pronto para `/openspec-archive`
