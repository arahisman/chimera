import { randomBytes } from 'crypto'
import { execa } from 'execa'
import { basename, extname, isAbsolute, join, win32 as pathWin32 } from 'path'
import { getImageProcessor } from '../tools/FileReadTool/imageProcessor.js'
import { logForDebugging } from './debug.js'
import { execFileNoThrowWithCwd } from './execFileNoThrow.js'
import { getFsImplementation } from './fsOperations.js'
import {
  detectImageFormatFromBase64,
  type ImageDimensions,
  maybeResizeAndDownsampleImageBuffer,
} from './imageResizer.js'
import { whichSync } from './which.js'

// Clipboard image access uses shell fallbacks in this recovered build. The
// original native NSPasteboard reader lived in an internal image-processor-napi
// package; matching public npm names are not trustworthy replacement sources.

type SupportedPlatform = 'darwin' | 'linux' | 'win32'
type ClipboardCommandAvailability = (command: string) => boolean

type ClipboardCommands = {
  checkImage: string
  saveImage: string
  getPath: string
  deleteFile: string
}

export type ClipboardCommandPlan = {
  commands: ClipboardCommands | null
  screenshotPath: string
  diagnostic?: string
}

// Threshold in characters for when to consider text a "large paste"
export const PASTE_THRESHOLD = 800

function defaultCommandAvailable(command: string): boolean {
  return whichSync(command) !== null
}

export function resolveClipboardCommands({
  platform = process.platform,
  env = process.env,
  isCommandAvailable = defaultCommandAvailable,
}: {
  platform?: NodeJS.Platform | string
  env?: Record<string, string | undefined>
  isCommandAvailable?: ClipboardCommandAvailability
} = {}): ClipboardCommandPlan {
  const supportedPlatform = platform as SupportedPlatform

  // Platform-specific temporary file paths
  // Use CHIMERA_TMPDIR if set, otherwise fall back to legacy env/platform defaults.
  const baseTmpDir =
    env.CHIMERA_TMPDIR ||
    env.CLAUDE_CODE_TMPDIR ||
    (supportedPlatform === 'win32' ? env.TEMP || 'C:\\Temp' : '/tmp')
  const screenshotFilename = 'chimera_latest_screenshot.png'
  const screenshotPath =
    supportedPlatform === 'win32'
      ? pathWin32.join(baseTmpDir, screenshotFilename)
      : join(baseTmpDir, screenshotFilename)

  if (
    supportedPlatform !== 'darwin' &&
    supportedPlatform !== 'linux' &&
    supportedPlatform !== 'win32'
  ) {
    return {
      commands: null,
      screenshotPath,
      diagnostic: `No supported clipboard image command for ${platform}.`,
    }
  }

  if (supportedPlatform === 'darwin') {
    if (!isCommandAvailable('osascript')) {
      return {
        commands: null,
        screenshotPath,
        diagnostic:
          'No supported clipboard image command found for macOS. Expected osascript.',
      }
    }

    return {
      screenshotPath,
      commands: {
        checkImage: `osascript -e 'the clipboard as «class PNGf»'`,
        saveImage: `osascript -e 'set png_data to (the clipboard as «class PNGf»)' -e 'set fp to open for access POSIX file "${screenshotPath}" with write permission' -e 'write png_data to fp' -e 'close access fp'`,
        getPath: `osascript -e 'get POSIX path of (the clipboard as «class furl»)'`,
        deleteFile: `rm -f "${screenshotPath}"`,
      },
    }
  }

  if (supportedPlatform === 'linux') {
    const hasWlPaste = isCommandAvailable('wl-paste')
    const hasXclip = isCommandAvailable('xclip')
    const useWlPaste = Boolean(env.WAYLAND_DISPLAY) && hasWlPaste
    const clipboardTool = useWlPaste
      ? 'wl-paste'
      : hasXclip
        ? 'xclip'
        : hasWlPaste
          ? 'wl-paste'
          : null

    if (clipboardTool === 'wl-paste') {
      return {
        screenshotPath,
        commands: {
          checkImage:
            'wl-paste -l 2>/dev/null | grep -E "image/(png|jpeg|jpg|gif|webp|bmp)"',
          saveImage: `wl-paste --type image/png > "${screenshotPath}" 2>/dev/null || wl-paste --type image/bmp > "${screenshotPath}"`,
          getPath: 'wl-paste 2>/dev/null',
          deleteFile: `rm -f "${screenshotPath}"`,
        },
      }
    }

    if (clipboardTool === 'xclip') {
      return {
        screenshotPath,
        commands: {
          checkImage:
            'xclip -selection clipboard -t TARGETS -o 2>/dev/null | grep -E "image/(png|jpeg|jpg|gif|webp|bmp)"',
          saveImage: `xclip -selection clipboard -t image/png -o > "${screenshotPath}" 2>/dev/null || xclip -selection clipboard -t image/bmp -o > "${screenshotPath}"`,
          getPath: 'xclip -selection clipboard -t text/plain -o 2>/dev/null',
          deleteFile: `rm -f "${screenshotPath}"`,
        },
      }
    }

    return {
      commands: null,
      screenshotPath,
      diagnostic:
        'No supported clipboard image command found for Linux. Install wl-paste for Wayland or xclip for X11.',
    }
  }

  const powershell = isCommandAvailable('powershell')
    ? 'powershell'
    : isCommandAvailable('powershell.exe')
      ? 'powershell.exe'
      : null

  if (!powershell) {
    return {
      commands: null,
      screenshotPath,
      diagnostic:
        'No supported clipboard image command found for Windows. Expected PowerShell.',
    }
  }

  return {
    screenshotPath,
    commands: {
      checkImage: `${powershell} -NoProfile -Command "(Get-Clipboard -Format Image) -ne $null"`,
      saveImage: `${powershell} -NoProfile -Command "$img = Get-Clipboard -Format Image; if ($img) { $img.Save('${screenshotPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png) }"`,
      getPath: `${powershell} -NoProfile -Command "Get-Clipboard"`,
      deleteFile: `del /f "${screenshotPath}"`,
    },
  }
}

function getClipboardCommands() {
  return resolveClipboardCommands()
}

export type ImageWithDimensions = {
  base64: string
  mediaType: string
  dimensions?: ImageDimensions
}

/**
 * Check if clipboard contains an image without retrieving it.
 */
export async function hasImageInClipboard(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false
  }
  const result = await execFileNoThrowWithCwd('osascript', [
    '-e',
    'the clipboard as «class PNGf»',
  ])
  return result.code === 0
}

export async function getImageFromClipboard(): Promise<ImageWithDimensions | null> {
  const { commands, screenshotPath, diagnostic } = getClipboardCommands()
  if (!commands) {
    logForDebugging(diagnostic ?? 'No supported clipboard image command found', {
      level: 'warn',
    })
    return null
  }

  try {
    // Check if clipboard has image
    const checkResult = await execa(commands.checkImage, {
      shell: true,
      reject: false,
    })
    if (checkResult.exitCode !== 0) {
      return null
    }

    // Save the image
    const saveResult = await execa(commands.saveImage, {
      shell: true,
      reject: false,
    })
    if (saveResult.exitCode !== 0) {
      return null
    }

    // Read the image and convert to base64
    let imageBuffer = getFsImplementation().readFileBytesSync(screenshotPath)

    // BMP is not supported by the API — convert to PNG via Sharp.
    // This handles WSL2 where Windows copies images as BMP by default.
    if (
      imageBuffer.length >= 2 &&
      imageBuffer[0] === 0x42 &&
      imageBuffer[1] === 0x4d
    ) {
      const sharp = await getImageProcessor()
      imageBuffer = await sharp(imageBuffer).png().toBuffer()
    }

    // Resize if needed to stay under 5MB API limit
    const resized = await maybeResizeAndDownsampleImageBuffer(
      imageBuffer,
      imageBuffer.length,
      'png',
    )
    const base64Image = resized.buffer.toString('base64')

    // Detect format from magic bytes
    const mediaType = detectImageFormatFromBase64(base64Image)

    // Cleanup (fire-and-forget, don't await)
    void execa(commands.deleteFile, { shell: true, reject: false })

    return {
      base64: base64Image,
      mediaType,
      dimensions: resized.dimensions,
    }
  } catch {
    return null
  }
}

export async function getImagePathFromClipboard(): Promise<string | null> {
  const { commands, diagnostic } = getClipboardCommands()
  if (!commands) {
    logForDebugging(diagnostic ?? 'No supported clipboard path command found', {
      level: 'warn',
    })
    return null
  }

  try {
    // Try to get text from clipboard
    const result = await execa(commands.getPath, {
      shell: true,
      reject: false,
    })
    if (result.exitCode !== 0 || !result.stdout) {
      return null
    }
    return result.stdout.trim()
  } catch (e) {
    logError(e as Error)
    return null
  }
}

/**
 * Regex pattern to match supported image file extensions. Kept in sync with
 * MIME_BY_EXT in BriefTool/upload.ts — attachments.ts uses this to set isImage
 * on the wire, and remote viewers fetch /preview iff isImage is true. An ext
 * here but not in MIME_BY_EXT (e.g. bmp) uploads as octet-stream and has no
 * /preview variant → broken thumbnail.
 */
export const IMAGE_EXTENSION_REGEX = /\.(png|jpe?g|gif|webp)$/i

/**
 * Remove outer single or double quotes from a string
 * @param text Text to clean
 * @returns Text without outer quotes
 */
function removeOuterQuotes(text: string): string {
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1)
  }
  return text
}

/**
 * Remove shell escape backslashes from a path (for macOS/Linux/WSL)
 * On Windows systems, this function returns the path unchanged
 * @param path Path that might contain shell-escaped characters
 * @returns Path with escape backslashes removed (on macOS/Linux/WSL only)
 */
function stripBackslashEscapes(path: string): string {
  const platform = process.platform as SupportedPlatform

  // On Windows, don't remove backslashes as they're part of the path
  if (platform === 'win32') {
    return path
  }

  // On macOS/Linux/WSL, handle shell-escaped paths
  // Double-backslashes (\\) represent actual backslashes in the filename
  // Single backslashes followed by special chars are shell escapes

  // First, temporarily replace double backslashes with a placeholder
  // Use random salt to prevent injection attacks where path contains literal placeholder
  const salt = randomBytes(8).toString('hex')
  const placeholder = `__DOUBLE_BACKSLASH_${salt}__`
  const withPlaceholder = path.replace(/\\\\/g, placeholder)

  // Remove single backslashes that are shell escapes
  // This handles cases like "name\ \(15\).png" -> "name (15).png"
  const withoutEscapes = withPlaceholder.replace(/\\(.)/g, '$1')

  // Replace placeholders back to single backslashes
  return withoutEscapes.replace(new RegExp(placeholder, 'g'), '\\')
}

/**
 * Check if a given text represents an image file path
 * @param text Text to check
 * @returns Boolean indicating if text is an image path
 */
export function isImageFilePath(text: string): boolean {
  const cleaned = removeOuterQuotes(text.trim())
  const unescaped = stripBackslashEscapes(cleaned)
  return IMAGE_EXTENSION_REGEX.test(unescaped)
}

/**
 * Clean and normalize a text string that might be an image file path
 * @param text Text to process
 * @returns Cleaned text with quotes removed, whitespace trimmed, and shell escapes removed, or null if not an image path
 */
export function asImageFilePath(text: string): string | null {
  const cleaned = removeOuterQuotes(text.trim())
  const unescaped = stripBackslashEscapes(cleaned)

  if (IMAGE_EXTENSION_REGEX.test(unescaped)) {
    return unescaped
  }

  return null
}

/**
 * Try to find and read an image file, falling back to clipboard search
 * @param text Pasted text that might be an image filename or path
 * @returns Object containing the image path and base64 data, or null if not found
 */
export async function tryReadImageFromPath(
  text: string,
): Promise<(ImageWithDimensions & { path: string }) | null> {
  // Strip terminal added spaces or quotes to dragged in paths
  const cleanedPath = asImageFilePath(text)

  if (!cleanedPath) {
    return null
  }

  const imagePath = cleanedPath
  let imageBuffer

  try {
    if (isAbsolute(imagePath)) {
      imageBuffer = getFsImplementation().readFileBytesSync(imagePath)
    } else {
      // VSCode Terminal just grabs the text content which is the filename
      // instead of getting the full path of the file pasted with cmd-v. So
      // we check if it matches the filename of the image in the clipboard.
      const clipboardPath = await getImagePathFromClipboard()
      if (clipboardPath && imagePath === basename(clipboardPath)) {
        imageBuffer = getFsImplementation().readFileBytesSync(clipboardPath)
      }
    }
  } catch (e) {
    logError(e as Error)
    return null
  }
  if (!imageBuffer) {
    return null
  }
  if (imageBuffer.length === 0) {
    logForDebugging(`Image file is empty: ${imagePath}`, { level: 'warn' })
    return null
  }

  // BMP is not supported by the API — convert to PNG via Sharp.
  if (
    imageBuffer.length >= 2 &&
    imageBuffer[0] === 0x42 &&
    imageBuffer[1] === 0x4d
  ) {
    const sharp = await getImageProcessor()
    imageBuffer = await sharp(imageBuffer).png().toBuffer()
  }

  // Resize if needed to stay under 5MB API limit
  // Extract extension from path for format hint
  const ext = extname(imagePath).slice(1).toLowerCase() || 'png'
  const resized = await maybeResizeAndDownsampleImageBuffer(
    imageBuffer,
    imageBuffer.length,
    ext,
  )
  const base64Image = resized.buffer.toString('base64')

  // Detect format from the actual file contents using magic bytes
  const mediaType = detectImageFormatFromBase64(base64Image)
  return {
    path: imagePath,
    base64: base64Image,
    mediaType,
    dimensions: resized.dimensions,
  }
}
