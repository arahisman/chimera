import { feature } from 'bun:bundle'
import * as React from 'react'
import { useState } from 'react'
import { resetCostState } from '../../bootstrap/state.js'
import {
  clearTrustedDeviceToken,
  enrollTrustedDevice,
} from '../../bridge/trustedDevice.js'
import { isCodexFeatureEnabled } from '../../codex/featurePolicy.js'
import type { LocalJSXCommandContext } from '../../commands.js'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { Select } from '../../components/CustomSelect/select.js'
import { ConsoleOAuthFlow } from '../../components/ConsoleOAuthFlow.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import TextInput from '../../components/TextInput.js'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { Box, Text } from '../../ink.js'
import { refreshGrowthBookAfterAuthChange } from '../../services/analytics/growthbook.js'
import { refreshPolicyLimits } from '../../services/policyLimits/index.js'
import { refreshRemoteManagedSettings } from '../../services/remoteManagedSettings/index.js'
import { getProviderCatalog } from '../../services/providers/catalog.js'
import {
  buildProviderApiKeySettings,
  CODEX_AUTH_PROVIDER,
  resolveAuthProviderChoice,
  type AuthProviderChoice,
} from '../../services/providers/configure.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { stripSignatureBlocks } from '../../utils/messages.js'
import {
  checkAndDisableAutoModeIfNeeded,
  checkAndDisableBypassPermissionsIfNeeded,
  resetAutoModeGateCheck,
  resetBypassPermissionsCheck,
} from '../../utils/permissions/bypassPermissionsKillswitch.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'
import { resetUserCache } from '../../utils/user.js'

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const requestedProvider = args?.trim()

  return (
    <Login
      requestedProvider={requestedProvider}
      onDone={async success => {
        context.onChangeAPIKey()
        // Signature-bearing blocks are bound to credentials; strip stale ones.
        context.setMessages(stripSignatureBlocks)
        if (success) {
          resetCostState()
          void refreshRemoteManagedSettings()
          void refreshPolicyLimits()
          resetUserCache()
          refreshGrowthBookAfterAuthChange()
          if (isCodexFeatureEnabled('remote-bridge')) {
            clearTrustedDeviceToken()
            void enrollTrustedDevice()
          }
          resetBypassPermissionsCheck()
          const appState = context.getAppState()
          void checkAndDisableBypassPermissionsIfNeeded(
            appState.toolPermissionContext,
            context.setAppState,
          )
          if (feature('TRANSCRIPT_CLASSIFIER')) {
            resetAutoModeGateCheck()
            void checkAndDisableAutoModeIfNeeded(
              appState.toolPermissionContext,
              context.setAppState,
              appState.fastMode,
            )
          }
          context.setAppState(prev => ({
            ...prev,
            authVersion: prev.authVersion + 1,
          }))
        }
        onDone(success ? 'Login successful' : 'Login interrupted')
      }}
    />
  )
}

export function Login(props: {
  onDone: (success: boolean, mainLoopModel: string) => void
  requestedProvider?: string
  startingMessage?: string
}): React.ReactNode {
  const mainLoopModel = useMainLoopModel()
  const [selected, setSelected] = useState<AuthProviderChoice | null>(() => {
    if (!props.requestedProvider) return null
    return resolveAuthProviderChoice(props.requestedProvider) ?? null
  })
  const [apiKey, setApiKey] = useState('')
  const [apiKeyCursorOffset, setApiKeyCursorOffset] = useState(0)
  const [isPastingApiKey, setIsPastingApiKey] = useState(false)
  const [fatalError] = useState<string | null>(() =>
    props.requestedProvider && !resolveAuthProviderChoice(props.requestedProvider)
      ? `Unknown auth provider "${props.requestedProvider}".`
      : null,
  )
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)

  const cancel = () => props.onDone(false, mainLoopModel)
  const complete = () => props.onDone(true, mainLoopModel)

  let content: React.ReactNode
  if (fatalError) {
    content = (
      <Box flexDirection="column" gap={1} marginTop={1}>
        <Text color="error">{fatalError}</Text>
        <Text dimColor={true}>
          Choose codex for ChatGPT/Codex OAuth, or run /login with an external
          provider ID such as openai.
        </Text>
      </Box>
    )
  } else if (!selected) {
    const options = [
      {
        label: (
          <Text>
            {CODEX_AUTH_PROVIDER.name} ·{' '}
            <Text dimColor={true}>OAuth subscription login</Text>
          </Text>
        ),
        value: CODEX_AUTH_PROVIDER.id,
      },
      ...getProviderCatalog().map(provider => ({
        label: (
          <Text>
            {provider.name} · <Text dimColor={true}>{provider.id}</Text>
          </Text>
        ),
        value: provider.id,
      })),
    ]

    content = (
      <Box flexDirection="column" gap={1} marginTop={1}>
        <Text bold={true}>
          Choose codex for ChatGPT/Codex OAuth, or an external provider for
          API-key auth.
        </Text>
        <Select
          options={options}
          visibleOptionCount={8}
          onCancel={cancel}
          onChange={value => {
            setSelected(resolveAuthProviderChoice(value) ?? null)
            setApiKey('')
            setApiKeyCursorOffset(0)
            setApiKeyError(null)
          }}
        />
      </Box>
    )
  } else if (selected.kind === 'codex') {
    content = (
      <ConsoleOAuthFlow
        provider="codex"
        onDone={complete}
        startingMessage={
          props.startingMessage ??
          'Chimera can be used with your ChatGPT Plus, Pro, Team, or Enterprise subscription.'
        }
      />
    )
  } else {
    const provider = selected.provider
    const apiKeyInputColumns = Math.max(
      24,
      Math.min(80, (process.stdout.columns ?? 100) - 18),
    )

    const saveApiKey = (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) {
        setApiKeyError('API key cannot be empty.')
        return
      }
      const currentSettings = getSettingsForSource('userSettings') ?? {}
      const result = updateSettingsForSource(
        'userSettings',
        buildProviderApiKeySettings(currentSettings, provider.id, trimmed),
      )
      if (result.error) {
        setApiKeyError(`Failed to update settings: ${result.error.message}`)
        return
      }
      complete()
    }

    content = (
      <Box flexDirection="column" gap={1} marginTop={1}>
        <Text bold={true}>
          Save API key for {provider.name} ({provider.id})
        </Text>
        <Text dimColor={true}>
          Models from this provider use the provider/model format.
        </Text>
        {apiKeyError ? <Text color="error">{apiKeyError}</Text> : null}
        <Box flexDirection="column" gap={1}>
          <Text color="permission">API key</Text>
          <Box
            borderStyle="round"
            borderColor="permission"
            paddingX={1}
            minHeight={3}
          >
            <TextInput
              value={apiKey}
              onChange={value => {
                setApiKey(value)
                setApiKeyError(null)
              }}
              placeholder="Paste API key here"
              mask="*"
              focus={true}
              showCursor={true}
              columns={apiKeyInputColumns}
              cursorOffset={apiKeyCursorOffset}
              onChangeCursorOffset={setApiKeyCursorOffset}
              onIsPastingChange={setIsPastingApiKey}
              onSubmit={saveApiKey}
            />
          </Box>
          <Text dimColor={true}>
            {isPastingApiKey ? 'Finishing paste...' : 'Press Enter to save'}
          </Text>
        </Box>
      </Box>
    )
  }

  return (
    <Dialog title="Login" onCancel={cancel} color="permission" inputGuide={_temp}>
      {content}
    </Dialog>
  )
}

function _temp(exitState: { pending: boolean; keyName: string }): React.ReactNode {
  return exitState.pending ? (
    <Text>Press {exitState.keyName} again to exit</Text>
  ) : (
    <ConfigurableShortcutHint
      action="confirm:no"
      context="Confirmation"
      fallback="Esc"
      description="cancel"
    />
  )
}
