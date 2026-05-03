#!/usr/bin/env bun
import { serve } from 'bun'
import { existsSync } from 'fs'
import { mkdir, mkdtemp, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const root = process.cwd()
const tempHome = await mkdtemp(join(tmpdir(), 'chimera-login-smoke-'))
const authPath = join(tempHome, 'chimera/codex/auth.json')
const callbackPort = await reservePort()

let authorizeCount = 0
let tokenExchangeCount = 0
let deviceUserCodeCount = 0
let devicePollCount = 0

const issuerServer = serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === '/oauth/authorize') {
      authorizeCount += 1
      assert(
        url.searchParams.get('client_id') === 'smoke-client',
        'browser authorize did not use smoke client id',
      )
      assert(
        url.searchParams.get('codex_cli_simplified_flow') === 'true',
        'browser authorize missed codex simplified flow flag',
      )
      const redirectUri = url.searchParams.get('redirect_uri')
      assert(redirectUri, 'browser authorize missed redirect_uri')
      const redirect = new URL(redirectUri)
      redirect.searchParams.set('code', 'browser-code')
      redirect.searchParams.set('state', url.searchParams.get('state') ?? '')
      return Response.redirect(redirect.toString(), 302)
    }

    if (url.pathname === '/api/accounts/deviceauth/usercode') {
      deviceUserCodeCount += 1
      const body = await req.json()
      assert(
        body.client_id === 'smoke-client',
        'device usercode did not use smoke client id',
      )
      return Response.json({
        device_auth_id: 'smoke-device-auth',
        user_code: 'SMOKE-DEVICE',
        interval: 1,
      })
    }

    if (url.pathname === '/api/accounts/deviceauth/token') {
      devicePollCount += 1
      const body = await req.json()
      assert(
        body.device_auth_id === 'smoke-device-auth',
        'device poll used unexpected device_auth_id',
      )
      assert(
        body.user_code === 'SMOKE-DEVICE',
        'device poll used unexpected user_code',
      )
      return Response.json({
        authorization_code: 'device-code',
        code_verifier: 'device-verifier',
      })
    }

    if (url.pathname === '/oauth/token') {
      tokenExchangeCount += 1
      const form = await req.formData()
      const code = String(form.get('code') ?? '')
      assert(
        form.get('client_id') === 'smoke-client',
        'token exchange did not use smoke client id',
      )
      assert(
        code === 'browser-code' || code === 'device-code',
        `unexpected token exchange code: ${code}`,
      )
      if (code === 'browser-code') {
        assert(
          form.get('redirect_uri') ===
            `http://localhost:${callbackPort}/auth/callback`,
          'browser token exchange used unexpected redirect_uri',
        )
      } else {
        assert(
          form.get('redirect_uri') === `${issuer}/deviceauth/callback`,
          'device token exchange used unexpected redirect_uri',
        )
      }

      const email =
        code === 'browser-code'
          ? 'browser-smoke@example.com'
          : 'device-smoke@example.com'
      return Response.json({
        access_token: jwt({
          chatgpt_account_id: `${code}-account`,
          email,
        }),
        refresh_token: `${code}-refresh`,
        id_token: jwt({
          chatgpt_account_id: `${code}-account`,
          email,
        }),
        expires_in: 3600,
      })
    }

    return new Response('not found', { status: 404 })
  },
})

const issuer = issuerServer.url.toString().replace(/\/$/, '')

const env = {
  ...process.env,
  BROWSER: process.platform === 'win32' ? 'cmd' : '/usr/bin/true',
  CHIMERA_CONFIG_HOME: tempHome,
  CHIMERA_OAUTH_CLIENT_ID: 'smoke-client',
  CHIMERA_OAUTH_ISSUER: issuer,
  CHIMERA_OAUTH_PORT: String(callbackPort),
  CLAUDE_CONFIG_DIR: join(tempHome, 'chimera'),
  HOME: tempHome,
  XDG_CONFIG_HOME: join(tempHome, '.config'),
}

try {
  await mkdir(dirname(authPath), { recursive: true, mode: 0o700 })

  const browser = await runCodex(['login'], {
    onStdout(text, state) {
      const match = text.match(/visit: (https?:\/\/\S+)/)
      if (!match || state.browserCallbackStarted) return
      state.browserCallbackStarted = true
      state.pending.push(
        fetch(match[1], { redirect: 'follow' }).then(response => {
          assert(
            response.ok,
            `browser callback fetch failed: ${response.status}`,
          )
          return response.text()
        }),
      )
    },
  })
  assert(
    browser.stdout.includes('Login successful as browser-smoke@example.com.'),
    'browser login did not report expected account',
  )
  await assertAuthFile({
    email: 'browser-smoke@example.com',
    accountId: 'browser-code-account',
  })
  await assertStatus('browser-smoke@example.com')
  console.log('smoke:codex-login browser flow ok')

  const browserLogout = await runCodex(['logout'])
  assert(
    browserLogout.stdout.includes(
      'Successfully logged out from your ChatGPT account.',
    ),
    'logout did not report success after browser login',
  )
  assert(!existsSync(authPath), 'logout did not remove browser auth file')

  const device = await runCodex(['login', '--device'])
  assert(
    device.stdout.includes(`${issuer}/codex/device`) &&
      device.stdout.includes('SMOKE-DEVICE'),
    'device login did not print verification URI and code',
  )
  assert(
    device.stdout.includes('Login successful as device-smoke@example.com.'),
    'device login did not report expected account',
  )
  await assertAuthFile({
    email: 'device-smoke@example.com',
    accountId: 'device-code-account',
  })
  await assertStatus('device-smoke@example.com')
  console.log('smoke:codex-login device flow ok')

  const deviceLogout = await runCodex(['logout'])
  assert(
    deviceLogout.stdout.includes(
      'Successfully logged out from your ChatGPT account.',
    ),
    'logout did not report success after device login',
  )
  assert(!existsSync(authPath), 'logout did not remove device auth file')
  console.log('smoke:codex-login logout ok')

  assert(authorizeCount === 1, `expected 1 authorize request, got ${authorizeCount}`)
  assert(
    tokenExchangeCount === 2,
    `expected 2 token exchanges, got ${tokenExchangeCount}`,
  )
  assert(
    deviceUserCodeCount === 1,
    `expected 1 device usercode request, got ${deviceUserCodeCount}`,
  )
  assert(devicePollCount === 1, `expected 1 device poll, got ${devicePollCount}`)
} finally {
  await issuerServer.stop(true)
  await rm(tempHome, { recursive: true, force: true })
}

async function runCodex(args, options = {}) {
  const state = { browserCallbackStarted: false, pending: [] }
  const proc = Bun.spawn({
    cmd: ['bun', 'dist/chimera.js', ...args],
    cwd: root,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  let stdout = ''
  let stderr = ''
  const stdoutTask = readText(proc.stdout, text => {
    stdout += text
    options.onStdout?.(stdout, state)
  })
  const stderrTask = readText(proc.stderr, text => {
    stderr += text
  })
  const exitCode = await withTimeout(
    proc.exited,
    20_000,
    `chimera ${args.join(' ')} timed out`,
    () => proc.kill(),
  )
  await Promise.all([stdoutTask, stderrTask, ...state.pending])

  if (exitCode !== 0) {
    throw new Error(
      [
        `chimera ${args.join(' ')} exited ${exitCode}`,
        `stdout:\n${stdout}`,
        `stderr:\n${stderr}`,
      ].join('\n'),
    )
  }

  return { stdout, stderr }
}

async function assertAuthFile({ email, accountId }) {
  const info = await stat(authPath)
  assert(
    (info.mode & 0o777) === 0o600,
    `auth file mode was ${(info.mode & 0o777).toString(8)}, expected 600`,
  )
  const tokens = JSON.parse(await readFile(authPath, 'utf8'))
  assert(tokens.email === email, `expected auth email ${email}`)
  assert(tokens.account_id === accountId, `expected account id ${accountId}`)
  assert(
    typeof tokens.access_token === 'string' && tokens.access_token.length > 0,
    'auth file missed access_token',
  )
  assert(
    typeof tokens.refresh_token === 'string' && tokens.refresh_token.length > 0,
    'auth file missed refresh_token',
  )
}

async function assertStatus(email) {
  const status = await runCodex(['auth', 'status', '--json'])
  const body = JSON.parse(status.stdout)
  assert(body.loggedIn === true, 'auth status did not report loggedIn true')
  assert(body.authMethod === 'chatgpt', 'auth status did not report chatgpt')
  assert(body.email === email, `auth status email was ${body.email}`)
}

async function readText(stream, onText) {
  const decoder = new TextDecoder()
  for await (const chunk of stream) {
    onText(decoder.decode(chunk))
  }
}

async function reservePort() {
  const server = serve({
    port: 0,
    fetch() {
      return new Response('reserved')
    },
  })
  const port = Number(new URL(server.url).port)
  await server.stop(true)
  return port
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

function jwt(claims) {
  return [
    base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' })),
    base64Url(JSON.stringify(claims)),
    'signature',
  ].join('.')
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
