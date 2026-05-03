import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getGlobalChimeraFile, getLegacyGlobalChimeraFile } from './env.js'
import {
  getChimeraConfigHomeDir,
  getLegacyChimeraConfigHomeDir,
} from './envUtils.js'

const ORIGINAL_CHIMERA_CONFIG_HOME = process.env.CHIMERA_CONFIG_HOME
const ORIGINAL_CHIMERA_CONFIG_DIR = process.env.CHIMERA_CONFIG_DIR
const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR
const ORIGINAL_XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME

function resetPathCaches(): void {
  getChimeraConfigHomeDir.cache.clear?.()
  getLegacyChimeraConfigHomeDir.cache.clear?.()
  getGlobalChimeraFile.cache.clear?.()
  getLegacyGlobalChimeraFile.cache.clear?.()
}

afterEach(() => {
  if (ORIGINAL_CHIMERA_CONFIG_HOME === undefined) delete process.env.CHIMERA_CONFIG_HOME
  else process.env.CHIMERA_CONFIG_HOME = ORIGINAL_CHIMERA_CONFIG_HOME
  if (ORIGINAL_CHIMERA_CONFIG_DIR === undefined) delete process.env.CHIMERA_CONFIG_DIR
  else process.env.CHIMERA_CONFIG_DIR = ORIGINAL_CHIMERA_CONFIG_DIR
  if (ORIGINAL_CLAUDE_CONFIG_DIR === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR
  if (ORIGINAL_XDG_CONFIG_HOME === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = ORIGINAL_XDG_CONFIG_HOME
  resetPathCaches()
})

describe('Chimera config paths', () => {
  test('uses Chimera config home before legacy Chimera config env', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'chimera-home-'))
    const legacyChimeraDir = join(tempHome, '.claude')
    try {
      process.env.CHIMERA_CONFIG_HOME = tempHome
      process.env.CLAUDE_CONFIG_DIR = legacyChimeraDir
      resetPathCaches()

      expect(getChimeraConfigHomeDir()).toBe(join(tempHome, 'chimera'))
      expect(getGlobalChimeraFile()).toBe(
        join(tempHome, 'chimera', '.chimera.json'),
      )
      expect(getLegacyChimeraConfigHomeDir()).toBe(legacyChimeraDir)
      expect(getLegacyGlobalChimeraFile()).toBe(
        join(legacyChimeraDir, '.claude.json'),
      )
    } finally {
      rmSync(tempHome, { recursive: true, force: true })
    }
  })

  test('defaults to an XDG Chimera directory when no explicit env is set', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'chimera-xdg-'))
    try {
      delete process.env.CHIMERA_CONFIG_HOME
      delete process.env.CHIMERA_CONFIG_DIR
      delete process.env.CLAUDE_CONFIG_DIR
      process.env.XDG_CONFIG_HOME = tempHome
      resetPathCaches()

      expect(getChimeraConfigHomeDir()).toBe(join(tempHome, 'chimera'))
      expect(getGlobalChimeraFile()).toBe(
        join(tempHome, 'chimera', '.chimera.json'),
      )
    } finally {
      rmSync(tempHome, { recursive: true, force: true })
    }
  })
})
