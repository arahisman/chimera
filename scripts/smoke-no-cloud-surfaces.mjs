import { access, readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const root = join(new URL('..', import.meta.url).pathname)

const denied = [
  { name: 'cloud assistant command', pattern: /program\.command\(['"]assistant\b/ },
  { name: 'assistant session discovery import', pattern: /assistant\/sessionDiscovery/ },
  { name: 'assistant chooser import', pattern: /AssistantSessionChooser/ },
  { name: 'remote-control command', pattern: /remote-control-server/ },
  { name: 'remote control server import', pattern: /remoteControlServer/ },
  { name: 'peer session tool', pattern: /\bListPeersTool\b/ },
  { name: 'peer command', pattern: /commands\/peers/ },
  { name: 'subscribe PR tool', pattern: /\bSubscribePRTool\b/ },
  { name: 'subscribe PR command', pattern: /subscribe-pr/ },
  { name: 'push notification tool', pattern: /\bPushNotificationTool\b/ },
  { name: 'cloud daemon entrypoint', pattern: /daemon\/main/ },
  { name: 'environment runner entrypoint', pattern: /environment-runner/ },
  { name: 'self-hosted runner entrypoint', pattern: /self-hosted-runner/ },
  { name: 'claude chrome package', pattern: /claude-for-chrome/ },
  { name: 'ant package fallback', pattern: /file:local-packages\/@ant/ },
  { name: 'Anthropic API endpoint', pattern: /api\.anthropic\.com/ },
  { name: 'Anthropic MCP proxy endpoint', pattern: /mcp-proxy(?:-staging)?\.anthropic\.com/ },
  { name: 'Anthropic feedback endpoint', pattern: /claude_cli_feedback|claude_code_shared_session_transcripts/ },
  { name: 'Anthropic GitHub action docs', pattern: /github\.com\/anthropics\/chimera-action/ },
  { name: 'Claude mobile app URL', pattern: /claude-by-anthropic|com\.anthropic\.claude/ },
  { name: 'Anthropic bundle identifier', pattern: /com\.anthropic\./ },
  { name: 'Anthropic package fallback', pattern: /@anthropic-ai\/claude-code/ },
]

const allowedFiles = new Set([
  'docs/chimera-local-scope.md',
  'docs/stub-inventory.md',
  'docs/local-parity-matrix.md',
  'docs/opencode-donor-map.md',
  'docs/superpowers/plans/2026-05-02-chimera-local-cleanup-and-parity.md',
])

const allowedFragments = [
  /CLAUDE\.md/,
  /legacy/i,
  /import/i,
  /migration/i,
]

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === '.git' ||
      entry.name === 'tmp'
    ) {
      continue
    }
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walk(path)))
    } else if (/\.(ts|tsx|js|jsx|json|md)$/.test(entry.name)) {
      out.push(path)
    }
  }
  return out
}

const files = [
  ...(await walk(join(root, 'src'))),
  join(root, 'package.json'),
  join(root, 'bun.lock'),
]

const distBundle = join(root, 'dist', 'chimera.js')
try {
  await access(distBundle)
  files.push(distBundle)
} catch {}

const failures = []
for (const file of files) {
  const rel = relative(root, file)
  if (allowedFiles.has(rel)) continue
  const text = await readFile(file, 'utf8')
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (allowedFragments.some(pattern => pattern.test(line))) continue
    for (const { name, pattern } of denied) {
      if (pattern.test(line)) {
        failures.push(`${rel}:${i + 1}: ${name}: ${line.trim()}`)
      }
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('smoke:no-cloud-surfaces ok')
