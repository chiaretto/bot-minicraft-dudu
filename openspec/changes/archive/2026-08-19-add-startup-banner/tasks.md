# Implementation Tasks: Aviso bonito de startup no terminal

**Change ID:** `add-startup-banner`

---

## Fase 1: Renderização (função pura)

- [x] 1.1 Criar `src/app/startup-banner.ts` com
      `renderStartupBanner(config: AppConfig, options?: BannerOptions): string`
- [x] 1.2 Montar o cartão a partir de `persona.name`, `ownerPlayer`,
      `server.host`, `server.port`, `server.version`
- [x] 1.3 Incluir o passo a passo do LAN e o aviso de que a porta muda a cada
      abertura, apontando `server.port` no `config.yaml`
- [x] 1.4 Suportar `options.color` (padrão: ligado só quando TTY e sem
      `NO_COLOR`); sem cor, nenhum código ANSI na saída
- [x] 1.5 Garantir que as linhas emolduradas têm todas o mesmo comprimento
      visível (sem emoji dentro da moldura)

**Quality Gate:** APROVADO
- [x] `npm run lint` limpo
- [x] Nenhum import de `minecraft/`, `dialogue/`, `ai/` ou `behaviors/`

---

## Fase 2: Integração no startup

- [x] 2.1 Em `src/app/main.ts`, imprimir o cartão logo após `loadConfig()` e
      antes de instanciar `CompanionBot`
- [x] 2.2 Só imprimir quando `process.env.NODE_ENV !== 'production'`
- [x] 2.3 Usar `console.log`, nunca o logger `pino`
- [x] 2.4 Confirmar que o caminho de config inválida continua saindo com a
      mensagem de erro atual e sem cartão

**Quality Gate:** APROVADO
- [x] `npm run dev` mostra o cartão antes das linhas de log
- [x] `NODE_ENV=production npm start` não mostra o cartão

---

## Fase 3: Testes

- [x] 3.1 Criar `test/startup-banner.test.ts` (a suíte é plana em `test/`, sem subpasta)
- [x] 3.2 Teste: host, porta e versão da config aparecem no texto
- [x] 3.3 Teste: o aviso sobre a porta do LAN mudar está presente
- [x] 3.4 Teste: com `color: false` a saída não contém nenhum caractere ESC
      (`U+001B`)
- [x] 3.5 Teste: todas as linhas da moldura têm o mesmo comprimento

**Quality Gate:** APROVADO
- [x] `npm test` passa

---

## Fase 4: Verificação e documentação

- [x] 4.1 Rodar `npm run dev` de verdade e conferir o cartão no terminal
- [x] 4.2 Conferir `npm run dev > saida.txt` — texto legível, sem ANSI
- [x] 4.3 Atualizar o README na seção de execução, mostrando o cartão
- [x] 4.4 `npm test` + `npm run lint` finais

**Quality Gate:** APROVADO
- [x] Todos os testes passam
- [x] Lint limpo
- [x] README sincronizado

---

## Completion Checklist

- [x] Todas as fases completas
- [x] Todos os quality gates aprovados
- [x] Documentação sincronizada
- [x] Pronto para `/openspec-archive add-startup-banner`
