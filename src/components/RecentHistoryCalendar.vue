<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { buildCalendarMonthCells } from '../lib/bjmania/recent-history-calendar'

const WHEEL_ITEM_HEIGHT = 24
const MIN_HISTORY_YEAR = 2010

const props = defineProps<{
  year: number
  month: number
  dayCounts: Record<string, number>
  selectedDateKey: string
  collapsed: boolean
  totalPlays: number
  uniqueSongs: number
  averageDifficultyText: string
  skillDeltaText: string
}>()

const emit = defineEmits<{
  changePeriod: [year: number, month: number]
  toggleCollapsed: []
  selectDate: [dateKey: string]
}>()

const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const cells = computed(() => buildCalendarMonthCells(props.year, props.month))
const maxDayCount = computed(() => Math.max(0, ...Object.values(props.dayCounts)))
// Local visual selection so the float/glow paints in this component first.
// Parent history loading must not gate the selected chrome.
const visualSelectedDateKey = ref(props.selectedDateKey)
const periodWheelsVisible = computed(() => !props.collapsed)

function maxMonthForYear(year: number) {
  const now = new Date()
  const currentYear = now.getFullYear()

  if (year < currentYear) {
    return 11
  }

  if (year > currentYear) {
    return 0
  }

  return now.getMonth()
}

function normalizeMonthForYear(year: number, month: number) {
  return Math.min(Math.max(month, 0), maxMonthForYear(year))
}

// Descending so the previous year sits above the selected year.
const yearOptions = computed(() => {
  const currentYear = new Date().getFullYear()
  const minYear = Math.min(MIN_HISTORY_YEAR, props.year, currentYear)
  const maxYear = Math.max(currentYear, props.year)
  return Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index)
})
const yearIndex = computed(() => {
  const index = yearOptions.value.indexOf(props.year)
  return index >= 0 ? index : 0
})

// Descending month numbers; current year only goes through the current month.
const monthOptions = computed(() => {
  const maxMonth = maxMonthForYear(props.year)
  return Array.from({ length: maxMonth + 1 }, (_, index) => maxMonth - index)
})
const monthIndex = computed(() => {
  const index = monthOptions.value.indexOf(normalizeMonthForYear(props.year, props.month))
  return index >= 0 ? index : 0
})

const yearDragging = ref(false)
const yearDragOffset = ref(0)
let yearDragStartY = 0
let yearDragStartIndex = 0

const monthDragging = ref(false)
const monthDragOffset = ref(0)
let monthDragStartY = 0
let monthDragStartIndex = 0

watch(() => props.selectedDateKey, (dateKey) => {
  visualSelectedDateKey.value = dateKey
})

// Keep parent month valid when the year limits shrink (e.g. back to current year).
watch(
  () => [props.year, props.month] as const,
  ([year, month]) => {
    const normalized = normalizeMonthForYear(year, month)

    if (normalized !== month) {
      emit('changePeriod', year, normalized)
    }
  },
)

function intensityClass(dateKey: string | null) {
  if (!dateKey) {
    return ''
  }

  const count = props.dayCounts[dateKey] ?? 0

  if (count <= 0 || maxDayCount.value <= 0) {
    return ''
  }

  const ratio = count / maxDayCount.value
  if (ratio <= 0.25) return 'recent-calendar__day--level-1'
  if (ratio <= 0.5) return 'recent-calendar__day--level-2'
  if (ratio <= 0.75) return 'recent-calendar__day--level-3'
  return 'recent-calendar__day--level-4'
}

function handleSelectDate(dateKey: string) {
  if (visualSelectedDateKey.value === dateKey) {
    return
  }

  visualSelectedDateKey.value = dateKey
  emit('selectDate', dateKey)
}

function clampIndex(index: number, length: number) {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0))
}

function clampDragOffset(offset: number, startIndex: number, length: number) {
  const minOffset = -startIndex * WHEEL_ITEM_HEIGHT
  const maxOffset = (Math.max(length - 1, 0) - startIndex) * WHEEL_ITEM_HEIGHT
  return Math.min(Math.max(offset, minOffset), maxOffset)
}

function getVerticalItemStyle(
  index: number,
  selectedIndex: number,
  dragging: boolean,
  dragOffset: number,
  dragStartIndex: number,
) {
  const anchorIndex = dragging ? dragStartIndex : selectedIndex
  const offset = (anchorIndex - index) * WHEEL_ITEM_HEIGHT + (dragging ? dragOffset : 0)
  const distance = Math.min(Math.abs(offset) / WHEEL_ITEM_HEIGHT, 2)
  const scale = 1 - Math.min(distance, 1) * 0.16
  const opacity = Math.max(0, 1 - distance * 0.36)

  return {
    opacity,
    transform: `translate3d(-50%, calc(-50% + ${offset}px), 0) scale(${scale})`,
    zIndex: Math.max(1, 10 - Math.round(distance * 3)),
  }
}

const yearPreviewIndex = computed(() => {
  if (!yearDragging.value) {
    return yearIndex.value
  }

  return clampIndex(
    yearDragStartIndex + Math.round(yearDragOffset.value / WHEEL_ITEM_HEIGHT),
    yearOptions.value.length,
  )
})

const monthPreviewIndex = computed(() => {
  if (!monthDragging.value) {
    return monthIndex.value
  }

  return clampIndex(
    monthDragStartIndex + Math.round(monthDragOffset.value / WHEEL_ITEM_HEIGHT),
    monthOptions.value.length,
  )
})

const yearPreviewValue = computed(() => yearOptions.value[yearPreviewIndex.value] ?? props.year)
const monthPreviewValue = computed(() => (
  monthOptions.value[monthPreviewIndex.value]
  ?? normalizeMonthForYear(props.year, props.month)
))

function commitPeriod(year: number, month: number) {
  const nextYear = year
  const nextMonth = normalizeMonthForYear(nextYear, month)

  if (nextYear === props.year && nextMonth === props.month) {
    return
  }

  emit('changePeriod', nextYear, nextMonth)
}

function handleYearPointerDown(event: PointerEvent) {
  yearDragging.value = true
  yearDragStartY = event.clientY
  yearDragStartIndex = yearIndex.value
  yearDragOffset.value = 0
  event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId)
}

function handleYearPointerMove(event: PointerEvent) {
  if (!yearDragging.value) {
    return
  }

  yearDragOffset.value = clampDragOffset(
    event.clientY - yearDragStartY,
    yearDragStartIndex,
    yearOptions.value.length,
  )
}

function finishYearDrag(event: PointerEvent) {
  if (!yearDragging.value) {
    return
  }

  const nextIndex = clampIndex(
    yearDragStartIndex + Math.round(yearDragOffset.value / WHEEL_ITEM_HEIGHT),
    yearOptions.value.length,
  )
  yearDragging.value = false
  yearDragOffset.value = 0
  commitPeriod(yearOptions.value[nextIndex] ?? props.year, props.month)

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.releasePointerCapture(event.pointerId)
  }
}

function handleMonthPointerDown(event: PointerEvent) {
  monthDragging.value = true
  monthDragStartY = event.clientY
  monthDragStartIndex = monthIndex.value
  monthDragOffset.value = 0
  event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId)
}

function handleMonthPointerMove(event: PointerEvent) {
  if (!monthDragging.value) {
    return
  }

  monthDragOffset.value = clampDragOffset(
    event.clientY - monthDragStartY,
    monthDragStartIndex,
    monthOptions.value.length,
  )
}

function finishMonthDrag(event: PointerEvent) {
  if (!monthDragging.value) {
    return
  }

  const nextIndex = clampIndex(
    monthDragStartIndex + Math.round(monthDragOffset.value / WHEEL_ITEM_HEIGHT),
    monthOptions.value.length,
  )
  monthDragging.value = false
  monthDragOffset.value = 0
  commitPeriod(props.year, monthOptions.value[nextIndex] ?? props.month)

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.releasePointerCapture(event.pointerId)
  }
}

function handleYearWheel(event: WheelEvent) {
  event.preventDefault()
  // Descending list: scroll down moves toward newer years (lower index).
  const delta = event.deltaY > 0 ? -1 : event.deltaY < 0 ? 1 : 0

  if (!delta) {
    return
  }

  const nextIndex = clampIndex(yearIndex.value + delta, yearOptions.value.length)
  commitPeriod(yearOptions.value[nextIndex] ?? props.year, props.month)
}

function handleMonthWheel(event: WheelEvent) {
  event.preventDefault()
  // Descending list: scroll down moves toward later months (lower index).
  const delta = event.deltaY > 0 ? -1 : event.deltaY < 0 ? 1 : 0

  if (!delta) {
    return
  }

  const nextIndex = clampIndex(monthIndex.value + delta, monthOptions.value.length)
  commitPeriod(props.year, monthOptions.value[nextIndex] ?? props.month)
}

function handleYearKeydown(event: KeyboardEvent) {
  // Descending list: Up moves to the older year shown above.
  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault()
    commitPeriod(yearOptions.value[clampIndex(yearIndex.value + 1, yearOptions.value.length)] ?? props.year, props.month)
    return
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault()
    commitPeriod(yearOptions.value[clampIndex(yearIndex.value - 1, yearOptions.value.length)] ?? props.year, props.month)
  }
}

function handleMonthKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault()
    commitPeriod(props.year, monthOptions.value[clampIndex(monthIndex.value + 1, monthOptions.value.length)] ?? props.month)
    return
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault()
    commitPeriod(props.year, monthOptions.value[clampIndex(monthIndex.value - 1, monthOptions.value.length)] ?? props.month)
  }
}

function formatMonthNumber(month: number) {
  return String(month + 1)
}
</script>

<template>
  <section class="recent-calendar" aria-label="游玩历史日历">
    <div class="recent-calendar__header">
      <div class="recent-calendar__period" aria-label="选择年月">
        <div class="recent-calendar__unit">
          <div
            v-if="periodWheelsVisible"
            class="recent-calendar__wheel recent-calendar__wheel--year"
            :class="{ 'recent-calendar__wheel--dragging': yearDragging }"
            role="slider"
            tabindex="0"
            data-press-feedback="off"
            :aria-label="`年份 ${year}`"
            :aria-valuemin="0"
            :aria-valuemax="Math.max(yearOptions.length - 1, 0)"
            :aria-valuenow="yearPreviewIndex"
            :aria-valuetext="`${yearPreviewValue}年`"
            @keydown="handleYearKeydown"
            @pointerdown.prevent="handleYearPointerDown"
            @pointermove.prevent="handleYearPointerMove"
            @pointerup.prevent="finishYearDrag"
            @pointercancel.prevent="finishYearDrag"
            @wheel="handleYearWheel"
          >
            <span
              v-for="(option, index) in yearOptions"
              :key="option"
              class="recent-calendar__wheel-item"
              :class="{ 'recent-calendar__wheel-item--selected': index === yearPreviewIndex }"
              :style="getVerticalItemStyle(index, yearIndex, yearDragging, yearDragOffset, yearDragStartIndex)"
              aria-hidden="true"
            >
              {{ option }}
            </span>
          </div>
          <strong
            v-else
            class="recent-calendar__static-value recent-calendar__static-value--year"
          >
            {{ year }}
          </strong>
          <span class="recent-calendar__unit-label" aria-hidden="true">年</span>
        </div>

        <div class="recent-calendar__unit">
          <div
            v-if="periodWheelsVisible"
            class="recent-calendar__wheel recent-calendar__wheel--month"
            :class="{ 'recent-calendar__wheel--dragging': monthDragging }"
            role="slider"
            tabindex="0"
            data-press-feedback="off"
            :aria-label="`月份 ${formatMonthNumber(monthPreviewValue)}月`"
            :aria-valuemin="0"
            :aria-valuemax="Math.max(monthOptions.length - 1, 0)"
            :aria-valuenow="monthPreviewIndex"
            :aria-valuetext="`${formatMonthNumber(monthPreviewValue)}月`"
            @keydown="handleMonthKeydown"
            @pointerdown.prevent="handleMonthPointerDown"
            @pointermove.prevent="handleMonthPointerMove"
            @pointerup.prevent="finishMonthDrag"
            @pointercancel.prevent="finishMonthDrag"
            @wheel="handleMonthWheel"
          >
            <span
              v-for="(option, index) in monthOptions"
              :key="option"
              class="recent-calendar__wheel-item"
              :class="{ 'recent-calendar__wheel-item--selected': index === monthPreviewIndex }"
              :style="getVerticalItemStyle(index, monthIndex, monthDragging, monthDragOffset, monthDragStartIndex)"
              aria-hidden="true"
            >
              {{ formatMonthNumber(option) }}
            </span>
          </div>
          <strong
            v-else
            class="recent-calendar__static-value recent-calendar__static-value--month"
          >
            {{ formatMonthNumber(month) }}
          </strong>
          <span class="recent-calendar__unit-label" aria-hidden="true">月</span>
        </div>
      </div>

      <button
        class="recent-calendar__collapse"
        type="button"
        :aria-label="collapsed ? '展开日历' : '收起日历'"
        :aria-expanded="!collapsed"
        @click="emit('toggleCollapsed')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" :class="{ 'recent-calendar__collapse-icon--collapsed': collapsed }">
          <path d="M6 14L12 8L18 14"></path>
        </svg>
      </button>
    </div>

    <div class="recent-calendar__stats">
      <span class="recent-calendar__stat">
        <strong>{{ totalPlays }}</strong>
        <small>次游玩</small>
      </span>
      <span class="recent-calendar__stat">
        <strong>{{ uniqueSongs }}</strong>
        <small>首歌曲</small>
      </span>
      <span class="recent-calendar__stat">
        <strong>{{ averageDifficultyText }}</strong>
        <small>平均难度</small>
      </span>
      <span class="recent-calendar__stat">
        <strong>{{ skillDeltaText }}</strong>
        <small>SKILL</small>
      </span>
    </div>

    <div v-if="!collapsed" class="recent-calendar__body">
      <div class="recent-calendar__weekdays" aria-hidden="true">
        <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
      </div>
      <div class="recent-calendar__grid">
        <template v-for="(cell, index) in cells" :key="cell.dateKey ?? `blank-${index}`">
          <span v-if="!cell.dateKey" class="recent-calendar__day recent-calendar__day--blank"></span>
          <button
            v-else
            class="recent-calendar__day"
            :class="[
              intensityClass(cell.dateKey),
              { 'recent-calendar__day--selected': visualSelectedDateKey === cell.dateKey },
            ]"
            type="button"
            data-press-feedback="off"
            :aria-label="`${cell.dateKey}，${dayCounts[cell.dateKey] ?? 0} 次游玩`"
            :aria-pressed="visualSelectedDateKey === cell.dateKey"
            @click="handleSelectDate(cell.dateKey)"
          >
            <span>{{ cell.day }}</span>
            <small v-if="dayCounts[cell.dateKey]">{{ dayCounts[cell.dateKey] }}</small>
          </button>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.recent-calendar {
  width: 366px;
  max-width: 100%;
  margin: 0 auto 18px;
  padding: 14px;
  border: 1px solid rgba(79, 55, 138, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 12px 28px rgba(40, 28, 88, 0.12);
  backdrop-filter: blur(10px);
}

.recent-calendar__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  gap: 8px;
  align-items: center;
}

.recent-calendar__period {
  display: flex;
  align-items: center;
  justify-content: center;
  /* Same gap as unit internals so 2026↔年 matches 年↔7. */
  gap: 8px;
  min-width: 0;
  padding: 0 12px;
}

.recent-calendar__unit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.recent-calendar__unit-label {
  flex: 0 0 auto;
  color: #39256b;
  font-family: var(--font-figma-ui);
  font-size: 1rem;
  font-weight: 800;
  line-height: 1;
  user-select: none;
}

.recent-calendar__static-value {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #39256b;
  font-family: var(--font-figma-ui);
  font-size: 1rem;
  font-weight: 800;
  line-height: 1;
}

.recent-calendar__static-value--year {
  width: 54px;
}

.recent-calendar__static-value--month {
  width: 32px;
}

.recent-calendar__wheel {
  position: relative;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: #4f378a;
  cursor: ns-resize;
  touch-action: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.recent-calendar__wheel--year {
  width: 54px;
  height: 48px;
}

.recent-calendar__wheel--month {
  width: 32px;
  height: 48px;
}

.recent-calendar__wheel:focus-visible {
  outline: none;
  border-radius: 12px;
  box-shadow: 0 0 0 3px rgba(79, 55, 138, 0.14);
}

.recent-calendar__wheel--dragging {
  cursor: grabbing;
}

.recent-calendar__wheel-item {
  position: absolute;
  left: 50%;
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 24px;
  color: rgba(79, 55, 138, 0.56);
  font-family: var(--font-figma-ui);
  font-size: 0.88rem;
  font-weight: 800;
  line-height: 1;
  pointer-events: none;
  transform-origin: center;
  transition:
    color 140ms ease,
    opacity 140ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform, opacity;
}

.recent-calendar__wheel--dragging .recent-calendar__wheel-item {
  transition: none;
}

.recent-calendar__wheel-item--selected {
  color: #39256b;
  font-size: 1rem;
  font-weight: 800;
}

.recent-calendar__collapse {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #4f378a;
  cursor: pointer;
}

.recent-calendar__collapse svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  transition: transform 0.18s ease;
}

.recent-calendar__collapse-icon--collapsed {
  transform: rotate(180deg);
}

/* Content-sized stats + even free space between them (visual weight, not equal columns). */
.recent-calendar__stats {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  width: 100%;
  padding: 0 14px;
  box-sizing: border-box;
}

.recent-calendar__stat {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 0;
  max-width: 34%;
  color: rgba(45, 32, 94, 0.68);
  text-align: center;
}

.recent-calendar__stat strong {
  max-width: 100%;
  overflow: hidden;
  color: #4f378a;
  font-size: 0.88rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-calendar__stat small {
  max-width: 100%;
  overflow: hidden;
  font-size: 0.62rem;
  font-weight: 600;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-calendar__body {
  margin-top: 12px;
}

.recent-calendar__weekdays,
.recent-calendar__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 5px;
}

.recent-calendar__weekdays {
  margin-bottom: 5px;
  color: rgba(45, 32, 94, 0.56);
  font-size: 0.7rem;
  text-align: center;
}

.recent-calendar__grid {
  padding: 6px 2px 10px;
  overflow: visible;
}

.recent-calendar__day {
  position: relative;
  display: grid;
  min-width: 0;
  aspect-ratio: 1;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 10px;
  background: rgba(79, 55, 138, 0.04);
  color: #35265f;
  font-size: 0.78rem;
  cursor: pointer;
  /* Day cells opt out of global press-feedback: that WAAPI transform animation
     was overriding the selected float until the release animation finished. */
}

.recent-calendar__day small {
  position: absolute;
  right: 3px;
  bottom: 2px;
  font-size: 0.5rem;
  opacity: 0.76;
}

.recent-calendar__day--blank {
  background: transparent;
  border-color: transparent;
  cursor: default;
}

.recent-calendar__day--level-1 { background: #eee8f7; }
.recent-calendar__day--level-2 { background: #d7c9ef; }
.recent-calendar__day--level-3 { background: #aa8fd8; color: #241446; }
.recent-calendar__day--level-4 { background: #694b9e; color: #ffffff; }

.recent-calendar__day--selected {
  z-index: 1;
  transform: translate3d(0, -4px, 0);
  border-color: #b48cf0;
  box-shadow:
    0 0 0 1px rgba(180, 140, 240, 0.9),
    0 0 12px 3px rgba(156, 112, 228, 0.62),
    0 0 22px 6px rgba(140, 96, 214, 0.28),
    0 10px 16px rgba(79, 55, 138, 0.28);
}
</style>
