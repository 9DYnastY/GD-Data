export interface CalendarMonthCell {
  dateKey: string | null
  day: number | null
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

export function formatLocalDateKey(timestampSeconds: number) {
  const date = new Date(timestampSeconds * 1000)

  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

export function buildCalendarMonthCells(year: number, month: number) {
  const firstWeekday = new Date(year, month, 1).getDay()
  const mondayFirstOffset = (firstWeekday + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: CalendarMonthCell[] = Array.from({ length: mondayFirstOffset }, () => ({
    dateKey: null,
    day: null,
  }))

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      dateKey: `${year}-${padDatePart(month + 1)}-${padDatePart(day)}`,
      day,
    })
  }

  while (cells.length % 7 !== 0) {
    cells.push({ dateKey: null, day: null })
  }

  return cells
}

export function getLocalMonthRange(year: number, month: number) {
  return {
    startTime: Math.floor(new Date(year, month, 1).getTime() / 1000),
    endTime: Math.floor(new Date(year, month + 1, 1).getTime() / 1000),
  }
}

export function getLocalDateRange(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)

  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const start = new Date(year, month, day)

  if (
    start.getFullYear() !== year
    || start.getMonth() !== month
    || start.getDate() !== day
  ) {
    return null
  }

  return {
    startTime: Math.floor(start.getTime() / 1000),
    endTime: Math.floor(new Date(year, month, day + 1).getTime() / 1000),
  }
}

export function shiftCalendarMonth(year: number, month: number, offset: number) {
  const shifted = new Date(year, month + offset, 1)
  return { year: shifted.getFullYear(), month: shifted.getMonth() }
}

export function formatHistoryDateLabel(dateKey: string, today = new Date()) {
  const range = getLocalDateRange(dateKey)

  if (!range) {
    return dateKey
  }

  const date = new Date(range.startTime * 1000)
  const todayKey = formatLocalDateKey(today.getTime() / 1000)
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const yesterdayKey = formatLocalDateKey(yesterday.getTime() / 1000)
  const dateText = `${date.getMonth() + 1}月${date.getDate()}日`

  if (dateKey === todayKey) {
    return `今天 · ${dateText}`
  }

  if (dateKey === yesterdayKey) {
    return `昨天 · ${dateText}`
  }

  return `${new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date)} · ${dateText}`
}
