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

// ── Partida ──────────────────────────────────────────────────────────────────

window.dudu.pedirEstado()
void carregarPorta()
