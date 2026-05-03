#!/usr/bin/env bun
import { serve } from 'bun'
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
import { dirname, join } from 'path'
import { tmpdir } from 'os'

const root = process.cwd()
const chimeraBin = join(root, 'dist/chimera.js')
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-plugin-home-'))
const tempWorkdir = await mkdtemp(join(tmpdir(), 'chimera-plugin-work-'))
const realTempWorkdir = await realpath(tempWorkdir)
const tempPluginDir = await mkdtemp(join(tmpdir(), 'chimera-plugin-'))
const codexConfigDir = join(tempHome, 'chimera')
const authPath = join(tempHome, 'chimera/codex/auth.json')
const sourcePath = join(tempWorkdir, 'src/app.ts')
const lspServerPath = join(tempPluginDir, 'lsp-server.mjs')
const pluginId = 'codex-plugin-smoke@inline'
const smokeLabel = 'codex-local-plugin-option'
const pluginMcpToolName = 'mcp__plugin_codex-plugin-smoke_codexMcp__ping'
const requests = []

const apiServer = serve({
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
  CHIMERA_API_ENDPOINT: new URL('/codex/responses', apiServer.url).toString(),
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
  assert(existsSync(chimeraBin), 'dist/chimera.js does not exist')
  await writeAuthConfigProjectAndPlugin()

  const command = await runCommand([
    'bun',
    chimeraBin,
    '-p',
    '/codex-plugin-smoke:codex-command argument-marker',
    '--plugin-dir',
    tempPluginDir,
    '--tools',
    '',
    '--output-format',
    'text',
  ])
  assert(
    command.stdout === 'plugin command final marker\n',
    `unexpected plugin command stdout: ${JSON.stringify(command.stdout)}`,
  )
  assert(command.stderr === '', `unexpected plugin command stderr: ${command.stderr}`)
  assertRequestIncludesAll(
    'argument-marker',
    ['codex plugin command marker', smokeLabel, tempPluginDir],
    'plugin slash command was not expanded',
  )
  console.log('smoke:codex-plugins slash command ok')

  const skill = await runCommand([
    'bun',
    chimeraBin,
    '-p',
    '/codex-plugin-smoke:codex-skill',
    '--plugin-dir',
    tempPluginDir,
    '--tools',
    '',
    '--output-format',
    'text',
  ])
  assert(
    skill.stdout === 'plugin skill final marker\n',
    `unexpected plugin skill stdout: ${JSON.stringify(skill.stdout)}`,
  )
  assert(skill.stderr === '', `unexpected plugin skill stderr: ${skill.stderr}`)
  assertRequestIncludesAll(
    'codex plugin skill marker',
    ['Base directory for this skill:', smokeLabel, 'Skill dir:'],
    'plugin slash skill was not expanded',
  )
  console.log('smoke:codex-plugins slash skill ok')

  const mcp = await runCommand([
    'bun',
    chimeraBin,
    '-p',
    'mcp plugin prompt marker',
    '--plugin-dir',
    tempPluginDir,
    '--tools',
    pluginMcpToolName,
    '--allowed-tools',
    pluginMcpToolName,
    '--output-format',
    'text',
  ])
  assert(
    mcp.stdout === 'mcp plugin final marker\n',
    `unexpected plugin MCP stdout: ${JSON.stringify(mcp.stdout)}`,
  )
  assert(mcp.stderr === '', `unexpected plugin MCP stderr: ${mcp.stderr}`)
  assertToolRoundtrip({
    callId: 'call_plugin_mcp',
    toolName: pluginMcpToolName,
    resultNeedle: 'mcp pong plugin mcp message',
  })
  console.log('smoke:codex-plugins MCP tool ok')

  const lsp = await runCommand([
    'bun',
    chimeraBin,
    '-p',
    'lsp plugin prompt marker',
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
    lsp.stdout === 'lsp plugin final marker\n',
    `unexpected plugin LSP stdout: ${JSON.stringify(lsp.stdout)}`,
  )
  assert(lsp.stderr === '', `unexpected plugin LSP stderr: ${lsp.stderr}`)
  assertToolRoundtrip({
    callId: 'call_plugin_lsp',
    toolName: 'LSP',
    resultNeedle: 'codex plugin lsp hover marker',
  })
  await assertTranscriptContains()
  console.log('smoke:codex-plugins LSP server ok')

  console.log('smoke:codex-plugins local plugin loading ok')
} finally {
  await apiServer.stop(true)
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
        access_token: 'plugin-smoke-access',
        refresh_token: 'plugin-smoke-refresh',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'plugin-smoke-account',
        email: 'plugin-smoke@example.com',
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
  await writeFile(
    join(codexConfigDir, 'settings.json'),
    JSON.stringify(
      {
        pluginConfigs: {
          [pluginId]: {
            options: {
              smokeLabel,
            },
          },
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
      'const pluginSmokeSymbol = 42',
      'export function readPluginSmokeSymbol() {',
      '  return pluginSmokeSymbol',
      '}',
      '',
    ].join('\n'),
  )

  await mkdir(join(tempPluginDir, '.chimera-plugin'), {
    recursive: true,
    mode: 0o700,
  })
  await mkdir(join(tempPluginDir, 'commands'), {
    recursive: true,
    mode: 0o700,
  })
  await mkdir(join(tempPluginDir, 'skills/codex-skill'), {
    recursive: true,
    mode: 0o700,
  })

  await writeFile(
    join(tempPluginDir, '.chimera-plugin/plugin.json'),
    JSON.stringify(
      {
        name: 'codex-plugin-smoke',
        version: '0.0.0',
        description: 'Codex local plugin smoke',
        commands: {
          'codex-command': {
            source: './commands/codex-command.md',
            description: 'Codex plugin command smoke',
          },
        },
        skills: './skills',
        userConfig: {
          smokeLabel: {
            type: 'string',
            title: 'Smoke label',
            description: 'Value used to prove plugin user config substitution',
            required: true,
            default: 'codex-default-label',
          },
        },
        settings: {
          agent: 'codex-plugin-smoke-agent',
        },
        mcpServers: {
          codexMcp: {
            type: 'stdio',
            command: 'bun',
            args: [
              join(root, 'scripts/mcp-smoke-server.mjs'),
              '${user_config.smokeLabel}',
            ],
            env: {
              SMOKE_LABEL: '${user_config.smokeLabel}',
            },
          },
        },
        lspServers: {
          fakeTs: {
            command: process.execPath,
            args: [lspServerPath, '${user_config.smokeLabel}'],
            extensionToLanguage: {
              '.ts': 'typescript',
            },
            workspaceFolder: tempWorkdir,
            startupTimeout: 5000,
            env: {
              SMOKE_LABEL: '${user_config.smokeLabel}',
            },
          },
        },
      },
      null,
      2,
    ),
  )

  await writeFile(
    join(tempPluginDir, 'commands/codex-command.md'),
    [
      '---',
      'description: Codex plugin command marker',
      'argument-hint: [value]',
      '---',
      '',
      'codex plugin command marker',
      'Argument: $ARGUMENTS',
      'Configured: ${user_config.smokeLabel}',
      'Root: ${CLAUDE_PLUGIN_ROOT}',
      '',
    ].join('\n'),
  )

  await writeFile(
    join(tempPluginDir, 'skills/codex-skill/SKILL.md'),
    [
      '---',
      'name: codex-skill',
      'description: Codex plugin skill smoke',
      '---',
      '',
      '# Codex Plugin Skill',
      '',
      'codex plugin skill marker',
      'Configured: ${user_config.smokeLabel}',
      'Skill dir: ${CLAUDE_SKILL_DIR}',
      '',
    ].join('\n'),
  )

  await writeFile(lspServerPath, fakeLspServerSource())
}

function responseForRequest(body) {
  const text = JSON.stringify(body)
  if (text.includes('function_call_output') && text.includes('call_plugin_mcp')) {
    return textSse('mcp plugin final marker')
  }
  if (text.includes('function_call_output') && text.includes('call_plugin_lsp')) {
    return textSse('lsp plugin final marker')
  }
  if (text.includes('mcp plugin prompt marker')) {
    return functionCallSse({
      callId: 'call_plugin_mcp',
      name: pluginMcpToolName,
      arguments: {
        message: 'plugin mcp message',
      },
    })
  }
  if (text.includes('lsp plugin prompt marker')) {
    return functionCallSse({
      callId: 'call_plugin_lsp',
      name: 'LSP',
      arguments: {
        operation: 'hover',
        filePath: sourcePath,
        line: 1,
        character: 8,
      },
    })
  }
  if (text.includes('codex plugin skill marker')) {
    return textSse('plugin skill final marker')
  }
  if (text.includes('argument-marker')) {
    return textSse('plugin command final marker')
  }
  return textSse('unexpected codex plugin smoke request')
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
    withTimeout(proc.exited, 80_000, `${cmd.join(' ')} timed out`, () =>
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

function assertRequestIncludesAll(anchor, needles, message) {
  const request = requests.find(item => JSON.stringify(item).includes(anchor))
  assert(request, `mock Codex server did not receive anchor: ${anchor}`)
  const text = JSON.stringify(request)
  for (const needle of needles) {
    assert(
      text.includes(needle),
      `${message}; missing ${needle}\nrequest snippet:\n${text.slice(0, 5000)}`,
    )
  }
}

function assertToolRoundtrip({ callId, toolName, resultNeedle }) {
  const resultRequest = requests.find(request => hasFunctionCallOutput(request, callId))
  assert(resultRequest, `no function_call_output request for ${callId}\n${requestSummaries()}`)
  const resultText = JSON.stringify(resultRequest)
  assert(
    resultText.includes(toolName),
    `function_call_output request did not preserve ${toolName} call history`,
  )
  assert(
    resultText.includes(resultNeedle),
    `function_call_output request did not contain tool result: ${resultNeedle}\n${resultText.slice(0, 4000)}`,
  )
  assert(
    !resultText.includes('InputValidationError'),
    `${toolName} produced an input validation error\n${resultText.slice(0, 4000)}`,
  )
  assert(
    !resultText.includes("haven't granted") && !resultText.includes('Permission to'),
    `${toolName} hit a permission prompt instead of executing\n${resultText.slice(0, 4000)}`,
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
    'codex plugin command marker',
    'codex plugin skill marker',
    'mcp pong plugin mcp message',
    'codex plugin lsp hover marker',
    smokeLabel,
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

function hasFunctionCallOutput(body, callId) {
  const input = Array.isArray(body?.input) ? body.input : []
  return input.some(
    item => item?.type === 'function_call_output' && item.call_id === callId,
  )
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
        value: 'codex plugin lsp hover marker for pluginSmokeSymbol',
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
