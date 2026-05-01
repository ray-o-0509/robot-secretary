import { desktopCapturer, screen } from 'electron'

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
