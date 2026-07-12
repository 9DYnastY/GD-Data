<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import AppPrimaryTopBar from '../components/AppPrimaryTopBar.vue'
import RecentPlayCard from '../components/RecentPlayCard.vue'
import RecentHistoryCalendar from '../components/RecentHistoryCalendar.vue'
import SkillProfileBoard from '../components/SkillProfileBoard.vue'
import dmModeToggleSrc from '../assets/skill-toggle/dm-mode.svg'
import gfModeToggleSrc from '../assets/skill-toggle/gf-mode.svg'
import { showAppToast } from '../lib/app-toast'
import { clearBjmaniaSkillSnapshotCache, loadBjmaniaSkillSnapshotCache } from '../lib/bjmania/cache'
import { formatDebugValue, useDebugMode } from '../lib/debug-mode'
import {
  loadBjmaniaGitadoraSnapshot,
  mapRecentPlaysToList,
  rawSkillToText,
} from '../lib/bjmania/client'
import { clearBjmaniaCookies } from '../lib/bjmania/http'
import {
  loadBjmaniaRecentHistoryRange,
  normalizeRecentPlayHistoryRecords,
  type StoredBjmaniaRecentPlay,
} from '../lib/bjmania/recent-history'
import {
  formatLocalDateKey,
  getLocalDateRange,
  getLocalMonthRange,
} from '../lib/bjmania/recent-history-calendar'
import { persistBjmaniaSnapshot } from '../lib/bjmania/snapshot-persistence'
import { loadSongCatalog, onSongCatalogUpdated } from '../lib/song-catalog'
import type {
  BjmaniaGitadoraSnapshot,
  BjmaniaRecentListItem,
  BjmaniaScoreFamily,
} from '../types/bjmania'
import type { SongViewModel } from '../types/song'

const FAMILY_TOGGLE_ASSETS: Record<BjmaniaScoreFamily, string> = {
  dm: dmModeToggleSrc,
  gf: gfModeToggleSrc,
}
const RECENT_CARD_WIDTH = 366
const RECENT_CARD_HEIGHT = 184
const RECENT_CARD_HORIZONTAL_PADDING = 36
const RECENT_PAGE_SIZE = 50
const FAMILY_LABELS: Record<BjmaniaScoreFamily, string> = { dm: 'DM', gf: 'GF' }
const GITADORA_VERSION_LABELS: Record<number, string> = {
  11: 'GALAXY WAVE DELTA',
  10: 'GALAXY WAVE',
  9: 'FUZZ-UP',
  8: 'HIGH-VOLTAGE',
  7: 'NEX+AGE',
  6: 'EXCHAIN',
}
const MAPPING_DEBUG_PAYLOAD_KEYS = [
  'MusicId',
  'Seq',
  'GameSpec',
  'CabinetInfo',
  'GitadoraVersion',
  'Skill',
  'NewSkill',
  'Perc',
  'Rank',
] as const

const route = useRoute()
const router = useRouter()
const debugModeEnabled = useDebugMode()

const loading = ref(true)
const refreshing = ref(false)
const snapshot = ref<BjmaniaGitadoraSnapshot | null>(null)
const historySearch = ref('')
const primaryTopBarRef = ref<InstanceType<typeof AppPrimaryTopBar> | null>(null)
const topShellRef = ref<HTMLElement | null>(null)
const showProfilePanel = ref(false)
const showVersionPanel = ref(false)
const showSignOutConfirm = ref(false)
const signingOut = ref(false)
const calendarNow = new Date()
const calendarYear = ref(calendarNow.getFullYear())
const calendarMonth = ref(calendarNow.getMonth())
const calendarCollapsed = ref(false)
const selectedDateKey = ref(formatLocalDateKey(calendarNow.getTime() / 1000))
const calendarRecords = ref<StoredBjmaniaRecentPlay[]>([])
const catalogSongs = ref<SongViewModel[]>([])
const loadedRecentRecords = ref<StoredBjmaniaRecentPlay[]>([])
const historyLoadingMore = ref(false)
const searchVisibleLimit = ref(RECENT_PAGE_SIZE)
const loadMoreSentinelRef = ref<HTMLElement | null>(null)
const viewportWidth = ref(typeof window === 'undefined' ? 402 : window.innerWidth)
let stopSongCatalogUpdateListener: (() => void) | null = null
let historyLoadSequence = 0
let calendarLoadSequence = 0
let loadMoreObserver: IntersectionObserver | null = null

const selectedFamily = computed<BjmaniaScoreFamily>(() => (
  route.query.family === 'gf' ? 'gf' : 'dm'
))
const requestedMdbVersion = computed(() => {
  const rawVersion = Array.isArray(route.query.version) ? route.query.version[0] : route.query.version
  const parsedVersion = rawVersion ? Number(rawVersion) : null
  return parsedVersion && Number.isFinite(parsedVersion) ? parsedVersion : null
})
const selectedFamilyLabel = computed(() => selectedFamily.value.toUpperCase())
const selectedFamilyToggleSrc = computed(() => FAMILY_TOGGLE_ASSETS[selectedFamily.value])
const avatarBadgeLabel = computed(() => {
  const name = snapshot.value?.gitadoraProfile.name?.trim() || snapshot.value?.authUser.name?.trim()
  return name ? name.charAt(0) : 'B'
})
const availableVersionOptions = computed(() => {
  const versions = snapshot.value?.availableVersions ?? []
  return [...new Set(versions.filter((version) => Number.isFinite(version)))]
    .sort((left, right) => right - left)
    .map((version) => ({
      version,
      label: GITADORA_VERSION_LABELS[version] ?? `VERSION ${version}`,
    }))
})
const activeSkillValue = computed(() => {
  const profile = snapshot.value?.gitadoraProfile

  if (!profile) {
    return '--'
  }

  return rawSkillToText(selectedFamily.value === 'dm' ? profile.dmSkillRaw : profile.gfSkillRaw)
})
const normalizedHistorySearch = computed(() => historySearch.value.trim().toLowerCase())
// Full selected-family month (ignores search). Powers the 4 monthly stats.
const calendarMonthRows = computed(() => {
  const mappedRows = mapRecentPlaysToList(calendarRecords.value, catalogSongs.value)

  return mappedRows.filter((row) => row.family === selectedFamily.value)
})
// Search-filtered month rows for day intensity/heatmap only.
const calendarHeatmapRows = computed(() => {
  if (!normalizedHistorySearch.value) {
    return calendarMonthRows.value
  }

  return calendarMonthRows.value.filter((row) => {
    const searchText = (row.song?.searchText ?? String(row.musicId ?? '')).toLowerCase()
    return searchText.includes(normalizedHistorySearch.value)
  })
})
const calendarDayCounts = computed(() => calendarHeatmapRows.value.reduce<Record<string, number>>((counts, row) => {
  const dateKey = formatLocalDateKey(row.timestamp)

  if (dateKey) {
    counts[dateKey] = (counts[dateKey] ?? 0) + 1
  }

  return counts
}, {}))
const calendarUniqueSongs = computed(() => new Set(
  calendarMonthRows.value
    .map((row) => row.musicId)
    .filter((musicId): musicId is number => musicId !== null),
).size)
const calendarAverageDifficultyText = computed(() => {
  const difficulties = calendarMonthRows.value
    .map((row) => row.difficultyRaw)
    .filter((difficulty) => Number.isFinite(difficulty) && difficulty > 0)

  if (difficulties.length === 0) {
    return '--'
  }

  const average = difficulties.reduce((total, difficulty) => total + difficulty, 0) / difficulties.length
  return (average / 100).toFixed(2)
})
const calendarSkillDeltaText = computed(() => {
  const playerSkillSamples = calendarMonthRows.value
    .map((row) => {
      const playerSkill = row.payload?.PlayerSkill

      if (typeof playerSkill !== 'number' || !Number.isFinite(playerSkill)) {
        return null
      }

      return {
        timestamp: row.timestamp,
        playerSkill,
      }
    })
    .filter((sample): sample is { timestamp: number, playerSkill: number } => sample !== null)
    .sort((left, right) => left.timestamp - right.timestamp || left.playerSkill - right.playerSkill)

  if (playerSkillSamples.length === 0) {
    return '--'
  }

  const earliest = playerSkillSamples[0]
  const latest = playerSkillSamples[playerSkillSamples.length - 1]

  if (!earliest || !latest) {
    return '--'
  }

  // Month skill change from the earliest to latest recorded PlayerSkill.
  const deltaRaw = latest.playerSkill - earliest.playerSkill
  const absoluteText = rawSkillToText(Math.abs(deltaRaw))

  if (deltaRaw > 0) {
    return `+${absoluteText}`
  }

  if (deltaRaw < 0) {
    return `-${absoluteText}`
  }

  return absoluteText
})
const matchingRecentRowEntries = computed(() => {
  const mappedRows = mapRecentPlaysToList(loadedRecentRecords.value, catalogSongs.value)

  return loadedRecentRecords.value
    .map((record, index) => ({
      id: record.id,
      row: mappedRows[index] as BjmaniaRecentListItem,
    }))
    .filter((entry) => entry.row.family === selectedFamily.value)
    .filter((entry) => {
      if (!normalizedHistorySearch.value) {
        return true
      }

      const searchText = (entry.row.song?.searchText ?? String(entry.row.musicId ?? '')).toLowerCase()
      return searchText.includes(normalizedHistorySearch.value)
    })
    .sort((left, right) => right.row.timestamp - left.row.timestamp || right.id.localeCompare(left.id))
})
const recentRowEntries = computed(() => (
  matchingRecentRowEntries.value.slice(0, searchVisibleLimit.value)
))
const historyHasMore = computed(() => (
  matchingRecentRowEntries.value.length > searchVisibleLimit.value
))
const filteredRows = computed(() => recentRowEntries.value.map((entry) => entry.row))
const recentCardScale = computed(() => Math.min(
  1,
  Math.max(0.72, (viewportWidth.value - RECENT_CARD_HORIZONTAL_PADDING) / RECENT_CARD_WIDTH),
))
const recentCardListStyle = computed(() => ({
  '--recent-card-width': `${RECENT_CARD_WIDTH}px`,
  '--recent-card-height': `${RECENT_CARD_HEIGHT}px`,
  '--recent-card-scale': String(recentCardScale.value),
}))
const stateMessage = computed(() => {
  if (loading.value && !snapshot.value) {
    return '正在加载游玩历史'
  }

  if (!filteredRows.value.length) {
    if (historySearch.value.trim()) {
      return '没有匹配的游玩记录'
    }

    return `${formatSelectedDateEmptyLabel(selectedDateKey.value)} 暂无游玩记录`
  }

  return ''
})

function formatSelectedDateEmptyLabel(dateKey: string) {
  const range = getLocalDateRange(dateKey)

  if (!range) {
    return dateKey
  }

  const date = new Date(range.startTime * 1000)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function reportHistoryError(error: unknown, fallback: string) {
  const message = error instanceof Error && error.message ? error.message : fallback
  showAppToast(message, { kind: 'error', duration: 2600 })
}

function applySnapshot(nextSnapshot: BjmaniaGitadoraSnapshot, songs: SongViewModel[]) {
  snapshot.value = nextSnapshot
  catalogSongs.value = songs
}

async function loadSelectedDateHistory() {
  const currentSnapshot = snapshot.value
  const range = getLocalDateRange(selectedDateKey.value)

  if (!currentSnapshot || !range) {
    loadedRecentRecords.value = []
    return false
  }

  const sequence = ++historyLoadSequence
  const page = await loadBjmaniaRecentHistoryRange({
    userId: currentSnapshot.authUser.id || 'unknown',
    family: selectedFamily.value,
    ...range,
  })

  if (sequence !== historyLoadSequence || currentSnapshot !== snapshot.value) {
    return page.storageAvailable
  }

  if (!page.storageAvailable) {
    const fallback = normalizeRecentPlayHistoryRecords(
      currentSnapshot.authUser.id || 'unknown',
      currentSnapshot.recentPlays.recentPlayEntries,
    )
    loadedRecentRecords.value = fallback.filter((record) => (
      record.family === selectedFamily.value
      && record.timestamp >= range.startTime
      && record.timestamp < range.endTime
    ))
    return false
  }

  loadedRecentRecords.value = page.records
  searchVisibleLimit.value = RECENT_PAGE_SIZE
  return true
}

async function loadCalendarRecords() {
  const currentSnapshot = snapshot.value
  const range = getLocalMonthRange(calendarYear.value, calendarMonth.value)

  if (!currentSnapshot) {
    calendarRecords.value = []
    return false
  }

  const sequence = ++calendarLoadSequence
  const page = await loadBjmaniaRecentHistoryRange({
    userId: currentSnapshot.authUser.id || 'unknown',
    family: selectedFamily.value,
    ...range,
  })

  if (sequence !== calendarLoadSequence || currentSnapshot !== snapshot.value) {
    return page.storageAvailable
  }

  if (!page.storageAvailable) {
    calendarRecords.value = normalizeRecentPlayHistoryRecords(
      currentSnapshot.authUser.id || 'unknown',
      currentSnapshot.recentPlays.recentPlayEntries,
    ).filter((record) => (
      record.family === selectedFamily.value
      && record.timestamp >= range.startTime
      && record.timestamp < range.endTime
    ))
    return false
  }

  calendarRecords.value = page.records
  return true
}

async function loadCurrentStoredHistory() {
  return await loadSelectedDateHistory()
}

function loadMoreHistory() {
  if (historyLoadingMore.value || !historyHasMore.value) {
    return
  }

  historyLoadingMore.value = true
  searchVisibleLimit.value += RECENT_PAGE_SIZE

  // Release the lock after paint so a still-visible sentinel can request the next page.
  void nextTick(() => {
    requestAnimationFrame(() => {
      historyLoadingMore.value = false
    })
  })
}

function teardownLoadMoreObserver() {
  loadMoreObserver?.disconnect()
  loadMoreObserver = null
}

function setupLoadMoreObserver() {
  teardownLoadMoreObserver()

  if (typeof IntersectionObserver === 'undefined' || !loadMoreSentinelRef.value) {
    return
  }

  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMoreHistory()
      }
    },
    {
      root: null,
      // Prefetch slightly before the true bottom for smoother scrolling.
      rootMargin: '160px 0px',
      threshold: 0,
    },
  )

  loadMoreObserver.observe(loadMoreSentinelRef.value)
}

async function restoreCachedSnapshot() {
  const cached = loadBjmaniaSkillSnapshotCache({ version: requestedMdbVersion.value })

  if (!cached) {
    return false
  }

  const songs = await loadSongCatalog({ mdbVersion: cached.snapshot.currentVersion })
  applySnapshot(cached.snapshot, songs)
  await persistBjmaniaSnapshot(cached.snapshot)
  await Promise.all([loadCurrentStoredHistory(), loadCalendarRecords()])
  return true
}

async function hydrateLiveSnapshot(version?: number) {
  refreshing.value = true

  try {
    const nextSnapshot = await loadBjmaniaGitadoraSnapshot({
      version: version ?? requestedMdbVersion.value ?? snapshot.value?.currentVersion,
    })
    const songs = await loadSongCatalog({ mdbVersion: nextSnapshot.currentVersion })
    applySnapshot(nextSnapshot, songs)
    await persistBjmaniaSnapshot(nextSnapshot, { announceNewRecentPlays: true })
    await Promise.all([loadCurrentStoredHistory(), loadCalendarRecords()])
  } finally {
    refreshing.value = false
  }
}

async function bootstrapPage() {
  loading.value = true

  let restoredFromCache = false

  try {
    restoredFromCache = await restoreCachedSnapshot()
  } catch {
    restoredFromCache = false
  }

  if (restoredFromCache) {
    loading.value = false
  }

  try {
    await hydrateLiveSnapshot()
  } catch (nextError) {
    reportHistoryError(nextError, '最近游玩数据加载失败')
  } finally {
    loading.value = false
  }
}

function switchFamily(family: BjmaniaScoreFamily) {
  if (family === selectedFamily.value) {
    return
  }

  void router.replace({
    name: 'skill-history',
    query: {
      ...route.query,
      family,
    },
  })
}

function cycleFamily() {
  switchFamily(selectedFamily.value === 'dm' ? 'gf' : 'dm')
}

function toggleCalendarCollapsed() {
  calendarCollapsed.value = !calendarCollapsed.value
}

async function setCalendarPeriod(year: number, month: number) {
  if (calendarYear.value === year && calendarMonth.value === month) {
    return
  }

  calendarYear.value = year
  calendarMonth.value = month

  try {
    await loadCalendarRecords()
  } catch (error) {
    reportHistoryError(error, '月份记录加载失败')
  }
}

async function selectCalendarDate(dateKey: string) {
  if (selectedDateKey.value === dateKey) {
    return
  }

  selectedDateKey.value = dateKey
  searchVisibleLimit.value = RECENT_PAGE_SIZE

  // Defer list reload so the calendar's local selected chrome can paint first.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })

  try {
    await loadCurrentStoredHistory()
  } catch (error) {
    reportHistoryError(error, '日期记录加载失败')
  }
}

function focusHistorySearch() {
  primaryTopBarRef.value?.focusSearch()
}

function handleHistorySearchFocus() {
  showProfilePanel.value = false
}

function submitHistorySearch() {
  primaryTopBarRef.value?.blurSearch()
}

async function handleProfileBadgeClick() {
  if (!snapshot.value) {
    await router.push({ name: 'skill' })
    return
  }

  showProfilePanel.value = !showProfilePanel.value
}

async function handleGenerateB50() {
  showProfilePanel.value = false
  await router.push({
    name: 'skill-b50',
    query: {
      family: selectedFamily.value,
      version: snapshot.value?.currentVersion ?? undefined,
    },
  })
}

function openVersionSelectPanel() {
  showProfilePanel.value = false
  showVersionPanel.value = true
}

function closeVersionSelectPanel() {
  if (!refreshing.value) {
    showVersionPanel.value = false
  }
}

function selectMdbVersion(version: number) {
  if (refreshing.value) {
    return
  }

  showVersionPanel.value = false
  void hydrateLiveSnapshot(version)
}

function openSignOutConfirm() {
  showProfilePanel.value = false
  showSignOutConfirm.value = true
}

function cancelSignOut() {
  if (!signingOut.value) {
    showSignOutConfirm.value = false
  }
}

async function confirmSignOut() {
  if (signingOut.value) {
    return
  }

  signingOut.value = true

  try {
    await clearBjmaniaCookies()
    clearBjmaniaSkillSnapshotCache()
    snapshot.value = null
    catalogSongs.value = []
    loadedRecentRecords.value = []
    showSignOutConfirm.value = false
    await router.replace({ name: 'skill' })
  } finally {
    signingOut.value = false
  }
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target

  if (showProfilePanel.value && topShellRef.value && target instanceof Node && !topShellRef.value.contains(target)) {
    showProfilePanel.value = false
  }
}

function buildSongDetailRoute(row: BjmaniaRecentListItem): RouteLocationRaw | null {
  if (row.musicId === null) {
    return null
  }

  return {
    name: 'song-detail',
    params: { musicId: row.musicId },
    query: {
      instrument: row.instrument ?? undefined,
      version: snapshot.value?.currentVersion ?? requestedMdbVersion.value ?? undefined,
    },
  }
}

const filteredRowEntries = computed(() => recentRowEntries.value.map((entry) => ({
  row: entry.row,
  key: entry.id,
  detailRoute: buildSongDetailRoute(entry.row),
})))

function mappingDebugRows(row: BjmaniaRecentListItem) {
  const payload = row.payload
  const mappedRows = [
    ['mapped.family', row.family],
    ['mapped.instrument', row.instrument],
    ['mapped.branchLabel', row.branchLabel],
    ['mapped.level', row.level],
    ['mapped.sheetLabel', row.sheetLabel],
    ['mapped.difficultyRaw', row.difficultyRaw],
    ['mapped.difficultyText', row.difficultyText],
  ] as const
  const payloadRows = MAPPING_DEBUG_PAYLOAD_KEYS.map((key) => [
    `payload.${key}`,
    payload?.[key],
  ] as const)

  return [...mappedRows, ...payloadRows].map(([label, value]) => ({
    label,
    value: formatDebugValue(value),
  }))
}

function mappingDebugPayloadJson(row: BjmaniaRecentListItem) {
  if (!row.payload) {
    return '{}'
  }

  try {
    return JSON.stringify(row.payload, null, 2)
  } catch {
    return '{}'
  }
}

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth
}

onMounted(() => {
  updateViewportWidth()
  window.addEventListener('resize', updateViewportWidth, { passive: true })
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  stopSongCatalogUpdateListener = onSongCatalogUpdated((songs, catalog) => {
    if (snapshot.value && catalog.mdbVersion === snapshot.value.currentVersion) {
      catalogSongs.value = songs
    }
  }, { mdbVersion: 'all' })
  void bootstrapPage()
})

watch(selectedFamily, () => {
  if (snapshot.value) {
    searchVisibleLimit.value = RECENT_PAGE_SIZE
    void Promise.all([loadCurrentStoredHistory(), loadCalendarRecords()]).catch((error) => {
      reportHistoryError(error, '游玩历史加载失败')
    })
  }
})

watch(historySearch, () => {
  searchVisibleLimit.value = RECENT_PAGE_SIZE
})

watch(
  [historyHasMore, () => filteredRowEntries.value.length, loadMoreSentinelRef],
  async () => {
    await nextTick()
    if (historyHasMore.value) {
      setupLoadMoreObserver()
    } else {
      teardownLoadMoreObserver()
    }
  },
)

onBeforeUnmount(() => {
  teardownLoadMoreObserver()
  window.removeEventListener('resize', updateViewportWidth)
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  stopSongCatalogUpdateListener?.()
  stopSongCatalogUpdateListener = null
})
</script>

<template>
  <section class="recent-history-view">
    <header ref="topShellRef" class="top-shell">
      <AppPrimaryTopBar
        ref="primaryTopBarRef"
        v-model="historySearch"
        :authenticated="Boolean(snapshot)"
        :avatar-label="avatarBadgeLabel"
        placeholder="搜索游玩曲目/艺术家"
        search-action-label="搜索游玩历史"
        @search-focus="handleHistorySearchFocus"
        @search-action="focusHistorySearch"
        @search-submit="submitHistorySearch"
        @avatar="handleProfileBadgeClick"
      />
      <transition name="menu-fade">
        <div v-if="showProfilePanel && snapshot" class="profile-flyout-shell">
          <section class="profile-flyout">
            <SkillProfileBoard
              :display-name="snapshot.gitadoraProfile.name || snapshot.authUser.name || 'BJMANIA'"
              :title="snapshot.gitadoraProfile.title || 'No title'"
              :mode-label="FAMILY_LABELS[selectedFamily]"
              :show-version-switch="availableVersionOptions.length > 0"
              :skill-value="activeSkillValue"
              :version-switch-disabled="refreshing"
              @generate-b50="handleGenerateB50"
              @select-version="openVersionSelectPanel"
              @sign-out="openSignOutConfirm"
            />
          </section>
        </div>
      </transition>
    </header>

    <transition name="sign-out-dialog">
      <div
        v-if="showVersionPanel"
        class="version-select-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-version-dialog-title"
        @click.self="closeVersionSelectPanel"
      >
        <div class="version-select-dialog__card">
          <h2 id="history-version-dialog-title">选择版本</h2>
          <div class="version-select-dialog__options">
            <button
              v-for="option in availableVersionOptions"
              :key="option.version"
              class="version-select-dialog__option"
              :class="{ 'version-select-dialog__option--active': option.version === snapshot?.currentVersion }"
              type="button"
              :disabled="refreshing"
              @click="selectMdbVersion(option.version)"
            >
              {{ option.label }}
            </button>
          </div>
          <button class="version-select-dialog__cancel" type="button" :disabled="refreshing" @click="closeVersionSelectPanel">
            取消
          </button>
        </div>
      </div>
    </transition>

    <transition name="sign-out-dialog">
      <div
        v-if="showSignOutConfirm"
        class="sign-out-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-sign-out-dialog-title"
        @click.self="cancelSignOut"
      >
        <div class="sign-out-dialog__card">
          <h2 id="history-sign-out-dialog-title">确定要登出账号吗？</h2>
          <div class="sign-out-dialog__actions">
            <button class="sign-out-dialog__button sign-out-dialog__button--ghost" type="button" :disabled="signingOut" @click="cancelSignOut">
              取消
            </button>
            <button class="sign-out-dialog__button" type="button" :disabled="signingOut" @click="confirmSignOut">
              确定
            </button>
          </div>
        </div>
      </div>
    </transition>

    <main class="recent-history-view__content">
      <RecentHistoryCalendar
        v-if="snapshot"
        :year="calendarYear"
        :month="calendarMonth"
        :day-counts="calendarDayCounts"
        :selected-date-key="selectedDateKey"
        :collapsed="calendarCollapsed"
        :total-plays="calendarMonthRows.length"
        :unique-songs="calendarUniqueSongs"
        :average-difficulty-text="calendarAverageDifficultyText"
        :skill-delta-text="calendarSkillDeltaText"
        @change-period="setCalendarPeriod"
        @toggle-collapsed="toggleCalendarCollapsed"
        @select-date="selectCalendarDate"
      />

      <section
        v-if="stateMessage"
        class="recent-history-view__state-card"
      >
        <p>{{ stateMessage }}</p>
      </section>

      <section
        v-else
        class="recent-history-view__list"
        :style="recentCardListStyle"
        aria-label="最近游玩记录"
      >
        <div
          v-for="entry in filteredRowEntries"
          :key="entry.key"
          class="recent-history-view__card-shell"
        >
          <div class="recent-history-view__card-frame">
            <RouterLink
              v-if="entry.detailRoute"
              class="recent-history-view__card-link"
              :to="entry.detailRoute"
              :aria-label="`查看 ${entry.row.song?.displayTitle ?? `Music #${entry.row.musicId}`} 的歌曲详情`"
            >
              <RecentPlayCard :row="entry.row" />
            </RouterLink>
            <RecentPlayCard v-else :row="entry.row" />
          </div>
          <section
            v-if="debugModeEnabled"
            class="recent-history-view__debug-panel"
            aria-label="mapping debug"
          >
            <div class="recent-history-view__debug-grid">
              <div
                v-for="debugRow in mappingDebugRows(entry.row)"
                :key="debugRow.label"
                class="recent-history-view__debug-row"
              >
                <span>{{ debugRow.label }}</span>
                <strong>{{ debugRow.value }}</strong>
              </div>
            </div>
            <details class="recent-history-view__debug-details">
              <summary>raw payload</summary>
              <pre>{{ mappingDebugPayloadJson(entry.row) }}</pre>
            </details>
          </section>
        </div>
        <div
          v-if="historyHasMore"
          ref="loadMoreSentinelRef"
          class="recent-history-view__load-sentinel"
          aria-hidden="true"
        ></div>
      </section>
    </main>

    <button
      class="family-fab"
      type="button"
      :aria-label="`切换游玩历史模式，当前 ${selectedFamilyLabel}`"
      @click="cycleFamily"
    >
      <img class="family-fab__image" :src="selectedFamilyToggleSrc" alt="" aria-hidden="true" />
    </button>
  </section>
</template>

<style scoped>
.recent-history-view {
  --recent-safe-top: env(safe-area-inset-top, 0px);
  --recent-top-bar-padding: calc(var(--recent-safe-top) + 15px);
  --recent-content-top-padding: calc(var(--recent-safe-top) + 100px);
  --primary-top-bar-padding: var(--recent-top-bar-padding);
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  background: transparent;
}

.top-shell {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 30;
  overflow: visible;
}

.profile-flyout-shell {
  position: absolute;
  top: 100%;
  right: 0;
  left: 0;
  display: flex;
  justify-content: center;
  padding-top: 10px;
  pointer-events: none;
}

.profile-flyout {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  width: min(100%, 402px);
  margin: 0 auto;
  padding: 0 11px;
  pointer-events: auto;
}

.sign-out-dialog,
.version-select-dialog {
  position: fixed;
  inset: 0;
  z-index: 96;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(20, 12, 48, 0.34);
  backdrop-filter: blur(8px);
}

.sign-out-dialog__card,
.version-select-dialog__card {
  display: grid;
  gap: 18px;
  width: min(100%, 312px);
  padding: 22px 20px 18px;
  border: 1px solid rgba(79, 55, 138, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 56px rgba(31, 16, 63, 0.24);
}

.sign-out-dialog__card h2,
.version-select-dialog__card h2 {
  margin: 0;
  color: #1d1741;
  font-family: var(--font-sans);
  font-size: 1.05rem;
  line-height: 1.35;
  text-align: center;
}

.version-select-dialog__options {
  display: grid;
  gap: 8px;
}

.version-select-dialog__option,
.version-select-dialog__cancel,
.sign-out-dialog__button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgba(79, 55, 138, 0.12);
  border-radius: 8px;
  font-family: var(--font-sans);
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.version-select-dialog__option {
  background: rgba(79, 55, 138, 0.08);
  color: #4f378a;
}

.version-select-dialog__option--active,
.sign-out-dialog__button {
  border-color: #4f378a;
  background: #4f378a;
  color: #ffffff;
}

.version-select-dialog__cancel,
.sign-out-dialog__button--ghost {
  background: transparent;
  color: rgba(29, 23, 65, 0.72);
}

.sign-out-dialog__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.version-select-dialog__option:disabled,
.version-select-dialog__cancel:disabled,
.sign-out-dialog__button:disabled {
  cursor: default;
  opacity: 0.68;
}

.menu-fade-enter-active,
.menu-fade-leave-active,
.sign-out-dialog-enter-active,
.sign-out-dialog-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.sign-out-dialog-enter-from,
.sign-out-dialog-leave-to {
  opacity: 0;
}

.recent-history-view__content {
  position: relative;
  z-index: 1;
  width: min(100%, 402px);
  margin: 0 auto;
  padding: var(--recent-content-top-padding) 18px 96px;
}

.recent-history-view__state-card {
  display: grid;
  place-items: center;
  width: 366px;
  max-width: 100%;
  min-height: 128px;
  margin: 0 auto;
  padding: 24px;
  border: 2px solid rgba(79, 55, 138, 0.26);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 12px 28px rgba(40, 28, 88, 0.14);
  backdrop-filter: blur(10px);
}

.recent-history-view__state-card p {
  margin: 0;
  color: #2c1d5d;
  font-family: var(--font-figma-title);
  font-size: 1rem;
  font-weight: 800;
  text-align: center;
}

.recent-history-view__list {
  --recent-card-width: 366px;
  --recent-card-height: 184px;
  --recent-card-scale: 1;
  display: grid;
  justify-items: center;
  gap: calc(28px * var(--recent-card-scale));
}

.recent-history-view__load-sentinel {
  width: 100%;
  height: 1px;
  margin: 0;
  pointer-events: none;
}

.recent-history-view__card-shell {
  display: grid;
  gap: calc(10px * var(--recent-card-scale));
  width: calc(var(--recent-card-width) * var(--recent-card-scale));
  height: auto;
  overflow: visible;
}

.recent-history-view__card-frame {
  width: calc(var(--recent-card-width) * var(--recent-card-scale));
  height: calc(var(--recent-card-height) * var(--recent-card-scale));
  overflow: visible;
}

.recent-history-view__card-link {
  display: block;
  width: 100%;
  height: 100%;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.recent-history-view__card-link:focus-visible {
  outline: none;
}

.recent-history-view__card-link:focus-visible :deep(.recent-play-card) {
  filter: drop-shadow(0 0 0.5rem rgba(79, 55, 138, 0.32));
}

.recent-history-view__card-frame > :deep(.recent-play-card) {
  transform: scale(var(--recent-card-scale));
  transform-origin: top left;
}

.recent-history-view__card-link :deep(.recent-play-card) {
  transform: scale(var(--recent-card-scale));
  transform-origin: top left;
}

.recent-history-view__debug-panel {
  display: grid;
  gap: 8px;
  width: 100%;
  padding: 10px;
  border: 1px solid rgba(79, 55, 138, 0.24);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.86);
  color: #261b53;
  box-shadow: 0 8px 18px rgba(41, 26, 90, 0.1);
  backdrop-filter: blur(8px);
}

.recent-history-view__debug-grid {
  display: grid;
  gap: 4px;
}

.recent-history-view__debug-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
  gap: 8px;
  align-items: start;
  font-family: var(--font-figma-title);
  font-size: 11px;
  line-height: 1.35;
}

.recent-history-view__debug-row span {
  color: rgba(46, 33, 94, 0.68);
  overflow-wrap: anywhere;
}

.recent-history-view__debug-row strong {
  color: #23164d;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.recent-history-view__debug-details {
  font-family: var(--font-figma-title);
  font-size: 11px;
  line-height: 1.35;
}

.recent-history-view__debug-details summary {
  color: #4f378a;
  cursor: pointer;
  font-weight: 800;
}

.recent-history-view__debug-details pre {
  max-height: 180px;
  margin: 8px 0 0;
  padding: 8px;
  overflow: auto;
  border-radius: 6px;
  background: rgba(35, 22, 77, 0.08);
  color: #201546;
  white-space: pre-wrap;
  word-break: break-word;
}

.family-fab {
  position: fixed;
  right: 14px;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 92px);
  z-index: 32;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: 999px;
  box-shadow: 0 4px 15.8px rgba(133, 121, 168, 0.82);
  cursor: pointer;
}

.family-fab__image {
  display: block;
  width: 56px;
  height: 56px;
}

@media (max-width: 440px) {
  .recent-history-view__content {
    padding-left: 18px;
    padding-right: 18px;
  }
}
</style>
