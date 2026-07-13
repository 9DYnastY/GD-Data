import type {
  BjmaniaRecentPlay,
  BjmaniaRecentPlayPayload,
  BjmaniaScoreFamily,
} from '../../types/bjmania'

const RECENT_HISTORY_DB_NAME = 'gddata-bjmania-history'
const RECENT_HISTORY_DB_VERSION = 2
const RECENT_HISTORY_STORE = 'recent-plays'
const RECENT_HISTORY_USER_TIME_INDEX = 'by-user-time'
const RECENT_HISTORY_USER_FAMILY_TIME_INDEX = 'by-user-family-time'
const RECENT_HISTORY_USER_MUSIC_TIME_INDEX = 'by-user-music-time'

export interface StoredBjmaniaRecentPlay extends BjmaniaRecentPlay {
  id: string
  userId: string
  capturedAt: number
  lastSeenAt: number
  musicId: number | null
  gameSpec: number | null
  seq: number | null
  gameVersion: number | null
  family: BjmaniaScoreFamily | null
}

export interface RecentHistoryMergeResult {
  addedCount: number
  storageAvailable: boolean
}

export interface RecentHistoryPage {
  records: StoredBjmaniaRecentPlay[]
  hasMore: boolean
  storageAvailable: boolean
}

function normalizeInteger(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isInteger(parsed) ? parsed : null
  }

  return null
}

function resolveRecentFamily(gameSpec: number | null, seq: number | null): BjmaniaScoreFamily | null {
  if (gameSpec === 1 && seq !== null && seq >= 1 && seq <= 4) {
    return 'dm'
  }

  if (gameSpec === 0 && seq !== null && seq >= 1 && seq <= 8) {
    return 'gf'
  }

  return null
}

function stableStringHash(value: string) {
  let first = 0x811c9dc5
  let second = 0x9e3779b9

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }

  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

function normalizedPayload(play: BjmaniaRecentPlay): BjmaniaRecentPlayPayload | null {
  return play.payload && typeof play.payload === 'object' ? play.payload : null
}

export function createRecentPlayHistoryId(userId: string, play: BjmaniaRecentPlay) {
  const payload = normalizedPayload(play)
  const timestamp = normalizeInteger(play.timestamp)
  const musicId = normalizeInteger(payload?.MusicId)
  const gameSpec = normalizeInteger(payload?.GameSpec)
  const seq = normalizeInteger(payload?.Seq)
  const userPrefix = encodeURIComponent(userId.trim() || 'unknown')

  if (timestamp !== null && timestamp > 0 && musicId !== null && gameSpec !== null && seq !== null) {
    return `${userPrefix}:play:${timestamp}:${musicId}:${gameSpec}:${seq}`
  }

  const fallbackSource = [play.format, String(play.timestamp), play.content].join('\u001f')
  return `${userPrefix}:raw:${stableStringHash(fallbackSource)}`
}

export function normalizeRecentPlayHistoryRecords(
  userId: string,
  recentPlays: readonly BjmaniaRecentPlay[],
  capturedAt = Date.now(),
) {
  const records = new Map<string, StoredBjmaniaRecentPlay>()

  recentPlays.forEach((play) => {
    const payload = normalizedPayload(play)
    const gameSpec = normalizeInteger(payload?.GameSpec)
    const seq = normalizeInteger(payload?.Seq)
    const id = createRecentPlayHistoryId(userId, play)

    records.set(id, {
      id,
      userId,
      capturedAt,
      lastSeenAt: capturedAt,
      format: typeof play.format === 'string' ? play.format : '',
      content: typeof play.content === 'string' ? play.content : '',
      timestamp: normalizeInteger(play.timestamp) ?? 0,
      comment: typeof play.comment === 'string' ? play.comment : '',
      payload,
      musicId: normalizeInteger(payload?.MusicId),
      gameSpec,
      seq,
      gameVersion: normalizeInteger(payload?.GitadoraVersion),
      family: resolveRecentFamily(gameSpec, seq),
    })
  })

  return [...records.values()]
}

function openRecentHistoryDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null)
  }

  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(RECENT_HISTORY_DB_NAME, RECENT_HISTORY_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      const store = db.objectStoreNames.contains(RECENT_HISTORY_STORE)
        ? request.transaction?.objectStore(RECENT_HISTORY_STORE)
        : db.createObjectStore(RECENT_HISTORY_STORE, { keyPath: 'id' })

      if (store && !store.indexNames.contains(RECENT_HISTORY_USER_TIME_INDEX)) {
        store.createIndex(RECENT_HISTORY_USER_TIME_INDEX, ['userId', 'timestamp'])
      }

      if (store && !store.indexNames.contains(RECENT_HISTORY_USER_FAMILY_TIME_INDEX)) {
        store.createIndex(RECENT_HISTORY_USER_FAMILY_TIME_INDEX, ['userId', 'family', 'timestamp'])
      }

      if (store && !store.indexNames.contains(RECENT_HISTORY_USER_MUSIC_TIME_INDEX)) {
        store.createIndex(RECENT_HISTORY_USER_MUSIC_TIME_INDEX, ['userId', 'musicId', 'timestamp'])
      }
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function mergeBjmaniaRecentHistory(
  userId: string,
  recentPlays: readonly BjmaniaRecentPlay[],
): Promise<RecentHistoryMergeResult> {
  const db = await openRecentHistoryDb()

  if (!db) {
    return { addedCount: 0, storageAvailable: false }
  }

  const records = normalizeRecentPlayHistoryRecords(userId, recentPlays)

  if (records.length === 0) {
    db.close()
    return { addedCount: 0, storageAvailable: true }
  }

  return await new Promise<RecentHistoryMergeResult>((resolve, reject) => {
    const transaction = db.transaction(RECENT_HISTORY_STORE, 'readwrite')
    const store = transaction.objectStore(RECENT_HISTORY_STORE)
    let addedCount = 0

    records.forEach((record) => {
      const request = store.get(record.id)

      request.onsuccess = () => {
        const existing = request.result as StoredBjmaniaRecentPlay | undefined

        if (!existing) {
          addedCount += 1
        }

        store.put({
          ...record,
          capturedAt: existing?.capturedAt ?? record.capturedAt,
        } satisfies StoredBjmaniaRecentPlay)
      }
    })

    transaction.oncomplete = () => {
      db.close()
      resolve({ addedCount, storageAvailable: true })
    }
    transaction.onerror = () => {
      const error = transaction.error
      db.close()
      reject(error)
    }
    transaction.onabort = () => {
      const error = transaction.error
      db.close()
      reject(error)
    }
  })
}

export async function loadBjmaniaRecentHistoryPage(options: {
  userId: string
  family: BjmaniaScoreFamily
  offset?: number
  limit?: number
  startTime?: number
  endTime?: number
}): Promise<RecentHistoryPage> {
  const db = await openRecentHistoryDb()

  if (!db) {
    return { records: [], hasMore: false, storageAvailable: false }
  }

  const offset = Math.max(0, Math.trunc(options.offset ?? 0))
  const limit = Math.max(1, Math.trunc(options.limit ?? 50))

  return await new Promise<RecentHistoryPage>((resolve, reject) => {
    const transaction = db.transaction(RECENT_HISTORY_STORE, 'readonly')
    const index = transaction.objectStore(RECENT_HISTORY_STORE).index(RECENT_HISTORY_USER_FAMILY_TIME_INDEX)
    const hasOpenEnd = typeof options.endTime === 'number' && Number.isFinite(options.endTime)
    const range = IDBKeyRange.bound(
      [options.userId, options.family, options.startTime ?? Number.MIN_SAFE_INTEGER],
      [options.userId, options.family, options.endTime ?? Number.MAX_SAFE_INTEGER],
      false,
      hasOpenEnd,
    )
    const request = index.openCursor(range, 'prev')
    const records: StoredBjmaniaRecentPlay[] = []
    let advanced = offset === 0

    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor || records.length >= limit + 1) {
        return
      }

      if (!advanced) {
        advanced = true
        cursor.advance(offset)
        return
      }

      records.push(cursor.value as StoredBjmaniaRecentPlay)
      cursor.continue()
    }
    transaction.oncomplete = () => {
      db.close()
      resolve({
        records: records.slice(0, limit),
        hasMore: records.length > limit,
        storageAvailable: true,
      })
    }
    transaction.onerror = () => {
      const error = transaction.error
      db.close()
      reject(error)
    }
  })
}

export async function loadAllBjmaniaRecentHistoryForFamily(options: {
  userId: string
  family: BjmaniaScoreFamily
}) {
  return await loadBjmaniaRecentHistoryPage({
    ...options,
    limit: Number.MAX_SAFE_INTEGER - 1,
  })
}

export async function loadBjmaniaRecentHistoryRange(options: {
  userId: string
  family: BjmaniaScoreFamily
  startTime: number
  endTime: number
}) {
  return await loadBjmaniaRecentHistoryPage({
    ...options,
    limit: Number.MAX_SAFE_INTEGER - 1,
  })
}

export async function loadBjmaniaRecentHistoryForMusic(options: {
  userId: string
  musicId: number
}): Promise<RecentHistoryPage> {
  const db = await openRecentHistoryDb()

  if (!db) {
    return { records: [], hasMore: false, storageAvailable: false }
  }

  if (!Number.isFinite(options.musicId)) {
    db.close()
    return { records: [], hasMore: false, storageAvailable: true }
  }

  return await new Promise<RecentHistoryPage>((resolve, reject) => {
    const transaction = db.transaction(RECENT_HISTORY_STORE, 'readonly')
    const store = transaction.objectStore(RECENT_HISTORY_STORE)
    const records: StoredBjmaniaRecentPlay[] = []

    const readFromIndex = () => {
      const index = store.index(RECENT_HISTORY_USER_MUSIC_TIME_INDEX)
      const range = IDBKeyRange.bound(
        [options.userId, options.musicId, Number.MIN_SAFE_INTEGER],
        [options.userId, options.musicId, Number.MAX_SAFE_INTEGER],
      )
      const request = index.openCursor(range, 'next')

      request.onsuccess = () => {
        const cursor = request.result

        if (!cursor) {
          return
        }

        records.push(cursor.value as StoredBjmaniaRecentPlay)
        cursor.continue()
      }
    }

    // Older DBs may still be mid-upgrade; fall back to a filtered user-time scan.
    if (store.indexNames.contains(RECENT_HISTORY_USER_MUSIC_TIME_INDEX)) {
      readFromIndex()
    } else {
      const index = store.index(RECENT_HISTORY_USER_TIME_INDEX)
      const range = IDBKeyRange.bound(
        [options.userId, Number.MIN_SAFE_INTEGER],
        [options.userId, Number.MAX_SAFE_INTEGER],
      )
      const request = index.openCursor(range, 'next')

      request.onsuccess = () => {
        const cursor = request.result

        if (!cursor) {
          return
        }

        const record = cursor.value as StoredBjmaniaRecentPlay

        if (record.musicId === options.musicId) {
          records.push(record)
        }

        cursor.continue()
      }
    }

    transaction.oncomplete = () => {
      db.close()
      resolve({
        records,
        hasMore: false,
        storageAvailable: true,
      })
    }
    transaction.onerror = () => {
      const error = transaction.error
      db.close()
      reject(error)
    }
  })
}

export async function countBjmaniaRecentHistory() {
  const db = await openRecentHistoryDb()

  if (!db) {
    return 0
  }

  return await new Promise<number>((resolve, reject) => {
    const transaction = db.transaction(RECENT_HISTORY_STORE, 'readonly')
    const request = transaction.objectStore(RECENT_HISTORY_STORE).count()
    let count = 0

    request.onsuccess = () => {
      count = request.result
    }
    transaction.oncomplete = () => {
      db.close()
      resolve(count)
    }
    transaction.onerror = () => {
      const error = transaction.error
      db.close()
      reject(error)
    }
  })
}

export async function clearBjmaniaRecentHistory() {
  const db = await openRecentHistoryDb()

  if (!db) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(RECENT_HISTORY_STORE, 'readwrite')
    transaction.objectStore(RECENT_HISTORY_STORE).clear()
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      const error = transaction.error
      db.close()
      reject(error)
    }
  })
}
