const AUDIO_BLOB_CACHE_LIMIT = 6
const AUDIO_CONTEXT_RESUME_TIMEOUT_MS = 5000
const PLAYBACK_START_DELAY_SECONDS = 0.05
const audioBlobCache = new Map<string, Promise<Blob>>()
let sharedAudioContext: AudioContext | null = null

export interface LoadedChartAudio {
  readonly currentTime: number
  readonly duration: number
  destroy: () => void
  pause: () => void
  play: () => Promise<void>
  seek: (time: number) => void
}

function getAudioContext() {
  if (!sharedAudioContext) {
    if (typeof AudioContext === 'undefined') {
      throw new Error('当前环境不支持音频播放')
    }

    sharedAudioContext = new AudioContext()
  }

  return sharedAudioContext
}

async function resumeAudioContext(context: AudioContext) {
  if (context.state === 'running') {
    return
  }

  let timeout = 0

  try {
    await Promise.race([
      context.resume(),
      new Promise<never>((_resolve, reject) => {
        timeout = window.setTimeout(
          () => reject(new Error('音频设备启动超时')),
          AUDIO_CONTEXT_RESUME_TIMEOUT_MS,
        )
      }),
    ])
  } finally {
    window.clearTimeout(timeout)
  }

  if ((context.state as string) !== 'running') {
    throw new Error('音频设备启动失败')
  }
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

      return blob
    })
    .catch((error) => {
      audioBlobCache.delete(url)
      throw error
    })

  rememberAudioBlob(url, promise)
  return await promise
}

function createLoadedChartAudio(context: AudioContext, decodedBuffer: AudioBuffer): LoadedChartAudio {
  const duration = decodedBuffer.duration
  let buffer: AudioBuffer | null = decodedBuffer
  let source: AudioBufferSourceNode | null = null
  let offset = 0
  let startedAt = 0
  let playing = false
  let destroyed = false

  const clampTime = (time: number) => Math.min(duration, Math.max(0, time))
  const getCurrentTime = () => {
    if (!playing) {
      return offset
    }

    return clampTime(offset + Math.max(0, context.currentTime - startedAt))
  }
  const stopSource = () => {
    if (!source) {
      return
    }

    source.onended = null

    try {
      source.stop()
    } catch {
      // The source may already have ended.
    }

    source.disconnect()
    source = null
  }
  const scheduleSource = () => {
    if (!buffer || offset >= duration) {
      return
    }

    const nextSource = context.createBufferSource()
    const startAt = context.currentTime + PLAYBACK_START_DELAY_SECONDS
    nextSource.buffer = buffer
    nextSource.connect(context.destination)
    nextSource.onended = () => {
      if (source !== nextSource) {
        return
      }

      nextSource.disconnect()
      source = null
      offset = duration
      startedAt = 0
      playing = false
    }
    source = nextSource
    startedAt = startAt
    playing = true
    nextSource.start(startAt, offset)
  }
  const pause = () => {
    offset = getCurrentTime()
    playing = false
    startedAt = 0
    stopSource()
  }

  return {
    duration,
    get currentTime() {
      return getCurrentTime()
    },
    async play() {
      if (destroyed || !buffer) {
        throw new Error('音频已释放')
      }

      if (offset >= duration) {
        offset = 0
      }

      await resumeAudioContext(context)

      if (destroyed || !buffer) {
        throw new Error('音频已释放')
      }

      stopSource()
      scheduleSource()
    },
    pause,
    seek(time: number) {
      if (destroyed) {
        return
      }

      const shouldResume = playing
      playing = false
      startedAt = 0
      stopSource()
      offset = clampTime(time)

      if (shouldResume) {
        scheduleSource()
      }
    },
    destroy() {
      if (destroyed) {
        return
      }

      pause()
      destroyed = true
      buffer = null
    },
  }
}

export async function loadChartAudio(url: string): Promise<LoadedChartAudio> {
  const blob = await downloadAudioBlob(url)
  const context = getAudioContext()
  const decodedBuffer = await context.decodeAudioData(await blob.arrayBuffer())

  if (!Number.isFinite(decodedBuffer.duration) || decodedBuffer.duration <= 0) {
    throw new Error('音频文件无法解码')
  }

  return createLoadedChartAudio(context, decodedBuffer)
}
