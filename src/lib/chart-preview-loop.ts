export interface PlaybackLoopRange {
  startTime: number
  endTime: number
}

export function resolvePlaybackLoopRange(bookmarks: number[]): PlaybackLoopRange | null {
  const [firstBookmark, secondBookmark] = bookmarks

  if (!Number.isFinite(firstBookmark) || !Number.isFinite(secondBookmark)) {
    return null
  }

  const startTime = Math.min(firstBookmark, secondBookmark)
  const endTime = Math.max(firstBookmark, secondBookmark)

  return endTime > startTime ? { startTime, endTime } : null
}

export function clampPlaybackLoopRange(
  range: PlaybackLoopRange | null,
  duration: number,
): PlaybackLoopRange | null {
  if (!range || !Number.isFinite(duration) || duration <= 0) {
    return null
  }

  const startTime = Math.min(duration, Math.max(0, range.startTime))
  const endTime = Math.min(duration, Math.max(0, range.endTime))

  return endTime > startTime ? { startTime, endTime } : null
}

export function resolvePlaybackLoopSeekTime(
  currentTime: number,
  range: PlaybackLoopRange | null,
) {
  if (!range || (currentTime >= range.startTime && currentTime < range.endTime)) {
    return null
  }

  return range.startTime
}
