import { resolveCoverImageSource } from './cover-cache'

type CoverPreloadTarget = {
  src: string | null
  cacheKey?: string | null
}

type CoverPreloadOptions = {
  limit?: number
  concurrency?: number
  timeoutMs?: number
}

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number
}

const preloadedCoverKeys = new Set<string>()

function targetKey(target: CoverPreloadTarget) {
  return `${target.cacheKey ?? ''}|${target.src ?? ''}`
}

function preloadImageSource(source: string | null) {
  if (!source || typeof Image === 'undefined') {
    return Promise.resolve(false)
  }

  return new Promise<boolean>((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      if (typeof image.decode === 'function') {
        void image.decode()
          .then(() => resolve(true))
          .catch(() => resolve(true))
        return
      }

      resolve(true)
    }
    image.onerror = () => resolve(false)
    image.src = source
  })
}

function scheduleIdleTask(task: () => void) {
  if (typeof window === 'undefined') {
    task()
    return
  }

  const idleWindow = window as IdleWindow

  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(task, { timeout: 1500 })
    return
  }

  window.setTimeout(task, 120)
}

async function preloadOneCover(target: CoverPreloadTarget) {
  const resolvedSource = await resolveCoverImageSource(target.src, target.cacheKey)
  await preloadImageSource(resolvedSource)
}

function collectPendingTargets(targets: CoverPreloadTarget[], limit: number) {
  return targets
    .filter((target) => target.src)
    .filter((target) => {
      const key = targetKey(target)

      if (preloadedCoverKeys.has(key)) {
        return false
      }

      preloadedCoverKeys.add(key)
      return true
    })
    .slice(0, limit)
}

async function runPreloadQueue(targets: CoverPreloadTarget[], concurrency: number) {
  let cursor = 0

  const runNext = async (): Promise<void> => {
    const target = targets[cursor]
    cursor += 1

    if (!target) {
      return
    }

    try {
      await preloadOneCover(target)
    } catch {
      // Preload is opportunistic; rendering should never depend on it.
    }

    await runNext()
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, targets.length) },
      () => runNext(),
    ),
  )
}

function withPreloadTimeout(task: Promise<void>, timeoutMs?: number) {
  if (!timeoutMs || timeoutMs <= 0 || typeof window === 'undefined') {
    return task
  }

  return new Promise<void>((resolve) => {
    let completed = false
    const timer = window.setTimeout(() => {
      if (completed) {
        return
      }

      completed = true
      resolve()
    }, timeoutMs)

    void task.finally(() => {
      if (completed) {
        return
      }

      completed = true
      window.clearTimeout(timer)
      resolve()
    })
  })
}

export function preloadCoverImagesNow(
  targets: CoverPreloadTarget[],
  options: CoverPreloadOptions = {},
) {
  const limit = options.limit ?? 12
  const concurrency = Math.max(1, options.concurrency ?? 2)
  const pendingTargets = collectPendingTargets(targets, limit)

  if (!pendingTargets.length) {
    return Promise.resolve()
  }

  return withPreloadTimeout(runPreloadQueue(pendingTargets, concurrency), options.timeoutMs)
}

export function preloadCoverImages(
  targets: CoverPreloadTarget[],
  options: CoverPreloadOptions = {},
) {
  const limit = options.limit ?? 12
  const concurrency = Math.max(1, options.concurrency ?? 2)
  const pendingTargets = collectPendingTargets(targets, limit)

  if (!pendingTargets.length) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    scheduleIdleTask(() => {
      void withPreloadTimeout(
        runPreloadQueue(pendingTargets, concurrency),
        options.timeoutMs,
      ).finally(resolve)
    })
  })
}
