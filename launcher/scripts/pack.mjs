/*
  Empacota o aplicativo gravando nele o caminho da cópia do repositório.

  O bot não é embutido no instalador (`data/` precisa continuar na pasta do
  projeto, senão a rotina diária de repertório perde o histórico). O preço é o
  aplicativo instalado ter que achar essa pasta — e o instalador é feito para o
  computador da casa, então o caminho de agora é o caminho certo.

  Quem mover o repositório depois aponta a pasta nova pela janela; a escolha do
  adulto vence este valor.
*/

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const launcherDir = resolve(join(fileURLToPath(import.meta.url), '..', '..'))
const repoRoot = resolve(launcherDir, '..')

if (!existsSync(join(repoRoot, 'src', 'app', 'main.ts'))) {
  console.error(`não achei o bot em ${repoRoot} — o launcher precisa morar dentro do repositório`)
  process.exit(1)
}

console.log(`empacotando com duduHome = ${repoRoot}`)

// Chamar o `cli.js` pelo `node` em vez do `npx`: desde a correção da
// CVE-2024-27980, o Node recusa executar `.cmd` sem `shell: true`, e o `npx`
// no Windows é exatamente isso. Assim também não entra um processo a mais.
const cli = join(launcherDir, 'node_modules', 'electron-builder', 'cli.js')

const result = spawnSync(
  process.execPath,
  [cli, '--win', `-c.extraMetadata.duduHome=${repoRoot}`],
  { cwd: launcherDir, stdio: 'inherit' },
)

if (result.error) {
  console.error(`falha ao chamar o electron-builder: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
