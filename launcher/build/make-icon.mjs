/*
  Gera `icon.ico` a partir do desenho descrito aqui.

  O ícone fica versionado como binário, mas o desenho não pode ser opaco: quem
  quiser mudar a cor ou o traço edita este arquivo e roda `node make-icon.mjs`,
  em vez de abrir um editor de imagem e adivinhar o que estava lá.

  Desenho: um bloco de grama em pixel art — terra marrom embaixo, faixa de grama
  verde em cima. É a forma que a criança reconhece como "Minecraft" mesmo no
  tamanho de 16px da barra de tarefas.
*/

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = join(fileURLToPath(import.meta.url), '..')

/** Grade do desenho, em blocos. Cada letra é uma cor. */
const PALETA = {
  '.': [0, 0, 0, 0], // transparente
  g: [106, 190, 78, 255], // grama
  G: [88, 163, 65, 255], // grama, sombra
  t: [143, 106, 74, 255], // terra
  T: [120, 88, 61, 255], // terra, sombra
  o: [58, 46, 34, 255], // contorno
}

const DESENHO = [
  '..oooooooooooo..',
  '.oggggggggggggo.',
  'oggggggggggggggo',
  'ogGgggggggggGggo',
  'oGGGgGgggGgGGGGo',
  'oooooooooooooooo',
  'otttttttttttttto',
  'otttTtttttttttto',
  'ottttttttTttttto',
  'otTttttttttttTto',
  'otttttttttttttto',
  'otttttTtttttttto',
  'ottttttttttTttto',
  'otTtttttttttttto',
  '.otttttttttttto.',
  '..oooooooooooo..',
]

const LADO = 256
const BLOCO = LADO / DESENHO.length

/** Expande a grade para pixels RGBA. */
function pixels() {
  const buf = Buffer.alloc(LADO * LADO * 4)
  for (let y = 0; y < LADO; y++) {
    const linha = DESENHO[Math.floor(y / BLOCO)]
    for (let x = 0; x < LADO; x++) {
      const cor = PALETA[linha[Math.floor(x / BLOCO)]] ?? PALETA['.']
      buf.set(cor, (y * LADO + x) * 4)
    }
  }
  return buf
}

function chunk(tipo, dados) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo) >>> 0)
  return Buffer.concat([len, corpo, crc])
}

const TABELA = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (const byte of buf) c = TABELA[(c ^ byte) & 0xff] ^ (c >>> 8)
  return c ^ -1
}

function png(rgba) {
  // Cada linha do PNG é precedida do byte de filtro (0 = nenhum).
  const cru = Buffer.alloc(LADO * (LADO * 4 + 1))
  for (let y = 0; y < LADO; y++) {
    cru[y * (LADO * 4 + 1)] = 0
    rgba.copy(cru, y * (LADO * 4 + 1) + 1, y * LADO * 4, (y + 1) * LADO * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(LADO, 0)
  ihdr.writeUInt32BE(LADO, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(cru, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function ico(pngBuf) {
  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0) // reservado
  dir.writeUInt16LE(1, 2) // tipo: ícone
  dir.writeUInt16LE(1, 4) // uma imagem

  const entrada = Buffer.alloc(16)
  entrada[0] = 0 // 0 significa 256
  entrada[1] = 0
  entrada[2] = 0 // cores na paleta: 0 = sem paleta
  entrada[3] = 0
  entrada.writeUInt16LE(1, 4) // planos
  entrada.writeUInt16LE(32, 6) // bits por pixel
  entrada.writeUInt32LE(pngBuf.length, 8)
  entrada.writeUInt32LE(6 + 16, 12)

  return Buffer.concat([dir, entrada, pngBuf])
}

const arquivo = join(AQUI, 'icon.ico')
writeFileSync(arquivo, ico(png(pixels())))
console.log(`icone gerado: ${arquivo}`)
