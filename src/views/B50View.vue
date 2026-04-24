<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import B50Poster from '../components/B50Poster.vue'
import b50ButtonSrc from '../assets/skill-page/Player_Board/b50_button.svg'
import dmModeToggleSrc from '../assets/skill-toggle/dm-mode.svg'
import gfModeToggleSrc from '../assets/skill-toggle/gf-mode.svg'
import { B50_POSTER_HEIGHT, B50_POSTER_WIDTH, getB50RowKey, selectB50BucketRows } from '../lib/b50'
import { exportElementAsImage, preloadImageSource, resolveImageSourceForExport } from '../lib/b50-export'
import { loadBjmaniaSkillSnapshotCache, saveBjmaniaSkillSnapshotCache } from '../lib/bjmania/cache'
import { loadBjmaniaGitadoraSnapshot, mapBestScoresToList, rawSkillToText } from '../lib/bjmania/client'
import { resolveCoverImageSource } from '../lib/cover-cache'
import { loadSongCatalog } from '../lib/song-catalog'
import type { BjmaniaGitadoraSnapshot, BjmaniaScoreFamily, BjmaniaScoreListItem } from '../types/bjmania'
import type { SongViewModel } from '../types/song'

const MIN_PREVIEW_SCALE = 0.42
const COVER_PREPARE_CONCURRENCY = 6
const EXPORT_OPTIONS = {
  format: 'jpeg' as const,
  quality: 0.8,
  scale: 2,
}
const FAMILY_TOGGLE_ASSETS: Record<BjmaniaScoreFamily, string> = {
  dm: dmModeToggleSrc,
  gf: gfModeToggleSrc,
}

const route = useRoute()
const router = useRouter()

const previewShellRef = ref<HTMLElement | null>(null)
const exportPosterRef = ref<HTMLElement | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const exporting = ref(false)
const error = ref('')
const snapshot = ref<BjmaniaGitadoraSnapshot | null>(null)
const scoreRows = ref<BjmaniaScoreListItem[]>([])
const previewScale = ref(MIN_PREVIEW_SCALE)
const previewCoverMap = ref<Record<string, string | null>>({})
const exportCoverMap = ref<Record<string, string | null> | null>(null)
const noticeMessage = ref('')
const noticeKind = ref<'success' | 'error'>('success')
const noticeVisible = ref(false)

let previewResizeObserver: ResizeObserver | null = null
let previewCoverSequence = 0
let noticeTimer: ReturnType<typeof setTimeout> | null = null

const selectedFamily = computed<BjmaniaScoreFamily>(() => (
  route.query.family === 'gf' ? 'gf' : 'dm'
))
const selectedFamilyLabel = computed(() => selectedFamily.value.toUpperCase())
const selectedFamilyToggleSrc = computed(() => FAMILY_TOGGLE_ASSETS[selectedFamily.value])
const hotRows = computed(() => selectB50BucketRows(scoreRows.value, selectedFamily.value, true))
const otherRows = computed(() => selectB50BucketRows(scoreRows.value, selectedFamily.value, false))
const currentRows = computed(() => [...hotRows.value, ...otherRows.value])
const activeCoverMap = computed(() => exportCoverMap.value ?? previewCoverMap.value)
const playerName = computed(() => snapshot.value?.gitadoraProfile.name?.trim() || snapshot.value?.authUser.name || 'NO NAME')
const playerTitle = computed(() => snapshot.value?.gitadoraProfile.title?.trim() || 'GITADORA PLAYER')
const skillValue = computed(() => {
  if (!snapshot.value) {
    return '--'
  }

  return rawSkillToText(
    selectedFamily.value === 'dm'
      ? snapshot.value.gitadoraProfile.dmSkillRaw
      : snapshot.value.gitadoraProfile.gfSkillRaw,
  )
})

function setErrorMessage(nextError: unknown, fallback: string) {
  if (nextError instanceof Error && nextError.message) {
    error.value = nextError.message
    return
  }

  error.value = fallback
}

function clearNotice() {
  noticeVisible.value = false

  if (noticeTimer) {
    clearTimeout(noticeTimer)
    noticeTimer = null
  }
}

function showNotice(message: string, kind: 'success' | 'error') {
  clearNotice()
  noticeMessage.value = message
  noticeKind.value = kind
  noticeVisible.value = true
  noticeTimer = setTimeout(() => {
    noticeVisible.value = false
    noticeTimer = null
  }, 2200)
}

function updatePreviewScale() {
  if (!previewShellRef.value) {
    return
  }

  const scaledToFit = previewShellRef.value.clientWidth / B50_POSTER_WIDTH
  const nextScale = Math.min(Math.max(scaledToFit, MIN_PREVIEW_SCALE), 1)
  previewScale.value = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : MIN_PREVIEW_SCALE
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  if (!items.length) {
    return [] as R[]
  }

  const workerCount = Math.min(Math.max(limit, 1), items.length)
  const results = new Array<R>(items.length)
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        results[currentIndex] = await mapper(items[currentIndex], currentIndex)
      }
    }),
  )

  return results
}

function isRemoteImageSource(source: string) {
  return /^https?:\/\//i.test(source)
}

async function resolveReadyCoverSource(
  row: BjmaniaScoreListItem,
  options?: { allowExportFallback?: boolean },
) {
  const key = getB50RowKey(row)
  const source = row.song?.heroImageUrl ?? null

  if (!source) {
    return null
  }

  const cacheKey = row.song?.heroImageCacheKey ?? key
  const currentPreviewSource = previewCoverMap.value[key]

  if (currentPreviewSource && await preloadImageSource(currentPreviewSource)) {
    return currentPreviewSource
  }

  const cachedSource = await resolveCoverImageSource(source, cacheKey)

  if (
    cachedSource &&
    (!options?.allowExportFallback || !isRemoteImageSource(cachedSource)) &&
    await preloadImageSource(cachedSource)
  ) {
    return cachedSource
  }

  if (options?.allowExportFallback) {
    const exportSafeSource = await resolveImageSourceForExport(source, cacheKey)

    if (exportSafeSource && await preloadImageSource(exportSafeSource)) {
      return exportSafeSource
    }
  }

  if (cachedSource && await preloadImageSource(cachedSource)) {
    return cachedSource
  }

  return null
}

async function buildCoverMap(
  rows: readonly BjmaniaScoreListItem[],
  options?: { allowExportFallback?: boolean },
) {
  const entries = await mapWithConcurrency(rows, COVER_PREPARE_CONCURRENCY, async (row) => {
    const key = getB50RowKey(row)
    const coverSource = await resolveReadyCoverSource(row, options)
    return [key, coverSource] as const
  })

  return Object.fromEntries(entries) as Record<string, string | null>
}

function countMissingCoverSources(
  rows: readonly BjmaniaScoreListItem[],
  coverMap: Record<string, string | null>,
) {
  return rows.reduce((count, row) => {
    if (!row.song?.heroImageUrl) {
      return count
    }

    return coverMap[getB50RowKey(row)] ? count : count + 1
  }, 0)
}

function applySnapshot(nextSnapshot: BjmaniaGitadoraSnapshot, songs: SongViewModel[]) {
  snapshot.value = nextSnapshot
  scoreRows.value = mapBestScoresToList(nextSnapshot.bestScores.bestScores, songs, nextSnapshot.hotMusicIds)
  error.value = ''
}

async function restoreCachedSnapshot() {
  const cached = loadBjmaniaSkillSnapshotCache()

  if (!cached) {
    return false
  }

  const songs = await loadSongCatalog()
  applySnapshot(cached.snapshot, songs)
  return true
}

async function hydrateLiveSnapshot() {
  refreshing.value = true

  try {
    const [nextSnapshot, songs] = await Promise.all([loadBjmaniaGitadoraSnapshot(), loadSongCatalog()])
    applySnapshot(nextSnapshot, songs)
    saveBjmaniaSkillSnapshotCache(nextSnapshot)
  } finally {
    refreshing.value = false
  }
}

async function bootstrapPage() {
  loading.value = true
  error.value = ''

  let restored = false

  try {
    restored = await restoreCachedSnapshot()
  } catch {
    restored = false
  }

  if (restored) {
    loading.value = false
  }

  try {
    await hydrateLiveSnapshot()
  } catch (nextError) {
    if (!restored) {
      setErrorMessage(nextError, 'B50 页面数据加载失败。')
    }
  } finally {
    loading.value = false
  }
}

async function hydratePreviewCovers(rows: BjmaniaScoreListItem[]) {
  const nextSequence = ++previewCoverSequence
  const nextMap = await buildCoverMap(rows)

  if (nextSequence !== previewCoverSequence) {
    return
  }

  previewCoverMap.value = nextMap
}

async function handleExport() {
  if (exporting.value || !exportPosterRef.value || !currentRows.value.length) {
    return
  }

  exporting.value = true
  error.value = ''

  try {
    const exportSequence = ++previewCoverSequence
    const nextMap = await buildCoverMap(currentRows.value, { allowExportFallback: true })
    const missingCount = countMissingCoverSources(currentRows.value, nextMap)

    previewCoverMap.value = nextMap

    if (missingCount > 0) {
      throw new Error(`仍有 ${missingCount} 张封面未准备好，请稍后再试。`)
    }

    exportCoverMap.value = nextMap
    await nextTick()

    if (exportSequence !== previewCoverSequence) {
      return
    }

    const result = await exportElementAsImage(
      exportPosterRef.value,
      `b50_${selectedFamily.value}`,
      EXPORT_OPTIONS,
    )

    const message = result.uri
      ? `B50 页面已保存到本地：${result.filename}`
      : `B50 页面已下载：${result.filename}`
    showNotice(message, 'success')
  } catch (nextError) {
    const message = nextError instanceof Error && nextError.message
      ? nextError.message
      : 'B50 页面导出失败。'
    showNotice(message, 'error')
  } finally {
    exporting.value = false
  }
}

function switchFamily(family: BjmaniaScoreFamily) {
  if (family === selectedFamily.value) {
    return
  }

  void router.replace({
    name: 'skill-b50',
    query: { family },
  })
}

function cycleFamily() {
  switchFamily(selectedFamily.value === 'dm' ? 'gf' : 'dm')
}

watch(currentRows, (rows) => {
  exportCoverMap.value = null
  void hydratePreviewCovers(rows)
}, { immediate: true })

onMounted(() => {
  updatePreviewScale()

  if (typeof ResizeObserver !== 'undefined' && previewShellRef.value) {
    previewResizeObserver = new ResizeObserver(() => {
      updatePreviewScale()
    })
    previewResizeObserver.observe(previewShellRef.value)
  }

  void bootstrapPage()
})

onBeforeUnmount(() => {
  previewResizeObserver?.disconnect()
  clearNotice()
})
</script>

<template>
  <section class="b50-view">
    <header class="b50-view__topbar">
      <div class="b50-view__topbar-inner">
        <RouterLink
          class="b50-view__back"
          :to="{ name: 'skill' }"
          aria-label="返回 Skill"
        >
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M24.5 9.5L14 20L24.5 30.5" />
            <path d="M15 20H34" />
          </svg>
        </RouterLink>
        <h1>B50</h1>
      </div>
    </header>

    <div v-if="loading && !snapshot" class="b50-view__state-card">
      <p class="b50-view__state-eyebrow">B50</p>
      <h1>正在加载页面数据</h1>
      <p>会先尝试读取 skill 页缓存，再补最新成绩。</p>
    </div>

    <div v-else-if="error && !snapshot" class="b50-view__state-card">
      <p class="b50-view__state-eyebrow">B50</p>
      <h1>页面加载失败</h1>
      <p>{{ error }}</p>
    </div>

    <div v-else class="b50-view__content">
      <p v-if="refreshing" class="b50-view__refreshing">正在刷新最新 BJMANIA 数据...</p>

      <div ref="previewShellRef" class="b50-view__preview-shell">
        <div class="b50-view__preview-scroll">
          <div
            class="b50-view__preview-stage"
            :style="{
              width: `${B50_POSTER_WIDTH * previewScale}px`,
              height: `${B50_POSTER_HEIGHT * previewScale}px`,
            }"
          >
            <div
              class="b50-view__preview-transform"
              :style="{ transform: `scale(${previewScale})` }"
            >
              <B50Poster
                :family="selectedFamily"
                :player-name="playerName"
                :player-title="playerTitle"
                :skill-value="skillValue"
                :hot-rows="hotRows"
                :other-rows="otherRows"
                :cover-map="activeCoverMap"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="b50-view__export-stage" aria-hidden="true">
        <div ref="exportPosterRef" class="b50-view__export-shell">
          <B50Poster
            :family="selectedFamily"
            :player-name="playerName"
            :player-title="playerTitle"
            :skill-value="skillValue"
            :hot-rows="hotRows"
            :other-rows="otherRows"
            :cover-map="activeCoverMap"
          />
        </div>
      </div>
    </div>

    <transition name="b50-loading-fade">
      <div v-if="exporting" class="b50-view__loading-mask" role="status" aria-live="polite">
        <div class="b50-view__loading-card">
          <span class="b50-view__spinner" aria-hidden="true"></span>
          <p>正在导出图片</p>
        </div>
      </div>
    </transition>

    <transition name="b50-notice-fade">
      <div
        v-if="noticeVisible"
        class="b50-view__notice"
        :class="{
          'b50-view__notice--success': noticeKind === 'success',
          'b50-view__notice--error': noticeKind === 'error',
        }"
        role="status"
        aria-live="polite"
      >
        {{ noticeMessage }}
      </div>
    </transition>

    <button
      class="export-fab"
      type="button"
      :disabled="loading || exporting || !currentRows.length"
      aria-label="导出 B50"
      @click="handleExport"
    >
      <img class="export-fab__icon" :src="b50ButtonSrc" alt="" aria-hidden="true" />
      <span>导出</span>
    </button>

    <button
      class="family-fab"
      type="button"
      :aria-label="`切换 B50 模式，当前 ${selectedFamilyLabel}`"
      @click="cycleFamily"
    >
      <img class="family-fab__image" :src="selectedFamilyToggleSrc" alt="" aria-hidden="true" />
    </button>
  </section>
</template>

<style scoped>
.b50-view {
  --b50-safe-top: env(safe-area-inset-top, 0px);
  --b50-top-bar-padding: calc(var(--b50-safe-top) + 15px);
  --b50-content-top-padding: calc(var(--b50-safe-top) + 100px);
  min-height: 100vh;
  padding: 0 14px 28px;
  background:
    radial-gradient(circle at top left, rgba(136, 96, 239, 0.18), transparent 28%),
    linear-gradient(180deg, #f7f5fb 0%, #ece6fb 100%);
}

.b50-view__topbar {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 30;
  width: 100%;
  background: #4b3b76;
  box-shadow: 0 4px 15.8px rgba(133, 121, 168, 0.82);
}

.b50-view__topbar-inner {
  display: flex;
  align-items: center;
  gap: 12px;
  width: min(100%, 402px);
  margin: 0 auto;
  padding: var(--b50-top-bar-padding) 11px 15px;
}

.b50-view__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  color: #ffffff;
  text-decoration: none;
}

.b50-view__back svg {
  width: 34px;
  height: 34px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: square;
  stroke-linejoin: miter;
  stroke-width: 3.2;
}

.b50-view__topbar h1 {
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

.b50-view__state-card {
  margin: var(--b50-content-top-padding) auto 0;
  width: min(100%, 520px);
  padding: 28px 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 38px rgba(72, 46, 140, 0.12);
}

.b50-view__state-eyebrow {
  margin: 0 0 12px;
  color: #6d59a2;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.b50-view__state-card h1,
.b50-view__state-card p {
  margin: 0;
}

.b50-view__state-card h1 {
  margin-bottom: 8px;
  color: #24174a;
  font-size: 1.4rem;
}

.b50-view__state-card p:last-child {
  color: #5d5475;
  line-height: 1.6;
}

.b50-view__content {
  width: min(100%, 1440px);
  margin: 0 auto;
  padding-top: var(--b50-content-top-padding);
}

.b50-view__refreshing {
  margin: 0 0 12px;
  color: #5a4a88;
  font-size: 0.95rem;
  line-height: 1.5;
}

.b50-view__preview-shell {
  overflow: hidden;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 22px 48px rgba(67, 42, 137, 0.12);
}

.b50-view__preview-scroll {
  overflow: auto;
  padding: 14px;
}

.b50-view__preview-stage {
  position: relative;
}

.b50-view__preview-transform {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
}

.b50-view__export-stage {
  position: fixed;
  top: 0;
  left: -99999px;
  pointer-events: none;
  opacity: 0;
}

.b50-view__export-shell {
  width: max-content;
}

.export-fab,
.family-fab {
  position: fixed;
  right: 14px;
  z-index: 32;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.family-fab {
  bottom: calc(env(safe-area-inset-bottom, 0px) + 92px);
  width: 56px;
  height: 56px;
  border-radius: 999px;
  box-shadow: 0 4px 15.8px rgba(133, 121, 168, 0.82);
}

.family-fab__image {
  display: block;
  width: 56px;
  height: 56px;
}

.export-fab {
  bottom: calc(env(safe-area-inset-bottom, 0px) + 162px);
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 1px;
  width: 56px;
  height: 56px;
  border-radius: 999px;
  background: #715ea6;
  color: #ffffff;
  box-shadow: 0 4px 15.8px rgba(133, 121, 168, 0.82);
  font-family: var(--font-sans);
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1;
}

.export-fab:disabled {
  opacity: 0.62;
  cursor: default;
}

.export-fab__icon {
  display: block;
  width: 32px;
  height: 32px;
  filter: brightness(0) invert(1);
}

.b50-view__loading-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(242, 238, 250, 0.48);
  backdrop-filter: blur(6px);
}

.b50-view__loading-card {
  display: grid;
  justify-items: center;
  gap: 14px;
  min-width: 164px;
  padding: 22px 24px 18px;
  border: 1px solid rgba(101, 66, 198, 0.22);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 24px 48px rgba(61, 37, 128, 0.18);
}

.b50-view__loading-card p {
  margin: 0;
  color: #4b328d;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.b50-view__spinner {
  width: 34px;
  height: 34px;
  border: 3px solid rgba(124, 88, 225, 0.2);
  border-top-color: #6d42d6;
  border-radius: 50%;
  animation: b50-view-spin 0.78s linear infinite;
}

.b50-view__notice {
  position: fixed;
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 22px);
  z-index: 82;
  max-width: min(calc(100vw - 28px), 420px);
  padding: 12px 18px;
  border-radius: 999px;
  color: #fff;
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
  transform: translateX(-50%);
  box-shadow: 0 14px 30px rgba(37, 21, 82, 0.22);
  backdrop-filter: blur(10px);
}

.b50-view__notice--success {
  background: rgba(79, 55, 138, 0.94);
}

.b50-view__notice--error {
  background: rgba(179, 38, 30, 0.92);
}

.b50-loading-fade-enter-active,
.b50-loading-fade-leave-active,
.b50-notice-fade-enter-active,
.b50-notice-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.b50-loading-fade-enter-from,
.b50-loading-fade-leave-to,
.b50-notice-fade-enter-from,
.b50-notice-fade-leave-to {
  opacity: 0;
}

.b50-notice-fade-enter-from,
.b50-notice-fade-leave-to {
  transform: translateX(-50%) translateY(8px);
}

@keyframes b50-view-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .b50-view {
    padding-inline: 10px;
  }
}
</style>
