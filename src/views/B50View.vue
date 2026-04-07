<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import B50Poster from '../components/B50Poster.vue'
import { B50_POSTER_HEIGHT, B50_POSTER_WIDTH, getB50RowKey, selectB50BucketRows } from '../lib/b50'
import { exportElementAsImage, preloadImageSource, resolveImageSourceForExport } from '../lib/b50-export'
import { loadBjmaniaSkillSnapshotCache, saveBjmaniaSkillSnapshotCache } from '../lib/bjmania/cache'
import { loadBjmaniaGitadoraSnapshot, mapBestScoresToList, rawSkillToText } from '../lib/bjmania/client'
import { resolveCoverImageSource } from '../lib/cover-cache'
import { loadSongCatalog } from '../lib/song-catalog'
import type { BjmaniaGitadoraSnapshot, BjmaniaScoreFamily, BjmaniaScoreListItem } from '../types/bjmania'
import type { SongViewModel } from '../types/song'

const MIN_PREVIEW_SCALE = 0.42
const EXPORT_OPTIONS = {
  format: 'jpeg' as const,
  quality: 0.8,
  scale: 2,
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
  const nextMap: Record<string, string | null> = {}

  await Promise.all(rows.map(async (row) => {
    const key = getB50RowKey(row)
    nextMap[key] = await resolveCoverImageSource(
      row.song?.heroImageUrl ?? null,
      row.song?.heroImageCacheKey ?? key,
    )
  }))

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
    const nextMap: Record<string, string | null> = {}

    await Promise.all(currentRows.value.map(async (row) => {
      const key = getB50RowKey(row)
      const resolvedSrc = await resolveImageSourceForExport(
        row.song?.heroImageUrl ?? null,
        row.song?.heroImageCacheKey ?? key,
      )

      if (resolvedSrc && await preloadImageSource(resolvedSrc)) {
        nextMap[key] = resolvedSrc
        return
      }

      nextMap[key] = null
    }))

    exportCoverMap.value = nextMap
    await nextTick()

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
    <header class="b50-view__toolbar">
      <RouterLink class="b50-view__nav-button" to="/skill">返回 Skill</RouterLink>

      <div class="b50-view__family-switch" aria-label="B50 mode">
        <button
          class="b50-view__family-button"
          :class="{ 'b50-view__family-button--active': selectedFamily === 'dm' }"
          type="button"
          @click="switchFamily('dm')"
        >
          DM
        </button>
        <button
          class="b50-view__family-button"
          :class="{ 'b50-view__family-button--active': selectedFamily === 'gf' }"
          type="button"
          @click="switchFamily('gf')"
        >
          GF
        </button>
      </div>

      <button
        class="b50-view__nav-button b50-view__nav-button--primary"
        type="button"
        :disabled="loading || exporting || !currentRows.length"
        @click="handleExport"
      >
        导出
      </button>
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
  </section>
</template>

<style scoped>
.b50-view {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 10px) 14px 28px;
  background:
    radial-gradient(circle at top left, rgba(136, 96, 239, 0.18), transparent 28%),
    linear-gradient(180deg, #f7f5fb 0%, #ece6fb 100%);
}

.b50-view__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 auto 16px;
  width: min(100%, 1440px);
}

.b50-view__nav-button,
.b50-view__family-button {
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #3b286e;
  font: inherit;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  box-shadow: 0 10px 26px rgba(74, 48, 144, 0.12);
}

.b50-view__nav-button {
  padding: 11px 18px;
}

.b50-view__nav-button--primary {
  background: linear-gradient(135deg, #6135d2, #8a64ea);
  color: #fff;
}

.b50-view__nav-button:disabled {
  cursor: default;
  opacity: 0.6;
}

.b50-view__family-switch {
  display: inline-flex;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 10px 26px rgba(74, 48, 144, 0.12);
}

.b50-view__family-button {
  min-width: 68px;
  padding: 9px 16px;
  background: transparent;
  box-shadow: none;
}

.b50-view__family-button--active {
  background: linear-gradient(135deg, #4f22be, #7a54e7);
  color: #fff;
}

.b50-view__state-card {
  margin: 56px auto 0;
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

  .b50-view__toolbar {
    flex-wrap: wrap;
  }

  .b50-view__family-switch {
    order: 3;
  }
}
</style>
