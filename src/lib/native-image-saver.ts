import { Capacitor, registerPlugin } from '@capacitor/core'

interface NativeImageSaverPlugin {
  saveImage(options: {
    dataBase64: string
    filename: string
    mimeType: string
  }): Promise<{
    uri?: string
  }>
}

const NativeImageSaver = registerPlugin<NativeImageSaverPlugin>('ImageSaver')

function inferImageMimeType(source: string | null) {
  const normalized = (source ?? '').split(/[?#]/, 1)[0].toLowerCase()

  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'image/jpeg'
  }

  if (normalized.endsWith('.webp')) {
    return 'image/webp'
  }

  return 'image/png'
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return 'jpg'
  }

  if (mimeType === 'image/webp') {
    return 'webp'
  }

  return 'png'
}

function sanitizeFilename(filename: string) {
  return filename
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || `cover-${Date.now()}`
}

function ensureFilenameExtension(filename: string, mimeType: string) {
  if (/\.[A-Za-z0-9]+$/.test(filename)) {
    return filename
  }

  return `${filename}.${extensionForMimeType(mimeType)}`
}

function dataUrlToBase64(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/)

  if (!match) {
    return null
  }

  return {
    mimeType: match[1],
    dataBase64: match[2],
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image data.'))
    reader.readAsDataURL(blob)
  })
}

async function downloadNativeImageBase64(source: string, mimeType: string) {
  const [{ FileTransfer }, { Directory, Filesystem }] = await Promise.all([
    import('@capacitor/file-transfer'),
    import('@capacitor/filesystem'),
  ])
  const extension = extensionForMimeType(mimeType)
  const directory = 'cover-save'
  const path = `${directory}/cover-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`

  try {
    try {
      await Filesystem.mkdir({
        path: directory,
        directory: Directory.Cache,
        recursive: true,
      })
    } catch {
      // Directory may already exist.
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

    return typeof file.data === 'string' ? file.data : null
  } finally {
    try {
      await Filesystem.deleteFile({
        path,
        directory: Directory.Cache,
      })
    } catch {
      // Cache cleanup is best effort.
    }
  }
}

async function fetchImageDataUrl(source: string) {
  const response = await fetch(source, {
    credentials: 'omit',
    cache: 'force-cache',
  })

  if (!response.ok) {
    throw new Error('Image download failed.')
  }

  return blobToDataUrl(await response.blob())
}

function downloadImageInBrowser(source: string, filename: string) {
  const link = document.createElement('a')
  link.href = source
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export async function saveImageToGallery(source: string | null, filenameBase: string) {
  if (!source) {
    throw new Error('Image source is empty.')
  }

  const inferredMimeType = inferImageMimeType(source)
  const safeFilenameBase = sanitizeFilename(filenameBase)
  const filename = ensureFilenameExtension(safeFilenameBase, inferredMimeType)

  if (Capacitor.getPlatform() === 'web') {
    const dataUrl = source.startsWith('data:') ? source : await fetchImageDataUrl(source)
    downloadImageInBrowser(dataUrl, filename)
    return { uri: null as string | null }
  }

  const parsedDataUrl = source.startsWith('data:') ? dataUrlToBase64(source) : null
  const mimeType = parsedDataUrl?.mimeType ?? inferredMimeType
  const dataBase64 = parsedDataUrl?.dataBase64 ?? await downloadNativeImageBase64(source, mimeType)

  if (!dataBase64) {
    throw new Error('Image data is empty.')
  }

  const result = await NativeImageSaver.saveImage({
    dataBase64,
    filename: ensureFilenameExtension(safeFilenameBase, mimeType),
    mimeType,
  })

  return {
    uri: result.uri ?? null,
  }
}
