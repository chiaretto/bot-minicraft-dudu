# Proposal: Escolher a voz do bot na janela

**Change ID:** `add-voice-picker`
**Created:** 2026-08-30
**Status:** Implementation Complete (falta prova com a janela aberta)
**Completed:** 2026-08-30

---

## Problem Statement

A voz entrou em `add-launcher-voice` com a escolha **automática**: a primeira voz
`pt-BR` que o Windows oferecer, velocidade 1, tom padrão.

Isso resolve o caso de ter voz, e não resolve o de ter a voz **certa**. Trocar
exigia editar `renderer.js` — o dono perguntou como fazer, e a resposta honesta
era "abrindo o arquivo".

Três coisas dependem de ouvir para decidir, e nenhuma dá para acertar no código:

- **Qual voz.** Nome de voz do Windows ("Microsoft Daniel") não diz nada sobre
  como ela soa para uma criança de 7 anos.
- **Velocidade.** A dona do bot lê devagar; ouvir devagar pode ajudar mais.
- **Tom.** Um timbre mais agudo soa mais como amigo e menos como leitor de tela.

## Proposed Solution

Três controles em "Coisas de adulto", ao lado da porta do LAN: lista de vozes,
velocidade e tom. Mais um botão **Ouvir**, porque escolher voz sem ouvir é
escolher no escuro.

### Onde cada coisa mora

A política é do módulo puro (`launcher/src/voice.ts`) e chega à janela **pela
ponte**: só o renderer enxerga `speechSynthesis.getVoices()`, e só o preload
carrega o módulo compilado. Sem isso, a escolha teria que ser duplicada em
`renderer.js` — duas listas para manter, que é o que o projeto evita.

### Quatro decisões

- **Só vozes em português**, `pt-BR` antes de `pt-PT`. Uma voz em inglês lendo
  "tá esquentando!" sai como outra língua.
- **Voz salva que sumiu não cala o bot.** Desinstalada, ou o mesmo perfil noutro
  computador: ele volta para a melhor disponível, em silêncio.
- **Valor fora da faixa é trazido para dentro.** `speechSynthesis` ignora a fala
  **inteira** quando `rate` ou `pitch` estão fora do aceito — o sintoma seria o
  bot emudecer sem motivo aparente. Vale também para o que voltou do
  `localStorage`, onde pode ter qualquer coisa.
- **O padrão é o que já era** (`rate: 1`, `pitch: 1`). Mudar sozinho a voz de
  quem já estava usando seria surpresa.

### Ouvir na hora

Trocar a voz na lista **fala na hora**. Arrastar velocidade ou tom fala quando o
dedo sai do controle — falar a cada pixel arrastado cortaria a própria fala.

## Scope

### In Scope

- `vozesEmPortugues`, `escolherVoz`, `normalizarAjustes`, `AJUSTES_PADRAO`,
  `LIMITES` e `FALA_DE_TESTE` no módulo puro.
- A política emprestada à janela pelo `preload`.
- Lista, velocidade, tom e botão Ouvir em "Coisas de adulto".
- Escolha lembrada no `localStorage`.
- Testes da política.

### Out of Scope

- **Instalar voz nova pelo aplicativo.** É configuração do Windows, e mexer
  nisso de dentro do launcher é invasivo.
- **Voz por personagem** (uma para o bot, outra para eventos). Um bot, uma voz.
- **Ler a fala de outros jogadores.** Continua fora, como no change da voz.
- **Controles na tela da criança.** Timbre e velocidade são ajuste de quem
  instalou; a caixa de ligar e desligar continua ao alcance dela, lá em cima.

## Impact Analysis

| Componente | Muda? | Detalhes |
|---|---|---|
| `launcher/src/voice.ts` | Sim | Escolha da voz e ajustes, puros |
| `launcher/src/preload.ts` | Sim | Empresta a política à janela |
| `launcher/ui/` | Sim | Três controles e o botão Ouvir |
| Bot, protocolo, specs de jogo | Não | Nada disso sabe que existe voz |

## Architecture Considerations

- **A ponte é o lugar da política compartilhada.** O renderer não tem `require`;
  o preload tem. É o mesmo papel que ele já faz para estado e log.
- **Regra pura, borda na janela**, como em `voice.ts` e `inventory.ts`.
- **Nada disso chega ao bot.** O aplicativo continua sendo só supervisor.

## Success Criteria

- [x] A lista mostra as vozes em português instaladas
- [x] Escolher uma fala na hora, e a escolha é lembrada
- [x] Velocidade e tom mudam a fala e são lembrados
- [x] Voz salva que sumiu não cala o bot
- [x] Sem voz em português, o bot ainda fala com a voz do sistema
- [x] `launcher: vitest` passa (100 testes)

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `getVoices()` vir vazia na primeira chamada | **Alta** | Médio | A lista é redesenhada no evento `voiceschanged` |
| Valor salvo fora da faixa emudecer o bot | Média | Alto | `normalizarAjustes` limita tudo que entra |
| Voz sumir entre sessões | Média | Médio | Volta para a melhor disponível, sem avisar |
| Falar a cada pixel do controle | Alta sem guarda | Baixo | Só fala no `change`, não no `input` |
