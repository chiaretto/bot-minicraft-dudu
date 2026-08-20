// Sincroniza as duas cópias do repertório.
//
//   data/repertoire.yaml               o que o bot lê em execução (fora do git)
//   src/dialogue/default-repertoire.yaml  semente versionada
//
// Editar só a cópia de `data/` deixa o trabalho fora do controle de versão —
// e `data/` está inteiro no .gitignore por causa das conversas do jogador.
// Feito em Node, não em shell, para rodar igual no Windows, no mac e no Linux.
//
//   npm run repertoire:sync              data/ -> semente (fim da rodada)
//   npm run repertoire:sync -- --check   só compara, não escreve
//   npm run repertoire:sync -- --from-seed  semente -> data/ (máquina nova)
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

const LIVE = 'data/repertoire.yaml'
const SEED = 'src/dialogue/default-repertoire.yaml'

const args = process.argv.slice(2)
const check = args.includes('--check')
const fromSeed = args.includes('--from-seed')

const [from, to] = fromSeed ? [SEED, LIVE] : [LIVE, SEED]

if (!existsSync(from)) {
  console.error(`erro: ${from} não existe.`)
  if (!fromSeed) {
    console.error('O bot nunca rodou nesta máquina. Edite a semente direto, ou rode:')
    console.error('  npm run repertoire:sync -- --from-seed')
  }
  process.exit(1)
}

const same = existsSync(to) && readFileSync(from, 'utf8') === readFileSync(to, 'utf8')

if (check) {
  if (same) {
    console.log(`iguais: ${from} == ${to}`)
    process.exit(0)
  }
  console.error(`DIFERENTES: ${from} != ${to}`)
  console.error('Rode `npm run repertoire:sync` para copiar antes de commitar.')
  process.exit(1)
}

if (same) {
  console.log(`já iguais, nada a copiar: ${from} == ${to}`)
  process.exit(0)
}

mkdirSync(dirname(to), { recursive: true })
copyFileSync(from, to)
console.log(`copiado: ${from} -> ${to}`)
