#!/usr/bin/env bun
import { serve } from 'bun'
import { existsSync } from 'fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import stripAnsi from 'strip-ansi'

const root = process.cwd()
const realRoot = await realpath(root)
const chimeraBin = join(root, 'dist/chimera.js')
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-tui-home-'))
const tempWorkdir = await mkdtemp(join(tmpdir(), 'chimera-tui-work-'))
const missingAuthHome = await mkdtemp(join(tmpdir(), 'chimera-tui-noauth-home-'))
const missingAuthWorkdir = await mkdtemp(
  join(tmpdir(), 'chimera-tui-noauth-work-'),
)
const codexConfigDir = join(tempHome, 'chimera')
const authPath = join(tempHome, 'chimera/codex/auth.json')
const snapshotsDir = join(root, 'tmp/codex-tui-snapshots')
const editPath = join(tempWorkdir, 'diff-target.txt')
const bashOutputPath = join(tempWorkdir, 'permission-output.txt')
const requests = []
const mainTurnCounts = new Map()

const textFixture = await readFile(
  join(root, 'tests/fixtures/codex-stream/text.sse'),
  'utf8',
)

const editReadFixture = functionCallSse({
  callId: 'call_tui_edit_read',
  name: 'Read',
  arguments: {
    file_path: editPath,
  },
})

const editFixture = functionCallSse({
  callId: 'call_tui_edit',
  name: 'Edit',
  arguments: {
    file_path: editPath,
    old_string: 'before edit',
    new_string: 'after edit',
    replace_all: false,
  },
})

const bashFixture = functionCallSse({
  callId: 'call_tui_bash',
  name: 'Bash',
  arguments: {
    command: `printf permission-ok > ${shellQuote(bashOutputPath)} && cat ${shellQuote(bashOutputPath)}`,
    description: 'TUI permission smoke',
    timeout: 10_000,
    run_in_background: false,
    dangerouslyDisableSandbox: false,
  },
})

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
  HOME: tempHome,
  LINES: '40',
  PWD: tempWorkdir,
  TERM: 'xterm-256color',
  XDG_CONFIG_HOME: join(tempHome, '.config'),
}

try {
  assert(existsSync(chimeraBin), 'dist/chimera.js does not exist')
  assert(existsSync('/usr/bin/expect'), 'TUI smoke requires /usr/bin/expect')
  await writeAuthAndConfig()
  await writeTrustedConfigOnly(missingAuthHome, missingAuthWorkdir)
  await writeFixtures()
  await rm(snapshotsDir, { recursive: true, force: true })
  await mkdir(snapshotsDir, { recursive: true })
  await seedResumeSession()

  const welcomeAndModel = await runExpect(
    welcomeAndModelPickerScript(),
    'welcome-model-picker',
  )
  assertIncludes(welcomeAndModel.clean, 'Chimera')
  assertExcludes(welcomeAndModel.clean, 'CodexCode')
  assertExcludes(welcomeAndModel.clean, 'ClaudeCode')
  assertExcludes(welcomeAndModel.clean, 'Opus now defaults')
  assertIncludes(welcomeAndModel.clean, 'SwitchbetweenOpenAImodels')
  assertIncludesAll(welcomeAndModel.clean, [
    'GPT-5.5',
    'GPT-5.4',
    'GPT-5.4Mini',
    'GPT-5.4Nano',
    'GPT-5.3Codex',
  ])
  assertExcludesAll(welcomeAndModel.clean, ['Sonnet', 'Opus', 'Haiku'])
  console.log('smoke:codex-tui welcome and OpenAI model picker ok')

  const permission = await runExpect(permissionScript(), 'permission-dialog')
  assertIncludes(permission.clean, 'interactive permission prompt')
  assertIncludesAll(permission.clean, ['Bash', 'command', 'proceed?'])
  assertIncludesIgnoringWhitespace(permission.clean, 'hello from codex')
  const bashOutput = await readFile(bashOutputPath, 'utf8')
  assert(bashOutput === 'permission-ok', 'Bash permission command did not run')
  assertToolRoundtrip({
    callId: 'call_tui_bash',
    toolName: 'Bash',
    requestNeedle: 'interactive permission prompt',
    resultNeedle: 'permission-ok',
  })
  console.log('smoke:codex-tui permission dialog ok')

  const diff = await runExpect(diffScript(), 'edit-diff')
  assertIncludes(diff.clean, 'interactive edit diff prompt')
  assertIncludesAll(diff.clean, ['Edit', 'diff-target.txt'])
  assertIncludes(diff.clean, 'before edit')
  assertIncludes(diff.clean, 'after edit')
  assertIncludesIgnoringWhitespace(diff.clean, 'hello from codex')
  assertToolRoundtrip({
    callId: 'call_tui_edit',
    toolName: 'Edit',
    requestNeedle: 'interactive edit diff prompt',
  })
  const editedFile = await readFile(editPath, 'utf8')
  assert(
    editedFile.includes('after edit'),
    `Edit smoke did not update file:\n${editedFile}`,
  )
  console.log('smoke:codex-tui edit diff preview ok')

  const config = await runExpect(configScript(), 'config-settings')
  assertIncludes(config.clean, 'Auto-compact')
  assertIncludes(config.clean, 'Search settings')
  assertIncludes(config.clean, 'No settings match')
  console.log('smoke:codex-tui config settings ok')

  const authError = await runExpect(
    authErrorScript(),
    'auth-error',
    {
      cwd: missingAuthWorkdir,
      env: {
        ...env,
        CLAUDE_CONFIG_DIR: join(missingAuthHome, 'chimera'),
        CHIMERA_CONFIG_HOME: missingAuthHome,
        HOME: missingAuthHome,
        PWD: missingAuthWorkdir,
        XDG_CONFIG_HOME: join(missingAuthHome, '.config'),
      },
    },
  )
  assertIncludesOneOf(authError.clean, ['Not authenticated', 'Not logged in'])
  assertIncludes(authError.clean, '/login')
  console.log('smoke:codex-tui auth error ok')

  const rateLimit = await runExpect(rateLimitScript(), 'rate-limit-error')
  assertIncludesIgnoringWhitespace(rateLimit.clean, 'rate limit')
  assertIncludes(rateLimit.clean, 'API Error')
  console.log('smoke:codex-tui rate limit error ok')

  const resume = await runExpect(resumeScript(), 'resume-picker')
  assertIncludesIgnoringWhitespace(resume.clean, 'Resume Session')
  assertIncludesIgnoringWhitespace(resume.clean, 'tui resume seed marker')
  console.log('smoke:codex-tui resume picker ok')

  console.log(`smoke:codex-tui snapshots written to ${snapshotsDir}`)
} finally {
  await server.stop(true)
  await rm(tempHome, { recursive: true, force: true })
  await rm(tempWorkdir, { recursive: true, force: true })
  await rm(missingAuthHome, { recursive: true, force: true })
  await rm(missingAuthWorkdir, { recursive: true, force: true })
}

function responseForRequest(body) {
  const text = JSON.stringify(body)

  if (text.includes('interactive rate limit prompt')) return rateLimitSse()
  if (isMainCodexTurn(text) && text.includes('tui resume seed marker')) {
    return textSse('tui resume seed response marker')
  }
  if (hasFunctionCallOutput(body, 'call_tui_edit')) {
    return textFixture
  }
  if (hasFunctionCallOutput(body, 'call_tui_edit_read')) {
    return editFixture
  }
  if (text.includes('function_call_output')) {
    return textFixture
  }

  if (isMainCodexTurn(text) && text.includes('interactive permission prompt')) {
    return bashFixture
  }

  if (isMainCodexTurn(text) && text.includes('interactive edit diff prompt')) {
    const count = mainTurnCounts.get('edit') ?? 0
    mainTurnCounts.set('edit', count + 1)
    return count === 0 ? editReadFixture : textFixture
  }

  return textFixture
}

function hasFunctionCallOutput(body, callId) {
  const input = Array.isArray(body?.input) ? body.input : []
  return input.some(
    item => item?.type === 'function_call_output' && item.call_id === callId,
  )
}

function isMainCodexTurn(text) {
  return (
    text.includes('currentDate') ||
    text.includes('Current date') ||
    text.includes('CWD:')
  )
}

async function writeAuthAndConfig() {
  await mkdir(dirname(authPath), { recursive: true, mode: 0o700 })
  await writeFile(
    authPath,
    JSON.stringify(
      {
        access_token: 'tui-smoke-access',
        refresh_token: 'tui-smoke-refresh',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'tui-smoke-account',
        email: 'tui-smoke@example.com',
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
          [normalizeConfigPath(root)]: trustedProjectConfig(),
          [normalizeConfigPath(realRoot)]: trustedProjectConfig(),
          [normalizeConfigPath(tempWorkdir)]: trustedProjectConfig(),
        },
      },
      null,
      2,
    ),
  )
}

async function writeTrustedConfigOnly(home, workdir) {
  const configDir = join(home, 'chimera')
  await mkdir(configDir, { recursive: true, mode: 0o700 })
  await writeFile(
    join(configDir, '.chimera.json'),
    JSON.stringify(
      {
        theme: 'dark',
        hasCompletedOnboarding: true,
        projects: {
          [normalizeConfigPath(workdir)]: trustedProjectConfig(),
        },
      },
      null,
      2,
    ),
  )
}

async function writeFixtures() {
  await writeFile(editPath, 'top\nbefore edit\nbottom\n')
}

function trustedProjectConfig() {
  return {
    hasCompletedProjectOnboarding: true,
    hasTrustDialogAccepted: true,
  }
}

async function seedResumeSession() {
  const proc = Bun.spawn({
    cmd: [
      'bun',
      chimeraBin,
      '-p',
      'tui resume seed marker',
      '--bare',
      '--tools',
      '',
      '--output-format',
      'text',
    ],
    cwd: tempWorkdir,
    env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    withTimeout(proc.exited, 60_000, 'resume seed timed out', () =>
      proc.kill(),
    ),
  ])

  assert(exitCode === 0, `resume seed exited ${exitCode}\n${stdout}\n${stderr}`)
  assert(
    stdout.includes('tui resume seed response marker'),
    `resume seed stdout did not include response marker:\n${stdout}`,
  )
  assert(stderr === '', `unexpected resume seed stderr:\n${stderr}`)
}

async function runExpect(script, name, options = {}) {
  const proc = Bun.spawn({
    cmd: ['/usr/bin/expect', '-c', script],
    cwd: options.cwd ?? tempWorkdir,
    env: options.env ?? env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    withTimeout(proc.exited, 60_000, `${name} timed out`, () => proc.kill()),
  ])

  const clean = stripAnsi(stdout).replace(/\r/g, '')
  await writeFile(join(snapshotsDir, `${name}.txt`), clean)

  if (exitCode !== 0 || stderr !== '') {
    throw new Error(
      [
        `${name} exited ${exitCode}`,
        `stdout:\n${clean}`,
        `stderr:\n${stderr}`,
      ].join('\n'),
    )
  }

  return { stdout, clean }
}

function welcomeAndModelPickerScript() {
  return [
    'set timeout 35',
    'log_user 1',
    'spawn bun ' + tclQuote(chimeraBin) + ' --bare',
    'expect {',
    '  -re {>} { }',
    '  timeout { exit 2 }',
    '}',
    'send "/model\\r"',
    'expect {',
    '  -re {GPT-5\\.5} { }',
    '  timeout { exit 3 }',
    '}',
    'after 500',
    'send "\\033"',
    'after 500',
    'send "\\003"',
    'after 500',
    'send "\\003"',
    'expect eof',
    '',
  ].join('\n')
}

function permissionScript() {
  return [
    'set timeout 35',
    'log_user 1',
    'spawn bun ' + tclQuote(chimeraBin) + ' --bare --tools "Bash"',
    'after 3000',
    'send "interactive permission prompt\\r"',
    'expect {',
    '  -re {proceed\\?} { }',
    '  timeout { exit 2 }',
    '}',
    'send "\\r"',
    'after 8000',
    'send "\\003"',
    'after 500',
    'send "\\003"',
    'expect eof',
    '',
  ].join('\n')
}

function diffScript() {
  return [
    'set timeout 40',
    'log_user 1',
    'spawn bun ' + tclQuote(chimeraBin) + ' --bare --tools "Read,Edit"',
    'after 3000',
    'send "interactive edit diff prompt\\r"',
    'expect {',
    '  -re {after edit} { }',
    '  timeout { exit 2 }',
    '}',
    'send "\\r"',
    'after 8000',
    'send "\\003"',
    'after 500',
    'send "\\003"',
    'expect eof',
    '',
  ].join('\n')
}

function configScript() {
  return [
    'set timeout 35',
    'log_user 1',
    'spawn bun ' + tclQuote(chimeraBin) + ' --bare',
    'after 3000',
    'send "/config\\r"',
    'expect {',
    '  -re {Auto-compact} { }',
    '  timeout { exit 2 }',
    '}',
    'send "/legacy-claude-setting"',
    'expect {',
    '  -re {No settings match} { }',
    '  timeout { exit 3 }',
    '}',
    'after 500',
    'send "\\033"',
    'after 500',
    'send "\\003"',
    'after 500',
    'send "\\003"',
    'expect eof',
    '',
  ].join('\n')
}

function authErrorScript() {
  return [
    'set timeout 35',
    'log_user 1',
    'spawn bun ' + tclQuote(chimeraBin) + ' --bare --tools ""',
    'after 3000',
    'send "interactive missing auth prompt\\r"',
    'expect {',
    '  -re {(/login|Not authenticated|Not logged in)} { }',
    '  timeout { exit 2 }',
    '}',
    'after 500',
    'send "\\003"',
    'after 500',
    'send "\\003"',
    'expect eof',
    '',
  ].join('\n')
}

function rateLimitScript() {
  return [
    'set timeout 35',
    'log_user 1',
    'spawn bun ' + tclQuote(chimeraBin) + ' --bare --tools ""',
    'after 3000',
    'send "interactive rate limit prompt\\r"',
    'expect {',
    '  -re {(API Error|rate limit reached|Codex rate limit)} { }',
    '  timeout { exit 2 }',
    '}',
    'after 500',
    'send "\\003"',
    'after 500',
    'send "\\003"',
    'expect eof',
    '',
  ].join('\n')
}

function resumeScript() {
  return [
    'set timeout 35',
    'log_user 1',
    'spawn bun ' + tclQuote(chimeraBin) + ' --bare --tools ""',
    'after 3000',
    'send "/resume\\r"',
    'expect {',
    '  -re {Search} { }',
    '  timeout { exit 2 }',
    '}',
    'after 500',
    'send "\\033"',
    'after 500',
    'send "\\003"',
    'after 500',
    'send "\\003"',
    'expect eof',
    '',
  ].join('\n')
}

function assertToolRoundtrip({
  callId,
  toolName,
  requestNeedle,
  resultNeedle,
}) {
  const requestWithPrompt = requests.some(request =>
    JSON.stringify(request).includes(requestNeedle),
  )
  assert(
    requestWithPrompt,
    `mock Codex server did not receive prompt: ${requestNeedle}`,
  )

  const resultRequest = requests.find(request => {
    const text = JSON.stringify(request)
    return text.includes('function_call_output') && text.includes(callId)
  })
  assert(resultRequest, `no function_call_output request for ${callId}`)
  const resultText = JSON.stringify(resultRequest)
  assert(
    resultText.includes(toolName),
    `function_call_output request did not preserve ${toolName} call history`,
  )
  if (resultNeedle !== undefined) {
    assert(
      resultText.includes(resultNeedle),
      `function_call_output request did not contain tool result: ${resultNeedle}`,
    )
  }
  assert(
    !resultText.includes('InputValidationError'),
    'function_call_output request included a tool input validation error',
  )
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
      item: { type: 'message', id: 'out_text' },
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

function rateLimitSse() {
  return [
    'event: codex.rate_limits',
    `data: ${JSON.stringify({
      type: 'codex.rate_limits',
      rate_limits: {
        limit_reached: true,
        primary: { reset_after_seconds: 7 },
      },
    })}`,
    '',
  ].join('\n')
}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function tclQuote(value) {
  return `{${value.replace(/[{}\\]/g, match => `\\${match}`)}}`
}

function normalizeConfigPath(path) {
  return path.replace(/\\/g, '/')
}

function assertIncludes(output, needle) {
  assert(output.includes(needle), `output did not include ${needle}\n${output}`)
}

function assertIncludesAll(output, needles) {
  for (const needle of needles) assertIncludes(output, needle)
}

function assertIncludesOneOf(output, needles) {
  assert(
    needles.some(needle => output.includes(needle)),
    `output did not include any of ${needles.join(', ')}\n${output}`,
  )
}

function assertIncludesIgnoringWhitespace(output, needle) {
  const compactOutput = output.replace(/\s+/g, '')
  const compactNeedle = needle.replace(/\s+/g, '')
  assert(
    compactOutput.includes(compactNeedle),
    `output did not include ${needle} ignoring whitespace\n${output}`,
  )
}

function assertExcludes(output, needle) {
  assert(!output.includes(needle), `output included ${needle}\n${output}`)
}

function assertExcludesAll(output, needles) {
  for (const needle of needles) assertExcludes(output, needle)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
