const AUDIO_BLOB_CACHE_LIMIT = 6
const AUDIO_METADATA_TIMEOUT_MS = 15000
const audioBlobCache = new Map<string, Promise<Blob>>()

export interface LoadedChartAudio {
  element: HTMLAudioElement
  duration: number
  destroy: () => void
}

function rememberAudioBlob(url: string, promise: Promise<Blob>) {
  audioBlobCache.delete(url)
  audioBlobCache.set(url, promise)

  while (audioBlobCache.size > AUDIO_BLOB_CACHE_LIMIT) {
    const oldestUrl = audioBlobCache.keys().next().value as string | undefined

    if (!oldestUrl) {
      break
    }

    audioBlobCache.delete(oldestUrl)
  }
}

async function downloadAudioBlob(url: string) {
  const cachedPromise = audioBlobCache.get(url)

  if (cachedPromise) {
    rememberAudioBlob(url, cachedPromise)
    return await cachedPromise
  }

  const promise = fetch(url, { cache: 'force-cache' })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`音频文件加载失败 (${response.status})`)
      }

      const blob = await response.blob()

      if (blob.size === 0) {
        throw new Error('音频文件为空')
      }

      return blob.type ? blob : new Blob([blob], { type: 'audio/ogg' })
    })
    .catch((error) => {
      audioBlobCache.delete(url)
      throw error
    })

  rememberAudioBlob(url, promise)
  return await promise
}

function waitForAudioMetadata(audio: HTMLAudioElement) {
  return new Promise<number>((resolve, reject) => {
    let timeout = 0

    const cleanup = () => {
      window.clearTimeout(timeout)
      audio.removeEventListener('loadedmetadata', handleMetadata)
      audio.removeEventListener('durationchange', handleMetadata)
      audio.removeEventListener('error', handleError)
    }
    const handleMetadata = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        return
      }

      cleanup()
      resolve(audio.duration)
    }
    const handleError = () => {
      cleanup()
      reject(new Error('音频文件无法解码'))
    }

    audio.addEventListener('loadedmetadata', handleMetadata)
    audio.addEventListener('durationchange', handleMetadata)
    audio.addEventListener('error', handleError)
    timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('音频初始化超时'))
    }, AUDIO_METADATA_TIMEOUT_MS)
    handleMetadata()
  })
}

export async function loadChartAudio(url: string): Promise<LoadedChartAudio> {
  const blob = await downloadAudioBlob(url)
  const objectUrl = URL.createObjectURL(blob)
  const audio = new Audio()

  audio.preload = 'auto'
  audio.playbackRate = 1
  audio.src = objectUrl

  try {
    audio.load()
    const duration = await waitForAudioMetadata(audio)
    let destroyed = false

    return {
      element: audio,
      duration,
      destroy: () => {
        if (destroyed) {
          return
        }

        destroyed = true
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        URL.revokeObjectURL(objectUrl)
      },
    }
  } catch (error) {
    audio.removeAttribute('src')
    audio.load()
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}
