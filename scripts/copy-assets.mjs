// O tsc só emite .js. O catálogo padrão é um .yaml embarcado que o loader lê
// em runtime, então precisa acompanhar o build.
import { copyFileSync, mkdirSync } from 'node:fs'

const assets = [['src/dialogue/default-repertoire.yaml', 'dist/dialogue/default-repertoire.yaml']]

for (const [from, to] of assets) {
  mkdirSync(to.slice(0, to.lastIndexOf('/')), { recursive: true })
  copyFileSync(from, to)
  console.log(`copiado: ${from} -> ${to}`)
}
