import { existsSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join } from 'path'

const requireFromHere = createRequire(import.meta.url)

export const CLAUDE_CODE_PACKAGE_NAME = 'chimera'

export type ClaudeVendorBinary =
  | 'audio-capture'
  | 'ripgrep'
  | 'tree-sitter-bash'

export type SupportedVendorArch = 'arm64' | 'x64'
export type SupportedVendorPlatform = 'darwin' | 'linux' | 'win32'

export type VendorPathOptions = {
  packageRoot?: string | null
  arch?: NodeJS.Architecture
  platform?: NodeJS.Platform
}

export function getVendorPlatform(
  options: Pick<VendorPathOptions, 'arch' | 'platform'> = {},
): `${SupportedVendorArch}-${SupportedVendorPlatform}` | null {
  const arch = options.arch ?? process.arch
  const platform = options.platform ?? process.platform

  if (arch !== 'arm64' && arch !== 'x64') {
    return null
  }
  if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') {
    return null
  }

  return `${arch}-${platform}`
}

export function resolveClaudeCodePackageRoot(
  options: Pick<VendorPathOptions, 'packageRoot'> = {},
): string | null {
  if (options.packageRoot !== undefined) {
    return options.packageRoot
  }

  const override =
    process.env.CODEX_CODE_CLAUDE_CODE_ROOT ??
    process.env.CLAUDE_CODE_PACKAGE_ROOT
  if (override) {
    return override
  }

  try {
    return dirname(
      requireFromHere.resolve(`${CLAUDE_CODE_PACKAGE_NAME}/package.json`),
    )
  } catch {
    return null
  }
}

export function getClaudeCodeVendorBinaryPath(
  binary: ClaudeVendorBinary,
  filename: string,
  options: VendorPathOptions = {},
): string | null {
  const packageRoot = resolveClaudeCodePackageRoot({
    packageRoot: options.packageRoot,
  })
  const vendorPlatform = getVendorPlatform(options)

  if (!packageRoot || !vendorPlatform) {
    return null
  }

  const candidate = join(packageRoot, 'vendor', binary, vendorPlatform, filename)
  return existsSync(candidate) ? candidate : null
}
