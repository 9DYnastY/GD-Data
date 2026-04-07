import { Capacitor } from '@capacitor/core'

const COVER_CACHE_DIRECTORY = 'cover-cache'
const inflightCoverLoads = new Map<string, Promise<string>>()
const resolvedCoverSources = new Map<string, string>()

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

async function resolveCachedFileUri(cachePath: string) {
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
    const resolvedSource = Capacitor.convertFileSrc(file.uri)
    resolvedCoverSources.set(cachePath, resolvedSource)
    return resolvedSource
  } catch {
    return null
  }
}

async function downloadCoverToCache(source: string, cachePath: string) {
  const { FileTransfer } = await import('@capacitor/file-transfer')
  const targetUri = await getCacheFileUri(cachePath)

  await FileTransfer.downloadFile({
    url: source,
    path: targetUri,
  })

  return await resolveCachedFileUri(cachePath)
}

export async function resolveCoverImageSource(source: string | null, cacheKey?: string | null) {
  if (!source) {
    return null
  }

  if (!shouldUseNativeCoverCache(source, cacheKey)) {
    return source
  }

  const cachePath = buildCachePath(cacheKey!)
  const existingSource = await resolveCachedFileUri(cachePath)

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
