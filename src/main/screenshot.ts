import { desktopCapturer, screen, nativeImage } from 'electron'
import type { Display } from 'electron'

export async function captureScreen(): Promise<{ base64: string; mediaType: 'image/png' }> {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const targetWidth = 1280
  const targetHeight = Math.round((height / width) * targetWidth)
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: targetWidth, height: targetHeight },
  })
  if (sources.length === 0) {
    throw new Error('No screen sources found (grant Screen Recording in System Settings → Privacy & Security)')
  }
  const png = sources[0].thumbnail.toPNG()
  if (png.length === 0) {
    throw new Error('Screenshot is empty (grant Screen Recording in System Settings → Privacy & Security)')
  }
  return { base64: png.toString('base64'), mediaType: 'image/png' }
}

export type LogicalRect = { x: number; y: number; w: number; h: number }

const MAX_LONG_EDGE = 1568

/**
 * Capture a sub-region of a specific display.
 * `rect` is in display-local logical coordinates (relative to display.bounds origin).
 */
export async function captureRegion(
  rect: LogicalRect,
  displayId: number,
): Promise<{ base64: string; mediaType: 'image/png' }> {
  const display = findDisplay(displayId)
  if (!display) {
    throw new Error(`Display ${displayId} not found`)
  }
  const scale = display.scaleFactor || 1
  const physicalW = Math.round(display.bounds.width * scale)
  const physicalH = Math.round(display.bounds.height * scale)

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: physicalW, height: physicalH },
  })
  if (sources.length === 0) {
    throw new Error('No screen sources found (grant Screen Recording in System Settings → Privacy & Security)')
  }

  const source = matchSourceForDisplay(sources, display)

  const thumb = source.thumbnail
  const thumbSize = thumb.getSize()
  const sx = thumbSize.width / display.bounds.width
  const sy = thumbSize.height / display.bounds.height

  const cropX = Math.max(0, Math.round(rect.x * sx))
  const cropY = Math.max(0, Math.round(rect.y * sy))
  const cropW = Math.min(thumbSize.width - cropX, Math.round(rect.w * sx))
  const cropH = Math.min(thumbSize.height - cropY, Math.round(rect.h * sy))

  if (cropW <= 0 || cropH <= 0) {
    throw new Error(`Invalid crop: ${cropW}x${cropH}`)
  }

  const cropped = thumb.crop({ x: cropX, y: cropY, width: cropW, height: cropH })

  // Resize so longest edge ≤ MAX_LONG_EDGE
  const resized = resizeIfNeeded(cropped)

  const png = resized.toPNG()
  if (png.length === 0) {
    throw new Error('Region screenshot empty')
  }
  return { base64: png.toString('base64'), mediaType: 'image/png' }
}

function findDisplay(displayId: number): Display | undefined {
  return screen.getAllDisplays().find((d) => d.id === displayId)
}

function matchSourceForDisplay(
  sources: Electron.DesktopCapturerSource[],
  display: Display,
): Electron.DesktopCapturerSource {
  const byId = sources.find((s) => s.display_id === String(display.id))
  if (byId) return byId
  const idx = screen.getAllDisplays().findIndex((d) => d.id === display.id)
  return sources[idx] ?? sources[0]
}

function resizeIfNeeded(image: Electron.NativeImage): Electron.NativeImage {
  const { width, height } = image.getSize()
  const longEdge = Math.max(width, height)
  if (longEdge <= MAX_LONG_EDGE) return image
  const ratio = MAX_LONG_EDGE / longEdge
  const newW = Math.round(width * ratio)
  const newH = Math.round(height * ratio)
  return image.resize({ width: newW, height: newH, quality: 'good' })
}

// Re-export so callers don't need a second import
export { nativeImage }
