import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { fileSuffixForOauthConfig } from '../constants/oauth.js'
import { getOriginalCwd } from '../bootstrap/state.js'
import {
  getGlobalConfig,
  GLOBAL_CONFIG_KEYS,
  saveGlobalConfig,
  type GlobalConfig,
} from './config.js'
import { getGlobalChimeraFile, getLegacyGlobalChimeraFile } from './env.js'
import { getLegacyChimeraConfigHomeDir } from './envUtils.js'
import { safeParseJSON } from './json.js'
import { getSettingsFilePathForSource } from './settings/settings.js'

export type ChimeraSettingsImportSource = {
  globalConfigPath?: string
  userSettingsPath?: string
  projectSettingsPath?: string
  localSettingsPath?: string
  userExtensionFiles: Array<ChimeraExtensionFileImportSource>
  projectExtensionFiles: Array<ChimeraExtensionFileImportSource>
  userExtensionDirs: Array<ChimeraExtensionDirImportSource>
  projectExtensionDirs: Array<ChimeraExtensionDirImportSource>
}

export type ChimeraSettingsImportResult = {
  importedGlobalConfig: boolean
  importedUserSettings: boolean
  importedProjectSettings: boolean
  importedLocalSettings: boolean
  importedUserExtensionFiles: string[]
  importedProjectExtensionFiles: string[]
  importedUserExtensionDirs: string[]
  importedProjectExtensionDirs: string[]
}

type ChimeraExtensionDirImportSource = {
  name: string
  sourcePath: string
  targetPath: string
}

type ChimeraExtensionFileImportSource = ChimeraExtensionDirImportSource

const IMPORTABLE_EXTENSION_FILES = ['CLAUDE.md', 'scheduled_tasks.json'] as const

const IMPORTABLE_EXTENSION_DIRS = [
  'commands',
  'agents',
  'skills',
  'output-styles',
  'rules',
  'workflows',
  'templates',
  'agent-memory',
  'agent-memory-local',
] as const

function fileExists(path: string | undefined): path is string {
  return !!path && existsSync(path)
}

function getLegacyUserSettingsPath(): string {
  return join(getLegacyChimeraConfigHomeDir(), 'settings.json')
}

function getLegacyCodexConfigHomeDir(): string {
  if (process.env.CODEX_CODE_CONFIG_DIR) {
    return process.env.CODEX_CODE_CONFIG_DIR
  }
  if (process.env.CODEX_CODE_CONFIG_HOME) {
    return join(process.env.CODEX_CODE_CONFIG_HOME, 'codex-code')
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'codex-code')
}

function getLegacyCodexGlobalFile(): string {
  return join(
    getLegacyCodexConfigHomeDir(),
    `.codex-code${fileSuffixForOauthConfig()}.json`,
  )
}

function getLegacyCodexUserSettingsPath(): string {
  return join(getLegacyCodexConfigHomeDir(), 'settings.json')
}

function getLegacyCodexProjectRoot(): string {
  return join(getOriginalCwd(), '.codex-code')
}

function getLegacyCodexProjectSettingsPath(): string {
  return join(getLegacyCodexProjectRoot(), 'settings.json')
}

function getLegacyCodexLocalSettingsPath(): string {
  return join(getLegacyCodexProjectRoot(), 'settings.local.json')
}

function getLegacyProjectSettingsPath(): string {
  return join(getOriginalCwd(), '.claude', 'settings.json')
}

function getLegacyLocalSettingsPath(): string {
  return join(getOriginalCwd(), '.claude', 'settings.local.json')
}

function firstExistingPath(...paths: string[]): string | undefined {
  return paths.find(fileExists)
}

function getCodexUserSettingsPath(): string | undefined {
  return getSettingsFilePathForSource('userSettings')
}

function getCodexProjectSettingsPath(): string | undefined {
  return getSettingsFilePathForSource('projectSettings')
}

function getCodexLocalSettingsPath(): string | undefined {
  return getSettingsFilePathForSource('localSettings')
}

function getImportableExtensionDirs(
  sourceRoot: string,
  targetRoot: string,
): Array<ChimeraExtensionDirImportSource> {
  return IMPORTABLE_EXTENSION_DIRS.map(name => ({
    name,
    sourcePath: join(sourceRoot, name),
    targetPath: join(targetRoot, name),
  })).filter(
    candidate =>
      fileExists(candidate.sourcePath) && !fileExists(candidate.targetPath),
  )
}

function getImportableExtensionFiles(
  sourceRoot: string,
  targetRoot: string,
): Array<ChimeraExtensionFileImportSource> {
  return IMPORTABLE_EXTENSION_FILES.map(name => ({
    name,
    sourcePath: join(sourceRoot, name),
    targetPath: join(targetRoot, name),
  })).filter(
    candidate =>
      fileExists(candidate.sourcePath) && !fileExists(candidate.targetPath),
  )
}

function getImportableExtensionDirsFromRoots(
  sources: string[],
  targetRoot: string,
): Array<ChimeraExtensionDirImportSource> {
  const seenTargets = new Set<string>()
  return sources.flatMap(sourceRoot =>
    getImportableExtensionDirs(sourceRoot, targetRoot).filter(candidate => {
      if (seenTargets.has(candidate.targetPath)) {
        return false
      }
      seenTargets.add(candidate.targetPath)
      return true
    }),
  )
}

function getImportableExtensionFilesFromRoots(
  sources: string[],
  targetRoot: string,
): Array<ChimeraExtensionFileImportSource> {
  const seenTargets = new Set<string>()
  return sources.flatMap(sourceRoot =>
    getImportableExtensionFiles(sourceRoot, targetRoot).filter(candidate => {
      if (seenTargets.has(candidate.targetPath)) {
        return false
      }
      seenTargets.add(candidate.targetPath)
      return true
    }),
  )
}

export function getChimeraSettingsImportSource(): ChimeraSettingsImportSource {
  const globalConfigPath = firstExistingPath(
    getLegacyCodexGlobalFile(),
    getLegacyGlobalChimeraFile(),
  )
  const userSettingsPath = firstExistingPath(
    getLegacyCodexUserSettingsPath(),
    getLegacyUserSettingsPath(),
  )
  const projectSettingsPath = firstExistingPath(
    getLegacyCodexProjectSettingsPath(),
    getLegacyProjectSettingsPath(),
  )
  const localSettingsPath = firstExistingPath(
    getLegacyCodexLocalSettingsPath(),
    getLegacyLocalSettingsPath(),
  )
  const targetUserRoot = dirname(
    getCodexUserSettingsPath() ??
      join(getLegacyCodexConfigHomeDir(), 'settings.json'),
  )
  const userSourceRoots = [
    getLegacyCodexConfigHomeDir(),
    getLegacyChimeraConfigHomeDir(),
  ]
  const projectSourceRoots = [
    getLegacyCodexProjectRoot(),
    join(getOriginalCwd(), '.claude'),
  ]
  const userExtensionDirs = getImportableExtensionDirsFromRoots(
    userSourceRoots,
    targetUserRoot,
  )
  const projectExtensionDirs = getImportableExtensionDirsFromRoots(
    projectSourceRoots,
    join(getOriginalCwd(), '.chimera'),
  )
  const userExtensionFiles = getImportableExtensionFilesFromRoots(
    userSourceRoots,
    targetUserRoot,
  )
  const projectExtensionFiles = getImportableExtensionFilesFromRoots(
    projectSourceRoots,
    join(getOriginalCwd(), '.chimera'),
  )
  return {
    globalConfigPath,
    userSettingsPath,
    projectSettingsPath,
    localSettingsPath,
    userExtensionFiles,
    projectExtensionFiles,
    userExtensionDirs,
    projectExtensionDirs,
  }
}

function hasImportableFile(
  sourcePath: string | undefined,
  targetPath: string | undefined,
): boolean {
  return fileExists(sourcePath) && !fileExists(targetPath)
}

export function shouldOfferChimeraSettingsImport(): boolean {
  const config = getGlobalConfig()
  if (config.claudeSettingsImportDecision) {
    return false
  }
  const source = getChimeraSettingsImportSource()
  return (
    !!source.globalConfigPath ||
    hasImportableFile(source.userSettingsPath, getCodexUserSettingsPath()) ||
    hasImportableFile(
      source.projectSettingsPath,
      getCodexProjectSettingsPath(),
    ) ||
    hasImportableFile(source.localSettingsPath, getCodexLocalSettingsPath()) ||
    source.userExtensionFiles.length > 0 ||
    source.projectExtensionFiles.length > 0 ||
    source.userExtensionDirs.length > 0 ||
    source.projectExtensionDirs.length > 0
  )
}

function pickPortableGlobalConfig(sourcePath: string): Partial<GlobalConfig> {
  const parsed = safeParseJSON(readFileSync(sourcePath, 'utf8'), false)
  if (!parsed || typeof parsed !== 'object') {
    return {}
  }
  const source = parsed as Record<string, unknown>
  const portable: Partial<GlobalConfig> = {}
  for (const key of GLOBAL_CONFIG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      ;(portable as Record<string, unknown>)[key] = source[key]
    }
  }
  return portable
}

export function importChimeraSettingsForCodex(): ChimeraSettingsImportResult {
  const source = getChimeraSettingsImportSource()
  const globalConfig = source.globalConfigPath
    ? pickPortableGlobalConfig(source.globalConfigPath)
    : {}
  let importedUserSettings = false
  let importedProjectSettings = false
  let importedLocalSettings = false
  const importedUserExtensionFiles: string[] = []
  const importedProjectExtensionFiles: string[] = []
  const importedUserExtensionDirs: string[] = []
  const importedProjectExtensionDirs: string[] = []

  const targetUserSettingsPath = getCodexUserSettingsPath()
  if (
    source.userSettingsPath &&
    targetUserSettingsPath &&
    !fileExists(targetUserSettingsPath)
  ) {
    mkdirSync(dirname(targetUserSettingsPath), { recursive: true })
    copyFileSync(source.userSettingsPath, targetUserSettingsPath)
    importedUserSettings = true
  }

  const targetProjectSettingsPath = getCodexProjectSettingsPath()
  if (
    source.projectSettingsPath &&
    targetProjectSettingsPath &&
    !fileExists(targetProjectSettingsPath)
  ) {
    mkdirSync(dirname(targetProjectSettingsPath), { recursive: true })
    copyFileSync(source.projectSettingsPath, targetProjectSettingsPath)
    importedProjectSettings = true
  }

  const targetLocalSettingsPath = getCodexLocalSettingsPath()
  if (
    source.localSettingsPath &&
    targetLocalSettingsPath &&
    !fileExists(targetLocalSettingsPath)
  ) {
    mkdirSync(dirname(targetLocalSettingsPath), { recursive: true })
    copyFileSync(source.localSettingsPath, targetLocalSettingsPath)
    importedLocalSettings = true
  }

  for (const file of source.userExtensionFiles) {
    mkdirSync(dirname(file.targetPath), { recursive: true })
    copyFileSync(file.sourcePath, file.targetPath)
    importedUserExtensionFiles.push(file.name)
  }

  for (const file of source.projectExtensionFiles) {
    mkdirSync(dirname(file.targetPath), { recursive: true })
    copyFileSync(file.sourcePath, file.targetPath)
    importedProjectExtensionFiles.push(file.name)
  }

  for (const dir of source.userExtensionDirs) {
    mkdirSync(dirname(dir.targetPath), { recursive: true })
    cpSync(dir.sourcePath, dir.targetPath, { recursive: true })
    importedUserExtensionDirs.push(dir.name)
  }

  for (const dir of source.projectExtensionDirs) {
    mkdirSync(dirname(dir.targetPath), { recursive: true })
    cpSync(dir.sourcePath, dir.targetPath, { recursive: true })
    importedProjectExtensionDirs.push(dir.name)
  }

  saveGlobalConfig(current => ({
    ...current,
    ...globalConfig,
    claudeSettingsImportDecision: 'imported',
    claudeSettingsImportedAt: new Date().toISOString(),
  }))

  return {
    importedGlobalConfig: Object.keys(globalConfig).length > 0,
    importedUserSettings,
    importedProjectSettings,
    importedLocalSettings,
    importedUserExtensionFiles,
    importedProjectExtensionFiles,
    importedUserExtensionDirs,
    importedProjectExtensionDirs,
  }
}

export function skipChimeraSettingsImport(): void {
  saveGlobalConfig(current => ({
    ...current,
    claudeSettingsImportDecision: 'skipped',
  }))
}
