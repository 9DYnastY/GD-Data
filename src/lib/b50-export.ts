import { Capacitor } from '@capacitor/core'
import { resolveCoverImageSource, shouldUseNativeCoverCache } from './cover-cache'

function isDirectoryAlreadyExistsError(error: unknown) {
  return (
    error instanceof Error &&
    (
      error.message.includes('already exists') ||
      error.message.includes('OS-PLUG-FILE-0010')
    )
  )
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Could not read export image blob.'))
    reader.readAsDataURL(blob)
  })
}

function waitForFonts() {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return Promise.resolve()
  }

  return document.fonts.ready.catch(() => {})
}

function waitForImages(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll('img'))

  return Promise.all(
    images.map((image) => {
      const decodeImage = () => {
        if (typeof image.decode !== 'function') {
          return Promise.resolve()
        }

        return image.decode().catch(() => {})
      }

      if (image.complete) {
        return decodeImage()
      }

      return new Promise<void>((resolve) => {
        image.addEventListener(
          'load',
          () => {
            void decodeImage().finally(() => resolve())
          },
          { once: true },
        )
        image.addEventListener('error', () => resolve(), { once: true })
      })
    }),
  ).then(() => undefined)
}

export type B50ExportFormat = 'png' | 'jpeg'

export interface B50ExportOptions {
  format?: B50ExportFormat
  quality?: number
  scale?: number
}

interface RelativeRect {
  left: number
  top: number
  width: number
  height: number
}

interface ExportTextPart {
  text: string
  rect: RelativeRect
  fontFamily: string
  fontSize: number
  fontStyle: string
  fontWeight: string
  letterSpacing: number
}

interface ExportGradientTextOverlay {
  backgroundImage: string
  rect: RelativeRect
  parts: ExportTextPart[]
}

const EXPORT_MIME_TYPE: Record<B50ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
}

const EXPORT_EXTENSION: Record<B50ExportFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
}

function buildFilename(baseName: string, format: B50ExportFormat = 'png') {
  return `${baseName.replace(/[^\w-]+/g, '_')}.${EXPORT_EXTENSION[format]}`
}

function normalizeExportQuality(quality?: number) {
  if (!Number.isFinite(quality)) {
    return 0.92
  }

  const nextQuality = Number(quality)
  const normalized = nextQuality > 1 ? nextQuality / 100 : nextQuality
  return Math.min(Math.max(normalized, 0), 1)
}

function parseCssPixelValue(value: string, fallback = 0) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toRelativeRect(rect: DOMRect, rootRect: DOMRect): RelativeRect {
  return {
    left: rect.left - rootRect.left,
    top: rect.top - rootRect.top,
    width: rect.width,
    height: rect.height,
  }
}

function getElementStyle(element: HTMLElement) {
  return element.ownerDocument.defaultView?.getComputedStyle(element) ?? window.getComputedStyle(element)
}

function hasGradientTextStyle(element: HTMLElement) {
  const style = getElementStyle(element)
  const backgroundImage = element.style.backgroundImage || style.backgroundImage

  return (
    backgroundImage.includes('linear-gradient') &&
    (
      style.backgroundClip === 'text' ||
      style.getPropertyValue('-webkit-background-clip') === 'text'
    )
  )
}

function buildTextPart(element: HTMLElement, rootRect: DOMRect): ExportTextPart {
  const style = getElementStyle(element)
  const fontSize = parseCssPixelValue(style.fontSize, 16)
  const letterSpacing = style.letterSpacing === 'normal'
    ? 0
    : parseCssPixelValue(style.letterSpacing, 0)

  return {
    text: (element.textContent ?? '').trim(),
    rect: toRelativeRect(element.getBoundingClientRect(), rootRect),
    fontFamily: style.fontFamily,
    fontSize,
    fontStyle: style.fontStyle || 'normal',
    fontWeight: style.fontWeight || '400',
    letterSpacing,
  }
}

function collectGradientTextOverlays(root: HTMLElement): ExportGradientTextOverlay[] {
  if (typeof window === 'undefined') {
    return []
  }

  const rootRect = root.getBoundingClientRect()
  const gradientElements = Array.from(
    root.querySelectorAll<HTMLElement>('.b50-player-board__name, .b50-player-board__skill-value'),
  ).filter(hasGradientTextStyle)

  return gradientElements.map((element) => {
    const style = getElementStyle(element)
    const parts = element.matches('.b50-player-board__skill-value')
      ? Array.from(element.querySelectorAll<HTMLElement>('span')).map((part) => buildTextPart(part, rootRect))
      : [buildTextPart(element, rootRect)]

    return {
      backgroundImage: element.style.backgroundImage || style.backgroundImage,
      rect: toRelativeRect(element.getBoundingClientRect(), rootRect),
      parts,
    }
  })
}

function hideGradientTextForHtml2Canvas(clonedRoot: HTMLElement) {
  const gradientElements = Array.from(
    clonedRoot.querySelectorAll<HTMLElement>('.b50-player-board__name, .b50-player-board__skill-value'),
  ).filter(hasGradientTextStyle)

  for (const element of gradientElements) {
    element.style.background = 'none'
    element.style.backgroundImage = 'none'
    element.style.color = 'transparent'
    element.style.webkitTextFillColor = 'transparent'
  }
}

function parseGradientStops(backgroundImage: string) {
  const stops: Array<{ color: string; offset: number }> = []
  const stopPattern = /((?:rgba?\([^)]*\))|(?:#[0-9a-fA-F]{3,8}))\s+([0-9.]+)%/g
  let match: RegExpExecArray | null

  while ((match = stopPattern.exec(backgroundImage)) !== null) {
    const offset = Number.parseFloat(match[2]) / 100

    if (Number.isFinite(offset)) {
      stops.push({
        color: match[1],
        offset: Math.min(1, Math.max(0, offset)),
      })
    }
  }

  return stops
}

function buildCanvasGradient(
  context: CanvasRenderingContext2D,
  overlay: ExportGradientTextOverlay,
  scaleY: number,
) {
  const top = overlay.rect.top * scaleY
  const bottom = (overlay.rect.top + overlay.rect.height) * scaleY
  const gradient = context.createLinearGradient(0, top, 0, bottom)
  const stops = parseGradientStops(overlay.backgroundImage)

  if (!stops.length) {
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(1, '#ffffff')
    return gradient
  }

  gradient.addColorStop(0, stops[0].color)

  for (const stop of stops) {
    gradient.addColorStop(stop.offset, stop.color)
  }

  gradient.addColorStop(1, stops[stops.length - 1].color)
  return gradient
}

function drawTextWithLetterSpacing(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number,
) {
  if (!letterSpacing) {
    context.fillText(text, x, y)
    return
  }

  let nextX = x

  for (const char of Array.from(text)) {
    context.fillText(char, nextX, y)
    nextX += context.measureText(char).width + letterSpacing
  }
}

function drawGradientTextOverlays(
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  overlays: ExportGradientTextOverlay[],
) {
  if (!overlays.length || !root.offsetWidth || !root.offsetHeight) {
    return canvas
  }

  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = canvas.width
  outputCanvas.height = canvas.height

  const context = outputCanvas.getContext('2d')
  if (!context) {
    return canvas
  }

  context.drawImage(canvas, 0, 0)
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.globalAlpha = 1
  context.globalCompositeOperation = 'source-over'

  const scaleX = canvas.width / root.offsetWidth
  const scaleY = canvas.height / root.offsetHeight

  for (const overlay of overlays) {
    const gradient = buildCanvasGradient(context, overlay, scaleY)

    for (const part of overlay.parts) {
      if (!part.text || part.rect.width <= 0 || part.rect.height <= 0) {
        continue
      }

      const x = part.rect.left * scaleX
      const y = part.rect.top * scaleY
      const width = part.rect.width * scaleX
      const height = part.rect.height * scaleY
      const fontSize = part.fontSize * scaleY
      const letterSpacing = part.letterSpacing * scaleX

      context.save()
      context.beginPath()
      context.rect(x, y, width, height)
      context.clip()
      context.fillStyle = gradient
      context.font = `${part.fontStyle} ${part.fontWeight} ${fontSize}px ${part.fontFamily}`
      context.textAlign = 'left'
      context.textBaseline = 'top'
      drawTextWithLetterSpacing(context, part.text, x, y, letterSpacing)
      context.restore()
    }
  }

  return outputCanvas
}

export function preloadImageSource(source: string | null) {
  if (!source || typeof Image === 'undefined') {
    return Promise.resolve(false)
  }

  return new Promise<boolean>((resolve) => {
    const image = new Image()
    image.decoding = 'sync'
    image.onload = () => {
      if (typeof image.decode === 'function') {
        void image.decode().finally(() => resolve(true))
        return
      }

      resolve(true)
    }
    image.onerror = () => resolve(false)
    image.src = source
  })
}

function inferImageMimeType(source: string) {
  const normalized = source.split('?')[0].toLowerCase()

  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'image/jpeg'
  }

  if (normalized.endsWith('.webp')) {
    return 'image/webp'
  }

  return 'image/png'
}

async function resolveNativeImageSourceForExport(source: string, cacheKey?: string) {
  const { FileTransfer } = await import('@capacitor/file-transfer')
  const { Directory, Filesystem } = await import('@capacitor/filesystem')
  const suffix = source.split('?')[0].split('.').pop()?.toLowerCase() || 'png'
  const safeKey = (cacheKey ?? `cover_${Date.now()}`).replace(/[^\w-]+/g, '_')
  const path = `b50-cache/${safeKey}.${suffix}`

  try {
    try {
      await Filesystem.mkdir({
        path: 'b50-cache',
        directory: Directory.Cache,
        recursive: true,
      })
    } catch (error) {
      if (!isDirectoryAlreadyExistsError(error)) {
        throw error
      }
    }

    const fileInfo = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    })

    await FileTransfer.downloadFile({
      url: source,
      path: fileInfo.uri,
    })

    const file = await Filesystem.readFile({
      path,
      directory: Directory.Cache,
    })

    if (typeof file.data !== 'string' || !file.data) {
      return source
    }

    return `data:${inferImageMimeType(source)};base64,${file.data}`
  } catch {
    return source
  } finally {
    try {
      await Filesystem.deleteFile({
        path,
        directory: Directory.Cache,
      })
    } catch {
      // Ignore cache cleanup failures; the export can still proceed with the resolved data.
    }
  }
}

export async function resolveImageSourceForExport(source: string | null, cacheKey?: string) {
  if (!source) {
    return source
  }

  if (source.startsWith('data:')) {
    return source
  }

  if (Capacitor.getPlatform() !== 'web') {
    if (shouldUseNativeCoverCache(source, cacheKey)) {
      const cachedSource = await resolveCoverImageSource(source, cacheKey)

      if (cachedSource && cachedSource !== source) {
        return cachedSource
      }
    }

    return resolveNativeImageSourceForExport(source, cacheKey)
  }

  if (typeof fetch === 'undefined') {
    return source
  }

  try {
    const response = await fetch(source, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache',
    })

    if (!response.ok) {
      return source
    }

    const blob = await response.blob()
    return await blobToDataUrl(blob)
  } catch {
    return source
  }
}

export async function exportElementAsImage(
  node: HTMLElement,
  baseName: string,
  options: B50ExportOptions = {},
) {
  await waitForFonts()
  await waitForImages(node)
  const gradientTextOverlays = collectGradientTextOverlays(node)

  const [{ default: html2canvas }, filesystemModule] = await Promise.all([
    import('html2canvas'),
    Capacitor.getPlatform() === 'web' ? Promise.resolve(null) : import('@capacitor/filesystem'),
  ])

  const format = options.format ?? 'png'
  const scale = Number.isFinite(options.scale) && Number(options.scale) > 0
    ? Number(options.scale)
    : 1
  const mimeType = EXPORT_MIME_TYPE[format]
  const quality = normalizeExportQuality(options.quality)

  const canvas = await html2canvas(node, {
    backgroundColor: null,
    useCORS: true,
    allowTaint: false,
    logging: false,
    scale,
    width: node.offsetWidth,
    height: node.offsetHeight,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
    onclone: (_document, clonedElement) => {
      hideGradientTextForHtml2Canvas(clonedElement as HTMLElement)
    },
  })
  const exportCanvas = drawGradientTextOverlays(canvas, node, gradientTextOverlays)

  const dataUrl = format === 'jpeg'
    ? exportCanvas.toDataURL(mimeType, quality)
    : exportCanvas.toDataURL(mimeType)
  const filename = buildFilename(baseName, format)

  if (Capacitor.getPlatform() === 'web') {
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = filename
    link.rel = 'noopener'
    link.click()
    return { filename, uri: null as string | null }
  }

  const { Directory, Filesystem } = filesystemModule!
  const file = await Filesystem.writeFile({
    path: filename,
    data: dataUrl.replace(/^data:[^;]+;base64,/, ''),
    directory: Directory.Documents,
  })

  return {
    filename,
    uri: file.uri ?? null,
  }
}

export async function exportElementAsPng(node: HTMLElement, baseName: string) {
  return exportElementAsImage(node, baseName, { format: 'png' })
}
