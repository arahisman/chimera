import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getAudioCaptureNativePath,
  loadAudioCaptureNative,
  resetAudioCaptureNativeForTesting,
} from './audioCapture.js'
import {
  getClaudeCodeVendorBinaryPath,
  getVendorPlatform,
  resolveClaudeCodePackageRoot,
} from './vendorPaths.js'

const forbiddenNativePackages = [
  'audio-capture-napi',
  'audio-capture.node',
  'color-diff-napi',
  'image-processor-napi',
  'modifiers-napi',
  'url-handler-napi',
]

describe('native dependency adapters', () => {
  test('does not install public exact-name native packages', async () => {
    const packageJson = JSON.parse(
      await readFile(join(process.cwd(), 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    const dependencyNames = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys(packageJson.optionalDependencies ?? {}),
    ])

    for (const packageName of forbiddenNativePackages) {
      expect(dependencyNames.has(packageName)).toBe(false)
    }
  })

  test('builds Chimera vendor paths by arch and platform', async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), 'chimera-vendor-'))
    const nativeDir = join(
      packageRoot,
      'vendor',
      'audio-capture',
      'arm64-darwin',
    )
    const nativeFile = join(nativeDir, 'audio-capture.node')

    try {
      await mkdir(nativeDir, { recursive: true })
      await writeFile(nativeFile, 'not a real native module')

      expect(resolveClaudeCodePackageRoot({ packageRoot })).toBe(packageRoot)
      expect(getVendorPlatform({ arch: 'arm64', platform: 'darwin' })).toBe(
        'arm64-darwin',
      )
      expect(getVendorPlatform({ arch: 'ia32', platform: 'darwin' })).toBeNull()
      expect(
        getClaudeCodeVendorBinaryPath('audio-capture', 'audio-capture.node', {
          packageRoot,
          arch: 'arm64',
          platform: 'darwin',
        }),
      ).toBe(nativeFile)
      expect(
        getAudioCaptureNativePath({
          packageRoot,
          arch: 'x64',
          platform: 'linux',
        }),
      ).toBeNull()
    } finally {
      await rm(packageRoot, { recursive: true, force: true })
    }
  })

  test('returns null instead of throwing when the native audio module is absent or invalid', async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), 'chimera-audio-'))
    const nativeDir = join(
      packageRoot,
      'vendor',
      'audio-capture',
      'arm64-darwin',
    )
    const nativeFile = join(nativeDir, 'audio-capture.node')

    try {
      resetAudioCaptureNativeForTesting()
      expect(
        loadAudioCaptureNative({
          packageRoot,
          arch: 'arm64',
          platform: 'darwin',
          cache: false,
        }),
      ).toBeNull()

      await mkdir(nativeDir, { recursive: true })
      await writeFile(nativeFile, 'not a real native module')

      expect(
        loadAudioCaptureNative({
          packageRoot,
          arch: 'arm64',
          platform: 'darwin',
          cache: false,
        }),
      ).toBeNull()
    } finally {
      resetAudioCaptureNativeForTesting()
      await rm(packageRoot, { recursive: true, force: true })
    }
  })

  test('loads the optional local Chimera audio vendor when present', () => {
    resetAudioCaptureNativeForTesting()
    try {
      const nativePath = getAudioCaptureNativePath()
      const native = loadAudioCaptureNative({ cache: false })

      if (!nativePath) {
        expect(native).toBeNull()
        return
      }

      expect(native).not.toBeNull()
      expect(typeof native!.startRecording).toBe('function')
      expect(typeof native!.stopRecording).toBe('function')
      expect(typeof native!.isRecording).toBe('function')
      expect(native!.isRecording()).toBe(false)

      const microphoneStatus = native!.microphoneAuthorizationStatus?.()
      if (microphoneStatus !== undefined) {
        expect(typeof microphoneStatus).toBe('number')
      }
    } finally {
      resetAudioCaptureNativeForTesting()
    }
  })

  test('locks recovered native replacement policy in source', async () => {
    const [
      colorDiff,
      imageProcessor,
      imagePaste,
      modifiers,
      protocolHandler,
      bashParser,
      parserAdapter,
      ripgrep,
    ] = await Promise.all([
      readFile(
        join(process.cwd(), 'src/components/StructuredDiff/colorDiff.ts'),
        'utf8',
      ),
      readFile(
        join(process.cwd(), 'src/tools/FileReadTool/imageProcessor.ts'),
        'utf8',
      ),
      readFile(join(process.cwd(), 'src/utils/imagePaste.ts'), 'utf8'),
      readFile(join(process.cwd(), 'src/utils/modifiers.ts'), 'utf8'),
      readFile(
        join(process.cwd(), 'src/utils/deepLink/protocolHandler.ts'),
        'utf8',
      ),
      readFile(join(process.cwd(), 'src/utils/bash/bashParser.ts'), 'utf8'),
      readFile(join(process.cwd(), 'src/utils/bash/parser.ts'), 'utf8'),
      readFile(join(process.cwd(), 'src/utils/ripgrep.ts'), 'utf8'),
    ])

    expect(colorDiff).toContain(
      "from '../../native-ts/color-diff/index.js'",
    )
    expect(imageProcessor).toContain("'sharp'")
    expect(imagePaste).toContain('osascript')
    expect(imagePaste).toContain('xclip')
    expect(imagePaste).toContain('wl-paste')
    expect(imagePaste).toContain('powershell')
    expect(modifiers).toContain('return false')
    expect(protocolHandler).toContain('return null')
    expect(bashParser).toContain('Pure-TypeScript bash parser')
    expect(parserAdapter).toContain("from './bashParser.js'")
    expect(ripgrep).toContain("mode: 'system'")
    expect(ripgrep).toContain("'vendor', 'ripgrep'")

    expect(imageProcessor).not.toMatch(
      /(?:import|require)\(['"]image-processor-napi['"]\)/,
    )
    expect(modifiers).not.toMatch(/(?:import|require)\(['"]modifiers-napi['"]\)/)
    expect(protocolHandler).not.toMatch(
      /(?:import|require)\(['"]url-handler-napi['"]\)/,
    )
    expect(parserAdapter).not.toMatch(
      /(?:import|require)\(['"]tree-sitter-bash['"]\)/,
    )
  })
})
