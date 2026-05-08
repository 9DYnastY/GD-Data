<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DtxChartCanvas from '../components/DtxChartCanvas.vue'
import menuIconSrc from '../assets/chart-preview/note-menu.png'
import pauseIconSrc from '../assets/chart-preview/note-pause.png'
import playIconSrc from '../assets/chart-preview/note-play.png'
import {
  getAvailableDtxInstruments,
  getAvailableDtxLevels,
  hasDtxChartSet,
} from '../lib/chart-preview-manifest'
import { loadDtxChartPreview } from '../lib/chart-preview-loader'
import { loadSongByMusicId } from '../lib/song-catalog'
import type { DtxChartMode, LoadedDtxChartPreview } from '../lib/chart-preview-types'
import type { InstrumentKey, LevelKey, SongViewModel } from '../types/song'

interface InstrumentOption {
  key: InstrumentKey
  label: string
}

interface LevelOption {
  key: LevelKey
  label: string
  difficultyText: string
}

interface ChartModeOption {
  key: Exclude<DtxChartMode, 'Full'>
  label: string
}

const route = useRoute()
const router = useRouter()

const song = ref<SongViewModel | null>(null)
const preview = ref<LoadedDtxChartPreview | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const selectedInstrumentKey = ref<InstrumentKey>('drum')
const selectedLevelKey = ref<LevelKey>('master')
const selectedSpeed = ref(4)
const selectedChartMode = ref<DtxChartMode>('XG/Gitadora')
const viewerRef = ref<HTMLElement | null>(null)
const progressShellRef = ref<HTMLElement | null>(null)
const viewerWidth = ref(0)
const settingsPanelOpen = ref(false)
const playing = ref(false)
const playbackProgress = ref(0)
let viewerResizeObserver: ResizeObserver | null = null
let loadSequence = 0
let playbackFrame = 0
let playbackStartedAt = 0
let playbackStartedProgress = 0
let activeProgressPointerId: number | null = null
let pendingInitialProgress = 0
let hasPendingInitialProgress = false

const INSTRUMENT_LABELS: Record<InstrumentKey, string> = {
  drum: 'Drum',
  guitar: 'Guitar',
  bass: 'Bass',
}

const LEVEL_LABELS: Record<LevelKey, string> = {
  basic: 'BAS',
  advanced: 'ADV',
  extreme: 'EXT',
  master: 'MAS',
}

const LEVEL_ORDER: LevelKey[] = ['basic', 'advanced', 'extreme', 'master']
const LEVEL_ORDER_DESC: LevelKey[] = ['master', 'extreme', 'advanced', 'basic']
const INSTRUMENT_ORDER: InstrumentKey[] = ['drum', 'guitar', 'bass']
const CHART_MODE_OPTIONS: ChartModeOption[] = [
  { key: 'XG/Gitadora', label: 'Gitadora' },
  { key: 'Classic', label: 'Classic' },
]
const SPEED_MIN = 1
const SPEED_MAX = 9.5
const SPEED_STEP = 0.5
const DEFAULT_SPEED = 4
const PROGRESS_RANGE_MAX = 1000
const PROGRESS_EDGE_INSET_PX = 20

const instrumentOptions = computed<InstrumentOption[]>(() => {
  const musicId = getRouteMusicId()
  const availableInstruments = musicId ? getAvailableDtxInstruments(musicId) : []

  return INSTRUMENT_ORDER
    .filter((instrument) => availableInstruments.includes(instrument))
    .map((instrument) => ({
      key: instrument,
      label: INSTRUMENT_LABELS[instrument],
    }))
})

const levelOptions = computed<LevelOption[]>(() => {
  const musicId = getRouteMusicId()
  const levels = musicId ? getAvailableDtxLevels(musicId, selectedInstrumentKey.value) : []
  const songLevels = song.value?.instruments.find((instrument) => {
    return instrument.key === selectedInstrumentKey.value
  })?.levels ?? []

  return LEVEL_ORDER
    .filter((level) => levels.includes(level) && isSongLevelAvailable(selectedInstrumentKey.value, level))
    .map((level) => {
      const songLevel = songLevels.find((candidate) => candidate.level === level)

      return {
        key: level,
        label: LEVEL_LABELS[level],
        difficultyText: songLevel?.difficultyText ?? '-.-',
      }
    })
})

const fitZoom = computed(() => {
  const firstCanvas = preview.value?.canvasData[0]

  if (!firstCanvas || viewerWidth.value <= 0 || firstCanvas.canvasSize.width <= 0) {
    return 1
  }

  return Number((viewerWidth.value / firstCanvas.canvasSize.width).toFixed(4))
})

const progressRangeValue = computed(() => Math.round(playbackProgress.value * PROGRESS_RANGE_MAX))
const progressThumbLeft = computed(() => {
  return `calc(${PROGRESS_EDGE_INSET_PX}px + (100% - ${PROGRESS_EDGE_INSET_PX * 2}px) * ${playbackProgress.value})`
})
const totalTimeLabel = computed(() => formatTime(preview.value?.dtxJson.songInfo.songDuration ?? 0))
const currentTimeLabel = computed(() => {
  const duration = preview.value?.dtxJson.songInfo.songDuration ?? 0
  return formatTime(duration * playbackProgress.value)
})
const canDecreaseSpeed = computed(() => selectedSpeed.value > SPEED_MIN)
const canIncreaseSpeed = computed(() => selectedSpeed.value < SPEED_MAX)

function getFirstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

function getRouteMusicId() {
  const musicId = Number(route.params.musicId)
  return Number.isFinite(musicId) ? musicId : null
}

function isInstrumentKey(value: unknown): value is InstrumentKey {
  return value === 'drum' || value === 'guitar' || value === 'bass'
}

function isLevelKey(value: unknown): value is LevelKey {
  return value === 'basic' || value === 'advanced' || value === 'extreme' || value === 'master'
}

function isDtxChartMode(value: unknown): value is DtxChartMode {
  return value === 'XG/Gitadora' || value === 'Classic'
}

function resolveRouteMdbVersion() {
  const rawVersion = getFirstQueryValue(route.query.version)
  const parsedVersion = rawVersion ? Number(rawVersion) : null
  return parsedVersion && Number.isFinite(parsedVersion) ? parsedVersion : null
}

function normalizeGameSpeed(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SPEED
  }

  const roundedValue = Math.round(value / SPEED_STEP) * SPEED_STEP
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, Number(roundedValue.toFixed(1))))
}

function mapLegacyRenderScaleToGameSpeed(scale: number) {
  return normalizeGameSpeed(scale * 2 + 0.5)
}

function mapGameSpeedToRenderScale(speed: number) {
  return Math.max(0.25, speed * 0.5 - 0.25)
}

function resolveRouteSpeed() {
  const rawSpeed = getFirstQueryValue(route.query.speed)
  const rawLegacyScale = getFirstQueryValue(route.query.scale)

  if (rawSpeed) {
    return normalizeGameSpeed(Number(rawSpeed))
  }

  if (rawLegacyScale) {
    return mapLegacyRenderScaleToGameSpeed(Number(rawLegacyScale))
  }

  return DEFAULT_SPEED
}

function resolveRouteChartMode() {
  const rawChartMode = getFirstQueryValue(route.query.chartMode)

  if (isDtxChartMode(rawChartMode)) {
    return rawChartMode
  }

  const normalizedMode = typeof rawChartMode === 'string'
    ? rawChartMode.toLowerCase()
    : ''

  if (normalizedMode === 'xg' || normalizedMode === 'gitadora' || normalizedMode === 'xg/gitadora') {
    return 'XG/Gitadora'
  }

  if (normalizedMode === 'classic') {
    return 'Classic'
  }

  return 'XG/Gitadora'
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function isSongLevelAvailable(instrumentKey: InstrumentKey, levelKey: LevelKey) {
  const instrument = song.value?.instruments.find((candidate) => candidate.key === instrumentKey)
  const level = instrument?.levels.find((candidate) => candidate.level === levelKey)
  return level?.available ?? true
}

function chooseFallbackInstrument(currentSong: SongViewModel, musicId: number) {
  const requestedInstrument = getFirstQueryValue(route.query.instrument)
  const availableInstruments = getAvailableDtxInstruments(musicId)
  const songInstruments = currentSong.instruments.map((instrument) => instrument.key)

  if (
    isInstrumentKey(requestedInstrument)
    && availableInstruments.includes(requestedInstrument)
    && songInstruments.includes(requestedInstrument)
  ) {
    return requestedInstrument
  }

  return INSTRUMENT_ORDER.find((instrument) => {
    return availableInstruments.includes(instrument) && songInstruments.includes(instrument)
  }) ?? availableInstruments[0] ?? 'drum'
}

function chooseFallbackLevel(musicId: number, instrumentKey: InstrumentKey) {
  const requestedLevel = getFirstQueryValue(route.query.level)
  const availableLevels = getAvailableDtxLevels(musicId, instrumentKey)

  if (
    isLevelKey(requestedLevel)
    && availableLevels.includes(requestedLevel)
    && isSongLevelAvailable(instrumentKey, requestedLevel)
  ) {
    return requestedLevel
  }

  return LEVEL_ORDER_DESC.find((level) => {
    return availableLevels.includes(level) && isSongLevelAvailable(instrumentKey, level)
  }) ?? availableLevels[availableLevels.length - 1] ?? 'master'
}

async function normalizeRouteSelection(musicId: number, currentSong: SongViewModel) {
  const instrument = chooseFallbackInstrument(currentSong, musicId)
  const level = chooseFallbackLevel(musicId, instrument)
  const routeInstrument = getFirstQueryValue(route.query.instrument)
  const routeLevel = getFirstQueryValue(route.query.level)

  if (routeInstrument !== instrument || routeLevel !== level) {
    await router.replace({
      name: 'song-chart',
      params: { musicId },
      query: {
        ...route.query,
        instrument,
        level,
      },
    })
    return null
  }

  return { instrument, level }
}

async function loadCurrentChart() {
  const currentSequence = ++loadSequence
  const musicId = getRouteMusicId()
  const previousPreview = preview.value
  const previousInstrument = selectedInstrumentKey.value
  const previousLevel = selectedLevelKey.value
  const previousProgress = playbackProgress.value

  stopPlayback()
  loading.value = true
  errorMessage.value = ''
  preview.value = null

  if (!musicId) {
    errorMessage.value = '歌曲 ID 无效'
    loading.value = false
    return
  }

  try {
    const currentSong = await loadSongByMusicId(musicId, { mdbVersion: resolveRouteMdbVersion() })

    if (currentSequence !== loadSequence) {
      return
    }

    if (!currentSong) {
      throw new Error(`没有找到 Music ID ${musicId}`)
    }

    song.value = currentSong

    if (!hasDtxChartSet(musicId)) {
      throw new Error('暂未收录这首歌的谱面预览')
    }

    const selection = await normalizeRouteSelection(musicId, currentSong)

    if (!selection || currentSequence !== loadSequence) {
      return
    }

    selectedInstrumentKey.value = selection.instrument
    selectedLevelKey.value = selection.level
    selectedSpeed.value = resolveRouteSpeed()
    selectedChartMode.value = resolveRouteChartMode()
    pendingInitialProgress = previousPreview?.chart.musicId === musicId
      && previousInstrument === selection.instrument
      && previousLevel === selection.level
      ? previousProgress
      : 0
    hasPendingInitialProgress = true
    preview.value = await loadDtxChartPreview(
      musicId,
      selection.instrument,
      selection.level,
      mapGameSpeedToRenderScale(selectedSpeed.value),
      selectedChartMode.value,
    )
  } catch (error) {
    if (currentSequence !== loadSequence) {
      return
    }

    errorMessage.value = error instanceof Error ? error.message : '谱面预览加载失败'
  } finally {
    if (currentSequence === loadSequence) {
      loading.value = false
    }
  }
}

async function goBack() {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back()
    return
  }

  const musicId = getRouteMusicId()

  if (musicId) {
    await router.replace({
      name: 'song-detail',
      params: { musicId },
      query: route.query.version ? { version: route.query.version } : undefined,
    })
    return
  }

  await router.replace({ name: 'home' })
}

function updateSelection(instrument: InstrumentKey, level = selectedLevelKey.value) {
  const musicId = getRouteMusicId()

  if (!musicId) {
    return
  }

  const availableLevels = getAvailableDtxLevels(musicId, instrument)
  const nextLevel = availableLevels.includes(level) && isSongLevelAvailable(instrument, level)
    ? level
    : chooseFallbackLevel(musicId, instrument)

  void router.replace({
    name: 'song-chart',
    params: { musicId },
    query: {
      ...route.query,
      instrument,
      level: nextLevel,
    },
  })
}

function updateSpeed(speed: number) {
  const musicId = getRouteMusicId()
  const normalizedSpeed = normalizeGameSpeed(speed)

  if (!musicId || normalizedSpeed === selectedSpeed.value) {
    return
  }

  selectedSpeed.value = normalizedSpeed
  const nextQuery = {
    ...route.query,
    speed: normalizedSpeed.toFixed(1),
  }
  Reflect.deleteProperty(nextQuery, 'scale')

  void router.replace({
    name: 'song-chart',
    params: { musicId },
    query: nextQuery,
  })
}

function adjustSpeed(delta: number) {
  updateSpeed(selectedSpeed.value + delta)
}

function updateChartMode(chartMode: DtxChartMode) {
  const musicId = getRouteMusicId()

  if (!musicId || chartMode === selectedChartMode.value) {
    return
  }

  selectedChartMode.value = chartMode
  void router.replace({
    name: 'song-chart',
    params: { musicId },
    query: {
      ...route.query,
      chartMode,
    },
  })
}

function getInstrumentButtonClass(instrument: InstrumentOption) {
  return {
    'chart-preview__panel-button--active': instrument.key === selectedInstrumentKey.value,
  }
}

function getLevelButtonClass(level: LevelOption) {
  return {
    'chart-preview__panel-button--active': level.key === selectedLevelKey.value,
  }
}

function getChartModeButtonClass(chartMode: DtxChartMode) {
  return {
    'chart-preview__panel-button--active': chartMode === selectedChartMode.value,
  }
}

function getViewerMaxScroll() {
  const viewer = viewerRef.value
  return viewer ? Math.max(0, viewer.scrollHeight - viewer.clientHeight) : 0
}

function setViewerProgress(progress: number) {
  const viewer = viewerRef.value
  const maxScroll = getViewerMaxScroll()
  const nextProgress = Math.min(1, Math.max(0, progress))

  playbackProgress.value = nextProgress

  if (!viewer) {
    return
  }

  const nextScrollTop = selectedInstrumentKey.value === 'drum'
    ? maxScroll - maxScroll * nextProgress
    : maxScroll * nextProgress

  viewer.scrollTop = nextScrollTop
}

function syncPlaybackProgressFromScroll() {
  const viewer = viewerRef.value
  const maxScroll = getViewerMaxScroll()

  if (!viewer || maxScroll <= 0) {
    playbackProgress.value = 0
    return
  }

  playbackProgress.value = selectedInstrumentKey.value === 'drum'
    ? Math.min(1, Math.max(0, (maxScroll - viewer.scrollTop) / maxScroll))
    : Math.min(1, Math.max(0, viewer.scrollTop / maxScroll))
}

function handleViewerScroll() {
  const viewer = viewerRef.value

  if (!viewer) {
    return
  }

  if (playing.value || activeProgressPointerId !== null) {
    return
  }

  syncPlaybackProgressFromScroll()
}

function setProgressFromClientX(clientX: number) {
  const shell = progressShellRef.value

  if (!shell) {
    return
  }

  const rect = shell.getBoundingClientRect()
  const startX = PROGRESS_EDGE_INSET_PX
  const endX = Math.max(startX, rect.width - PROGRESS_EDGE_INSET_PX)
  const localX = Math.min(endX, Math.max(startX, clientX - rect.left))
  const rangeWidth = Math.max(1, endX - startX)
  setViewerProgress((localX - startX) / rangeWidth)
}

function handleProgressPointerDown(event: PointerEvent) {
  event.preventDefault()
  activeProgressPointerId = event.pointerId
  progressShellRef.value?.setPointerCapture(event.pointerId)
  setProgressFromClientX(event.clientX)
}

function handleProgressPointerMove(event: PointerEvent) {
  if (activeProgressPointerId !== event.pointerId) {
    return
  }

  setProgressFromClientX(event.clientX)
}

function finishProgressPointer(event: PointerEvent) {
  if (activeProgressPointerId !== event.pointerId) {
    return
  }

  progressShellRef.value?.releasePointerCapture(event.pointerId)
  activeProgressPointerId = null
}

function handleProgressKeydown(event: KeyboardEvent) {
  if (event.key === 'Home') {
    event.preventDefault()
    setViewerProgress(0)
    return
  }

  if (event.key === 'End') {
    event.preventDefault()
    setViewerProgress(1)
    return
  }

  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return
  }

  event.preventDefault()
  const direction = event.key === 'ArrowRight' ? 1 : -1
  const step = event.shiftKey ? 0.1 : 0.02
  setViewerProgress(playbackProgress.value + direction * step)
}

function syncViewerWidth() {
  const viewer = viewerRef.value
  viewerWidth.value = viewer?.clientWidth ?? 0
}

function observeViewerElement(element: HTMLElement | null) {
  viewerResizeObserver?.disconnect()
  viewerResizeObserver = null

  if (typeof ResizeObserver !== 'undefined' && element) {
    viewerResizeObserver = new ResizeObserver(() => {
      syncViewerWidth()
      if (playing.value) {
        setViewerProgress(playbackProgress.value)
      } else {
        syncPlaybackProgressFromScroll()
      }
    })
    viewerResizeObserver.observe(element)
  }

  syncViewerWidth()
}

async function syncInitialScrollPosition() {
  await nextTick()
  window.requestAnimationFrame(() => {
    const nextProgress = hasPendingInitialProgress ? pendingInitialProgress : playbackProgress.value
    pendingInitialProgress = 0
    hasPendingInitialProgress = false
    setViewerProgress(nextProgress)
  })
}

function stopPlayback() {
  playing.value = false
  playbackStartedAt = 0
  playbackStartedProgress = 0
  if (playbackFrame) {
    window.cancelAnimationFrame(playbackFrame)
    playbackFrame = 0
  }
}

function runPlayback(timestamp: number) {
  if (!playing.value) {
    return
  }

  const duration = preview.value?.dtxJson.songInfo.songDuration ?? 0

  if (!viewerRef.value || getViewerMaxScroll() <= 0 || duration <= 0) {
    stopPlayback()
    return
  }

  if (!playbackStartedAt) {
    playbackStartedAt = timestamp
    playbackStartedProgress = playbackProgress.value
  }

  const elapsedSeconds = Math.max(0, (timestamp - playbackStartedAt) / 1000)
  const nextProgress = Math.min(1, playbackStartedProgress + elapsedSeconds / duration)
  setViewerProgress(nextProgress)

  if (nextProgress >= 1) {
    setViewerProgress(1)
    stopPlayback()
    return
  }

  playbackFrame = window.requestAnimationFrame(runPlayback)
}

function togglePlayback() {
  if (playing.value) {
    stopPlayback()
    return
  }

  if (playbackProgress.value >= 0.999) {
    setViewerProgress(0)
  }

  settingsPanelOpen.value = false
  playing.value = true
  playbackStartedAt = 0
  playbackStartedProgress = playbackProgress.value
  playbackFrame = window.requestAnimationFrame(runPlayback)
}

function closeSettingsPanel() {
  settingsPanelOpen.value = false
}

watch(
  () => [
    route.params.musicId,
    route.query.instrument,
    route.query.level,
    route.query.version,
    route.query.speed,
    route.query.scale,
    route.query.chartMode,
  ],
  () => {
    void loadCurrentChart()
  },
  { immediate: true },
)

watch(
  () => [preview.value, fitZoom.value, selectedInstrumentKey.value] as const,
  () => {
    void syncInitialScrollPosition()
  },
  { flush: 'post' },
)

watch(
  viewerRef,
  (element) => {
    observeViewerElement(element)
  },
  { flush: 'post' },
)

onMounted(() => {
  syncViewerWidth()
})

onBeforeUnmount(() => {
  stopPlayback()
  viewerResizeObserver?.disconnect()
  viewerResizeObserver = null
})
</script>

<template>
  <section class="chart-preview">
    <header class="chart-preview__topbar">
      <div class="chart-preview__topbar-inner">
        <button class="chart-preview__back-button" type="button" aria-label="返回上一页" @click="goBack">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M24.5 9.5L14 20L24.5 30.5"></path>
            <path d="M15 20H34"></path>
          </svg>
        </button>
        <h1>{{ song?.displayTitle ?? '谱面预览' }}</h1>
      </div>
    </header>

    <main class="chart-preview__content">
      <section v-if="loading" class="chart-preview__state">
        谱面加载中...
      </section>

      <section v-else-if="errorMessage" class="chart-preview__state chart-preview__state--error">
        <p>{{ errorMessage }}</p>
        <button type="button" @click="goBack">返回详情</button>
      </section>

      <section
        v-else-if="preview"
        ref="viewerRef"
        class="chart-preview__viewer"
        aria-label="谱面画布"
        @scroll="handleViewerScroll"
      >
        <div class="chart-preview__viewer-inner">
          <DtxChartCanvas
            v-for="(canvasData, index) in preview.canvasData"
            :key="`${preview.chart.url}-${index}`"
            :canvas-data="canvasData"
            :zoom="fitZoom"
          />
        </div>
      </section>
    </main>

    <Transition name="chart-preview-scrim">
      <button
        v-if="settingsPanelOpen"
        class="chart-preview__panel-scrim"
        type="button"
        aria-label="关闭谱面设置"
        @click="closeSettingsPanel"
      ></button>
    </Transition>

    <Transition name="chart-preview-panel">
      <section v-if="settingsPanelOpen" class="chart-preview__settings-panel" aria-label="谱面设置">
        <div class="chart-preview__panel-section">
          <!-- <span>Instrument</span> -->
          <div class="chart-preview__panel-grid chart-preview__panel-grid--three">
            <button
              v-for="instrument in instrumentOptions"
              :key="instrument.key"
              class="chart-preview__panel-button"
              :class="getInstrumentButtonClass(instrument)"
              type="button"
              @click="updateSelection(instrument.key)"
            >
              {{ instrument.label }}
            </button>
          </div>
        </div>

        <div class="chart-preview__panel-section">
          <span>难度</span>
          <div class="chart-preview__panel-grid chart-preview__panel-grid--four">
            <button
              v-for="level in levelOptions"
              :key="level.key"
              class="chart-preview__panel-button"
              :class="getLevelButtonClass(level)"
              type="button"
              @click="updateSelection(selectedInstrumentKey, level.key)"
            >
              <span>{{ level.label }}</span>
              <small>{{ level.difficultyText }}</small>
            </button>
          </div>
        </div>

        <div class="chart-preview__panel-section">
          <span>流速</span>
          <div class="chart-preview__speed-stepper">
            <button
              class="chart-preview__speed-button"
              type="button"
              :disabled="!canDecreaseSpeed"
              aria-label="降低流速"
              @click="adjustSpeed(-SPEED_STEP)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5L8 12L15 19"></path>
              </svg>
            </button>
            <div class="chart-preview__speed-value" aria-live="polite">
              {{ selectedSpeed.toFixed(1) }}
            </div>
            <button
              class="chart-preview__speed-button"
              type="button"
              :disabled="!canIncreaseSpeed"
              aria-label="提高流速"
              @click="adjustSpeed(SPEED_STEP)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 5L16 12L9 19"></path>
              </svg>
            </button>
          </div>
        </div>

        <div class="chart-preview__panel-section">
          <span>模式</span>
          <div class="chart-preview__panel-grid chart-preview__panel-grid--two">
            <button
              v-for="chartMode in CHART_MODE_OPTIONS"
              :key="chartMode.key"
              class="chart-preview__panel-button"
              :class="getChartModeButtonClass(chartMode.key)"
              type="button"
              @click="updateChartMode(chartMode.key)"
            >
              {{ chartMode.label }}
            </button>
          </div>
        </div>
      </section>
    </Transition>

    <footer class="chart-preview__player" aria-label="谱面播放控制">
      <div
        ref="progressShellRef"
        class="chart-preview__progress-shell"
        role="slider"
        tabindex="0"
        aria-label="播放进度"
        aria-valuemin="0"
        :aria-valuemax="PROGRESS_RANGE_MAX"
        :aria-valuenow="progressRangeValue"
        @keydown="handleProgressKeydown"
        @pointercancel="finishProgressPointer"
        @pointerdown="handleProgressPointerDown"
        @pointermove="handleProgressPointerMove"
        @pointerup="finishProgressPointer"
      >
        <span class="chart-preview__progress-track" aria-hidden="true"></span>
        <span
          class="chart-preview__progress-thumb"
          :style="{ left: progressThumbLeft }"
          aria-hidden="true"
        ></span>
      </div>

      <div class="chart-preview__player-inner">
        <span class="chart-preview__time">{{ currentTimeLabel }} / {{ totalTimeLabel }}</span>
        <button
          class="chart-preview__play-button"
          type="button"
          :aria-label="playing ? '暂停自动滚动' : '播放自动滚动'"
          @click="togglePlayback"
        >
          <img :src="playing ? pauseIconSrc : playIconSrc" alt="" aria-hidden="true" />
        </button>
        <button
          class="chart-preview__menu-button"
          type="button"
          :aria-expanded="settingsPanelOpen"
          aria-label="打开谱面设置"
          @click="settingsPanelOpen = !settingsPanelOpen"
        >
          <img :src="menuIconSrc" alt="" aria-hidden="true" />
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.chart-preview {
  --note-safe-top: env(safe-area-inset-top, 0px);
  --note-safe-bottom: env(safe-area-inset-bottom, 0px);
  --note-purple: #4b3b76;
  --note-page-width: min(100%, 402px);
  --note-topbar-height: calc(var(--note-safe-top) + 70px);
  --note-player-height: calc(var(--note-safe-bottom) + 80px);
  --note-player-back-top: 8px;
  --note-player-panel-bottom: calc(var(--note-player-height) - var(--note-player-back-top));
  --note-player-cover-overlap: 30px;
  position: relative;
  height: 100vh;
  overflow: hidden;
  color: #1d1741;
  background: #f4f1f8;
}

.chart-preview__topbar {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 30;
  width: 100%;
  background: var(--note-purple);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.28),
    0 8px 18px rgba(39, 28, 78, 0.28);
}

.chart-preview__topbar-inner {
  display: flex;
  gap: 14px;
  align-items: center;
  width: var(--note-page-width);
  margin: 0 auto;
  padding: calc(var(--note-safe-top) + 15px) 11px 15px;
  color: #ffffff;
}

.chart-preview__back-button {
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

.chart-preview__back-button svg {
  width: 34px;
  height: 34px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: square;
  stroke-linejoin: miter;
  stroke-width: 3.2;
}

.chart-preview__topbar h1 {
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 40px;
  margin: 0;
  overflow: hidden;
  color: #ffffff;
  font-family: var(--font-figma-title);
  font-size: 22px;
  font-weight: 400;
  letter-spacing: 0.01em;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-preview__content {
  width: var(--note-page-width);
  height: calc(
    100vh - var(--note-topbar-height) - var(--note-player-panel-bottom) +
    var(--note-player-cover-overlap)
  );
  margin: var(--note-topbar-height) auto 0;
  padding: 19px 20px 0;
}

.chart-preview__viewer {
  width: 100%;
  height: 100%;
  overflow: auto;
  border-radius: 11px;
  background: #000000;
  scrollbar-width: none;
}

.chart-preview__viewer::-webkit-scrollbar {
  display: none;
}

.chart-preview__viewer-inner {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100%;
  line-height: 0;
}

.chart-preview__state {
  display: grid;
  height: 100%;
  place-items: center;
  padding: 28px;
  color: #4a4a4a;
  text-align: center;
}

.chart-preview__state--error {
  align-content: center;
  gap: 12px;
  color: #7a2440;
}

.chart-preview__state p {
  margin: 0;
}

.chart-preview__state button {
  width: auto;
  min-height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: 5px;
  background: var(--note-purple);
  color: #ffffff;
}

.chart-preview__player {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 35;
  width: var(--note-page-width);
  height: var(--note-player-height);
  margin: 0 auto;
  background: transparent;
}

.chart-preview__player::before {
  content: '';
  position: absolute;
  top: var(--note-player-back-top);
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
  background: #d9d0f2;
}

.chart-preview__player-inner {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr 72px 1fr;
  align-items: center;
  height: calc(100% - var(--note-player-back-top));
  margin-top: var(--note-player-back-top);
  padding: 0 25px var(--note-safe-bottom);
}

.chart-preview__time {
  color: #27213d;
  font-family: var(--font-figma-title);
  font-size: 14px;
  font-weight: 400;
}

.chart-preview__play-button,
.chart-preview__menu-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--note-purple);
  cursor: pointer;
}

.chart-preview__play-button {
  justify-self: center;
  width: 52px;
  height: 52px;
}

.chart-preview__menu-button {
  justify-self: end;
  width: 52px;
  height: 52px;
}

.chart-preview__play-button img {
  width: 30px;
  height: 30px;
  object-fit: contain;
}

.chart-preview__menu-button img {
  width: 30px;
  height: 30px;
  object-fit: contain;
}

.chart-preview__progress-shell {
  position: absolute;
  top: calc(var(--note-player-back-top) - 16.5px);
  left: 0;
  z-index: 2;
  width: 100%;
  height: 33px;
  cursor: pointer;
  outline: none;
  touch-action: none;
}

.chart-preview__progress-track {
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  height: 14px;
  background: var(--note-purple);
  transform: translateY(-50%);
}

.chart-preview__progress-thumb {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 33px;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 2px 5px rgba(55, 43, 89, 0.32);
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.chart-preview__progress-shell:focus-visible .chart-preview__progress-thumb {
  box-shadow:
    0 2px 5px rgba(55, 43, 89, 0.32),
    0 0 0 3px rgba(255, 255, 255, 0.62);
}

.chart-preview__panel-scrim {
  position: fixed;
  top: var(--note-topbar-height);
  right: 0;
  bottom: var(--note-player-panel-bottom);
  left: 0;
  z-index: 33;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: default;
}

.chart-preview__settings-panel {
  position: fixed;
  right: 0;
  bottom: var(--note-player-panel-bottom);
  left: 0;
  z-index: 34;
  display: grid;
  gap: 14px;
  width: var(--note-page-width);
  margin: 0 auto;
  padding: 18px 20px 20px;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  background: #e8e1f6;
  box-shadow: 0 -14px 30px rgba(55, 43, 89, 0.22);
}

.chart-preview__panel-section {
  display: grid;
  gap: 8px;
}

.chart-preview__panel-section > span {
  color: var(--note-purple);
  font-family: var(--font-figma-title);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.chart-preview__panel-grid {
  display: grid;
  gap: 7px;
}

.chart-preview__panel-grid--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.chart-preview__panel-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.chart-preview__panel-grid--four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.chart-preview__panel-button {
  display: grid;
  gap: 2px;
  align-content: center;
  min-height: 44px;
  padding: 0 8px;
  border: 1px solid rgba(75, 59, 118, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.58);
  color: var(--note-purple);
  font-family: var(--font-figma-title);
  font-size: 12px;
  font-weight: 700;
}

.chart-preview__panel-button small {
  color: currentColor;
  font-size: 11px;
  font-weight: 400;
  line-height: 1;
  opacity: 0.78;
}

.chart-preview__panel-button--active {
  border-color: rgba(75, 59, 118, 0.44);
  background: var(--note-purple);
  color: #ffffff;
}

.chart-preview__speed-stepper {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: stretch;
  min-height: 44px;
  overflow: hidden;
  border: 1px solid rgba(75, 59, 118, 0.24);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.58);
}

.chart-preview__speed-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--note-purple);
}

.chart-preview__speed-button svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.5;
}

.chart-preview__speed-button:disabled {
  opacity: 0.3;
}

.chart-preview__speed-value {
  display: grid;
  place-items: center;
  min-width: 0;
  border-right: 1px solid rgba(75, 59, 118, 0.14);
  border-left: 1px solid rgba(75, 59, 118, 0.14);
  color: var(--note-purple);
  font-family: var(--font-figma-title);
  font-size: 15px;
  font-weight: 700;
}

.chart-preview-scrim-enter-active,
.chart-preview-scrim-leave-active {
  transition: opacity 180ms ease;
}

.chart-preview-scrim-enter-from,
.chart-preview-scrim-leave-to {
  opacity: 0;
}

.chart-preview-panel-enter-active,
.chart-preview-panel-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.chart-preview-panel-enter-from,
.chart-preview-panel-leave-to {
  opacity: 0;
  transform: translateY(18px);
}
</style>
