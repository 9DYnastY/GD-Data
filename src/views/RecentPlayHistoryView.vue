<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import RecentPlayCard from '../components/RecentPlayCard.vue'
import dmModeToggleSrc from '../assets/skill-toggle/dm-mode.svg'
import gfModeToggleSrc from '../assets/skill-toggle/gf-mode.svg'
import { loadBjmaniaSkillSnapshotCache, saveBjmaniaSkillSnapshotCache } from '../lib/bjmania/cache'
import { formatDebugValue, useDebugMode } from '../lib/debug-mode'
import {
  filterRecentByFamily,
  loadBjmaniaGitadoraSnapshot,
  mapRecentPlaysToList,
} from '../lib/bjmania/client'
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
const error = ref('')
const snapshot = ref<BjmaniaGitadoraSnapshot | null>(null)
const recentRows = ref<BjmaniaRecentListItem[]>([])
const loadedFromCache = ref(false)
const viewportWidth = ref(typeof window === 'undefined' ? 402 : window.innerWidth)
let stopSongCatalogUpdateListener: (() => void) | null = null

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
const filteredRows = computed(() => (
  filterRecentByFamily(recentRows.value, selectedFamily.value)
    .slice()
    .sort((left, right) => right.timestamp - left.timestamp)
))
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

  if (error.value && !snapshot.value) {
    return error.value
  }

  if (!filteredRows.value.length) {
    return `暂无 ${selectedFamilyLabel.value} 游玩历史`
  }

  return ''
})

function setErrorMessage(nextError: unknown, fallback: string) {
  error.value = nextError instanceof Error && nextError.message ? nextError.message : fallback
}

function applySnapshot(nextSnapshot: BjmaniaGitadoraSnapshot, songs: SongViewModel[]) {
  snapshot.value = nextSnapshot
  recentRows.value = mapRecentPlaysToList(nextSnapshot.recentPlays.recentPlayEntries, songs)
}

async function restoreCachedSnapshot() {
  const cached = loadBjmaniaSkillSnapshotCache({ version: requestedMdbVersion.value })

  if (!cached) {
    return false
  }

  const songs = await loadSongCatalog({ mdbVersion: cached.snapshot.currentVersion })
  applySnapshot(cached.snapshot, songs)
  loadedFromCache.value = true
  return true
}

async function hydrateLiveSnapshot() {
  refreshing.value = true

  try {
    const nextSnapshot = await loadBjmaniaGitadoraSnapshot({
      version: requestedMdbVersion.value ?? snapshot.value?.currentVersion,
    })
    const songs = await loadSongCatalog({ mdbVersion: nextSnapshot.currentVersion })
    applySnapshot(nextSnapshot, songs)
    saveBjmaniaSkillSnapshotCache(nextSnapshot)
    loadedFromCache.value = false
    error.value = ''
  } finally {
    refreshing.value = false
  }
}

async function bootstrapPage() {
  loading.value = true
  error.value = ''

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
    setErrorMessage(nextError, '最近游玩数据加载失败')
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

function rowKey(row: BjmaniaRecentListItem, index: number) {
  return `${row.timestamp}-${row.musicId ?? 'unknown'}-${row.instrument ?? 'unknown'}-${row.level ?? 'unknown'}-${index}`
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

const filteredRowEntries = computed(() => filteredRows.value.map((row, index) => ({
  row,
  key: rowKey(row, index),
  detailRoute: buildSongDetailRoute(row),
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
  stopSongCatalogUpdateListener = onSongCatalogUpdated((songs, catalog) => {
    if (snapshot.value && catalog.mdbVersion === snapshot.value.currentVersion) {
      applySnapshot(snapshot.value, songs)
    }
  }, { mdbVersion: 'all' })
  void bootstrapPage()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewportWidth)
  stopSongCatalogUpdateListener?.()
  stopSongCatalogUpdateListener = null
})
</script>

<template>
  <section class="recent-history-view">
    <header class="recent-history-view__topbar">
      <div class="recent-history-view__topbar-inner">
        <RouterLink
          class="recent-history-view__back"
          :to="{ name: 'skill' }"
          aria-label="返回 Skill"
        >
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M24.5 9.5L14 20L24.5 30.5" />
            <path d="M15 20H34" />
          </svg>
        </RouterLink>
        <h1>游玩历史</h1>
      </div>
    </header>

    <main class="recent-history-view__content">
      <p
        v-if="refreshing && filteredRows.length"
        class="recent-history-view__sync"
      >
        正在同步最新 BJMANIA 数据...
      </p>
      <p
        v-else-if="loadedFromCache && filteredRows.length"
        class="recent-history-view__sync"
      >
        使用缓存中，若此条消息长时存在，请尝试重新登录
      </p>
      <p
        v-else-if="error && filteredRows.length"
        class="recent-history-view__sync recent-history-view__sync--error"
      >
        刷新失败：{{ error }}
      </p>

      <section
        v-if="stateMessage"
        class="recent-history-view__state-card"
        :class="{ 'recent-history-view__state-card--error': error && !snapshot }"
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
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  background: transparent;
}

.recent-history-view__topbar {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 30;
  width: 100%;
  background: #4b3b76;
  box-shadow: 0 4px 15.8px rgba(133, 121, 168, 0.82);
}

.recent-history-view__topbar-inner {
  display: flex;
  align-items: center;
  gap: 12px;
  width: min(100%, 402px);
  margin: 0 auto;
  padding: var(--recent-top-bar-padding) 11px 15px;
}

.recent-history-view__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  color: #ffffff;
  text-decoration: none;
}

.recent-history-view__back svg {
  width: 34px;
  height: 34px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: square;
  stroke-linejoin: miter;
  stroke-width: 3.2;
}

.recent-history-view__topbar h1 {
  display: flex;
  align-items: center;
  min-height: 40px;
  margin: 0;
  color: #ffffff;
  font-family: var(--font-figma-title);
  font-size: 22px;
  font-weight: 400;
  line-height: 1;
  letter-spacing: 0.01em;
}

.recent-history-view__content {
  position: relative;
  z-index: 1;
  width: min(100%, 402px);
  margin: 0 auto;
  padding: var(--recent-content-top-padding) 18px 96px;
}

.recent-history-view__sync {
  width: 366px;
  max-width: 100%;
  margin: 0 auto 14px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.62);
  color: #34226c;
  font-family: var(--font-figma-title);
  font-size: 0.78rem;
  font-weight: 700;
  text-align: center;
  backdrop-filter: blur(8px);
}

.recent-history-view__sync--error {
  color: #b3261e;
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

.recent-history-view__state-card--error {
  border-color: rgba(179, 38, 30, 0.32);
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
