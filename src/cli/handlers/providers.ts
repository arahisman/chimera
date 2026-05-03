import { emitKeypressEvents } from 'readline'
import { createInterface } from 'readline/promises'
import {
  buildProviderApiKeyRemovalSettings,
  buildProviderApiKeySettings,
  formatAuthProviderList,
  formatProviderList,
  resolveAuthProviderChoice,
  resolveProviderChoice,
  type AuthProviderChoice,
} from '../../services/providers/configure.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'

export function listProviders(): void {
  const rows = formatProviderList()
  process.stdout.write(
    [
      `External providers (${rows.length})`,
      'Use models as provider/model, for example openrouter/openai/gpt-5.4.',
      'Run `chimera providers configure` to save an API key.',
      '',
      ...rows,
    ].join('\n') + '\n',
  )
}

export async function configureProviderApiKey(options: {
  provider?: string
  apiKey?: string
}): Promise<void> {
  const providerChoice =
    options.provider ??
    (await promptProviderChoice())
  const provider = resolveProviderChoice(providerChoice)

  if (!provider) {
    process.stderr.write(
      `Unknown provider "${providerChoice}". Run \`chimera providers\` to list available providers.\n`,
    )
    process.exit(1)
    return
  }

  const apiKey = (options.apiKey ?? (await promptSecret(
    `API key for ${provider.name}: `,
  ))).trim()

  if (!apiKey) {
    process.stderr.write('API key cannot be empty.\n')
    process.exit(1)
    return
  }

  const currentSettings = getSettingsForSource('userSettings') ?? {}
  const result = updateSettingsForSource(
    'userSettings',
    buildProviderApiKeySettings(currentSettings, provider.id, apiKey),
  )

  if (result.error) {
    process.stderr.write(`Failed to update settings: ${result.error.message}\n`)
    process.exit(1)
    return
  }

  process.stdout.write(
    [
      `Configured ${provider.name} (${provider.id}).`,
      `Use it with: chimera --model ${provider.id}/<model-id>`,
    ].join('\n') + '\n',
  )
}

export async function resolveCliAuthProviderChoice(
  provider?: string,
): Promise<AuthProviderChoice> {
  const providerChoice = provider ?? (await promptAuthProviderChoice())
  const choice = resolveAuthProviderChoice(providerChoice)

  if (!choice) {
    process.stderr.write(
      `Unknown auth provider "${providerChoice}". Run \`chimera providers\` to list external providers.\n`,
    )
    process.exit(1)
  }

  return choice
}

export async function loginExternalProviderApiKey(options: {
  provider: string
  apiKey?: string
}): Promise<void> {
  await configureProviderApiKey(options)
}

export async function logoutExternalProviderApiKey(options: {
  provider: string
}): Promise<void> {
  const provider = resolveProviderChoice(options.provider)

  if (!provider) {
    process.stderr.write(
      `Unknown provider "${options.provider}". Run \`chimera providers\` to list available providers.\n`,
    )
    process.exit(1)
    return
  }

  const currentSettings = getSettingsForSource('userSettings') ?? {}
  const result = updateSettingsForSource(
    'userSettings',
    buildProviderApiKeyRemovalSettings(currentSettings, provider.id),
  )

  if (result.error) {
    process.stderr.write(`Failed to update settings: ${result.error.message}\n`)
    process.exit(1)
    return
  }

  process.stdout.write(`Removed saved API key for ${provider.name} (${provider.id}).\n`)
}

export function listAuthProviders(): void {
  const rows = formatAuthProviderList()
  process.stdout.write(
    [
      `Authentication providers (${rows.length})`,
      'Choose codex for ChatGPT/Codex OAuth, or an external provider for API-key auth.',
      '',
      ...rows,
    ].join('\n') + '\n',
  )
}

async function promptProviderChoice(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write(
      'Provider is required in non-interactive mode. Example: chimera providers configure openai --api-key sk-...\n',
    )
    process.exit(1)
    return ''
  }

  listProviders()
  return promptLine('Choose provider by number or ID: ')
}

async function promptAuthProviderChoice(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write(
      'Provider is required in non-interactive mode. Example: chimera login codex or chimera login openai --api-key sk-...\n',
    )
    process.exit(1)
    return ''
  }

  listAuthProviders()
  return promptLine('Choose provider by number or ID: ')
}

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    return await rl.question(question)
  } finally {
    rl.close()
  }
}

async function promptSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return promptLine(question)
  }

  process.stdout.write(question)
  emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)

  return await new Promise((resolve, reject) => {
    let value = ''
    const cleanup = () => {
      process.stdin.setRawMode(false)
      process.stdin.off('keypress', onKeypress)
      process.stdout.write('\n')
    }
    const onKeypress = (str: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') {
        cleanup()
        reject(new Error('Interrupted'))
        return
      }
      if (key.name === 'return' || key.name === 'enter') {
        cleanup()
        resolve(value)
        return
      }
      if (key.name === 'backspace' || key.name === 'delete') {
        value = value.slice(0, -1)
        return
      }
      if (str) {
        value += str
      }
    }
    process.stdin.on('keypress', onKeypress)
  })
}
