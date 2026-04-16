import { Capacitor } from '@capacitor/core'

const COVER_CACHE_DIRECTORY = 'cover-cache'
const MIN_VALID_COVER_BYTES = 1024
const inflightCoverLoads = new Map<string, Promise<string>>()
const resolvedCoverSources = new Map<string, string>()

type CoverCacheMetadata = {
  source: string
  size: number
  contentLength: number | null
  savedAt: number
}

function isDirectoryAlreadyExistsError(error: unknown) {
  return (
    error instanceof Error &&
    (
      error.message.includes('already exists') ||
      error.message.includes('OS-PLUG-FILE-0010')
    )
  )
}

function extractFilename(source: string) {
  const normalized = source.split(/[?#]/, 1)[0] ?? ''
  const rawFilename = normalized.split('/').pop() ?? ''
  return rawFilename.trim()
}

function sanitizeFilename(filename: string) {
  const sanitized = filename.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return sanitized || 'cover.png'
}

function ensureFilenameExtension(filename: string) {
  return /\.[A-Za-z0-9]+$/.test(filename) ? filename : `${filename}.png`
}

function buildCachePath(cacheKey: string) {
  return `${COVER_CACHE_DIRECTORY}/${cacheKey}`
}

function buildCacheMetaPath(cachePath: string) {
  return `${cachePath}.meta.json`
}

function appendCacheVersion(source: string, size: number, mtime: number) {
  const separator = source.includes('?') ? '&' : '?'
  return `${source}${separator}v=${encodeURIComponent(`${mtime}-${size}`)}`
}

async function getCacheFileUri(cachePath: string) {
  const { Directory, Filesystem } = await import('@capacitor/filesystem')

  try {
    await Filesystem.mkdir({
      path: COVER_CACHE_DIRECTORY,
      directory: Directory.Data,
      recursive: true,
    })
  } catch (error) {
    if (!isDirectoryAlreadyExistsError(error)) {
      throw error
    }
  }

  const file = await Filesystem.getUri({
    path: cachePath,
    directory: Directory.Data,
  })

  return file.uri
}

async function deleteCacheFile(path: string) {
  const { Directory, Filesystem } = await import('@capacitor/filesystem')

  try {
    await Filesystem.deleteFile({
      path,
      directory: Directory.Data,
    })
  } catch {
    // Missing files and cleanup failures should not block a new download attempt.
  }
}

async function deleteCachedCover(cachePath: string) {
  resolvedCoverSources.delete(cachePath)
  await Promise.all([
    deleteCacheFile(cachePath),
    deleteCacheFile(buildCacheMetaPath(cachePath)),
  ])
}

async function readCacheMetadata(cachePath: string) {
  const { Directory, Encoding, Filesystem } = await import('@capacitor/filesystem')

  try {
    const result = await Filesystem.readFile({
      path: buildCacheMetaPath(cachePath),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    })

    if (typeof result.data !== 'string') {
      return null
    }

    return JSON.parse(result.data) as CoverCacheMetadata
  } catch {
    return null
  }
}

async function writeCacheMetadata(cachePath: string, metadata: CoverCacheMetadata) {
  const { Directory, Encoding, Filesystem } = await import('@capacitor/filesystem')

  await Filesystem.writeFile({
    path: buildCacheMetaPath(cachePath),
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    data: JSON.stringify(metadata),
  })
}

function isTrustedCacheFile(
  source: string,
  size: number,
  metadata: CoverCacheMetadata | null,
) {
  if (!metadata) {
    return false
  }

  if (metadata.source !== source || metadata.size !== size) {
    return false
  }

  if (metadata.contentLength !== null && metadata.contentLength > 0 && size < metadata.contentLength) {
    return false
  }

  return true
}

function canDecodeImageSource(source: string) {
  if (typeof Image === 'undefined') {
    return Promise.resolve(true)
  }

  return new Promise<boolean>((resolve) => {
    const image = new Image()
    image.decoding = 'sync'
    image.onload = () => {
      const hasDimensions = image.naturalWidth > 0 && image.naturalHeight > 0

      if (typeof image.decode === 'function') {
        void image.decode()
          .then(() => resolve(hasDimensions))
          .catch(() => resolve(false))
        return
      }

      resolve(hasDimensions)
    }
    image.onerror = () => resolve(false)
    image.src = source
  })
}

function isRemoteImageSource(source: string) {
  return /^https?:\/\//i.test(source)
}

function isNativeRuntime() {
  return Capacitor.getPlatform() !== 'web'
}

export function createCoverCacheKey(musicId: number, source: string | null) {
  if (!source) {
    return null
  }

  const filename = ensureFilenameExtension(sanitizeFilename(extractFilename(source)))
  return `${musicId}_${filename}`
}

export function shouldUseNativeCoverCache(source: string | null, cacheKey?: string | null) {
  return Boolean(source && cacheKey && isNativeRuntime() && isRemoteImageSource(source))
}

async function resolveCachedFileUri(source: string, cachePath: string) {
  const cachedSource = resolvedCoverSources.get(cachePath)

  if (cachedSource) {
    return cachedSource
  }

  const { Directory, Filesystem } = await import('@capacitor/filesystem')

  try {
    const file = await Filesystem.stat({
      path: cachePath,
      directory: Directory.Data,
    })

    if (file.size < MIN_VALID_COVER_BYTES) {
      await deleteCachedCover(cachePath)
      return null
    }

    const metadata = await readCacheMetadata(cachePath)

    if (!isTrustedCacheFile(source, file.size, metadata)) {
      await deleteCachedCover(cachePath)
      return null
    }

    const resolvedSource = appendCacheVersion(
      Capacitor.convertFileSrc(file.uri),
      file.size,
      file.mtime,
    )

    if (!await canDecodeImageSource(resolvedSource)) {
      await deleteCachedCover(cachePath)
      return null
    }

    resolvedCoverSources.set(cachePath, resolvedSource)
    return resolvedSource
  } catch {
    return null
  }
}

async function downloadCoverToCache(source: string, cachePath: string) {
  const { FileTransfer } = await import('@capacitor/file-transfer')
  const { Directory, Filesystem } = await import('@capacitor/filesystem')
  const tempPath = `${cachePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const targetUri = await getCacheFileUri(tempPath)
  let downloadedBytes = 0
  let contentLength: number | null = null

  const progressHandle = await FileTransfer.addListener('progress', (progress) => {
    if (progress.type !== 'download' || progress.url !== source) {
      return
    }

    downloadedBytes = progress.bytes
    contentLength = progress.contentLength > 0 ? progress.contentLength : null
  })

  try {
    await FileTransfer.downloadFile({
      url: source,
      path: targetUri,
      progress: true,
    })

    const tempFile = await Filesystem.stat({
      path: tempPath,
      directory: Directory.Data,
    })

    const expectedBytes = contentLength ?? downloadedBytes

    if (tempFile.size < MIN_VALID_COVER_BYTES) {
      throw new Error('Downloaded cover is too small.')
    }

    if (expectedBytes > 0 && tempFile.size < expectedBytes) {
      throw new Error('Downloaded cover is incomplete.')
    }

    const tempSource = appendCacheVersion(
      Capacitor.convertFileSrc(tempFile.uri),
      tempFile.size,
      tempFile.mtime,
    )

    if (!await canDecodeImageSource(tempSource)) {
      throw new Error('Downloaded cover cannot be decoded.')
    }

    await deleteCachedCover(cachePath)
    await Filesystem.rename({
      from: tempPath,
      to: cachePath,
      directory: Directory.Data,
      toDirectory: Directory.Data,
    })

    const finalFile = await Filesystem.stat({
      path: cachePath,
      directory: Directory.Data,
    })

    await writeCacheMetadata(cachePath, {
      source,
      size: finalFile.size,
      contentLength,
      savedAt: Date.now(),
    })

    return await resolveCachedFileUri(source, cachePath)
  } catch (error) {
    await deleteCacheFile(tempPath)
    throw error
  } finally {
    await progressHandle.remove()
  }
}

export async function resolveCoverImageSource(source: string | null, cacheKey?: string | null) {
  if (!source) {
    return null
  }

  if (!shouldUseNativeCoverCache(source, cacheKey)) {
    return source
  }

  const cachePath = buildCachePath(cacheKey!)
  const existingSource = await resolveCachedFileUri(source, cachePath)

  if (existingSource) {
    return existingSource
  }

  const inflightSource = inflightCoverLoads.get(cachePath)

  if (inflightSource) {
    return inflightSource
  }

  const nextSourcePromise = (async () => {
    try {
      return (await downloadCoverToCache(source, cachePath)) ?? source
    } catch {
      return source
    } finally {
      inflightCoverLoads.delete(cachePath)
    }
  })()

  inflightCoverLoads.set(cachePath, nextSourcePromise)
  return nextSourcePromise
}

export async function invalidateCoverImageCache(cacheKey?: string | null) {
  if (!cacheKey || !isNativeRuntime()) {
    return
  }

  const cachePath = buildCachePath(cacheKey)
  await deleteCachedCover(cachePath)
}
