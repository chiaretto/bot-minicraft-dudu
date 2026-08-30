# Implementation Tasks: Log em arquivo

**Change ID:** `add-file-logging`
**Implementado:** 2026-08-30

---

## Fase 1: O stream

- [x] 1.1 `DailyFileStream`, com o dia decidido **a cada escrita**
- [x] 1.2 Falha engolida e avisada por callback
- [x] 1.3 `_final` espera o arquivo fechar de verdade
      - Sem isso o teste lia o arquivo antes de o conteúdo chegar ao disco — e
        em produção o mesmo aconteceria no encerramento.
- [x] 1.4 `error` do stream tratado: sem ouvinte, `error` derruba o Node

**Quality Gate: PASSOU**

---

## Fase 2: O logger

- [x] 2.1 `createLogger` aceita objeto **ou** string (assinatura antiga vale)
- [x] 2.2 `multistream` com stdout + arquivo
- [x] 2.3 `redact` antes dos destinos, valendo para os dois
- [x] 2.4 `logDir` no schema, `null` desligando
- [x] 2.5 `main.ts` passa a pasta e loga onde o log está

**Quality Gate: PASSOU** — `tsc` e `eslint` limpos

---

## Fase 3: Validação

- [x] 3.1 12 testes: nome, virada de meia-noite, continuação, falha, redact
- [x] 3.2 `npm test` (947 testes) e `npx eslint src test` limpos
- [x] 3.3 `config.example.yaml` e README
- [ ] 3.4 Em jogo: subir o bot e conferir o arquivo do dia

**Quality Gate: PENDENTE** — 3.4 não observado; o bot não subiu nesta sessão.
Os testes cobrem o stream e o logger, mas ninguém viu o arquivo nascer numa
sessão de verdade.
