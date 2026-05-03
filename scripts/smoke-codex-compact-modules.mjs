#!/usr/bin/env bun
import { spawn } from 'node:child_process'

const compactStubFragments = [
  'reactiveCompact.js',
  'cachedMicrocompact.js',
  'cachedMCConfig.js',
  'snipCompact.js',
  'snipProjection.js',
  'contextCollapse/index.js',
  'contextCollapse/operations.js',
  'contextCollapse/persist.js',
  'sessionTranscript/sessionTranscript.js',
  'tools/SnipTool/prompt.js',
  'tools/SnipTool/SnipTool.js',
  'tools/CtxInspectTool/CtxInspectTool.js',
  'commands/force-snip.js',
  'messages/SnipBoundaryMessage.js',
]

function runBuild() {
  return new Promise(resolve => {
    const child = spawn('bun', ['scripts/build.mjs'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
}

const result = await runBuild()
const output = `${result.stdout}\n${result.stderr}`

if (result.code !== 0) {
  console.error(output)
  throw new Error(`build failed with exit code ${result.code}`)
}

const leaked = compactStubFragments.filter(fragment => output.includes(fragment))

if (leaked.length > 0) {
  console.error(output)
  throw new Error(
    `compact/context modules still resolve through recovered stubs: ${leaked.join(', ')}`,
  )
}

console.log('compact/context modules resolve to local source files')
