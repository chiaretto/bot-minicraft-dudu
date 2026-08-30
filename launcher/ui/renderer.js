/*
  Janela. Não decide nada: mostra o que o processo principal manda e repassa o
  clique. Toda regra (o que pode ser clicado, que frase cada estado tem) mora
  nos módulos puros do `src/`, para poder ser testada sem abrir janela.
*/

const $ = (id) => document.getElementById(id)

const luz = $('luz')
const frase = $('frase')
const btChamar = $('chamar')
const btParar = $('parar')
const btReiniciar = $('reiniciar')
const campoPorta = $('porta')
const btSalvarPorta = $('salvar-porta')
const btEscolher = $('escolher')
const recado = $('recado')
const pasta = $('pasta')
const log = $('log')
const caixaVoz = $('voz')
const mochila = $('mochila')
const itens = $('itens')
const resto = $('resto')

/** Teto de linhas na tela, igual ao do processo principal. */
const MAX_LINHAS = 500

function dizer(texto, tipo) {
  recado.textContent = texto
  recado.className = tipo || ''
}

// ── Estado ───────────────────────────────────────────────────────────────────

window.dudu.aoMudarEstado((estado) => {
  luz.className = estado.phrase.tone
  frase.textContent = estado.aviso || estado.phrase.text

  btChamar.textContent = estado.labels.chamar
  btParar.textContent = estado.labels.parar
  btReiniciar.textContent = estado.labels.reiniciar

  btChamar.disabled = !estado.canStart
  btParar.disabled = !estado.canStop
  btReiniciar.disabled = !estado.canRestart

  pasta.textContent = estado.repoRoot || 'pasta do bot não encontrada'
})

// ── Log ──────────────────────────────────────────────────────────────────────

window.dudu.aoReceberLog((linha) => {
  // Rola junto só se já estava no fim: o adulto lendo uma linha lá em cima não
  // pode ser arrastado para baixo a cada mensagem nova.
  const noFim = log.scrollTop + log.clientHeight >= log.scrollHeight - 24

  const div = document.createElement('div')
  div.textContent = linha
  log.appendChild(div)

  while (log.childElementCount > MAX_LINHAS) log.removeChild(log.firstChild)
  if (noFim) log.scrollTop = log.scrollHeight
})

// ── Botões ───────────────────────────────────────────────────────────────────

btChamar.addEventListener('click', () => window.dudu.chamar())
btParar.addEventListener('click', () => window.dudu.parar())
btReiniciar.addEventListener('click', () => window.dudu.reiniciar())

// ── Porta ────────────────────────────────────────────────────────────────────

async function carregarPorta() {
  const porta = await window.dudu.lerPorta()
  if (porta !== null && porta !== undefined) campoPorta.value = String(porta)
}

btSalvarPorta.addEventListener('click', async () => {
  const porta = Number(campoPorta.value)
  const resposta = await window.dudu.gravarPorta(porta)
  if (!resposta.ok) {
    dizer(resposta.erro || 'não deu para salvar', 'erro')
    return
  }
  dizer(
    resposta.precisaReiniciar
      ? 'Porta salva. Clique em "Acordar de novo" para valer.'
      : 'Porta salva.',
    'ok',
  )
})

campoPorta.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') btSalvarPorta.click()
})

btEscolher.addEventListener('click', async () => {
  const resposta = await window.dudu.escolherPasta()
  if (resposta.erro) {
    dizer(resposta.erro, 'erro')
    return
  }
  if (resposta.ok) {
    dizer('Pasta do bot atualizada.', 'ok')
    void carregarPorta()
  }
})

// ── Mochila ──────────────────────────────────────────────────────────────────
/*
  Só desenha. Quantos itens cabem e o que dizer do resto é decisão do módulo
  puro `src/inventory.ts`; os nomes já chegam em português do próprio bot.
*/

window.dudu.aoReceberMochila((painel) => {
  // `null` é o bot fora do mundo: painel de fantasma faria a criança pedir um
  // bloco que ninguém está carregando.
  if (!painel) {
    mochila.style.display = 'none'
    itens.replaceChildren()
    resto.textContent = ''
    return
  }

  mochila.style.display = 'block'
  itens.replaceChildren()

  if (painel.vazio) {
    const vazio = document.createElement('span')
    vazio.className = 'item'
    vazio.textContent = painel.vazio
    itens.append(vazio)
    resto.textContent = ''
    return
  }

  for (const item of painel.itens) {
    const chip = document.createElement('span')
    chip.className = 'item'
    const qtd = document.createElement('b')
    qtd.textContent = String(item.qtd)
    chip.append(qtd, ` ${item.nome}`)
    itens.append(chip)
  }

  resto.textContent = painel.resto || ''
})

// ── Voz ──────────────────────────────────────────────────────────────────────
/*
  A dona do bot tem 7 anos e lê devagar; o chat do Minecraft rola rápido. Ouvir
  é o que faz ela acompanhar a conversa.

  A POLÍTICA (o que vale a pena ouvir, cortado onde, quantas falas cabem na
  fila) mora no módulo puro `src/voice.ts`, testada sem abrir janela. Aqui só
  sobra o que precisa de navegador: falar.
*/

const CHAVE_VOZ = 'dudu:voz'

function vozLigada() {
  try {
    return localStorage.getItem(CHAVE_VOZ) !== 'off'
  } catch {
    // Sem armazenamento, o padrão é ligado: é para a criança que a voz existe.
    return true
  }
}

caixaVoz.checked = vozLigada()

caixaVoz.addEventListener('change', () => {
  try {
    localStorage.setItem(CHAVE_VOZ, caixaVoz.checked ? 'on' : 'off')
  } catch {
    // Não deu para lembrar a escolha: ela vale nesta sessão mesmo assim.
  }
  if (!caixaVoz.checked) window.speechSynthesis?.cancel()
})

/** A voz em português mais parecida com gente, se o sistema tiver alguma. */
function vozPtBr() {
  const vozes = window.speechSynthesis?.getVoices?.() || []
  return vozes.find((v) => v.lang === 'pt-BR') || vozes.find((v) => v.lang?.startsWith('pt')) || null
}

window.dudu.aoReceberFala((texto) => {
  if (!caixaVoz.checked || !window.speechSynthesis) return

  // Fala nova cancela a anterior: numa rodada de quente e frio o bot fala a
  // cada dois segundos, e uma fila comprida faria a voz ficar meio minuto
  // atrás do jogo. O que importa é o que ele acabou de dizer.
  window.speechSynthesis.cancel()

  const fala = new SpeechSynthesisUtterance(texto)
  fala.lang = 'pt-BR'
  fala.rate = 1
  const voz = vozPtBr()
  if (voz) fala.voice = voz
  window.speechSynthesis.speak(fala)
})

// ── Partida ──────────────────────────────────────────────────────────────────

window.dudu.pedirEstado()
void carregarPorta()
