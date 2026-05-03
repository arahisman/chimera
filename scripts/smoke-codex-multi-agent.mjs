#!/usr/bin/env bun
import { serve } from 'bun'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

const root = process.cwd()
const chimeraBin = join(root, 'dist/chimera.js')
const realRoot = await realpath(root)
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-multi-agent-smoke-'))
const codexConfigDir = join(tempHome, 'chimera')
const authPath = join(tempHome, 'chimera/codex/auth.json')
const requests = []

const scenarios = [
  {
    id: 'general',
    label: 'general-purpose subagent',
    parent: 'multi agent parent general marker',
    child: 'multi agent child general marker',
    childResponse: 'multi agent child general response',
    final: 'multi agent final general marker',
    tools: ['Agent'],
    allowedTools: ['Agent'],
    args: {
      description: 'General smoke',
      prompt:
        'multi agent child general marker: respond with exactly multi agent child general response.',
      subagent_type: 'general-purpose',
      run_in_background: false,
    },
    assertChild(request) {
      assertSystemPromptIncludes(request, 'You are an agent for Chimera')
      assertToolAbsent(request, 'Agent')
    },
  },
  {
    id: 'explore',
    label: 'Explore subagent',
    parent: 'multi agent parent explore marker',
    child: 'multi agent child explore marker',
    childResponse: 'multi agent child explore response',
    final: 'multi agent final explore marker',
    tools: ['Agent', 'Bash', 'Read', 'Glob', 'Grep', 'Edit', 'Write'],
    allowedTools: ['Agent', 'Bash', 'Read', 'Glob', 'Grep', 'Edit', 'Write'],
    args: {
      description: 'Explore smoke',
      prompt:
        'multi agent child explore marker: respond with exactly multi agent child explore response.',
      subagent_type: 'Explore',
      run_in_background: false,
    },
    assertChild(request) {
      assertSystemPromptIncludes(request, 'file search specialist for Chimera')
      assertToolPresent(request, 'Read')
      assertToolPresent(request, 'Glob')
      assertToolPresent(request, 'Grep')
      assertToolAbsent(request, 'Agent')
      assertToolAbsent(request, 'Edit')
      assertToolAbsent(request, 'Write')
    },
  },
  {
    id: 'plan',
    label: 'Plan subagent',
    parent: 'multi agent parent plan marker',
    child: 'multi agent child plan marker',
    childResponse: 'multi agent child plan response',
    final: 'multi agent final plan marker',
    tools: ['Agent', 'Bash', 'Read', 'Glob', 'Grep', 'Edit', 'Write'],
    allowedTools: ['Agent', 'Bash', 'Read', 'Glob', 'Grep', 'Edit', 'Write'],
    args: {
      description: 'Plan smoke',
      prompt:
        'multi agent child plan marker: respond with exactly multi agent child plan response.',
      subagent_type: 'Plan',
      run_in_background: false,
    },
    assertChild(request) {
      assertSystemPromptIncludes(request, 'planning specialist for Chimera')
      assertToolPresent(request, 'Read')
      assertToolPresent(request, 'Glob')
      assertToolPresent(request, 'Grep')
      assertToolAbsent(request, 'Agent')
      assertToolAbsent(request, 'Edit')
      assertToolAbsent(request, 'Write')
    },
  },
  {
    id: 'custom',
    label: 'custom agent from settings with tool restrictions',
    parent: 'multi agent parent custom marker',
    child: 'multi agent child custom marker',
    childResponse: 'multi agent child custom response',
    final: 'multi agent final custom marker',
    tools: ['Agent', 'Bash', 'Read', 'Glob', 'Grep', 'Edit', 'Write'],
    allowedTools: ['Agent', 'Bash', 'Read', 'Glob', 'Grep', 'Edit', 'Write'],
    args: {
      description: 'Custom smoke',
      prompt:
        'multi agent child custom marker: respond with exactly multi agent child custom response.',
      subagent_type: 'custom-codex-smoke',
      run_in_background: false,
    },
    agents: {
      'custom-codex-smoke': {
        description: 'Custom Codex smoke agent loaded from settings',
        prompt: [
          'You are a custom Chimera smoke agent.',
          'CUSTOM_CODEX_AGENT_SYSTEM_MARKER',
        ].join('\n'),
        model: 'gpt-5.4-mini',
        tools: ['Read'],
      },
    },
    assertChild(request) {
      assert(request.model === 'gpt-5.4-mini', `custom agent used ${request.model}`)
      assertSystemPromptIncludes(request, 'CUSTOM_CODEX_AGENT_SYSTEM_MARKER')
      assertToolPresent(request, 'Read')
      assertToolAbsent(request, 'Agent')
      assertToolAbsent(request, 'Bash')
      assertToolAbsent(request, 'Edit')
      assertToolAbsent(request, 'Write')
    },
  },
  {
    id: 'override-model',
    label: 'agent-specific OpenAI model override',
    parent: 'multi agent parent override model marker',
    child: 'multi agent child override model marker',
    childResponse: 'multi agent child override model response',
    final: 'multi agent final override model marker',
    tools: ['Agent'],
    allowedTools: ['Agent'],
    args: {
      description: 'Override model smoke',
      prompt:
        'multi agent child override model marker: respond with exactly multi agent child override model response.',
      subagent_type: 'general-purpose',
      model: 'gpt-5.4-mini',
      run_in_background: false,
    },
    assertChild(request) {
      assert(request.model === 'gpt-5.4-mini', `override agent used ${request.model}`)
      assertSystemPromptIncludes(request, 'You are an agent for Chimera')
    },
  },
  {
    id: 'reject-alias',
    label: 'Anthropic alias rejection',
    parent: 'multi agent parent reject alias marker',
    final: 'multi agent final reject alias marker',
    tools: ['Agent'],
    allowedTools: ['Agent'],
    args: {
      description: 'Reject alias smoke',
      prompt:
        'multi agent child reject alias marker: this child must not be requested.',
      subagent_type: 'general-purpose',
      model: 'sonnet',
      run_in_background: false,
    },
    assertNoChild: true,
    assertToolOutput(text) {
      assert(text.includes('sonnet'), 'alias rejection output did not mention sonnet')
      assert(
        text.includes('gpt-5.5') || text.includes('gpt-5.4'),
        'alias rejection output did not mention OpenAI model ids',
      )
    },
  },
]

const scenarioById = new Map(scenarios.map(scenario => [scenario.id, scenario]))

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
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
  CLAUDE_CONFIG_DIR: codexConfigDir,
  CHIMERA_API_ENDPOINT: new URL('/codex/responses', server.url).toString(),
  CHIMERA_BUNDLE_FEATURE_BUILTIN_EXPLORE_PLAN_AGENTS: 'true',
  CHIMERA_CONFIG_HOME: tempHome,
  CHIMERA_SKIP_VERSION_CHECK: '1',
  COLUMNS: '120',
  HOME: tempHome,
  LINES: '40',
  TERM: 'xterm-256color',
  XDG_CONFIG_HOME: join(tempHome, '.config'),
}

try {
  await writeAuthAndConfig()

  for (const scenario of scenarios) {
    const result = await runCommand([
      'bun',
      chimeraBin,
      '-p',
      scenario.parent,
      '--tools',
      scenario.tools.join(','),
      '--allowed-tools',
      scenario.allowedTools.join(','),
      ...(scenario.agents ? ['--agents', JSON.stringify(scenario.agents)] : []),
      '--output-format',
      'text',
    ])

    assert(
      result.stdout === `${scenario.final}\n`,
      `${scenario.label} stdout mismatch: ${JSON.stringify(result.stdout)}`,
    )
    assert(result.stderr === '', `${scenario.label} stderr: ${result.stderr}`)
    assertScenarioRoundtrip(scenario)
  }

  await assertTranscriptContains()
  console.log('smoke:codex-multi-agent built-in, custom, model, and nesting checks ok')
} finally {
  await server.stop(true)
  await rm(tempHome, { recursive: true, force: true })
}

async function writeAuthAndConfig() {
  await mkdir(dirname(authPath), { recursive: true, mode: 0o700 })
  await writeFile(
    authPath,
    JSON.stringify(
      {
        access_token: 'multi-agent-smoke-access',
        refresh_token: 'multi-agent-smoke-refresh',
        expires_at: Date.now() + 60 * 60_000,
        account_id: 'multi-agent-smoke-account',
        email: 'multi-agent-smoke@example.com',
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )

  await mkdir(codexConfigDir, { recursive: true, mode: 0o700 })
  await mkdir(join(codexConfigDir, 'agents'), { recursive: true, mode: 0o700 })
  await writeFile(
    join(codexConfigDir, 'agents', 'custom-codex-smoke.md'),
    [
      '---',
      'name: custom-codex-smoke',
      'description: Custom Codex smoke agent loaded from settings',
      'model: gpt-5.4-mini',
      'tools: Read',
      '---',
      'You are a custom Chimera smoke agent.',
      'CUSTOM_CODEX_AGENT_SYSTEM_MARKER',
      '',
    ].join('\n'),
  )

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
  )
}

function responseForRequest(body) {
  const text = JSON.stringify(body)

  if (text.includes('function_call_output')) {
    const scenario = scenarios.find(item => text.includes(callIdFor(item)))
    if (scenario) {
      scenario.assertToolOutput?.(text)
      return textSse(scenario.final)
    }
  }

  const childScenario = scenarios.find(
    scenario => scenario.child && text.includes(scenario.child),
  )
  if (childScenario) {
    return textSse(childScenario.childResponse)
  }

  const parentScenario = scenarios.find(scenario => text.includes(scenario.parent))
  if (parentScenario) {
    return functionCallSse({
      callId: callIdFor(parentScenario),
      name: 'Agent',
      arguments: parentScenario.args,
    })
  }

  return textSse('unexpected codex multi-agent smoke request')
}

async function runCommand(cmd) {
  const proc = Bun.spawn({
    cmd,
    cwd: root,
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

function assertScenarioRoundtrip(scenario) {
  const parentRequest = findParentToolRequest(scenario)
  assert(
    parentRequest,
    `${scenario.label}: mock Codex server did not receive parent prompt`,
  )
  assertCodexAgentToolSchemaIsLocal(parentRequest)

  const resultRequest = requests.find(request => {
    const text = JSON.stringify(request)
    return text.includes('function_call_output') && text.includes(callIdFor(scenario))
  })
  assert(resultRequest, `${scenario.label}: no function_call_output request`)

  const resultText = JSON.stringify(resultRequest)
  assert(
    resultText.includes('Agent'),
    `${scenario.label}: function_call_output did not preserve Agent history`,
  )

  if (scenario.assertNoChild) {
    assert(
      !requests.some(request => {
        const text = JSON.stringify(request)
        return (
          text.includes(scenario.args.prompt) &&
          !text.includes('function_call_output') &&
          String(request.instructions ?? '').includes('Chimera agent')
        )
      }),
      `${scenario.label}: alias rejection unexpectedly launched a child agent`,
    )
    return
  }

  const childRequest = requests.find(request => {
    const text = JSON.stringify(request)
    return text.includes(scenario.child) && !text.includes('function_call_output')
  })
  assert(childRequest, `${scenario.label}: no child request found\n${requestSummaries()}`)
  assert(
    resultText.includes(scenario.childResponse),
    `${scenario.label}: function_call_output did not include child response`,
  )
  assert(
    !resultText.includes('InputValidationError'),
    `${scenario.label}: function_call_output included a validation error`,
  )
  scenario.assertChild?.(childRequest)
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
  for (const scenario of scenarios) {
    for (const needle of [scenario.parent, callIdFor(scenario), scenario.final]) {
      assert(transcript.includes(needle), `transcript did not contain ${needle}`)
    }
    if (!scenario.assertNoChild) {
      for (const needle of [scenario.child, scenario.childResponse]) {
        assert(transcript.includes(needle), `transcript did not contain ${needle}`)
      }
    }
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

function findParentToolRequest(scenario) {
  return requests.find(request => {
    const text = JSON.stringify(request)
    return (
      text.includes(scenario.parent) &&
      !text.includes('function_call_output') &&
      (request.tools ?? []).some(tool => tool.name === 'Agent')
    )
  })
}

function assertCodexAgentToolSchemaIsLocal(request) {
  const agentTool = (request.tools ?? []).find(tool => tool.name === 'Agent')
  assert(agentTool, 'parent request did not expose Agent tool')
  const properties = agentTool.parameters?.properties ?? {}
  for (const hiddenParam of ['name', 'team_name', 'mode']) {
    assert(
      !Object.prototype.hasOwnProperty.call(properties, hiddenParam),
      `Codex Agent schema exposed ${hiddenParam}`,
    )
  }

  const schema = JSON.stringify(agentTool)
  for (const hiddenTerm of ['remote CCR', 'teammate_spawned']) {
    assert(!schema.includes(hiddenTerm), `Codex Agent schema exposed ${hiddenTerm}`)
  }
  const isolation = JSON.stringify(properties.isolation ?? {})
  assert(!isolation.includes('remote'), 'Codex Agent schema exposed remote isolation')
}

function toolNames(request) {
  return (request.tools ?? []).map(tool => tool.name).sort()
}

function assertToolPresent(request, toolName) {
  const names = toolNames(request)
  assert(
    names.includes(toolName),
    `expected ${toolName} in child tools, got ${names.join(', ') || '<none>'}`,
  )
}

function assertToolAbsent(request, toolName) {
  const names = toolNames(request)
  assert(
    !names.includes(toolName),
    `expected ${toolName} to be absent from child tools, got ${names.join(', ')}`,
  )
}

function assertSystemPromptIncludes(request, marker) {
  assert(
    String(request.instructions ?? '').includes(marker),
    `child instructions did not include ${marker}`,
  )
}

function requestSummaries() {
  return requests
    .map((request, index) => {
      const text = JSON.stringify(request)
      return `request ${index + 1}: ${text.slice(0, 2000)}`
    })
    .join('\n---\n')
}

function callIdFor(scenario) {
  const found = scenarioById.get(scenario.id)
  assert(found, `unknown scenario ${scenario.id}`)
  return `call_agent_${scenario.id.replace(/[^a-z0-9_]/gi, '_')}`
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
