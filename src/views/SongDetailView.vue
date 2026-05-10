<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LazyCoverImage from '../components/LazyCoverImage.vue'
import bookOpenIconSrc from '../assets/detail-page/book-open.png'
import favoriteSelectedIconSrc from '../assets/detail-page/favorite-selected.png'
import favoriteIconSrc from '../assets/detail-page/favorite.png'
import noteIconSrc from '../assets/detail-page/note.png'
import { loadBjmaniaSkillSnapshotCache } from '../lib/bjmania/cache'
import { mapBestScoresToList } from '../lib/bjmania/client'
import {
  getAvailableDtxLevels,
  hasLoadedDtxChartSet,
  loadDtxChartManifest,
} from '../lib/chart-preview-manifest'
import { saveImageToGallery } from '../lib/native-image-saver'
import { openNativeWebView } from '../lib/native-webview'
import { loadSongByMusicId, onSongCatalogUpdated } from '../lib/song-catalog'
import { favoriteMusicIds, toggleFavoriteMusicId } from '../lib/song-favorites'
import { resolveSongVersionLogos } from '../lib/version-logos'
import type { BjmaniaScoreListItem } from '../types/bjmania'
import type { DifficultySlot, InstrumentDifficulty, InstrumentKey, LevelKey, SongViewModel } from '../types/song'

const route = useRoute()
const router = useRouter()
const song = ref<SongViewModel>()
const loading = ref(true)
const errorMessage = ref('')
const selectedInstrumentKey = ref<InstrumentKey>('drum')
const scoreRows = ref<BjmaniaScoreListItem[]>([])
const copyToastVisible = ref(false)
const copyToastText = ref('')
const titleScrollEl = ref<HTMLButtonElement | null>(null)
const artistScrollEl = ref<HTMLButtonElement | null>(null)
const coverLightboxOpen = ref(false)
const coverSaving = ref(false)
let stopSongCatalogUpdateListener: (() => void) | null = null
let copyToastTimer: number | undefined
let copyTextPointerStart: { x: number; y: number } | null = null
let copyTextPointerDragged = false
let autoScrollTimers: number[] = []
let autoScrollFrames: number[] = []
let autoScrollAnimations: Animation[] = []
let previousBodyOverflow: string | null = null
let coverLongPressTimer: number | undefined
let coverLongPressPointerStart: { x: number; y: number } | null = null
let coverLongPressTriggered = false

const INSTRUMENT_LABELS: Record<InstrumentKey, string> = {
  drum: 'Drum',
  guitar: 'Guitar',
  bass: 'Bass',
}

const LEVEL_LABELS: Record<LevelKey, string> = {
  master: 'MAS',
  extreme: 'EXT',
  advanced: 'ADV',
  basic: 'BAS',
}

function isInstrumentKey(value: unknown): value is InstrumentKey {
  return value === 'drum' || value === 'guitar' || value === 'bass'
}

function syncSelectedInstrumentFromRoute() {
  const instrument = Array.isArray(route.query.instrument)
    ? route.query.instrument[0]
    : route.query.instrument

  if (isInstrumentKey(instrument)) {
    selectedInstrumentKey.value = instrument
  }
}

function resolveRouteMdbVersion() {
  const rawVersion = Array.isArray(route.query.version) ? route.query.version[0] : route.query.version
  const parsedVersion = rawVersion ? Number(rawVersion) : null
  return parsedVersion && Number.isFinite(parsedVersion) ? parsedVersion : null
}

function orderedLevels(levels: DifficultySlot[]) {
  const levelOrder: LevelKey[] = ['master', 'extreme', 'advanced', 'basic']
  return levelOrder
    .map((levelKey) => levels.find((level) => level.level === levelKey))
    .filter((level): level is DifficultySlot => Boolean(level))
}

function formatSkillLabel(row: BjmaniaScoreListItem | null) {
  if (!row || row.skillCalcRaw <= 0) {
    return '--'
  }

  return row.skillCalcText
}

function formatRateLabel(row: BjmaniaScoreListItem | null) {
  if (!row) {
    return '--'
  }

  return row.percText === 'FAILED' ? 'Failed' : row.percText
}

function formatPlayStateLabel(level: DifficultySlot, row: BjmaniaScoreListItem | null) {
  if (!level.available) {
    return '无谱面'
  }

  if (!row) {
    return '未游玩'
  }

  if (row.excellent) {
    return 'Excellent'
  }

  if (row.fullCombo) {
    return 'Full Combo'
  }

  if (row.clear) {
    return 'Cleared'
  }

  return row.percText === 'FAILED' ? 'Failed' : 'Played'
}

function getLevelTone(level: LevelKey) {
  return `song-detail__chart-card--${level}`
}

function getInstrumentButtonClass(instrument: InstrumentDifficulty) {
  return {
    'song-detail__instrument-button--active': instrument.key === selectedInstrumentKey.value,
  }
}

function syncCachedScoreRows(currentSong: SongViewModel) {
  const cached = loadBjmaniaSkillSnapshotCache({ version: resolveRouteMdbVersion() })

  if (!cached) {
    scoreRows.value = []
    return
  }

  scoreRows.value = mapBestScoresToList(
    cached.snapshot.bestScores.bestScores,
    [currentSong],
    cached.snapshot.hotMusicIds,
  ).filter((row) => row.musicId === currentSong.musicId)
}

async function loadCurrentSong() {
  loading.value = true
  errorMessage.value = ''

  const musicId = Number(route.params.musicId)

  if (!Number.isFinite(musicId)) {
    errorMessage.value = '歌曲 ID 无效'
    song.value = undefined
    loading.value = false
    return
  }

  try {
    const result = await loadSongByMusicId(musicId, { mdbVersion: resolveRouteMdbVersion() })

    if (!result) {
      errorMessage.value = `没有找到 Music ID ${musicId}`
      song.value = undefined
      return
    }

    song.value = result
    syncCachedScoreRows(result)
    if (!result.instruments.some((instrument) => instrument.key === selectedInstrumentKey.value)) {
      selectedInstrumentKey.value = result.instruments[0]?.key ?? 'drum'
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '歌曲详情加载失败'
    song.value = undefined
    scoreRows.value = []
  } finally {
    loading.value = false
  }
}

async function goBack() {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back()
    return
  }

  await router.replace({ name: 'home' })
}

function resetCopyTextPointer() {
  copyTextPointerStart = null
  copyTextPointerDragged = false
}

function handleCopyTextPointerDown(event: PointerEvent) {
  clearAutoScrollTimers()
  copyTextPointerStart = {
    x: event.clientX,
    y: event.clientY,
  }
  copyTextPointerDragged = false
}

function handleCopyTextPointerMove(event: PointerEvent) {
  if (!copyTextPointerStart) {
    return
  }

  const distanceX = Math.abs(event.clientX - copyTextPointerStart.x)
  const distanceY = Math.abs(event.clientY - copyTextPointerStart.y)

  if (distanceX > 8 || distanceY > 8) {
    copyTextPointerDragged = true
  }
}

function fallbackCopyText(text: string) {
  if (typeof document === 'undefined') {
    return false
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.top = '-999px'
  textarea.style.left = '-999px'
  textarea.style.opacity = '0'

  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)

  return copied
}

function showToast(message: string, duration = 1200) {
  if (copyToastTimer !== undefined) {
    window.clearTimeout(copyToastTimer)
  }

  copyToastText.value = message
  copyToastVisible.value = true
  copyToastTimer = window.setTimeout(() => {
    copyToastVisible.value = false
    copyToastTimer = undefined
  }, duration)
}

function showCopyToast() {
  showToast('已复制')
}

async function copyTextValue(value: string) {
  if (copyTextPointerDragged) {
    resetCopyTextPointer()
    return
  }

  resetCopyTextPointer()
  const text = value.trim()

  if (!text) {
    return
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      fallbackCopyText(text)
    }
  } catch {
    fallbackCopyText(text)
  }

  showCopyToast()
}

function clearAutoScrollTimers() {
  autoScrollTimers.forEach((timer) => window.clearTimeout(timer))
  autoScrollTimers = []
  autoScrollFrames.forEach((frame) => window.cancelAnimationFrame(frame))
  autoScrollFrames = []
  autoScrollAnimations.forEach((animation) => animation.cancel())
  autoScrollAnimations = []
  resetAutoScrollTextTransforms()
}

function queueAutoScrollTimer(callback: () => void, delay: number) {
  const timer = window.setTimeout(() => {
    autoScrollTimers = autoScrollTimers.filter((currentTimer) => currentTimer !== timer)
    callback()
  }, delay)

  autoScrollTimers.push(timer)
}

function queueAutoScrollFrame(callback: FrameRequestCallback) {
  const frame = window.requestAnimationFrame((time) => {
    autoScrollFrames = autoScrollFrames.filter((currentFrame) => currentFrame !== frame)
    callback(time)
  })

  autoScrollFrames.push(frame)
}

function animateTextScroll(element: HTMLElement, targetLeft: number, duration: number) {
  const startLeft = element.scrollLeft
  const distance = targetLeft - startLeft
  const startTime = performance.now()

  if (Math.abs(distance) <= 1) {
    element.scrollLeft = targetLeft
    return
  }

  const step = (time: number) => {
    const progress = Math.min(1, (time - startTime) / duration)
    const easedProgress = 1 - Math.pow(1 - progress, 3)
    element.scrollLeft = startLeft + distance * easedProgress

    if (progress < 1) {
      queueAutoScrollFrame(step)
    }
  }

  queueAutoScrollFrame(step)
}

function removeAutoScrollAnimation(animation: Animation) {
  autoScrollAnimations = autoScrollAnimations.filter((currentAnimation) => currentAnimation !== animation)
}

function resetAutoScrollTextTransforms() {
  const titleText = titleScrollEl.value?.querySelector<HTMLElement>('span')
  const artistText = artistScrollEl.value?.querySelector<HTMLElement>('span')

  if (titleText) {
    titleText.style.transform = ''
  }

  if (artistText) {
    artistText.style.transform = ''
  }
}

function animateTextTransform(
  content: HTMLElement,
  fromX: number,
  toX: number,
  duration: number,
) {
  if (typeof content.animate !== 'function') {
    return null
  }

  const animation = content.animate(
    [
      { transform: `translate3d(${fromX}px, 0, 0)` },
      { transform: `translate3d(${toX}px, 0, 0)` },
    ],
    {
      duration,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    },
  )

  autoScrollAnimations.push(animation)
  animation.oncancel = () => {
    removeAutoScrollAnimation(animation)
  }
  animation.onfinish = () => {
    removeAutoScrollAnimation(animation)
    content.style.transform = toX === 0 ? '' : `translate3d(${toX}px, 0, 0)`
    animation.oncancel = null
    animation.cancel()
  }

  return animation
}

function previewTextScroll(element: HTMLElement | null, delay = 0) {
  if (!element) {
    return
  }

  const content = element.querySelector<HTMLElement>('span')
  const maxScrollLeft = (content?.scrollWidth ?? element.scrollWidth) - element.clientWidth

  if (maxScrollLeft <= 2) {
    element.scrollLeft = 0
    if (content) {
      content.style.transform = ''
    }
    return
  }

  const forwardDuration = Math.min(3400, Math.max(1700, maxScrollLeft * 18))
  const returnDuration = Math.min(2800, Math.max(1300, maxScrollLeft * 12))

  element.scrollLeft = 0
  queueAutoScrollTimer(() => {
    if (content && animateTextTransform(content, 0, -maxScrollLeft, forwardDuration)) {
      return
    }

    animateTextScroll(element, maxScrollLeft, forwardDuration)
  }, delay)
  queueAutoScrollTimer(() => {
    if (content && animateTextTransform(content, -maxScrollLeft, 0, returnDuration)) {
      return
    }

    animateTextScroll(element, 0, returnDuration)
  }, delay + forwardDuration + 900)
}

async function previewScrollableTextOnce() {
  if (typeof window === 'undefined') {
    return
  }

  clearAutoScrollTimers()
  await nextTick()

  queueAutoScrollTimer(() => {
    previewTextScroll(titleScrollEl.value)
    previewTextScroll(artistScrollEl.value, 180)
  }, 260)
}

function clearCoverLongPressTimer() {
  if (coverLongPressTimer !== undefined) {
    window.clearTimeout(coverLongPressTimer)
    coverLongPressTimer = undefined
  }
  coverLongPressPointerStart = null
}

function openCoverLightbox() {
  if (!song.value?.heroImageUrl) {
    return
  }

  coverLightboxOpen.value = true
}

function closeCoverLightbox() {
  coverLightboxOpen.value = false
  clearCoverLongPressTimer()
}

function buildCoverFilenameBase() {
  if (!song.value) {
    return `cover-${Date.now()}`
  }

  return `${song.value.musicId}-${song.value.displayTitle}`
}

async function saveCurrentCoverToGallery() {
  if (!song.value?.heroImageUrl || coverSaving.value) {
    return
  }

  coverSaving.value = true
  showToast('正在保存...', 1600)

  try {
    await saveImageToGallery(song.value.heroImageUrl, buildCoverFilenameBase())
    showToast('已保存到图库')
  } catch {
    showToast('保存失败')
  } finally {
    coverSaving.value = false
  }
}

async function openSongRemyWiki() {
  if (!song.value?.links.remyUrl) {
    showToast('暂无 RemyWiki 链接')
    return
  }

  try {
    await openNativeWebView(song.value.links.remyUrl, song.value.displayTitle)
  } catch {
    showToast('无法打开 RemyWiki')
  }
}

async function openChartPreview(level?: LevelKey) {
  if (!song.value) {
    return
  }

  const currentSong = song.value
  const instrument = selectedInstrumentKey.value
  let chartAvailable = false

  try {
    const manifest = await loadDtxChartManifest()
    chartAvailable = hasLoadedDtxChartSet(currentSong.musicId, manifest)

    if (level && !getAvailableDtxLevels(currentSong.musicId, instrument, manifest).includes(level)) {
      showToast('暂未收录该谱面预览')
      return
    }
  } catch {
    showToast('谱面库加载失败')
    return
  }

  if (!chartAvailable) {
    showToast('暂未收录谱面预览')
    return
  }

  await router.push({
    name: 'song-chart',
    params: { musicId: currentSong.musicId },
    query: {
      instrument,
      ...(level ? { level } : {}),
      ...(route.query.version ? { version: route.query.version } : {}),
    },
  })
}

function toggleSongFavorite() {
  if (!song.value) {
    return
  }

  const favorite = toggleFavoriteMusicId(song.value.musicId)
  showToast(favorite ? '已收藏' : '已取消收藏')
}

function handleCoverLongPressStart(event: PointerEvent) {
  if (!song.value?.heroImageUrl || coverSaving.value) {
    return
  }

  coverLongPressTriggered = false
  clearCoverLongPressTimer()
  coverLongPressPointerStart = {
    x: event.clientX,
    y: event.clientY,
  }
  coverLongPressTimer = window.setTimeout(() => {
    coverLongPressTriggered = true
    clearCoverLongPressTimer()
    void saveCurrentCoverToGallery()
  }, 720)
}

function handleCoverLongPressMove(event: PointerEvent) {
  if (!coverLongPressPointerStart) {
    return
  }

  const distanceX = Math.abs(event.clientX - coverLongPressPointerStart.x)
  const distanceY = Math.abs(event.clientY - coverLongPressPointerStart.y)

  if (distanceX > 10 || distanceY > 10) {
    clearCoverLongPressTimer()
  }
}

function handleCoverLightboxClick(event: MouseEvent) {
  if (!coverLongPressTriggered) {
    return
  }

  coverLongPressTriggered = false
  event.preventDefault()
  event.stopPropagation()
}

const selectedInstrument = computed(() => {
  return song.value?.instruments.find((instrument) => instrument.key === selectedInstrumentKey.value)
    ?? song.value?.instruments[0]
    ?? null
})

const instrumentTabs = computed(() => {
  if (!song.value) {
    return []
  }

  const order: InstrumentKey[] = ['drum', 'guitar', 'bass']
  return order
    .map((instrumentKey) => song.value?.instruments.find((instrument) => instrument.key === instrumentKey))
    .filter((instrument): instrument is InstrumentDifficulty => Boolean(instrument))
})

const selectedLevels = computed(() => {
  return selectedInstrument.value ? orderedLevels(selectedInstrument.value.levels) : []
})

const scoreRowByChart = computed(() => {
  const map = new Map<string, BjmaniaScoreListItem>()

  scoreRows.value.forEach((row) => {
    map.set(`${row.instrument}:${row.level}`, row)
  })

  return map
})

function getScoreRow(level: LevelKey) {
  return scoreRowByChart.value.get(`${selectedInstrumentKey.value}:${level}`) ?? null
}

const versionLogos = computed(() => {
  return song.value ? resolveSongVersionLogos(song.value.versionKey) : []
})

const quickFacts = computed(() => {
  if (!song.value) {
    return []
  }

  return [
    { label: 'BPM', value: song.value.bpmDisplay },
    { label: 'Length', value: song.value.lengthLabel },
    { label: 'ID', value: `#${song.value.musicId}` },
  ]
})

const isCurrentSongFavorite = computed(() => {
  return song.value ? favoriteMusicIds.value.has(song.value.musicId) : false
})

watch(
  () => route.query.instrument,
  () => {
    syncSelectedInstrumentFromRoute()
  },
  { immediate: true },
)

watch(() => [route.params.musicId, route.query.version], loadCurrentSong)

watch(
  () => [song.value?.musicId, loading.value] as const,
  ([musicId, isLoading]) => {
    if (musicId && !isLoading) {
      void previewScrollableTextOnce()
    }
  },
  { flush: 'post' },
)

watch(coverLightboxOpen, (isOpen) => {
  if (typeof document === 'undefined') {
    return
  }

  if (isOpen) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return
  }

  document.body.style.overflow = previousBodyOverflow ?? ''
  previousBodyOverflow = null
})

onMounted(() => {
  stopSongCatalogUpdateListener = onSongCatalogUpdated(() => {
    void loadCurrentSong()
  }, { mdbVersion: 'all' })
  void loadCurrentSong()
})

onBeforeUnmount(() => {
  stopSongCatalogUpdateListener?.()
  stopSongCatalogUpdateListener = null
  if (copyToastTimer !== undefined) {
    window.clearTimeout(copyToastTimer)
    copyToastTimer = undefined
  }
  clearAutoScrollTimers()
  clearCoverLongPressTimer()
  if (typeof document !== 'undefined' && previousBodyOverflow !== null) {
    document.body.style.overflow = previousBodyOverflow
    previousBodyOverflow = null
  }
})
</script>

<template>
  <section class="song-detail">
    <header class="song-detail__topbar">
      <div class="song-detail__topbar-inner">
        <button class="song-detail__back-button" type="button" aria-label="返回上一页" @click="goBack">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M24.5 9.5L14 20L24.5 30.5"></path>
            <path d="M15 20H34"></path>
          </svg>
        </button>
        <h1>详情</h1>
      </div>
    </header>

    <main class="song-detail__content">
      <section v-if="loading" class="song-detail__state">
        歌曲详情加载中...
      </section>

      <section v-else-if="errorMessage" class="song-detail__state song-detail__state--error">
        <p>{{ errorMessage }}</p>
        <button type="button" @click="goBack">返回</button>
      </section>

      <template v-else-if="song">
        <section class="song-detail__hero" aria-labelledby="song-detail-title">
          <button
            class="song-detail__cover-wrap"
            type="button"
            :disabled="!song.heroImageUrl"
            :aria-label="`查看 ${song.displayTitle} 封面`"
            @click="openCoverLightbox"
          >
            <LazyCoverImage
              class="song-detail__cover"
              :src="song.heroImageUrl"
              :cache-key="song.heroImageCacheKey"
              :alt="`${song.displayTitle} cover`"
              :fallback-text="song.imageFallback"
              :eager="true"
            />
          </button>

          <div class="song-detail__identity">
            <h1 id="song-detail-title">
              <button
                ref="titleScrollEl"
                class="song-detail__copy-text song-detail__copy-text--title"
                type="button"
                :title="song.displayTitle"
                @pointerdown="handleCopyTextPointerDown"
                @pointermove="handleCopyTextPointerMove"
                @pointercancel="resetCopyTextPointer"
                @click="copyTextValue(song.displayTitle)"
              >
                <span>{{ song.displayTitle }}</span>
              </button>
            </h1>
            <p class="song-detail__artist">
              <button
                ref="artistScrollEl"
                class="song-detail__copy-text song-detail__copy-text--artist"
                type="button"
                :title="song.displayArtist"
                @pointerdown="handleCopyTextPointerDown"
                @pointermove="handleCopyTextPointerMove"
                @pointercancel="resetCopyTextPointer"
                @click="copyTextValue(song.displayArtist)"
              >
                <span>{{ song.displayArtist }}</span>
              </button>
            </p>
            <div v-if="versionLogos.length" class="song-detail__inline-logos" aria-label="收录版本">
              <img
                v-for="logo in versionLogos"
                :key="logo.key"
                :src="logo.src"
                :alt="`${logo.label} version logo`"
              />
            </div>
          </div>
        </section>

        <section class="song-detail__action-row" aria-label="歌曲操作">
          <button
            class="song-detail__icon-button song-detail__icon-button--action"
            type="button"
            aria-label="谱面预览"
            @click="openChartPreview()"
          >
            <img :src="noteIconSrc" alt="" aria-hidden="true" />
          </button>
          <button
            class="song-detail__icon-button song-detail__icon-button--action"
            type="button"
            aria-label="打开 RemyWiki"
            :disabled="!song.links.remyUrl"
            @click="openSongRemyWiki"
          >
            <img :src="bookOpenIconSrc" alt="" aria-hidden="true" />
          </button>
          <button
            class="song-detail__icon-button song-detail__icon-button--action"
            type="button"
            :aria-label="isCurrentSongFavorite ? '取消收藏' : '收藏'"
            :aria-pressed="isCurrentSongFavorite"
            @click="toggleSongFavorite"
          >
            <img
              :src="isCurrentSongFavorite ? favoriteSelectedIconSrc : favoriteIconSrc"
              alt=""
              aria-hidden="true"
            />
          </button>
        </section>

        <section class="song-detail__facts" aria-label="歌曲摘要">
          <article v-for="fact in quickFacts" :key="fact.label" class="song-detail__fact">
            <span>{{ fact.label }}</span>
            <strong>{{ fact.value }}</strong>
          </article>
        </section>

        <section class="song-detail__chart-section" aria-label="谱面信息">
          <div class="song-detail__section-heading">
            <span>Skill</span>
          </div>

          <div class="song-detail__instrument-tabs" role="tablist" aria-label="选择乐器">
            <button
              v-for="instrument in instrumentTabs"
              :key="instrument.key"
              class="song-detail__instrument-button"
              :class="getInstrumentButtonClass(instrument)"
              type="button"
              :aria-selected="instrument.key === selectedInstrumentKey"
              @click="selectedInstrumentKey = instrument.key"
            >
              <span>{{ INSTRUMENT_LABELS[instrument.key] }}</span>
            </button>
          </div>

          <div class="song-detail__chart-grid">
            <button
              v-for="level in selectedLevels"
              :key="`${selectedInstrumentKey}-${level.level}`"
              class="song-detail__chart-card"
              :class="[getLevelTone(level.level), { 'song-detail__chart-card--missing': !level.available }]"
              type="button"
              :disabled="!level.available"
              :aria-label="`${INSTRUMENT_LABELS[selectedInstrumentKey]} ${LEVEL_LABELS[level.level]} 谱面预览`"
              @click="openChartPreview(level.level)"
            >
              <span class="song-detail__chart-code">{{ LEVEL_LABELS[level.level] }}</span>
              <strong>{{ level.available ? level.difficultyText : '-.-' }}</strong>
              <div class="song-detail__skill-strip">
                <span>Skill</span>
                <b>{{ formatSkillLabel(getScoreRow(level.level)) }}</b>
              </div>
              <div class="song-detail__skill-strip">
                <span>达成率</span>
                <b>{{ formatRateLabel(getScoreRow(level.level)) }}</b>
              </div>
              <div class="song-detail__score-state">
                <span>{{ formatPlayStateLabel(level, getScoreRow(level.level)) }}</span>
                <b v-if="getScoreRow(level.level)">{{ getScoreRow(level.level)?.rankLabel }}</b>
              </div>
            </button>
          </div>
        </section>
      </template>
    </main>

    <Teleport to="body">
      <Transition name="song-detail-lightbox">
        <div
          v-if="coverLightboxOpen && song"
          class="song-detail__lightbox"
          role="dialog"
          aria-modal="true"
          :aria-label="`${song.displayTitle} 封面预览`"
          @click.self="closeCoverLightbox"
        >
          <button
            class="song-detail__lightbox-close"
            type="button"
            aria-label="关闭封面预览"
            @click="closeCoverLightbox"
          >
            ×
          </button>
          <LazyCoverImage
            class="song-detail__lightbox-cover"
            :src="song.heroImageUrl"
            :cache-key="song.heroImageCacheKey"
            :alt="`${song.displayTitle} cover`"
            :fallback-text="song.imageFallback"
            :eager="true"
            :animate-loading="false"
            @click.stop="handleCoverLightboxClick"
            @contextmenu.prevent
            @pointerdown="handleCoverLongPressStart"
            @pointermove="handleCoverLongPressMove"
            @pointerup="clearCoverLongPressTimer"
            @pointercancel="clearCoverLongPressTimer"
            @pointerleave="clearCoverLongPressTimer"
          />
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="song-detail-copy-toast">
        <div v-if="copyToastVisible" class="song-detail__copy-toast" role="status" aria-live="polite">
          {{ copyToastText }}
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.song-detail {
  --detail-safe-top: env(safe-area-inset-top, 0px);
  --detail-purple: #4b3b76;
  --detail-purple-active: #4b3c77;
  --detail-purple-soft: #e8e5f1;
  --detail-ink: #1d1741;
  --detail-muted: #4a4a4a;
  --detail-page-padding: clamp(14px, 4.73vw, 19px);
  --detail-cover-size: clamp(124px, 35.8vw, 144px);
  --detail-hero-gap: clamp(12px, 3.48vw, 14px);
  --detail-action-gap: clamp(4px, 1.49vw, 6px);
  --detail-skill-padding-x: clamp(12px, 3.73vw, 15px);
  --detail-card-gap-x: clamp(12px, 3.73vw, 15px);
  --detail-page-width: min(100%, 402px);
  --detail-hero-bg-width: 100%;
  --detail-hero-start: calc(var(--detail-safe-top) + 80px);
  --detail-purple-height: calc(var(--detail-hero-start) + var(--detail-cover-size));
  position: relative;
  min-height: 100vh;
  color: var(--detail-ink);
  background: #f4f1f8;
  overflow-x: clip;
}

.song-detail::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 0;
  width: var(--detail-hero-bg-width);
  height: var(--detail-purple-height);
  background: var(--detail-purple);
  transform: translateX(-50%);
}

.song-detail__topbar {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 30;
  width: 100%;
  background: var(--detail-purple);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.28),
    0 8px 18px rgba(39, 28, 78, 0.28);
}

.song-detail__topbar-inner {
  display: flex;
  gap: 14px;
  align-items: center;
  width: var(--detail-page-width);
  margin: 0 auto;
  padding: calc(var(--detail-safe-top) + 15px) 11px 15px;
  color: #ffffff;
}

.song-detail__back-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #ffffff;
  cursor: pointer;
}

.song-detail__back-button svg {
  width: 34px;
  height: 34px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: square;
  stroke-linejoin: miter;
  stroke-width: 3.2;
}

.song-detail__topbar h1 {
  display: flex;
  align-items: center;
  min-height: 40px;
  margin: 0;
  color: #ffffff;
  font-family: var(--font-figma-title);
  font-size: 22px;
  font-weight: 400;
  letter-spacing: 0.01em;
  line-height: 1;
}

.song-detail__content {
  position: relative;
  z-index: 1;
  display: grid;
  width: var(--detail-page-width);
  margin: 0 auto;
  padding: var(--detail-hero-start) var(--detail-page-padding) 26px;
}

.song-detail__hero {
  display: grid;
  grid-template-columns: var(--detail-cover-size) minmax(0, 1fr);
  gap: var(--detail-hero-gap);
  align-items: center;
  min-height: var(--detail-cover-size);
}

.song-detail__cover-wrap {
  position: relative;
  z-index: 2;
  display: block;
  width: var(--detail-cover-size);
  aspect-ratio: 1 / 1;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 10px;
  background: #d9d6de;
  box-shadow: 0 1px 7px #493784;
  cursor: pointer;
  transform: translateY(24px);
  transition:
    box-shadow 150ms ease,
    transform 150ms ease;
}

.song-detail__cover-wrap:active {
  box-shadow: 0 1px 5px #493784;
  transform: translateY(24px) scale(0.975);
}

.song-detail__cover-wrap:disabled {
  cursor: default;
}

.song-detail__cover {
  width: 100%;
  height: 100%;
}

.song-detail__cover :deep(img) {
  object-fit: cover;
}

.song-detail__identity {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 5px;
  min-width: 0;
  color: #ffffff;
}

.song-detail__identity h1,
.song-detail__artist {
  min-width: 0;
  margin: 0;
}

.song-detail__identity h1 {
  min-width: 0;
}

.song-detail__copy-text {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 1px 0 3px;
  overflow-x: auto;
  overflow-y: hidden;
  border: 0;
  border-radius: 6px;
  appearance: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  transition:
    background-color 120ms ease,
    opacity 120ms ease,
    transform 120ms ease;
}

.song-detail__copy-text::-webkit-scrollbar {
  display: none;
}

.song-detail__copy-text span {
  display: inline-block;
  min-width: max-content;
  padding-right: 12px;
  transform: translate3d(0, 0, 0);
  will-change: transform;
}

.song-detail__copy-text:active {
  background: rgba(255, 255, 255, 0.12);
  opacity: 0.78;
  transform: scale(0.985);
}

.song-detail__copy-text--title {
  margin: -1px 0 -3px;
  padding-bottom: 5px;
  font-family: var(--font-sans);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1.18;
}

.song-detail__copy-text--artist {
  margin: -1px 0 -3px;
  color: #ffffff;
  font-family: var(--font-figma-ui);
  font-size: 11px;
  letter-spacing: 0;
  line-height: 21px;
}

.song-detail__inline-logos {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 42px;
  overflow: hidden;
}

.song-detail__inline-logos img {
  width: min(115px, 49%);
  height: 41px;
  object-fit: contain;
  transform: rotate(-0.15deg);
}

.song-detail__action-row {
  position: relative;
  z-index: 3;
  display: flex;
  justify-content: flex-end;
  gap: var(--detail-action-gap);
  margin: 16px 0 17px;
  padding-right: 0;
}

.song-detail__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 57px;
  height: 37px;
  padding: 0;
  border: 0.947px solid #e5e5e5;
  border-radius: 12px;
  background: #fdfcff;
  cursor: default;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    opacity 140ms ease,
    transform 140ms ease;
}

.song-detail__icon-button--action {
  cursor: pointer;
}

.song-detail__icon-button--action:active {
  border-color: rgba(126, 73, 228, 0.38);
  box-shadow: 0 3px 9px rgba(75, 59, 118, 0.12);
  transform: scale(0.94);
}

.song-detail__icon-button:disabled {
  opacity: 0.45;
  cursor: default;
}

.song-detail__icon-button img {
  width: 27px;
  height: 27px;
  object-fit: contain;
}

.song-detail__facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 23px;
}

.song-detail__fact,
.song-detail__chart-section,
.song-detail__state {
  border: 0.8px solid #e5e5e5;
  border-radius: 10px;
  background: #fdfcff;
}

.song-detail__fact {
  display: grid;
  gap: 8px;
  min-height: 60px;
  padding: 7px 8px 6px;
}

.song-detail__fact span,
.song-detail__section-heading span {
  color: var(--detail-muted);
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 20px;
}

.song-detail__fact strong {
  align-self: end;
  color: #000000;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.song-detail__chart-section,
.song-detail__state {
  display: grid;
  gap: 13px;
  padding: 17px var(--detail-skill-padding-x) 20px;
}

.song-detail__section-heading {
  display: block;
}

.song-detail__instrument-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  min-height: 51px;
  padding: 5px;
  border-radius: 10px;
  background: var(--detail-purple-soft);
}

.song-detail__instrument-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #5c5370;
  cursor: pointer;
}

.song-detail__instrument-button span {
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 20px;
}

.song-detail__instrument-button--active {
  background: var(--detail-purple-active);
  color: #ffffff;
}

.song-detail__chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px var(--detail-card-gap-x);
}

.song-detail__chart-card {
  appearance: none;
  display: grid;
  gap: 8px;
  width: 100%;
  min-height: 142px;
  padding: 9px 13px 8px;
  border: 0;
  border-radius: 11.556px;
  color: #ffffff;
  text-align: left;
  cursor: pointer;
  transition:
    filter 140ms ease,
    opacity 140ms ease,
    transform 140ms ease;
}

.song-detail__chart-card:active:not(:disabled) {
  filter: brightness(0.96);
  transform: scale(0.975);
}

.song-detail__chart-card:disabled {
  cursor: default;
  opacity: 1;
}

.song-detail__chart-card--master {
  background: #8c49b5;
}

.song-detail__chart-card--extreme {
  background: #ac2a42;
}

.song-detail__chart-card--advanced {
  background: #c17006;
}

.song-detail__chart-card--basic {
  background: #4a86e0;
}

.song-detail__chart-card--missing {
  background: #8e8797;
}

.song-detail__chart-code {
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 300;
  letter-spacing: 0;
  line-height: 18px;
}

.song-detail__chart-card strong {
  font-family: var(--font-figma-ui);
  font-size: 24px;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 20px;
}

.song-detail__skill-strip,
.song-detail__score-state span,
.song-detail__score-state b {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 19px;
  padding: 0 5px;
  border-radius: 5.778px;
  background: rgba(255, 255, 255, 0.2);
  color: #dddddd;
  font-family: var(--font-sans);
  font-size: 11.556px;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 19px;
}

.song-detail__skill-strip {
  width: 100%;
}

.song-detail__skill-strip span,
.song-detail__skill-strip b {
  color: #dddddd;
  font-size: 11.556px;
  font-weight: 400;
  line-height: 19px;
}

.song-detail__score-state {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  margin-top: auto;
}

.song-detail__score-state b {
  justify-content: center;
  width: 19px;
  padding: 0;
}

.song-detail__state {
  color: var(--detail-ink);
}

.song-detail__state--error {
  color: #b3261e;
}

.song-detail__state p {
  margin: 0;
}

.song-detail__state button {
  width: fit-content;
  min-height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: var(--detail-purple);
  color: #ffffff;
  font-weight: 700;
}

.song-detail__lightbox {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(env(safe-area-inset-top, 0px) + 52px) 22px calc(env(safe-area-inset-bottom, 0px) + 52px);
  background: rgba(12, 9, 24, 0.82);
  backdrop-filter: blur(10px);
}

.song-detail__lightbox-close {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 14px);
  right: 16px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
  font-family: var(--font-sans);
  font-size: 30px;
  font-weight: 300;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    transform 140ms ease;
}

.song-detail__lightbox-close:active {
  background: rgba(255, 255, 255, 0.24);
  transform: scale(0.94);
}

.song-detail__lightbox-cover {
  width: min(86vw, 340px);
  max-width: 100%;
  max-height: min(72vh, 520px);
  aspect-ratio: 1 / 1;
  border-radius: 16px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.4);
  user-select: none;
  -webkit-user-drag: none;
  touch-action: manipulation;
}

.song-detail__lightbox-cover :deep(img) {
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

.song-detail-lightbox-enter-active,
.song-detail-lightbox-leave-active {
  transition: opacity 180ms ease;
}

.song-detail-lightbox-enter-active .song-detail__lightbox-cover,
.song-detail-lightbox-leave-active .song-detail__lightbox-cover {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.song-detail-lightbox-enter-from,
.song-detail-lightbox-leave-to {
  opacity: 0;
}

.song-detail-lightbox-enter-from .song-detail__lightbox-cover,
.song-detail-lightbox-leave-to .song-detail__lightbox-cover {
  opacity: 0;
  transform: scale(0.92);
}

.song-detail__copy-toast {
  position: fixed;
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 34px);
  z-index: 140;
  padding: 8px 15px;
  border-radius: 999px;
  background: rgba(29, 23, 65, 0.9);
  color: #ffffff;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 18px;
  pointer-events: none;
  transform: translateX(-50%);
  box-shadow: 0 8px 22px rgba(29, 23, 65, 0.24);
}

.song-detail-copy-toast-enter-active,
.song-detail-copy-toast-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.song-detail-copy-toast-enter-from,
.song-detail-copy-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}

@media (max-width: 360px) {
  .song-detail__hero {
    grid-template-columns: 124px minmax(0, 1fr);
  }

  .song-detail__cover-wrap {
    width: 124px;
  }

  .song-detail__copy-text--title {
    font-size: 18px;
  }

  .song-detail__action-row {
    gap: 4px;
  }
}
</style>
