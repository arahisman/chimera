import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const patterns = [
  /createLocalUnavailable(Command|Tool)/,
  /not available in this local Chimera build/,
  /0\.0\.0-chimera-compat/,
  /file:local-packages\/@ant/,
]

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(path))
    else if (/\.(ts|tsx|js|jsx|json)$/.test(entry.name)) out.push(path)
  }
  return out
}

const failures = []
for (const file of await walk(join(root, 'src'))) {
  const text = await readFile(file, 'utf8')
  for (const pattern of patterns) {
    if (pattern.test(text)) failures.push(`${file.slice(root.length)}: ${pattern}`)
  }
}
const packageText = await readFile(join(root, 'package.json'), 'utf8')
for (const pattern of patterns) {
  if (pattern.test(packageText)) failures.push(`package.json: ${pattern}`)
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('smoke:no-local-unavailable ok')
