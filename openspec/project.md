# Projeto: bot-minicraft-dudu

Bot companheiro para Minecraft Java Edition — um "amigo virtual" que entra no
mundo do jogador, conversa e obedece comandos, com personalidade e decisões
guiadas por IA — modelo local (Ollama) ou nuvem (Gemini), escolhido por config.

---

## Contexto

- O bot roda **no mesmo computador** onde o Minecraft está instalado.
- Conecta-se ao servidor/mundo como um cliente Minecraft comum (mais um jogador
  na sala), não como mod nem plugin server-side.
- Existe **um jogador dono** (`ownerPlayer`), definido nas configurações. O bot
  segue e obedece apenas esse jogador.
- Toda a interação com o jogador acontece pelo **chat do jogo**.

## Stack

| Camada | Escolha |
|--------|---------|
| Runtime | Node.js 20+ (LTS) |
| Linguagem | TypeScript (strict) |
| Protocolo Minecraft | `mineflayer` (Java Edition) |
| Navegação | `mineflayer-pathfinder` |
| IA | Interface `LlmProvider`: `ollama` local (padrão) ou `@google/genai` (Gemini) |
| Config | arquivo `config.yaml` + `.env` para segredos |
| Testes | `vitest` |
| Lint/format | `eslint` + `prettier` |

## Convenções

- Estrutura em camadas: `config/` → `minecraft/` → `dialogue/` → `memory/` →
  `ai/` → `behaviors/` → `app/`.
- **Cascata de resolução de conversa**: parser de comandos → repertório local
  (`data/repertoire.yaml`) → IA. O modelo é sempre o último recurso.
- Toda inferência passa pela interface `LlmProvider`. Nenhum código fora de
  `src/ai/providers/` pode referenciar Ollama ou Gemini diretamente.
- Histórico de conversa em JSONL append-only, um arquivo por dia em
  `data/conversations/`. `data/` nunca vai para o controle de versão.
- Nenhuma camada de baixo importa de camada de cima; o wiring acontece em `app/`.
- Efeitos de mundo (andar, quebrar, largar item) ficam isolados em
  `behaviors/actions/`, cada ação um módulo com assinatura uniforme.
- A IA **nunca** executa efeito direto: ela devolve uma intenção estruturada que
  passa por validação antes de virar ação.
- Combate e defesa são **determinísticos** e nunca dependem de uma chamada de IA.
  A IA só narra o que já aconteceu, de forma assíncrona.
- Segredos (chave de API do provider de nuvem, credenciais de conta) só via variável de
  ambiente. Nunca commitados, nunca logados.
- Mensagens do bot no chat em português (idioma do jogador dono).

## Fluxo de trabalho

Este projeto usa OpenSpec (Spec-Driven Development):

1. `/openspec-proposal <descrição>` — cria a proposta em `openspec/changes/`
2. `/openspec-apply <change-id>` — implementa seguindo `tasks.md`
3. `/openspec-archive <change-id>` — consolida os deltas em `openspec/specs/`

`openspec/specs/` é a fonte da verdade do comportamento já implementado.
