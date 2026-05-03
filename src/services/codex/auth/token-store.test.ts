import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  clearCodexTokens,
  codexAuthPath,
  hasCodexTokensSync,
  loadCodexTokens,
  loadCodexTokensSync,
  saveCodexTokens,
  type CodexTokens,
} from './token-store.js'

let previousConfigHome: string | undefined
let tempDir: string

const tokens: CodexTokens = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_at: 123,
  account_id: 'acct_1',
  email: 'dev@example.com',
}

beforeEach(async () => {
  previousConfigHome = process.env.CHIMERA_CONFIG_HOME
  tempDir = await mkdtemp(join(tmpdir(), 'codex-auth-test-'))
  process.env.CHIMERA_CONFIG_HOME = tempDir
})

afterEach(async () => {
  if (previousConfigHome === undefined) {
    delete process.env.CHIMERA_CONFIG_HOME
  } else {
    process.env.CHIMERA_CONFIG_HOME = previousConfigHome
  }
  await rm(tempDir, { recursive: true, force: true })
})

describe('chimera token store', () => {
  test('tolerates missing auth file', async () => {
    expect(await loadCodexTokens()).toBeUndefined()
  })

  test('writes and reads auth file with 0600 permissions', async () => {
    await saveCodexTokens(tokens)

    expect(codexAuthPath()).toBe(
      join(tempDir, 'chimera', 'codex', 'auth.json'),
    )
    expect(await loadCodexTokens()).toEqual(tokens)
    expect(loadCodexTokensSync()).toEqual(tokens)
    expect(hasCodexTokensSync()).toBe(true)
    expect((await stat(codexAuthPath())).mode & 0o777).toBe(0o600)
  })

  test('clears auth file and ignores missing file', async () => {
    await saveCodexTokens(tokens)
    await clearCodexTokens()
    await clearCodexTokens()

    expect(await loadCodexTokens()).toBeUndefined()
    expect(loadCodexTokensSync()).toBeUndefined()
    expect(hasCodexTokensSync()).toBe(false)
  })
})
