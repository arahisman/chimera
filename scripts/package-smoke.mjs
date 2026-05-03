#!/usr/bin/env bun
import { existsSync } from 'fs'
import { mkdtemp, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const root = process.cwd()
const tempDir = await mkdtemp(join(tmpdir(), 'chimera-package-smoke-'))
const prefixDir = join(tempDir, 'prefix')
const homeDir = join(tempDir, 'home')
const packageJson = await Bun.file(join(root, 'package.json')).json()

try {
  await run({
    label: 'npm pack',
    cmd: ['npm', 'pack', '--pack-destination', tempDir],
    cwd: root,
  })

  const tarball = (await readdir(tempDir)).find(name =>
    /^chimera-.*\.tgz$/.test(name),
  )
  assert(tarball, 'npm pack did not create chimera-*.tgz')
  const tarballPath = join(tempDir, tarball)

  await run({
    label: 'npm install global prefix',
    cmd: [
      'npm',
      'install',
      '--prefix',
      prefixDir,
      '-g',
      tarballPath,
      '--no-audit',
      '--no-fund',
    ],
    cwd: tempDir,
  })

  const binPath = join(prefixDir, 'bin', 'chimera')
  assert(existsSync(binPath), 'global install did not create chimera bin')

  const env = {
    ...process.env,
    CLAUDE_CONFIG_DIR: join(homeDir, '.config', 'chimera'),
    CHIMERA_CONFIG_HOME: join(homeDir, '.config'),
    HOME: homeDir,
    XDG_CONFIG_HOME: join(homeDir, '.config'),
  }

  const version = await run({
    label: 'chimera --version',
    cmd: [binPath, '--version'],
    cwd: tempDir,
    env,
  })
  assert(
    version.stdout.trim() === `${packageJson.version} (Chimera)`,
    `unexpected version output: ${JSON.stringify(version.stdout)}`,
  )

  const help = await run({
    label: 'chimera --help',
    cmd: [binPath, '--help'],
    cwd: tempDir,
    env,
  })
  assert(help.stdout.includes('Chimera'), 'help output did not name Chimera')
  assert(help.stdout.includes('auth'), 'help output did not include auth command')

  const auth = await run({
    label: 'chimera auth status --json',
    cmd: [binPath, 'auth', 'status', '--json'],
    cwd: tempDir,
    env,
    allowedExitCodes: [0, 1],
  })
  const status = JSON.parse(auth.stdout)
  assert(status.loggedIn === false, 'isolated auth status should be logged out')
  assert(!('email' in status), 'logged-out auth status leaked email field')
  assert(!('accountId' in status), 'logged-out auth status leaked account id field')

  console.log(`smoke:codex-package ok (${tarball})`)
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function run({ label, cmd, cwd, env = process.env, allowedExitCodes = [0] }) {
  const proc = Bun.spawn({
    cmd,
    cwd,
    env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    withTimeout(proc.exited, 120_000, `${label} timed out`, () => proc.kill()),
  ])
  if (!allowedExitCodes.includes(exitCode)) {
    throw new Error(
      [
        `${label} failed: ${cmd.join(' ')} exited ${exitCode}`,
        `stdout:\n${stdout.slice(0, 4000)}`,
        `stderr:\n${stderr.slice(0, 4000)}`,
      ].join('\n'),
    )
  }
  return { stdout, stderr }
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

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
