import type { BjmaniaGitadoraSnapshot } from '../../types/bjmania'
import { showAppToast } from '../app-toast'
import { saveBjmaniaSkillSnapshotCache } from './cache'
import { mergeBjmaniaRecentHistory, type RecentHistoryMergeResult } from './recent-history'

const RECENT_HISTORY_PENDING_KEY = 'gddata:bjmania-recent-history-pending'

export interface BjmaniaSnapshotPersistenceResult extends RecentHistoryMergeResult {
  storageError: unknown | null
}

function readPendingCounts() {
  if (typeof window === 'undefined') {
    return {} as Record<string, number>
  }

  try {
    const raw = window.localStorage.getItem(RECENT_HISTORY_PENDING_KEY)
    const parsed = raw ? JSON.parse(raw) as unknown : null

    if (!parsed || typeof parsed !== 'object') {
      return {} as Record<string, number>
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => (
        typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0
      )),
    )
  } catch {
    return {} as Record<string, number>
  }
}

function writePendingCounts(counts: Record<string, number>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (Object.keys(counts).length === 0) {
      window.localStorage.removeItem(RECENT_HISTORY_PENDING_KEY)
    } else {
      window.localStorage.setItem(RECENT_HISTORY_PENDING_KEY, JSON.stringify(counts))
    }
  } catch {
    // The history itself remains durable even when this optional notification counter cannot be saved.
  }
}

function addPendingCount(userId: string, count: number) {
  if (count <= 0) {
    return
  }

  const counts = readPendingCounts()
  counts[userId] = (counts[userId] ?? 0) + count
  writePendingCounts(counts)
}

function takePendingCount(userId: string) {
  const counts = readPendingCounts()
  const count = counts[userId] ?? 0
  delete counts[userId]
  writePendingCounts(counts)
  return count
}

export function clearPendingBjmaniaRecentHistoryAnnouncements() {
  writePendingCounts({})
}

export async function persistBjmaniaSnapshot(
  snapshot: BjmaniaGitadoraSnapshot,
  options?: {
    trackNewRecentPlays?: boolean
    announceNewRecentPlays?: boolean
  },
): Promise<BjmaniaSnapshotPersistenceResult> {
  saveBjmaniaSkillSnapshotCache(snapshot)
  const userId = snapshot.authUser.id.trim()

  if (!userId) {
    return {
      addedCount: 0,
      storageAvailable: false,
      storageError: new Error('BJMANIA user id is unavailable.'),
    }
  }

  try {
    const result = await mergeBjmaniaRecentHistory(
      userId,
      snapshot.recentPlays.recentPlayEntries,
    )

    if (options?.announceNewRecentPlays) {
      const announcementCount = takePendingCount(userId) + result.addedCount

      if (announcementCount > 0) {
        showAppToast(`新增 ${announcementCount}条游玩记录`)
      }
    } else if (options?.trackNewRecentPlays) {
      addPendingCount(userId, result.addedCount)
    }

    return { ...result, storageError: null }
  } catch (storageError) {
    return {
      addedCount: 0,
      storageAvailable: false,
      storageError,
    }
  }
}
