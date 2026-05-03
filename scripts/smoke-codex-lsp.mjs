#!/usr/bin/env bun
import { serve } from 'bun'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

const root = process.cwd()
const chimeraBin = join(root, 'dist/chimera.js')
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-lsp-home-'))
const tempWorkdir = await mkdtemp(join(tmpdir(), 'chimera-lsp-work-'))
const realTempWorkdir = await realpath(tempWorkdir)
const tempPluginDir = await mkdtemp(join(tmpdir(), 'chimera-lsp-plugin-'))
const codexConfigDir = join(tempHome, 'chimera')
const authPath = join(tempHome, 'chimera/codex/auth.json')
const sourcePath = join(tempWorkdir, 'src/app.ts')
const lspServerPath = join(tempPluginDir, 'fake-lsp-server.mjs')
const requests = []

const server = serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    if (!url.pathname.includes('/codex/responses')) {
      return new Response('not found', { status: 404 })
    }

    const body = await req.json().catch(() => ({}))
    requests.push(body)
    return new Response(responseForRequest(body), {
      headers: { 'content-type': 'text/event-stream' },
    })
  },
})

const env = {
  ...process.env,
  CLAUBBIT: '1',
  CLAUDE_CONFIG_DIR: codexConfigDir,
  CHIMERA_API_ENDPOINT: new URL('/codex/responses', server.url).toString(),
  CHIMERA_CONFIG_HOME: tempHome,
  CHIMERA_SKIP_VERSION_CHECK: '1',
  COLUMNS: '120',
  ENABLE_LSP_TOOL: '1',
  HOME: tempHome,
  LINES: '40',
  PWD: tempWorkdir,
  TERM: 'xterm-256color',
  XDG_CONFIG_HOME: join(tempHome, '.config'),
}

try {
  await writeAuthConfigProjectAndPlugin()

  const result = await runCommand([
    'bun',
    chimeraBin,
    '-p',
    'lsp parent prompt marker',
    '--plugin-dir',
    tempPluginDir,
    '--tools',
    'LSP',
    '--allowed-tools',
    'LSP',
    '--output-format',
    'text',
  ])

  assert(
    result.stdout === 'lsp parent final marker\n',
    `unexpected LSP smoke stdout: ${JSON.stringify(result.stdout)}`,
  )
  assert(result.stderr === '', `unexpected LSP smoke stderr: ${result.stderr}`)
  assertLspRoundtrip()
  await assertTranscriptContains()
  console.log('smoke:codex-lsp hover roundtrip ok')
} finally {
  await server.stop(true)
  await rm(tempHome, { recursive: true, force: true })
  await rm(tempWorkdir, { recursive: true, force: true })
  await rm(tempPluginDir, { recursive: true, force: true })
}

async function writeAuthConfigProjectAndPlugin() {
  await mkdir(dirname(authPath), { recursive: true, mode: 0o700 })
  await writeFile(
    authPath,
    JSON.stringify(
      {
        access_token: 'lsp-smoke-access',
        refresh_token: 'lsp-smoke-refresh',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'lsp-smoke-account',
        email: 'lsp-smoke@example.com',
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )

  await mkdir(codexConfigDir, { recursive: true, mode: 0o700 })
  await writeFile(
    join(codexConfigDir, '.chimera.json'),
    JSON.stringify(
      {
        theme: 'dark',
        hasCompletedOnboarding: true,
        projects: {
          [normalizeConfigPath(tempWorkdir)]: trustedProjectConfig(),
          [normalizeConfigPath(realTempWorkdir)]: trustedProjectConfig(),
        },
      },
      null,
      2,
    ),
  )

  await mkdir(dirname(sourcePath), { recursive: true, mode: 0o700 })
  await writeFile(
    sourcePath,
    [
      'const smokeSymbol = 42',
      'export function readSmokeSymbol() {',
      '  return smokeSymbol',
      '}',
      '',
    ].join('\n'),
  )

  await writeFile(lspServerPath, fakeLspServerSource())
  await mkdir(join(tempPluginDir, '.chimera-plugin'), {
    recursive: true,
    mode: 0o700,
  })
  await writeFile(
    join(tempPluginDir, '.chimera-plugin/plugin.json'),
    JSON.stringify(
      {
        name: 'codex-lsp-smoke',
        version: '0.0.0',
        description: 'Codex LSP smoke plugin',
        lspServers: {
          fakeTs: {
            command: process.execPath,
            args: [lspServerPath],
            extensionToLanguage: {
              '.ts': 'typescript',
            },
            workspaceFolder: tempWorkdir,
            startupTimeout: 5000,
          },
        },
      },
      null,
      2,
    ),
  )
}

function responseForRequest(body) {
  const text = JSON.stringify(body)
  if (text.includes('function_call_output') && text.includes('call_lsp')) {
    return textSse('lsp parent final marker')
  }

  if (text.includes('lsp parent prompt marker')) {
    return functionCallSse({
      callId: 'call_lsp',
      name: 'LSP',
      arguments: {
        operation: 'hover',
        filePath: sourcePath,
        line: 1,
        character: 8,
      },
    })
  }

  return textSse('unexpected codex lsp smoke request')
}

async function runCommand(cmd) {
  const proc = Bun.spawn({
    cmd,
    cwd: tempWorkdir,
    env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    withTimeout(proc.exited, 70_000, `${cmd.join(' ')} timed out`, () =>
      proc.kill(),
    ),
  ])

  if (exitCode !== 0) {
    throw new Error(
      [
        `${cmd.join(' ')} exited ${exitCode}`,
        `stdout:\n${stdout}`,
        `stderr:\n${stderr}`,
      ].join('\n'),
    )
  }

  return { stdout, stderr }
}

function assertLspRoundtrip() {
  assert(
    requests.some(request =>
      JSON.stringify(request).includes('lsp parent prompt marker'),
    ),
    'mock Codex server did not receive parent prompt',
  )
  const resultRequest = requests.find(request => {
    const text = JSON.stringify(request)
    return text.includes('function_call_output') && text.includes('call_lsp')
  })
  assert(resultRequest, `no function_call_output request for LSP call\n${requestSummaries()}`)
  const resultText = JSON.stringify(resultRequest)
  assert(
    resultText.includes('LSP'),
    'function_call_output request did not preserve LSP call history',
  )
  assert(
    resultText.includes('codex lsp hover marker'),
    `function_call_output request did not include hover result\n${resultText.slice(0, 4000)}`,
  )
  assert(
    !resultText.includes('InputValidationError'),
    'function_call_output request included a tool input validation error',
  )
}

async function assertTranscriptContains() {
  const entries = []
  for (const file of (await walk(codexConfigDir)).filter(file =>
    file.endsWith('.jsonl'),
  )) {
    const text = await readFile(file, 'utf8')
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      entries.push(JSON.parse(line))
    }
  }

  assert(entries.length > 0, 'no transcript JSONL entries were written')
  const transcript = JSON.stringify(entries)
  for (const needle of [
    'lsp parent prompt marker',
    'call_lsp',
    'codex lsp hover marker',
    'lsp parent final marker',
  ]) {
    assert(transcript.includes(needle), `transcript did not contain ${needle}`)
  }
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

function functionCallSse({ callId, name, arguments: args }) {
  return [
    'event: response.output_item.added',
    `data: ${JSON.stringify({
      type: 'response.output_item.added',
      output_index: 0,
      item: { type: 'function_call', call_id: callId, name },
    })}`,
    '',
    'event: response.function_call_arguments.delta',
    `data: ${JSON.stringify({
      type: 'response.function_call_arguments.delta',
      output_index: 0,
      delta: JSON.stringify(args),
    })}`,
    '',
    'event: response.output_item.done',
    `data: ${JSON.stringify({
      type: 'response.output_item.done',
      output_index: 0,
      item: { type: 'function_call', call_id: callId, name },
    })}`,
    '',
    'event: response.completed',
    `data: ${JSON.stringify({
      type: 'response.completed',
      response: { usage: { input_tokens: 2, output_tokens: 5 } },
    })}`,
    '',
  ].join('\n')
}

function textSse(text) {
  return [
    'event: response.output_item.added',
    `data: ${JSON.stringify({
      type: 'response.output_item.added',
      output_index: 0,
      item: { type: 'message', id: `out_${Math.random().toString(36).slice(2)}` },
    })}`,
    '',
    'event: response.output_text.delta',
    `data: ${JSON.stringify({
      type: 'response.output_text.delta',
      output_index: 0,
      delta: text,
    })}`,
    '',
    'event: response.output_item.done',
    `data: ${JSON.stringify({
      type: 'response.output_item.done',
      output_index: 0,
      item: { type: 'message', id: 'out_text' },
    })}`,
    '',
    'event: response.completed',
    `data: ${JSON.stringify({
      type: 'response.completed',
      response: { usage: { input_tokens: 1, output_tokens: 3 } },
    })}`,
    '',
  ].join('\n')
}

function fakeLspServerSource() {
  return String.raw`const decoder = new TextDecoder()
let buffer = Buffer.alloc(0)

process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk])
  drain()
})

function drain() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return

    const header = decoder.decode(buffer.subarray(0, headerEnd))
    const match = header.match(/Content-Length:\s*(\d+)/i)
    if (!match) {
      buffer = buffer.subarray(headerEnd + 4)
      continue
    }

    const length = Number(match[1])
    const bodyStart = headerEnd + 4
    const bodyEnd = bodyStart + length
    if (buffer.length < bodyEnd) return

    const payload = decoder.decode(buffer.subarray(bodyStart, bodyEnd))
    buffer = buffer.subarray(bodyEnd)
    handle(JSON.parse(payload))
  }
}

function handle(message) {
  if (message.method === 'exit') {
    process.exit(0)
  }
  if (message.id === undefined) return

  if (message.method === 'initialize') {
    respond(message.id, {
      capabilities: {
        textDocumentSync: 1,
        hoverProvider: true,
        definitionProvider: true,
      },
    })
    return
  }
  if (message.method === 'shutdown') {
    respond(message.id, null)
    return
  }
  if (message.method === 'textDocument/hover') {
    respond(message.id, {
      contents: {
        kind: 'markdown',
        value: 'codex lsp hover marker for smokeSymbol',
      },
    })
    return
  }

  respond(message.id, null)
}

function respond(id, result) {
  const json = JSON.stringify({ jsonrpc: '2.0', id, result })
  process.stdout.write(
    'Content-Length: ' + Buffer.byteLength(json, 'utf8') + '\r\n\r\n' + json,
  )
}
`
}

function requestSummaries() {
  return requests
    .map((request, index) => {
      const text = JSON.stringify(request)
      return `request ${index + 1}: ${text.slice(0, 2000)}`
    })
    .join('\n---\n')
}

function normalizeConfigPath(path) {
  return path.replace(/\\/g, '/')
}

function trustedProjectConfig() {
  return {
    hasCompletedProjectOnboarding: true,
    hasTrustDialogAccepted: true,
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
