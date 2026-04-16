<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import RecentPlayCard from '../components/RecentPlayCard.vue'
import dmModeToggleSrc from '../assets/skill-toggle/dm-mode.svg'
import gfModeToggleSrc from '../assets/skill-toggle/gf-mode.svg'
import { loadBjmaniaSkillSnapshotCache, saveBjmaniaSkillSnapshotCache } from '../lib/bjmania/cache'
import {
  filterRecentByFamily,
  loadBjmaniaGitadoraSnapshot,
  mapRecentPlaysToList,
} from '../lib/bjmania/client'
import { loadSongCatalog } from '../lib/song-catalog'
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

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const snapshot = ref<BjmaniaGitadoraSnapshot | null>(null)
const recentRows = ref<BjmaniaRecentListItem[]>([])
const loadedFromCache = ref(false)
const viewportWidth = ref(typeof window === 'undefined' ? 402 : window.innerWidth)

const selectedFamily = computed<BjmaniaScoreFamily>(() => (
  route.query.family === 'gf' ? 'gf' : 'dm'
))
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
  const cached = loadBjmaniaSkillSnapshotCache()

  if (!cached) {
    return false
  }

  const songs = await loadSongCatalog()
  applySnapshot(cached.snapshot, songs)
  loadedFromCache.value = true
  return true
}

async function hydrateLiveSnapshot() {
  refreshing.value = true

  try {
    const [nextSnapshot, songs] = await Promise.all([
      loadBjmaniaGitadoraSnapshot(),
      loadSongCatalog(),
    ])
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

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth
}

onMounted(() => {
  updateViewportWidth()
  window.addEventListener('resize', updateViewportWidth, { passive: true })
  void bootstrapPage()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewportWidth)
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
        已先显示本地缓存，后台继续刷新
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
          v-for="(row, index) in filteredRows"
          :key="rowKey(row, index)"
          class="recent-history-view__card-shell"
        >
          <RecentPlayCard :row="row" />
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
  --recent-top-bar-height: calc(var(--recent-safe-top) + 70px);
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
  z-index: 5;
  width: 100%;
  background: #4b3b76;
  box-shadow: 0 4px 15.8px rgba(133, 121, 168, 0.82);
}

.recent-history-view__topbar-inner {
  display: flex;
  align-items: center;
  gap: 16px;
  width: min(100%, 402px);
  margin: 0 auto;
  padding: var(--recent-top-bar-padding) 20px 15px;
}

.recent-history-view__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 34px;
  height: 34px;
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
  padding: calc(var(--recent-top-bar-height) + 31px) 18px 96px;
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
  gap: calc(44px * var(--recent-card-scale));
}

.recent-history-view__card-shell {
  width: calc(var(--recent-card-width) * var(--recent-card-scale));
  height: calc(var(--recent-card-height) * var(--recent-card-scale));
  overflow: visible;
}

.recent-history-view__card-shell > :deep(.recent-play-card) {
  transform: scale(var(--recent-card-scale));
  transform-origin: top left;
}

.family-fab {
  position: fixed;
  right: 14px;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 32px);
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
