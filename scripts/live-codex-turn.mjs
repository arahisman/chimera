#!/usr/bin/env bun
import { existsSync } from 'fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadCodexTokens } from '../src/services/codex/auth/token-store.ts'
import {
  getCodexModelConfig,
  getDefaultCodexModel,
  normalizeCodexModelId,
} from '../src/services/codex/models/registry.ts'

if (process.env.CHIMERA_LIVE !== '1') {
  console.error('Refusing to run live Codex turn smoke without CHIMERA_LIVE=1.')
  console.error('Run `CHIMERA_LIVE=1 bun scripts/live-codex-turn.mjs` after `chimera login`.')
  process.exit(2)
}

const root = process.cwd()
const realRoot = await realpath(root)
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-live-turn-'))
const codexConfigDir = join(tempHome, 'chimera')
const model = normalizeCodexModelId(
  process.env.CHIMERA_LIVE_MODEL ??
    process.env.CHIMERA_MODEL ??
    getDefaultCodexModel().id,
)
const marker = `live-codex-turn-ok-${Date.now()}`

try {
  assert(existsSync(join(root, 'dist/chimera.js')), 'dist/chimera.js is missing; run `bun run build` first')
  assert(getCodexModelConfig(model), `live turn model is not in the Codex registry: ${model}`)
  assert(model.startsWith('gpt-'), `live turn model must be a real OpenAI model id: ${model}`)

  const tokens = await loadCodexTokens()
  assert(tokens, 'Not authenticated. Run `chimera login` before live turn smoke.')

  await writeTrustedConfig()
  const result = await runCommand([
    'bun',
    'dist/chimera.js',
    '-p',
    `Reply exactly with: ${marker}`,
    '--bare',
    '--tools',
    '',
    '--output-format',
    'text',
    '--model',
    model,
  ])

  assert(
    result.stdout.includes(marker),
    `live assistant text did not include marker ${marker}; stdout was ${JSON.stringify(result.stdout.slice(0, 200))}`,
  )
  assert(!containsTokenMaterial(result.stdout, tokens), 'stdout leaked Codex token material')
  assert(!containsTokenMaterial(result.stderr, tokens), 'stderr leaked Codex token material')

  const transcript = await readTranscript()
  assert(transcript.includes(marker), 'transcript did not contain live assistant text')
  assert(transcript.includes(model), `transcript did not record selected model ${model}`)
  assert(!containsTokenMaterial(transcript, tokens), 'transcript leaked Codex token material')

  console.log(`live:codex-turn ok (${model})`)
} finally {
  await rm(tempHome, { recursive: true, force: true })
}

async function writeTrustedConfig() {
  await mkdir(codexConfigDir, { recursive: true, mode: 0o700 })
  await writeFile(
    join(codexConfigDir, '.chimera.json'),
    JSON.stringify(
      {
        theme: 'dark',
        hasCompletedOnboarding: true,
        projects: {
          [normalizeConfigPath(root)]: trustedProjectConfig(),
          [normalizeConfigPath(realRoot)]: trustedProjectConfig(),
        },
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )
}

function trustedProjectConfig() {
  return {
    hasCompletedProjectOnboarding: true,
    hasTrustDialogAccepted: true,
  }
}

async function runCommand(cmd) {
  const proc = Bun.spawn({
    cmd,
    cwd: root,
    env: {
      ...process.env,
      CLAUBBIT: '1',
      CLAUDE_CONFIG_DIR: codexConfigDir,
      CHIMERA_SKIP_VERSION_CHECK: '1',
      COLUMNS: '100',
      LINES: '30',
      TERM: process.env.TERM || 'xterm-256color',
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    withTimeout(proc.exited, 60_000, `${cmd.join(' ')} timed out`, () =>
      proc.kill(),
    ),
  ])

  if (exitCode !== 0) {
    throw new Error(
      [
        `${cmd.join(' ')} exited ${exitCode}`,
        `stdout:\n${stdout.slice(0, 2000)}`,
        `stderr:\n${stderr.slice(0, 2000)}`,
      ].join('\n'),
    )
  }

  return { stdout, stderr }
}

async function readTranscript() {
  const files = (await walk(codexConfigDir)).filter(file => file.endsWith('.jsonl'))
  assert(files.length > 0, 'no transcript JSONL files were written')
  const chunks = []
  for (const file of files) chunks.push(await readFile(file, 'utf8'))
  return chunks.join('\n')
}

async function walk(dir) {
  const files = []
  let dirents = []
  try {
    dirents = await readdir(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const dirent of dirents) {
    const path = join(dir, dirent.name)
    if (dirent.isDirectory()) files.push(...(await walk(path)))
    else files.push(path)
  }
  return files
}

function containsTokenMaterial(text, tokens) {
  return tokenNeedles(tokens).some(needle => text.includes(needle))
}

function tokenNeedles(tokens) {
  return [
    tokens.access_token,
    tokens.refresh_token,
    tokens.id_token,
  ].filter(value => typeof value === 'string' && value.length >= 16)
}

async function withTimeout(promise, ms, message, onTimeout) {
  let timeout
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          onTimeout?.()
          reject(new Error(message))
        }, ms)
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeConfigPath(path) {
  return path.replace(/\\/g, '/')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
