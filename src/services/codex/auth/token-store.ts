import { readFileSync } from 'fs'
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

export type CodexTokens = {
  id_token?: string
  access_token: string
  refresh_token: string
  expires_at: number
  account_id?: string
  email?: string
}

function configHome(): string {
  return (
    process.env.CHIMERA_CONFIG_HOME ||
    process.env.CODEX_CODE_CONFIG_HOME ||
    process.env.XDG_CONFIG_HOME ||
    join(process.env.HOME || '.', '.config')
  )
}

export function codexAuthPath(): string {
  return join(configHome(), 'chimera', 'codex', 'auth.json')
}

function legacyCodexAuthPath(): string {
  return join(configHome(), 'codex-code', 'codex', 'auth.json')
}

export async function loadCodexTokens(): Promise<CodexTokens | undefined> {
  try {
    return JSON.parse(await readFile(codexAuthPath(), 'utf8')) as CodexTokens
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  try {
    return JSON.parse(
      await readFile(legacyCodexAuthPath(), 'utf8'),
    ) as CodexTokens
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

export function loadCodexTokensSync(): CodexTokens | undefined {
  for (const path of [codexAuthPath(), legacyCodexAuthPath()]) {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as CodexTokens
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return undefined
}

export function hasCodexTokensSync(): boolean {
  try {
    const tokens = loadCodexTokensSync()
    return Boolean(tokens?.access_token && tokens.refresh_token)
  } catch {
    return false
  }
}

export async function saveCodexTokens(tokens: CodexTokens): Promise<void> {
  const path = codexAuthPath()
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, JSON.stringify(tokens, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  })
  await rename(tmp, path)
  await chmod(path, 0o600)
}

export async function clearCodexTokens(): Promise<void> {
  try {
    await unlink(codexAuthPath())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
