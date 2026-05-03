import * as React from 'react'
import { clearTrustedDeviceTokenCache } from '../../bridge/trustedDevice.js'
import type { LocalJSXCommandContext } from '../../commands.js'
import { Select } from '../../components/CustomSelect/select.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text } from '../../ink.js'
import { refreshGrowthBookAfterAuthChange } from '../../services/analytics/growthbook.js'
import { getGroveNoticeConfig, getGroveSettings } from '../../services/api/grove.js'
import { clearCodexAuth } from '../../services/codex/auth/manager.js'
import { clearPolicyLimitsCache } from '../../services/policyLimits/index.js'
// flushTelemetry is loaded lazily to avoid pulling in ~1.1MB of OpenTelemetry at startup
import { clearRemoteManagedSettingsCache } from '../../services/remoteManagedSettings/index.js'
import { getProviderCatalog } from '../../services/providers/catalog.js'
import {
  buildProviderApiKeyRemovalSettings,
  CODEX_AUTH_PROVIDER,
  resolveAuthProviderChoice,
  type AuthProviderChoice,
} from '../../services/providers/configure.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { getChimeraAIOAuthTokens, removeApiKey } from '../../utils/auth.js'
import { clearBetasCaches } from '../../utils/betas.js'
import { saveGlobalConfig } from '../../utils/config.js'
import { gracefulShutdownSync } from '../../utils/gracefulShutdown.js'
import { getSecureStorage } from '../../utils/secureStorage/index.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'
import { clearToolSchemaCache } from '../../utils/toolSchemaCache.js'
import { resetUserCache } from '../../utils/user.js'

export async function performLogout({
  clearOnboarding = false,
}): Promise<void> {
  // Flush telemetry before clearing credentials to prevent org data leakage.
  const { flushTelemetry } = await import(
    '../../utils/telemetry/instrumentation.js'
  )
  await flushTelemetry()
  await removeApiKey()
  await clearCodexAuth()

  const secureStorage = getSecureStorage()
  secureStorage.delete()
  await clearAuthRelatedCaches()
  saveGlobalConfig(current => {
    const updated = { ...current }
    if (clearOnboarding) {
      updated.hasCompletedOnboarding = false
      updated.subscriptionNoticeCount = 0
      updated.hasAvailableSubscription = false
      if (updated.customApiKeyResponses?.approved) {
        updated.customApiKeyResponses = {
          ...updated.customApiKeyResponses,
          approved: [],
        }
      }
    }
    updated.oauthAccount = undefined
    return updated
  })
}

// clearing anything memoized that must be invalidated when user/session/auth changes
export async function clearAuthRelatedCaches(): Promise<void> {
  getChimeraAIOAuthTokens.cache?.clear?.()
  clearTrustedDeviceTokenCache()
  clearBetasCaches()
  clearToolSchemaCache()
  resetUserCache()
  refreshGrowthBookAfterAuthChange()
  getGroveNoticeConfig.cache?.clear?.()
  getGroveSettings.cache?.clear?.()
  await clearRemoteManagedSettingsCache()
  await clearPolicyLimitsCache()
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const requestedProvider = args?.trim()
  if (requestedProvider) {
    const choice = resolveAuthProviderChoice(requestedProvider)
    if (!choice) {
      return <Text color="error">Unknown auth provider "{requestedProvider}".</Text>
    }
    const result = await logoutSelectedProvider(choice, context)
    if (choice.kind !== 'codex') {
      onDone(`Removed API key for ${choice.provider.name}`)
    }
    return result
  }

  return (
    <LogoutProviderPicker
      onCancel={() => onDone('Logout interrupted')}
      onSelect={async choice => {
        await logoutSelectedProvider(choice, context)
        onDone(
          choice.kind === 'codex'
            ? 'Logged out from Codex OAuth'
            : `Removed API key for ${choice.provider.name}`,
        )
      }}
    />
  )
}

async function logoutSelectedProvider(
  choice: AuthProviderChoice,
  context: LocalJSXCommandContext,
): Promise<React.ReactNode> {
  if (choice.kind === 'codex') {
    await performLogout({ clearOnboarding: true })
    const message = <Text>Successfully logged out from Codex OAuth.</Text>
    setTimeout(() => {
      gracefulShutdownSync(0, 'logout')
    }, 200)
    return message
  }

  const currentSettings = getSettingsForSource('userSettings') ?? {}
  const result = updateSettingsForSource(
    'userSettings',
    buildProviderApiKeyRemovalSettings(currentSettings, choice.provider.id),
  )
  if (result.error) {
    return <Text color="error">Failed to update settings: {result.error.message}</Text>
  }

  context.onChangeAPIKey()
  return (
    <Text>
      Removed saved API key for {choice.provider.name} ({choice.provider.id}).
    </Text>
  )
}

function LogoutProviderPicker(props: {
  onSelect: (choice: AuthProviderChoice) => void | Promise<void>
  onCancel: () => void
}): React.ReactNode {
  const options = [
    {
      label: (
        <Text>
          {CODEX_AUTH_PROVIDER.name} ·{' '}
          <Text dimColor={true}>clear OAuth session</Text>
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

  return (
    <Dialog title="Logout" onCancel={props.onCancel} color="permission">
      <Box flexDirection="column" gap={1} marginTop={1}>
        <Text bold={true}>
          Choose which provider credentials Chimera should remove.
        </Text>
        <Select
          options={options}
          visibleOptionCount={8}
          onCancel={props.onCancel}
          onChange={value => {
            const choice = resolveAuthProviderChoice(value)
            if (choice) void props.onSelect(choice)
          }}
        />
      </Box>
    </Dialog>
  )
}
