<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DtxRealtimeCanvas from '../components/DtxRealtimeCanvas.vue'
import menuIconSrc from '../assets/chart-preview/note-menu.png'
import pauseIconSrc from '../assets/chart-preview/note-pause.png'
import playIconSrc from '../assets/chart-preview/note-play.png'
import {
  getAvailableDtxInstruments,
  getAvailableDtxLevels,
  hasLoadedDtxChartSet,
  loadDtxChartManifest,
} from '../lib/chart-preview-manifest'
import { loadDtxChartPreview } from '../lib/chart-preview-loader'
import { loadSongByMusicId } from '../lib/song-catalog'
import { useDebugMode } from '../lib/debug-mode'
import { REALTIME_BASE_PIXELS_PER_SECOND } from '../lib/chart-preview-realtime-renderer'
import { getFullBodyFrameWidth } from '../lib/chart-preview-positioner'
import type { DtxChartMode, LoadedDtxChartPreview } from '../lib/chart-preview-types'
import type { DtxChartManifest } from '../lib/chart-preview-manifest'
import type { InstrumentKey, LevelKey, SongViewModel } from '../types/song'

interface InstrumentOption {
  key: InstrumentKey
  label: string
  available: boolean
}

interface LevelOption {
  key: LevelKey
  label: string
  difficultyText: string
  available: boolean
}

interface ChartModeOption {
  key: Exclude<DtxChartMode, 'Full'>
  label: string
}

const route = useRoute()
const router = useRouter()
const debugModeEnabled = useDebugMode()

const song = ref<SongViewModel | null>(null)
const chartManifest = ref<DtxChartManifest | null>(null)
const preview = ref<LoadedDtxChartPreview | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const selectedInstrumentKey = ref<InstrumentKey>('drum')
const selectedLevelKey = ref<LevelKey>('master')
const selectedSpeed = ref(4)
const selectedChartMode = ref<DtxChartMode>('XG/Gitadora')
const reverseEnabled = ref(false)
const viewerShellRef = ref<HTMLElement | null>(null)
const progressShellRef = ref<HTMLElement | null>(null)
const settingsPanelOpen = ref(false)
const playing = ref(false)
const playbackProgress = ref(0)
const rafAverageIntervalMs = ref(0)
const rafLastIntervalMs = ref(0)
let loadSequence = 0
let playbackFrame = 0
let playbackStartedAt = 0
let playbackStartedProgress = 0
let rafDebugFrame = 0
let rafDebugLastTimestamp = 0
let rafDebugAverageInterval = 0
let activeProgressPointerId: number | null = null
let activeChartPointerId: number | null = null
let chartDragStartProgress = 0
let chartDragStartY = 0

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
const CHART_PREVIEW_SPEED_STORAGE_KEY = 'gddata.chartPreview.speed'
const CHART_PREVIEW_REVERSE_STORAGE_KEY = 'gddata.chartPreview.reverse'
const PROGRESS_RANGE_MAX = 1000
const PROGRESS_EDGE_INSET_PX = 20
const RAF_DEBUG_SMOOTHING = 0.12

const instrumentOptions = computed<InstrumentOption[]>(() => {
  const musicId = getRouteMusicId()
  const availableInstruments = musicId !== null ? getAvailableDtxInstruments(musicId, chartManifest.value) : []

  return INSTRUMENT_ORDER
    .map((instrument) => ({
      key: instrument,
      label: INSTRUMENT_LABELS[instrument],
      available: availableInstruments.includes(instrument),
    }))
})

const levelOptions = computed<LevelOption[]>(() => {
  const musicId = getRouteMusicId()
  const levels = musicId !== null ? getAvailableDtxLevels(musicId, selectedInstrumentKey.value, chartManifest.value) : []
  const songLevels = song.value?.instruments.find((instrument) => {
    return instrument.key === selectedInstrumentKey.value
  })?.levels ?? []

  return LEVEL_ORDER
    .map((level) => {
      const available = levels.includes(level)
      const songLevel = songLevels.find((candidate) => candidate.level === level)

      return {
        key: level,
        label: LEVEL_LABELS[level],
        difficultyText: available ? songLevel?.difficultyText ?? '-.-' : '-.-',
        available,
      }
    })
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
const canToggleReverse = computed(() => selectedInstrumentKey.value !== 'drum')
const realtimeReverse = computed(() => selectedInstrumentKey.value === 'drum' || reverseEnabled.value)
const rafAverageIntervalLabel = computed(() => {
  return rafAverageIntervalMs.value > 0 ? `${rafAverageIntervalMs.value.toFixed(1)} ms` : '-- ms'
})
const rafLastIntervalLabel = computed(() => {
  return rafLastIntervalMs.value > 0 ? `${rafLastIntervalMs.value.toFixed(1)} ms` : '-- ms'
})
const rafFpsLabel = computed(() => {
  return rafAverageIntervalMs.value > 0 ? `${Math.round(1000 / rafAverageIntervalMs.value)} fps` : '-- fps'
})

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

function getPreferenceStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function readStoredSpeed() {
  const rawSpeed = getPreferenceStorage()?.getItem(CHART_PREVIEW_SPEED_STORAGE_KEY)
  return rawSpeed ? normalizeGameSpeed(Number(rawSpeed)) : DEFAULT_SPEED
}

function writeStoredSpeed(speed: number) {
  try {
    getPreferenceStorage()?.setItem(CHART_PREVIEW_SPEED_STORAGE_KEY, normalizeGameSpeed(speed).toFixed(1))
  } catch {
    // Preference persistence is best effort.
  }
}

function readStoredReverse() {
  return getPreferenceStorage()?.getItem(CHART_PREVIEW_REVERSE_STORAGE_KEY) === '1'
}

function writeStoredReverse(enabled: boolean) {
  try {
    getPreferenceStorage()?.setItem(CHART_PREVIEW_REVERSE_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // Preference persistence is best effort.
  }
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

  return readStoredSpeed()
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

function resolveRouteReverse(instrument: InstrumentKey) {
  if (instrument === 'drum') {
    return false
  }

  const rawReverse = getFirstQueryValue(route.query.reverse)

  if (rawReverse !== undefined && rawReverse !== null) {
    return rawReverse === '1' || rawReverse === 'true' || rawReverse === 'on'
  }

  return readStoredReverse()
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function chooseFallbackInstrument(musicId: number, manifest: DtxChartManifest) {
  const requestedInstrument = getFirstQueryValue(route.query.instrument)
  const availableInstruments = getAvailableDtxInstruments(musicId, manifest)

  if (
    isInstrumentKey(requestedInstrument)
    && availableInstruments.includes(requestedInstrument)
  ) {
    return requestedInstrument
  }

  return INSTRUMENT_ORDER.find((instrument) => {
    return availableInstruments.includes(instrument)
  }) ?? availableInstruments[0] ?? 'drum'
}

function chooseFallbackLevel(musicId: number, instrumentKey: InstrumentKey, manifest = chartManifest.value) {
  const requestedLevel = getFirstQueryValue(route.query.level)
  const availableLevels = manifest ? getAvailableDtxLevels(musicId, instrumentKey, manifest) : []

  if (
    isLevelKey(requestedLevel)
    && availableLevels.includes(requestedLevel)
  ) {
    return requestedLevel
  }

  return LEVEL_ORDER_DESC.find((level) => {
    return availableLevels.includes(level)
  }) ?? availableLevels[availableLevels.length - 1] ?? 'master'
}

async function normalizeRouteSelection(musicId: number, manifest: DtxChartManifest) {
  const instrument = chooseFallbackInstrument(musicId, manifest)
  const level = chooseFallbackLevel(musicId, instrument, manifest)
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

  if (musicId === null) {
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

    const manifest = await loadDtxChartManifest()

    if (currentSequence !== loadSequence) {
      return
    }

    chartManifest.value = manifest

    if (!hasLoadedDtxChartSet(musicId, manifest)) {
      throw new Error('暂未收录这首歌的谱面预览')
    }

    const selection = await normalizeRouteSelection(musicId, manifest)

    if (!selection || currentSequence !== loadSequence) {
      return
    }

    selectedInstrumentKey.value = selection.instrument
    selectedLevelKey.value = selection.level
    selectedSpeed.value = resolveRouteSpeed()
    selectedChartMode.value = resolveRouteChartMode()
    reverseEnabled.value = resolveRouteReverse(selection.instrument)
    playbackProgress.value = previousPreview?.chart.musicId === musicId
      && previousInstrument === selection.instrument
      && previousLevel === selection.level
      ? previousProgress
      : 0
    preview.value = await loadDtxChartPreview(
      musicId,
      selection.instrument,
      selection.level,
      mapGameSpeedToRenderScale(selectedSpeed.value),
      selectedChartMode.value,
      reverseEnabled.value,
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

  if (musicId !== null) {
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

  if (musicId === null) {
    return
  }

  const manifest = chartManifest.value
  const availableInstruments = manifest ? getAvailableDtxInstruments(musicId, manifest) : []

  if (!availableInstruments.includes(instrument)) {
    return
  }

  const availableLevels = manifest ? getAvailableDtxLevels(musicId, instrument, manifest) : []
  const nextLevel = availableLevels.includes(level)
    ? level
    : chooseFallbackLevel(musicId, instrument, manifest)
  const nextQuery = {
    ...route.query,
    instrument,
    level: nextLevel,
  }

  if (instrument === 'drum') {
    Reflect.deleteProperty(nextQuery, 'reverse')
  }

  void router.replace({
    name: 'song-chart',
    params: { musicId },
    query: nextQuery,
  })
}

function updateSpeed(speed: number) {
  const musicId = getRouteMusicId()
  const normalizedSpeed = normalizeGameSpeed(speed)

  if (musicId === null || normalizedSpeed === selectedSpeed.value) {
    return
  }

  selectedSpeed.value = normalizedSpeed
  writeStoredSpeed(normalizedSpeed)
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

  if (musicId === null || chartMode === selectedChartMode.value) {
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

function updateReverse(enabled: boolean) {
  const musicId = getRouteMusicId()

  if (musicId === null || !canToggleReverse.value || enabled === reverseEnabled.value) {
    return
  }

  reverseEnabled.value = enabled
  writeStoredReverse(enabled)
  const nextQuery = { ...route.query }

  if (enabled) {
    nextQuery.reverse = '1'
  } else {
    Reflect.deleteProperty(nextQuery, 'reverse')
  }

  void router.replace({
    name: 'song-chart',
    params: { musicId },
    query: nextQuery,
  })
}

function getInstrumentButtonClass(instrument: InstrumentOption) {
  return {
    'chart-preview__panel-button--active': instrument.key === selectedInstrumentKey.value,
    'chart-preview__panel-button--disabled': !instrument.available,
  }
}

function getLevelButtonClass(level: LevelOption) {
  return {
    'chart-preview__panel-button--active': level.key === selectedLevelKey.value,
    'chart-preview__panel-button--disabled': !level.available,
  }
}

function getChartModeButtonClass(chartMode: DtxChartMode) {
  return {
    'chart-preview__panel-button--active': chartMode === selectedChartMode.value,
  }
}

function setViewerProgress(progress: number) {
  playbackProgress.value = Math.min(1, Math.max(0, progress))
}

function seekViewerProgress(progress: number) {
  setViewerProgress(progress)

  if (playing.value) {
    playbackStartedAt = performance.now()
    playbackStartedProgress = playbackProgress.value
  }
}

function getChartPixelsPerSecond() {
  const currentPreview = preview.value
  const viewerShell = viewerShellRef.value

  if (!currentPreview || !viewerShell) {
    return 1
  }

  const bodyWidth = getFullBodyFrameWidth(
    currentPreview.drawingConfig.gameMode,
    currentPreview.drawingConfig.chartMode,
  )
  const zoom = viewerShell.clientWidth / Math.max(1, bodyWidth)

  return Math.max(1, currentPreview.drawingConfig.scale * REALTIME_BASE_PIXELS_PER_SECOND * zoom)
}

function seekViewerByPixelDelta(deltaY: number, startProgress = playbackProgress.value) {
  const duration = preview.value?.dtxJson.songInfo.songDuration ?? 0

  if (duration <= 0) {
    return
  }

  const direction = realtimeReverse.value ? 1 : -1
  seekViewerProgress(startProgress + direction * deltaY / (duration * getChartPixelsPerSecond()))
}

function normalizeWheelDeltaY(event: WheelEvent) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * 16
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * (viewerShellRef.value?.clientHeight ?? 1)
  }

  return event.deltaY
}

function handleChartWheel(event: WheelEvent) {
  event.preventDefault()
  seekViewerByPixelDelta(normalizeWheelDeltaY(event))
}

function handleChartPointerDown(event: PointerEvent) {
  if (event.button !== 0 && event.pointerType === 'mouse') {
    return
  }

  event.preventDefault()
  activeChartPointerId = event.pointerId
  chartDragStartY = event.clientY
  chartDragStartProgress = playbackProgress.value
  viewerShellRef.value?.setPointerCapture(event.pointerId)
}

function handleChartPointerMove(event: PointerEvent) {
  if (activeChartPointerId !== event.pointerId) {
    return
  }

  event.preventDefault()
  seekViewerByPixelDelta(event.clientY - chartDragStartY, chartDragStartProgress)
}

function finishChartPointer(event: PointerEvent) {
  if (activeChartPointerId !== event.pointerId) {
    return
  }

  viewerShellRef.value?.releasePointerCapture(event.pointerId)
  activeChartPointerId = null
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
  seekViewerProgress((localX - startX) / rangeWidth)
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
    seekViewerProgress(0)
    return
  }

  if (event.key === 'End') {
    event.preventDefault()
    seekViewerProgress(1)
    return
  }

  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return
  }

  event.preventDefault()
  const direction = event.key === 'ArrowRight' ? 1 : -1
  const step = event.shiftKey ? 0.1 : 0.02
  seekViewerProgress(playbackProgress.value + direction * step)
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

  if (!preview.value || duration <= 0) {
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

function resetRafDebugStats() {
  rafDebugLastTimestamp = 0
  rafDebugAverageInterval = 0
  rafAverageIntervalMs.value = 0
  rafLastIntervalMs.value = 0
}

function runRafDebugMonitor(timestamp: number) {
  if (!debugModeEnabled.value) {
    rafDebugFrame = 0
    resetRafDebugStats()
    return
  }

  if (rafDebugLastTimestamp > 0) {
    const interval = Math.max(0, timestamp - rafDebugLastTimestamp)
    rafLastIntervalMs.value = interval
    rafDebugAverageInterval = rafDebugAverageInterval > 0
      ? rafDebugAverageInterval * (1 - RAF_DEBUG_SMOOTHING) + interval * RAF_DEBUG_SMOOTHING
      : interval
    rafAverageIntervalMs.value = rafDebugAverageInterval
  }

  rafDebugLastTimestamp = timestamp
  rafDebugFrame = window.requestAnimationFrame(runRafDebugMonitor)
}

function startRafDebugMonitor() {
  if (rafDebugFrame) {
    return
  }

  resetRafDebugStats()
  rafDebugFrame = window.requestAnimationFrame(runRafDebugMonitor)
}

function stopRafDebugMonitor() {
  if (rafDebugFrame) {
    window.cancelAnimationFrame(rafDebugFrame)
    rafDebugFrame = 0
  }

  resetRafDebugStats()
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
    route.query.reverse,
  ],
  () => {
    void loadCurrentChart()
  },
  { immediate: true },
)

watch(
  () => [route.query.reverse, selectedInstrumentKey.value] as const,
  () => {
    reverseEnabled.value = resolveRouteReverse(selectedInstrumentKey.value)
  },
)

watch(
  debugModeEnabled,
  (enabled) => {
    if (enabled) {
      startRafDebugMonitor()
      return
    }

    stopRafDebugMonitor()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopPlayback()
  stopRafDebugMonitor()
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
      <section
        v-if="loading"
        class="chart-preview__state chart-preview__state--loading"
        role="status"
        aria-label="谱面加载中"
      >
        <div class="chart-preview__loading-shimmer" aria-hidden="true"></div>
      </section>

      <section v-else-if="errorMessage" class="chart-preview__state chart-preview__state--error">
        <p>{{ errorMessage }}</p>
        <button type="button" @click="goBack">返回详情</button>
      </section>

      <div
        v-else-if="preview"
        ref="viewerShellRef"
        class="chart-preview__viewer-shell"
        :class="{ 'chart-preview__viewer-shell--dragging': activeChartPointerId !== null }"
        aria-label="谱面画布"
        @pointercancel="finishChartPointer"
        @pointerdown="handleChartPointerDown"
        @pointermove="handleChartPointerMove"
        @pointerup="finishChartPointer"
        @wheel="handleChartWheel"
      >
        <DtxRealtimeCanvas
          :drawing-config="preview.drawingConfig"
          :dtx-json="preview.dtxJson"
          :progress="playbackProgress"
          :reverse="realtimeReverse"
        />
        <div
          v-if="debugModeEnabled"
          class="chart-preview__raf-debug"
          aria-label="rAF interval debug"
        >
          <span>{{ rafAverageIntervalLabel }}</span>
          <strong>{{ rafFpsLabel }}</strong>
          <small>last {{ rafLastIntervalLabel }}</small>
        </div>
      </div>
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
              :disabled="!instrument.available"
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
              :disabled="!level.available"
              @click="updateSelection(selectedInstrumentKey, level.key)"
            >
              <span>{{ level.label }}</span>
              <small>{{ level.difficultyText }}</small>
            </button>
          </div>
        </div>

        <div class="chart-preview__panel-row chart-preview__panel-row--speed-reverse">
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
            <span>反转</span>
            <button
              class="chart-preview__reverse-toggle"
              type="button"
              role="switch"
              :aria-checked="reverseEnabled"
              :disabled="!canToggleReverse"
              @click="updateReverse(!reverseEnabled)"
            >
              <span class="chart-preview__reverse-toggle-track">
                <span class="chart-preview__reverse-toggle-thumb"></span>
              </span>
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
  --note-player-width: 100%;
  --note-topbar-height: calc(var(--note-safe-top) + 70px);
  --note-player-height: calc(var(--note-safe-bottom) + 80px);
  --note-player-back-top: 8px;
  --note-player-panel-bottom: calc(var(--note-player-height) - var(--note-player-back-top));
  --note-player-cover-overlap: -7px;
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

.chart-preview__viewer-shell {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 11px 11px 0 0;
  background: #000000;
  cursor: grab;
  touch-action: none;
}

.chart-preview__viewer-shell--dragging {
  cursor: grabbing;
}

.chart-preview__raf-debug {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 4;
  display: grid;
  gap: 2px;
  min-width: 86px;
  padding: 7px 9px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 7px;
  background: rgba(24, 19, 37, 0.78);
  color: #ffffff;
  font-family: var(--font-figma-title);
  line-height: 1;
  pointer-events: none;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.36);
}

.chart-preview__raf-debug span {
  font-size: 12px;
  font-weight: 700;
}

.chart-preview__raf-debug strong {
  font-size: 15px;
  font-weight: 700;
}

.chart-preview__raf-debug small {
  color: rgba(255, 255, 255, 0.78);
  font-size: 10px;
  font-weight: 400;
}

.chart-preview__state {
  display: grid;
  height: 100%;
  place-items: center;
  padding: 28px;
  color: #4a4a4a;
  text-align: center;
}

.chart-preview__state--loading {
  align-items: stretch;
  justify-items: stretch;
  padding: 0;
}

.chart-preview__loading-shimmer {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 100%;
  min-height: 240px;
  border-radius: 11px 11px 0 0;
  background:
    linear-gradient(135deg, #d7d3dc 0%, #eeeaf2 45%, #cbc6d1 100%),
    radial-gradient(circle at 24% 20%, rgba(255, 255, 255, 0.28), transparent 24%),
    radial-gradient(circle at 76% 78%, rgba(124, 113, 145, 0.13), transparent 28%);
}

.chart-preview__loading-shimmer::before {
  content: '';
  position: absolute;
  inset: -35% -70%;
  z-index: 1;
  background: linear-gradient(
    115deg,
    transparent 38%,
    rgba(255, 255, 255, 0.6) 50%,
    transparent 62%
  );
  background-repeat: no-repeat;
  animation: chartPreviewSkeletonSweep 1.25s cubic-bezier(0.4, 0, 0.2, 1) infinite;
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
  width: var(--note-player-width);
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
  width: var(--note-player-width);
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

.chart-preview__panel-row {
  display: grid;
  gap: 10px;
}

.chart-preview__panel-row--speed-reverse {
  grid-template-columns: minmax(0, 1fr) 88px;
  align-items: end;
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

.chart-preview__panel-button--disabled,
.chart-preview__panel-button:disabled {
  border-color: rgba(120, 111, 139, 0.12);
  background: rgba(217, 211, 224, 0.44);
  color: #9a93a9;
  cursor: default;
  opacity: 1;
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

.chart-preview__reverse-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--note-purple);
}

.chart-preview__reverse-toggle-track {
  position: relative;
  width: 52px;
  height: 28px;
  border-radius: 999px;
  background: rgba(75, 59, 118, 0.22);
  transition: background 160ms ease;
}

.chart-preview__reverse-toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2px 4px rgba(55, 43, 89, 0.28);
  transition: transform 160ms ease;
}

.chart-preview__reverse-toggle[aria-checked="true"] .chart-preview__reverse-toggle-track {
  background: var(--note-purple);
}

.chart-preview__reverse-toggle[aria-checked="true"] .chart-preview__reverse-toggle-thumb {
  transform: translateX(24px);
}

.chart-preview__reverse-toggle:disabled {
  color: #948ca7;
  cursor: default;
  opacity: 0.72;
}

.chart-preview__reverse-toggle:disabled .chart-preview__reverse-toggle-track {
  background: rgba(143, 136, 160, 0.36);
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

@keyframes chartPreviewSkeletonSweep {
  from {
    transform: translate3d(-34%, -18%, 0);
  }

  to {
    transform: translate3d(34%, 18%, 0);
  }
}
</style>
