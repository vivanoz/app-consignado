// Publica o app no GitHub Pages da Viva Noz: gera dist/ e envia para a
// branch gh-pages de vivanoz/app-consignado. Uso: npm run publicar
import { execSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'

const REPO = 'https://github.com/vivanoz/app-consignado.git'
const rodar = (comando, opcoes = {}) => execSync(comando, { stdio: 'inherit', ...opcoes })
const ler = (comando) => execSync(comando, { encoding: 'utf8' }).trim()

if (ler('gh api user --jq .login') !== 'vivanoz') {
  console.error('A conta ativa do GitHub não é a vivanoz. Rode: gh auth switch --user vivanoz')
  process.exit(1)
}
if (ler('git status --porcelain')) {
  console.error('Há alterações sem commit. Faça o commit antes de publicar.')
  process.exit(1)
}
if (!existsSync('.env.local')) {
  console.warn('Aviso: sem .env.local. O app vai ao ar sem ligação com o Supabase.')
}

const versao = ler('git rev-parse --short HEAD')
rodar('npm test')
rodar('npm run build')

// O GitHub Pages não deve tratar a pasta como site Jekyll.
writeFileSync('dist/.nojekyll', '')
rmSync('dist/.git', { recursive: true, force: true })

const noDist = { cwd: 'dist' }
rodar('git init -q -b gh-pages', noDist)
rodar('git add -A', noDist)
rodar(
  `git -c user.name="Viva Noz" -c user.email="338384750+vivanoz@users.noreply.github.com" commit -q -m "Publica ${versao}"`,
  noDist,
)
// A branch gh-pages guarda só a versão no ar; o histórico do código fica na main.
rodar(`git -c credential.helper= -c credential.helper="!gh auth git-credential" push -q --force ${REPO} gh-pages`, noDist)
rmSync('dist/.git', { recursive: true, force: true })

console.log(`\nPublicado ${versao}. Em um ou dois minutos: https://vivanoz.github.io/app-consignado/`)
