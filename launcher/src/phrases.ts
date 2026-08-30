/**
 * O que a janela diz, em palavra de criança.
 *
 * Vale aqui a **regra número um** do projeto (`openspec/project.md` → "Público
 * do bot"): quem lê esta tela é uma criança de 7 anos. Frase curta, palavra
 * simples, tom de amigo, e quando dá errado a frase ensina o passo seguinte —
 * do mesmo jeito que as respostas de "não entendi" fazem no chat.
 *
 * A regra não é sobre o chat, é sobre quem lê. Esta é a primeira superfície do
 * projeto que a criança lê fora do jogo.
 *
 * Tudo num arquivo só para que revisar a regra número um seja ler um arquivo.
 * Nenhuma palavra técnica passa por aqui: "processo", "porta", "servidor",
 * "conexão", "erro" e código de falha ficam no bloco de adulto.
 */

import type { UiState } from './supervisor'

/** Clima da frase. A cor de verdade é escolhida no CSS. */
export type Tone = 'dormindo' | 'esperando' | 'junto' | 'ops'

export interface Phrase {
  text: string
  tone: Tone
}

/**
 * Frase de cada estado. `{nome}` vira o nome do bot (`persona.name`) — quem
 * renomear o bot no `config.yaml` vê o novo nome na janela.
 */
const TEMPLATES: Record<UiState, Phrase> = {
  parado: { text: 'O {nome} tá dormindo.', tone: 'dormindo' },
  ligando: { text: 'Acordando o {nome}...', tone: 'esperando' },
  procurando: { text: 'Procurando seu mundo...', tone: 'esperando' },
  no_mundo: { text: 'O {nome} tá com você!', tone: 'junto' },
  parando: { text: 'O {nome} tá indo dormir...', tone: 'esperando' },
  // Este é o caso comum de porta errada. A frase pergunta o que a criança pode
  // resolver sozinha, com a palavra que ela vê no menu do jogo.
  desistiu: { text: 'Não achei seu mundo! Abriu ele pra LAN?', tone: 'ops' },
  caiu: { text: 'O {nome} foi embora. Quer chamar de novo?', tone: 'ops' },
}

export function phraseFor(state: UiState, botName: string): Phrase {
  const template = TEMPLATES[state]
  return { text: template.text.replace('{nome}', botName), tone: template.tone }
}

/** Texto dos botões, também com o nome do bot. */
export function buttonLabels(botName: string): {
  chamar: string
  parar: string
  reiniciar: string
} {
  return {
    chamar: `Chamar o ${botName}`,
    parar: 'Mandar dormir',
    reiniciar: 'Acordar de novo',
  }
}

/** Nome usado quando o `config.yaml` não pôde ser lido. */
export const NOME_PADRAO = 'bot'

/**
 * Recado de quando nem dá para tentar — a pasta do bot sumiu, o `config.yaml`
 * não abre. Continua sendo frase de criança: ela não pode consertar, mas
 * também não pode ficar olhando uma tela que não explica nada.
 */
export const RECADO_SEM_BOT = 'Não achei o bot aqui no computador. Chama um adulto!'
