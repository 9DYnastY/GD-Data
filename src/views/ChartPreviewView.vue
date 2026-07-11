<script setup lang="ts">
import { App } from '@capacitor/app'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DtxChartCanvas from '../components/DtxChartCanvas.vue'
import DtxRealtimeCanvas from '../components/DtxRealtimeCanvas.vue'
import menuIconSrc from '../assets/chart-preview/note-menu.png'
import pauseIconSrc from '../assets/chart-preview/note-pause.png'
import playIconSrc from '../assets/chart-preview/note-play.png'
import {
  getAvailableDtxInstruments,
  getAvailableDtxLevels,
  hasDtxChartAudio,
  loadDtxChartManifest,
} from '../lib/chart-preview-manifest'
import { loadChartAudio } from '../lib/chart-preview-audio'
import { loadDtxChartPreview } from '../lib/chart-preview-loader'
import {
  clampPlaybackLoopRange,
  resolvePlaybackLoopRange,
  resolvePlaybackLoopSeekTime,
} from '../lib/chart-preview-loop'
import { loadBjmaniaSkillSnapshotCache } from '../lib/bjmania/cache'
import { loadSongByMusicId } from '../lib/song-catalog'
import { useDebugMode } from '../lib/debug-mode'
import { exportElementAsImage, resolveImageSourceForExport } from '../lib/b50-export'
import {
  REALTIME_BASE_PIXELS_PER_SECOND,
  prepareDtxRealtimeData,
  renderDtxAnnotationExportCanvas,
} from '../lib/chart-preview-realtime-renderer'
import { getFullBodyFrameWidth } from '../lib/chart-preview-positioner'
import type { LoadedChartAudio } from '../lib/chart-preview-audio'
import type { DtxHandAnnotation } from '../lib/chart-preview-realtime-renderer'
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
  hasAudio: boolean
}

interface ChartModeOption {
  key: DtxChartMode
  label: string
}

type ChartRenderMode = 'realtime' | 'static'

interface StaticPointerPosition {
  x: number
  y: number
}

interface StaticPanGesture {
  type: 'pan'
  pointerId: number
  startX: number
  startY: number
  startPanX: number
  startPanY: number
}

interface StaticPinchGesture {
  type: 'pinch'
  startDistance: number
  startMidX: number
  startMidY: number
  startPanX: number
  startPanY: number
  startZoom: number
  startCanvasZoom: number
}

type StaticGesture = StaticPanGesture | StaticPinchGesture

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
const selectedBarsPerColumn = ref(5)
const selectedChartMode = ref<DtxChartMode>('XG/Gitadora')
const reverseEnabled = ref(false)
const viewerShellRef = ref<HTMLElement | null>(null)
const progressShellRef = ref<HTMLElement | null>(null)
const annotationExportStageRef = ref<HTMLElement | null>(null)
const annotationExportCanvasRef = ref<HTMLCanvasElement | null>(null)
const annotationExportCoverSrc = ref<string | null>(null)
const viewerShellSize = ref({ width: 0, height: 0 })
const settingsPanelOpen = ref(false)
const chartRenderMode = ref<ChartRenderMode>('realtime')
const annotationModeEnabled = ref(false)
const showAnnotations = ref(false)
const annotationSelectedNoteKey = ref<string | null>(null)
const chartAnnotations = ref<Record<string, DtxHandAnnotation>>({})
const playbackBookmarks = ref<number[]>([])
const annotationExporting = ref(false)
const dynamicDragging = ref(false)
const staticDragging = ref(false)
const staticZoom = ref(1)
const staticRenderedZoom = ref(1)
const staticPanX = ref(0)
const staticPanY = ref(0)
const playing = ref(false)
const playbackTimeSeconds = ref(0)
const audioDurationSeconds = ref(0)
const audioLoading = ref(false)
const audioPlaybackPending = ref(false)
const audioTrackEnabled = ref(false)
const playbackNotice = ref('')
const rafAverageIntervalMs = ref(0)
const rafLastIntervalMs = ref(0)
let loadSequence = 0
let audioLoadSequence = 0
let playbackRequestSequence = 0
let playbackFrame = 0
let playbackStartedAt = 0
let playbackStartedTime = 0
let rafDebugFrame = 0
let rafDebugLastTimestamp = 0
let rafDebugAverageInterval = 0
let activeProgressPointerId: number | null = null
let activeChartPointerId: number | null = null
let chartDragStartTime = 0
let resumeAfterProgressSeek = false
let resumeAfterChartSeek = false
let chartDragStartY = 0
let viewerResizeObserver: ResizeObserver | null = null
let staticGesture: StaticGesture | null = null
let staticZoomCommitTimer: number | null = null
let playbackNoticeTimer: number | null = null
let loadedChartAudio: LoadedChartAudio | null = null
let appStateChangeListener: { remove: () => Promise<void> } | null = null
let viewUnmounted = false
const staticPointers = new Map<number, StaticPointerPosition>()

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
const BARS_PER_COLUMN_MIN = 3
const BARS_PER_COLUMN_MAX = 10
const BARS_PER_COLUMN_STEP = 1
const DEFAULT_BARS_PER_COLUMN = 5
const STATIC_ZOOM_MIN = 0.25
const STATIC_ZOOM_MAX = 5
const CHART_PREVIEW_SPEED_STORAGE_KEY = 'gddata.chartPreview.speed'
const CHART_PREVIEW_BARS_PER_COLUMN_STORAGE_KEY = 'gddata.chartPreview.barsPerColumn'
const CHART_PREVIEW_REVERSE_STORAGE_KEY = 'gddata.chartPreview.reverse'
const CHART_PREVIEW_AUDIO_TRACK_STORAGE_KEY = 'gddata.chartPreview.audioTrack'
const PROGRESS_RANGE_MAX = 1000
const PROGRESS_EDGE_INSET_PX = 20
const RAF_DEBUG_SMOOTHING = 0.12
const ANNOTATION_EXPORT_CANVAS_WIDTH = 402
const instrumentOptions = computed<InstrumentOption[]>(() => {
  const musicId = getRouteMusicId()
  const availableInstruments = musicId !== null
    ? getSelectableDtxInstruments(musicId, chartManifest.value)
    : []

  return INSTRUMENT_ORDER
    .map((instrument) => ({
      key: instrument,
      label: INSTRUMENT_LABELS[instrument],
      available: availableInstruments.includes(instrument),
    }))
})

const levelOptions = computed<LevelOption[]>(() => {
  const musicId = getRouteMusicId()
  const levels = musicId !== null
    ? getSelectableDtxLevels(musicId, selectedInstrumentKey.value, chartManifest.value)
    : []
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
        hasAudio: Boolean(
          available
          && musicId !== null
          && hasDtxChartAudio(musicId, selectedInstrumentKey.value, level, chartManifest.value),
        ),
      }
    })
})

const dtxDurationSeconds = computed(() => preview.value?.dtxJson.songInfo.songDuration ?? 0)
const timelineDurationSeconds = computed(() => (
  audioDurationSeconds.value > 0 ? audioDurationSeconds.value : dtxDurationSeconds.value
))
const playbackProgress = computed(() => {
  const duration = timelineDurationSeconds.value
  return duration > 0 ? Math.min(1, Math.max(0, playbackTimeSeconds.value / duration)) : 0
})
const chartPlaybackProgress = computed(() => {
  const duration = dtxDurationSeconds.value
  return duration > 0 ? Math.min(1, Math.max(0, playbackTimeSeconds.value / duration)) : 0
})
const progressRangeValue = computed(() => Math.round(playbackProgress.value * PROGRESS_RANGE_MAX))
const progressThumbLeft = computed(() => {
  return `calc(${PROGRESS_EDGE_INSET_PX}px + (100% - ${PROGRESS_EDGE_INSET_PX * 2}px) * ${playbackProgress.value})`
})
const totalTimeLabel = computed(() => formatTime(timelineDurationSeconds.value))
const currentTimeLabel = computed(() => formatTime(playbackTimeSeconds.value))
const currentBarNumber = computed(() => {
  const bars = preview.value?.dtxJson.bars ?? []

  if (bars.length === 0) {
    return 0
  }

  let currentBar = 0

  for (let index = 0; index < bars.length; index += 1) {
    if ((bars[index]?.startTimePos ?? 0) > playbackTimeSeconds.value) {
      break
    }

    currentBar = index
  }

  return currentBar
})
const currentBarLabel = computed(() => {
  const bars = preview.value?.dtxJson.bars ?? []
  return bars.length > 0 ? formatBarNumber(currentBarNumber.value) : '---'
})
const totalBarLabel = computed(() => {
  const bars = preview.value?.dtxJson.bars ?? []
  return bars.length > 0 ? formatBarNumber(bars.length - 1) : '---'
})
const canDecreaseSpeed = computed(() => selectedSpeed.value > SPEED_MIN)
const canIncreaseSpeed = computed(() => selectedSpeed.value < SPEED_MAX)
const canAdjustBarsPerColumn = computed(() => chartRenderMode.value === 'static')
const canDecreaseBarsPerColumn = computed(() => {
  return canAdjustBarsPerColumn.value && selectedBarsPerColumn.value > BARS_PER_COLUMN_MIN
})
const canIncreaseBarsPerColumn = computed(() => {
  return canAdjustBarsPerColumn.value && selectedBarsPerColumn.value < BARS_PER_COLUMN_MAX
})
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
const chartDragging = computed(() => {
  return chartRenderMode.value === 'static' ? staticDragging.value : dynamicDragging.value
})
const dynamicChartEnabled = computed(() => {
  return chartRenderMode.value === 'realtime'
})
const annotationModeAvailable = computed(() => {
  return selectedInstrumentKey.value === 'drum' && chartRenderMode.value === 'realtime'
})
const annotationModeActive = computed(() => {
  return annotationModeEnabled.value && annotationModeAvailable.value
})
const playerProgressStartLabel = computed(() => (
  annotationModeActive.value ? currentBarLabel.value : currentTimeLabel.value
))
const playerProgressEndLabel = computed(() => (
  annotationModeActive.value ? totalBarLabel.value : totalTimeLabel.value
))
const annotationDisplayActive = computed(() => {
  return annotationModeActive.value || showAnnotations.value
})
const playbackLoopRange = computed(() => clampPlaybackLoopRange(
  resolvePlaybackLoopRange(playbackBookmarks.value),
  timelineDurationSeconds.value,
))
const visiblePlaybackBookmarks = computed(() => {
  if (!preview.value) {
    return []
  }

  const range = playbackLoopRange.value
  return range ? [range.startTime, range.endTime] : playbackBookmarks.value
})
const playbackBookmarkMarkers = computed(() => {
  return visiblePlaybackBookmarks.value.map((bookmark, index) => {
    const progress = Math.min(1, Math.max(0, bookmark / Math.max(1, timelineDurationSeconds.value)))
    return {
      index,
      left: `calc(${PROGRESS_EDGE_INSET_PX}px + (100% - ${PROGRESS_EDGE_INSET_PX * 2}px) * ${progress})`,
    }
  })
})
const playbackBookmarkButtonLabel = computed(() => {
  if (playbackBookmarks.value.length === 1) {
    return '设置 B 点'
  }

  return playbackBookmarks.value.length === 2 ? '重新设置 A 点' : '设置 A 点'
})
const canExportAnnotations = computed(() => (
  selectedInstrumentKey.value === 'drum'
  && Boolean(preview.value)
  && Boolean(playbackLoopRange.value)
))
const selectedAnnotationValue = computed(() => {
  const noteKey = annotationSelectedNoteKey.value
  return noteKey ? chartAnnotations.value[noteKey] ?? null : null
})
const annotationProgressSegments = computed(() => {
  const bars = preview.value?.dtxJson.bars ?? []
  const duration = timelineDurationSeconds.value

  if (bars.length === 0 || duration <= 0) {
    return []
  }

  const annotatedBars = new Set<number>()

  Object.entries(chartAnnotations.value).forEach(([noteKey, value]) => {
    if (value !== 'L' && value !== 'R') {
      return
    }

    const barNumber = Number(noteKey.split(':', 1)[0])

    if (Number.isInteger(barNumber) && barNumber >= 0 && barNumber < bars.length) {
      annotatedBars.add(barNumber)
    }
  })

  return [...annotatedBars].sort((a, b) => a - b).map((barNumber) => {
    const bar = bars[barNumber]
    const startTime = Math.max(0, Math.min(duration, bar?.startTimePos ?? 0))
    const nextStartTime = bars[barNumber + 1]?.startTimePos
    const endTime = Math.max(startTime, Math.min(
      duration,
      typeof nextStartTime === 'number'
        ? nextStartTime
        : startTime + (bar?.duration ?? 0),
    ))

    return {
      barNumber,
      left: `calc(${PROGRESS_EDGE_INSET_PX}px + (100% - ${PROGRESS_EDGE_INSET_PX * 2}px) * ${startTime / duration})`,
      width: `calc((100% - ${PROGRESS_EDGE_INSET_PX * 2}px) * ${Math.max(0.0035, (endTime - startTime) / duration)})`,
    }
  })
})
const annotationExportDifficultyText = computed(() => {
  return levelOptions.value.find((level) => level.key === selectedLevelKey.value)?.difficultyText ?? '-.-'
})
const annotationExportAuthorName = loadBjmaniaSkillSnapshotCache()?.snapshot.gitadoraProfile.name?.trim() || '佚名'
const annotationExportDateText = new Intl.DateTimeFormat('zh-CN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date())
const audioTrackAvailable = computed(() => Boolean(preview.value?.chart.audioUrl))
const playbackDisabled = computed(() => {
  return (
    chartRenderMode.value === 'static'
    || annotationModeActive.value
    || !preview.value
    || audioLoading.value
    || audioPlaybackPending.value
  )
})
const staticFitZoom = computed(() => {
  const canvasWidth = preview.value?.canvasData[0]?.canvasSize.width ?? 0

  if (canvasWidth <= 0 || viewerShellSize.value.width <= 0) {
    return 1
  }

  return viewerShellSize.value.width / canvasWidth
})
const staticCanvasZoom = computed(() => {
  return staticFitZoom.value * staticRenderedZoom.value
})
const staticDisplayCanvasZoom = computed(() => {
  return staticFitZoom.value * staticZoom.value
})
const staticStackScale = computed(() => {
  return staticZoom.value / Math.max(0.001, staticRenderedZoom.value)
})
const staticStackStyle = computed(() => {
  const scale = Math.max(0.001, staticStackScale.value)

  return {
    gap: `${10 / scale}px`,
    transform: `translate3d(${staticPanX.value}px, ${staticPanY.value}px, 0) scale(${scale})`,
  }
})

function getFirstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

function getRouteMusicId() {
  const musicId = Number(route.params.musicId)
  return Number.isFinite(musicId) ? musicId : null
}

function getSelectableDtxLevels(
  musicId: number,
  instrument: InstrumentKey,
  manifest = chartManifest.value,
) {
  const officialLevels = new Set(
    song.value?.instruments
      .find((entry) => entry.key === instrument)
      ?.levels
      .filter((level) => level.available)
      .map((level) => level.level) ?? [],
  )

  return getAvailableDtxLevels(musicId, instrument, manifest)
    .filter((level) => officialLevels.has(level))
}

function getSelectableDtxInstruments(musicId: number, manifest = chartManifest.value) {
  return getAvailableDtxInstruments(musicId, manifest)
    .filter((instrument) => getSelectableDtxLevels(musicId, instrument, manifest).length > 0)
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

function normalizeBarsPerColumn(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_BARS_PER_COLUMN
  }

  const roundedValue = Math.round(value / BARS_PER_COLUMN_STEP) * BARS_PER_COLUMN_STEP
  return Math.min(BARS_PER_COLUMN_MAX, Math.max(BARS_PER_COLUMN_MIN, roundedValue))
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

function readStoredBarsPerColumn() {
  const rawBarsPerColumn = getPreferenceStorage()?.getItem(CHART_PREVIEW_BARS_PER_COLUMN_STORAGE_KEY)
  return rawBarsPerColumn ? normalizeBarsPerColumn(Number(rawBarsPerColumn)) : DEFAULT_BARS_PER_COLUMN
}

function writeStoredBarsPerColumn(barsPerColumn: number) {
  try {
    getPreferenceStorage()?.setItem(
      CHART_PREVIEW_BARS_PER_COLUMN_STORAGE_KEY,
      normalizeBarsPerColumn(barsPerColumn).toString(),
    )
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

function readStoredAudioTrackEnabled() {
  return getPreferenceStorage()?.getItem(CHART_PREVIEW_AUDIO_TRACK_STORAGE_KEY) === '1'
}

function writeStoredAudioTrackEnabled(enabled: boolean) {
  try {
    getPreferenceStorage()?.setItem(CHART_PREVIEW_AUDIO_TRACK_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // Preference persistence is best effort.
  }
}

function getAnnotationStorageKey(currentPreview = preview.value) {
  if (!currentPreview) {
    return ''
  }

  return [
    'gddata.chartPreview.annotations',
    currentPreview.chart.musicId,
    currentPreview.chart.instrument,
    currentPreview.chart.level,
    currentPreview.chart.url,
  ].join(':')
}

function readStoredAnnotations(currentPreview: LoadedDtxChartPreview) {
  const rawAnnotations = getPreferenceStorage()?.getItem(getAnnotationStorageKey(currentPreview))

  if (!rawAnnotations) {
    return {}
  }

  try {
    const parsed = JSON.parse(rawAnnotations) as Record<string, DtxHandAnnotation>
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, DtxHandAnnotation] => {
        return entry[1] === 'L' || entry[1] === 'R'
      }),
    )
  } catch {
    return {}
  }
}

function writeStoredAnnotations() {
  const storageKey = getAnnotationStorageKey()

  if (!storageKey) {
    return
  }

  try {
    getPreferenceStorage()?.setItem(storageKey, JSON.stringify(chartAnnotations.value))
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

function resolveRouteBarsPerColumn() {
  const rawBarsPerColumn = getFirstQueryValue(route.query.barsPerColumn)
  return rawBarsPerColumn ? normalizeBarsPerColumn(Number(rawBarsPerColumn)) : readStoredBarsPerColumn()
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

function formatBarNumber(value: number) {
  return String(Math.max(0, value)).padStart(3, '0')
}

function chooseFallbackInstrument(musicId: number, manifest: DtxChartManifest) {
  const requestedInstrument = getFirstQueryValue(route.query.instrument)
  const availableInstruments = getSelectableDtxInstruments(musicId, manifest)

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
  const availableLevels = manifest ? getSelectableDtxLevels(musicId, instrumentKey, manifest) : []

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

function clearPlaybackNoticeTimer() {
  if (playbackNoticeTimer !== null) {
    window.clearTimeout(playbackNoticeTimer)
    playbackNoticeTimer = null
  }
}

function showPlaybackNotice(message: string) {
  clearPlaybackNoticeTimer()
  playbackNotice.value = message
  playbackNoticeTimer = window.setTimeout(() => {
    playbackNotice.value = ''
    playbackNoticeTimer = null
  }, 2400)
}

function releaseLoadedChartAudio() {
  if (loadedChartAudio) {
    loadedChartAudio.destroy()
    loadedChartAudio = null
  }

  audioDurationSeconds.value = 0
}

async function prepareChartAudio(currentPreview: LoadedDtxChartPreview, sequence: number) {
  const audioUrl = currentPreview.chart.audioUrl

  if (!audioUrl) {
    return
  }

  const currentAudioSequence = ++audioLoadSequence
  audioLoading.value = true

  try {
    const loadedAudio = await loadChartAudio(audioUrl)

    if (
      sequence !== loadSequence
      || currentAudioSequence !== audioLoadSequence
      || !audioTrackEnabled.value
    ) {
      loadedAudio.destroy()
      return
    }

    loadedChartAudio = loadedAudio
    audioDurationSeconds.value = loadedAudio.duration
    seekViewerTime(playbackTimeSeconds.value)
  } catch {
    if (sequence === loadSequence && currentAudioSequence === audioLoadSequence) {
      audioTrackEnabled.value = false
      showPlaybackNotice('音频加载失败，已切换为无声播放')
    }
  } finally {
    if (sequence === loadSequence && currentAudioSequence === audioLoadSequence) {
      audioLoading.value = false
    }
  }
}

async function loadCurrentChart() {
  const currentSequence = ++loadSequence
  const musicId = getRouteMusicId()
  const previousPreview = preview.value
  const previousInstrument = selectedInstrumentKey.value
  const previousLevel = selectedLevelKey.value
  const previousPlaybackTime = playbackTimeSeconds.value

  stopPlayback()
  resumeAfterProgressSeek = false
  resumeAfterChartSeek = false
  audioLoadSequence += 1
  releaseLoadedChartAudio()
  audioLoading.value = false
  audioPlaybackPending.value = false
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

    if (getSelectableDtxInstruments(musicId, manifest).length === 0) {
      throw new Error('暂未收录这首歌的谱面预览')
    }

    const selection = await normalizeRouteSelection(musicId, manifest)

    if (!selection || currentSequence !== loadSequence) {
      return
    }

    selectedInstrumentKey.value = selection.instrument
    selectedLevelKey.value = selection.level
    selectedSpeed.value = resolveRouteSpeed()
    selectedBarsPerColumn.value = resolveRouteBarsPerColumn()
    selectedChartMode.value = resolveRouteChartMode()
    reverseEnabled.value = resolveRouteReverse(selection.instrument)
    const loadedPreview = await loadDtxChartPreview(
      musicId,
      selection.instrument,
      selection.level,
      mapGameSpeedToRenderScale(selectedSpeed.value),
      selectedChartMode.value,
      reverseEnabled.value,
      selectedBarsPerColumn.value,
    )

    if (currentSequence !== loadSequence) {
      return
    }

    preview.value = loadedPreview
    chartAnnotations.value = readStoredAnnotations(loadedPreview)
    annotationSelectedNoteKey.value = null

    if (
      previousPreview?.chart.musicId !== musicId
      || previousInstrument !== selection.instrument
      || previousLevel !== selection.level
    ) {
      playbackBookmarks.value = []
    }

    if (selection.instrument !== 'drum') {
      annotationModeEnabled.value = false
    }

    audioTrackEnabled.value = Boolean(
      loadedPreview.chart.audioUrl && readStoredAudioTrackEnabled(),
    )
    setPlaybackTime(
      previousPreview?.chart.musicId === musicId
        && previousInstrument === selection.instrument
        && previousLevel === selection.level
        ? previousPlaybackTime
        : 0,
    )
    resetStaticViewport()
    if (audioTrackEnabled.value) {
      void prepareChartAudio(loadedPreview, currentSequence)
    }
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
  const availableInstruments = manifest ? getSelectableDtxInstruments(musicId, manifest) : []

  if (!availableInstruments.includes(instrument)) {
    return
  }

  const availableLevels = manifest ? getSelectableDtxLevels(musicId, instrument, manifest) : []
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

function updateBarsPerColumn(barsPerColumn: number) {
  const musicId = getRouteMusicId()
  const normalizedBarsPerColumn = normalizeBarsPerColumn(barsPerColumn)

  if (
    musicId === null
    || !canAdjustBarsPerColumn.value
    || normalizedBarsPerColumn === selectedBarsPerColumn.value
  ) {
    return
  }

  selectedBarsPerColumn.value = normalizedBarsPerColumn
  writeStoredBarsPerColumn(normalizedBarsPerColumn)

  void router.replace({
    name: 'song-chart',
    params: { musicId },
    query: {
      ...route.query,
      barsPerColumn: normalizedBarsPerColumn.toString(),
    },
  })
}

function adjustBarsPerColumn(delta: number) {
  updateBarsPerColumn(selectedBarsPerColumn.value + delta)
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
  const currentReverseQuery = getFirstQueryValue(route.query.reverse)
  const hasReverseQuery = currentReverseQuery !== undefined && currentReverseQuery !== null
  const nextQuery = { ...route.query }

  if (enabled) {
    nextQuery.reverse = '1'
  } else {
    Reflect.deleteProperty(nextQuery, 'reverse')
  }

  if (!enabled && !hasReverseQuery) {
    void loadCurrentChart()
    return
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

function normalizeStaticZoom(value: number) {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.min(STATIC_ZOOM_MAX, Math.max(STATIC_ZOOM_MIN, value))
}

function clearStaticZoomCommit() {
  if (staticZoomCommitTimer === null) {
    return
  }

  window.clearTimeout(staticZoomCommitTimer)
  staticZoomCommitTimer = null
}

function commitStaticZoomToCanvas() {
  clearStaticZoomCommit()
  staticRenderedZoom.value = staticZoom.value
}

function scheduleStaticZoomCommit(delayMs = 140) {
  clearStaticZoomCommit()
  staticZoomCommitTimer = window.setTimeout(() => {
    commitStaticZoomToCanvas()
  }, delayMs)
}

function resetStaticGesture() {
  staticGesture = null
  staticPointers.clear()
  staticDragging.value = false
}

function resetStaticViewport() {
  clearStaticZoomCommit()
  resetStaticGesture()
  staticZoom.value = STATIC_ZOOM_MIN
  staticRenderedZoom.value = STATIC_ZOOM_MIN
  staticPanX.value = 0
  staticPanY.value = 0
}

function updateViewerShellSize() {
  const viewerShell = viewerShellRef.value

  if (!viewerShell) {
    viewerShellSize.value = { width: 0, height: 0 }
    return
  }

  viewerShellSize.value = {
    width: viewerShell.clientWidth,
    height: viewerShell.clientHeight,
  }
}

function getStaticLocalPoint(clientX: number, clientY: number) {
  const rect = viewerShellRef.value?.getBoundingClientRect()

  if (!rect) {
    return { x: clientX, y: clientY }
  }

  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  }
}

function getStaticPointerDistance(pointerA: StaticPointerPosition, pointerB: StaticPointerPosition) {
  return Math.hypot(pointerA.x - pointerB.x, pointerA.y - pointerB.y)
}

function getStaticPointerMidpoint(pointerA: StaticPointerPosition, pointerB: StaticPointerPosition) {
  return {
    x: (pointerA.x + pointerB.x) / 2,
    y: (pointerA.y + pointerB.y) / 2,
  }
}

function setStaticZoomAt(clientX: number, clientY: number, zoom: number) {
  const localPoint = getStaticLocalPoint(clientX, clientY)
  const oldCanvasZoom = Math.max(0.001, staticDisplayCanvasZoom.value)
  const nextStaticZoom = normalizeStaticZoom(zoom)
  const nextCanvasZoom = Math.max(0.001, staticFitZoom.value * nextStaticZoom)
  const contentX = (localPoint.x - staticPanX.value) / oldCanvasZoom
  const contentY = (localPoint.y - staticPanY.value) / oldCanvasZoom

  staticZoom.value = nextStaticZoom
  staticPanX.value = localPoint.x - contentX * nextCanvasZoom
  staticPanY.value = localPoint.y - contentY * nextCanvasZoom
}

function beginStaticPanGesture(pointerId: number, pointer: StaticPointerPosition) {
  staticGesture = {
    type: 'pan',
    pointerId,
    startX: pointer.x,
    startY: pointer.y,
    startPanX: staticPanX.value,
    startPanY: staticPanY.value,
  }
  staticDragging.value = true
}

function beginStaticPinchGesture() {
  const pointers = Array.from(staticPointers.values())

  if (pointers.length < 2) {
    return
  }

  const midpoint = getStaticPointerMidpoint(pointers[0], pointers[1])
  staticGesture = {
    type: 'pinch',
    startDistance: Math.max(1, getStaticPointerDistance(pointers[0], pointers[1])),
    startMidX: midpoint.x,
    startMidY: midpoint.y,
    startPanX: staticPanX.value,
    startPanY: staticPanY.value,
    startZoom: staticZoom.value,
    startCanvasZoom: Math.max(0.001, staticDisplayCanvasZoom.value),
  }
  staticDragging.value = true
}

function handleStaticPointerDown(event: PointerEvent) {
  if (event.button !== 0 && event.pointerType === 'mouse') {
    return
  }

  event.preventDefault()
  clearStaticZoomCommit()
  const pointer = getStaticLocalPoint(event.clientX, event.clientY)
  staticPointers.set(event.pointerId, pointer)
  viewerShellRef.value?.setPointerCapture(event.pointerId)

  if (staticPointers.size >= 2) {
    beginStaticPinchGesture()
    return
  }

  beginStaticPanGesture(event.pointerId, pointer)
}

function handleStaticPointerMove(event: PointerEvent) {
  if (!staticPointers.has(event.pointerId)) {
    return
  }

  event.preventDefault()
  const pointer = getStaticLocalPoint(event.clientX, event.clientY)
  staticPointers.set(event.pointerId, pointer)

  if (staticGesture?.type === 'pinch') {
    const pointers = Array.from(staticPointers.values())

    if (pointers.length < 2) {
      return
    }

    const distance = Math.max(1, getStaticPointerDistance(pointers[0], pointers[1]))
    const midpoint = getStaticPointerMidpoint(pointers[0], pointers[1])
    const nextStaticZoom = normalizeStaticZoom(staticGesture.startZoom * distance / staticGesture.startDistance)
    const nextCanvasZoom = Math.max(0.001, staticFitZoom.value * nextStaticZoom)
    const contentX = (staticGesture.startMidX - staticGesture.startPanX) / staticGesture.startCanvasZoom
    const contentY = (staticGesture.startMidY - staticGesture.startPanY) / staticGesture.startCanvasZoom

    staticZoom.value = nextStaticZoom
    staticPanX.value = midpoint.x - contentX * nextCanvasZoom
    staticPanY.value = midpoint.y - contentY * nextCanvasZoom
    return
  }

  if (staticGesture?.type === 'pan' && staticGesture.pointerId === event.pointerId) {
    staticPanX.value = staticGesture.startPanX + pointer.x - staticGesture.startX
    staticPanY.value = staticGesture.startPanY + pointer.y - staticGesture.startY
  }
}

function finishStaticPointer(event: PointerEvent) {
  if (!staticPointers.has(event.pointerId)) {
    return
  }

  viewerShellRef.value?.releasePointerCapture(event.pointerId)
  staticPointers.delete(event.pointerId)

  const remainingPointers = Array.from(staticPointers.entries())

  if (remainingPointers.length >= 2) {
    beginStaticPinchGesture()
    return
  }

  if (remainingPointers.length === 1) {
    beginStaticPanGesture(remainingPointers[0][0], remainingPointers[0][1])
    return
  }

  resetStaticGesture()
  scheduleStaticZoomCommit(0)
}

function handleStaticWheel(event: WheelEvent) {
  event.preventDefault()
  const deltaY = normalizeWheelDeltaY(event)

  if (event.ctrlKey || event.metaKey) {
    const zoomFactor = Math.exp(-deltaY * 0.0015)
    setStaticZoomAt(event.clientX, event.clientY, staticZoom.value * zoomFactor)
    scheduleStaticZoomCommit()
    return
  }

  staticPanX.value -= event.deltaX
  staticPanY.value -= deltaY
}

function handleViewerWheel(event: WheelEvent) {
  if (chartRenderMode.value === 'static') {
    handleStaticWheel(event)
    return
  }

  handleChartWheel(event)
}

function handleViewerPointerDown(event: PointerEvent) {
  if (chartRenderMode.value === 'static') {
    handleStaticPointerDown(event)
    return
  }

  handleChartPointerDown(event)
}

function handleViewerPointerMove(event: PointerEvent) {
  if (chartRenderMode.value === 'static') {
    handleStaticPointerMove(event)
    return
  }

  handleChartPointerMove(event)
}

function finishViewerPointer(event: PointerEvent) {
  if (chartRenderMode.value === 'static') {
    finishStaticPointer(event)
    return
  }

  finishChartPointer(event)
}

function updateDynamicChartEnabled(enabled: boolean) {
  if (enabled === dynamicChartEnabled.value) {
    return
  }

  if (!enabled) {
    stopPlayback()
    annotationModeEnabled.value = false
    annotationSelectedNoteKey.value = null
    chartRenderMode.value = 'static'
    resetStaticViewport()
    return
  }

  clearStaticZoomCommit()
  resetStaticGesture()
  chartRenderMode.value = 'realtime'
}

function updateAnnotationMode(enabled: boolean) {
  if (enabled === annotationModeEnabled.value) {
    return
  }

  if (enabled && !annotationModeAvailable.value) {
    showPlaybackNotice('批注模式仅支持 Drum 动态谱面')
    return
  }

  stopPlayback()
  annotationModeEnabled.value = enabled
  annotationSelectedNoteKey.value = null
}

function handleAnnotationSelectNote(noteKey: string) {
  if (!annotationModeActive.value) {
    return
  }

  annotationSelectedNoteKey.value = noteKey
}

function setSelectedAnnotation(value: DtxHandAnnotation) {
  const noteKey = annotationSelectedNoteKey.value

  if (!noteKey) {
    return
  }

  chartAnnotations.value = {
    ...chartAnnotations.value,
    [noteKey]: value,
  }
  writeStoredAnnotations()
}

function clearSelectedAnnotation() {
  const noteKey = annotationSelectedNoteKey.value

  if (!noteKey || !chartAnnotations.value[noteKey]) {
    return
  }

  const nextAnnotations = { ...chartAnnotations.value }
  Reflect.deleteProperty(nextAnnotations, noteKey)
  chartAnnotations.value = nextAnnotations
  writeStoredAnnotations()
}

function setPlaybackBookmark() {
  if (!preview.value || chartRenderMode.value !== 'realtime' || dtxDurationSeconds.value <= 0) {
    return
  }

  const settingOutPoint = playbackBookmarks.value.length === 1
  const bookmark = Math.min(dtxDurationSeconds.value, Math.max(0, playbackTimeSeconds.value))

  if (settingOutPoint && !resolvePlaybackLoopRange([...playbackBookmarks.value, bookmark])) {
    showPlaybackNotice('请移动播放位置后再设置 B 点')
    return
  }

  playbackBookmarks.value = settingOutPoint ? [...playbackBookmarks.value, bookmark] : [bookmark]
  showPlaybackNotice(settingOutPoint ? '已标记出点' : '已标记入点')
}

async function exportAnnotationsImage() {
  const currentPreview = preview.value
  const exportStage = annotationExportStageRef.value
  const exportCanvas = annotationExportCanvasRef.value
  const range = playbackLoopRange.value

  if (annotationExporting.value || !currentPreview || !exportStage || !exportCanvas || !range) {
    return
  }

  annotationExporting.value = true

  try {
    const { startTime, endTime } = range
    annotationExportCoverSrc.value = await resolveImageSourceForExport(
      song.value?.heroImageUrl ?? null,
      song.value?.heroImageCacheKey ?? undefined,
    )

    await nextTick()

    renderDtxAnnotationExportCanvas(
      exportCanvas,
      prepareDtxRealtimeData(currentPreview.dtxJson),
      currentPreview.drawingConfig,
      {
        annotations: chartAnnotations.value,
        endTime,
        reverse: realtimeReverse.value,
        startTime,
        width: ANNOTATION_EXPORT_CANVAS_WIDTH,
      },
    )

    const result = await exportElementAsImage(
      exportStage,
      `chart_annotation_${currentPreview.chart.musicId}_${selectedLevelKey.value}_${Math.round(startTime * 1000)}-${Math.round(endTime * 1000)}`,
      { format: 'png', scale: 2 },
    )

    showPlaybackNotice(result.uri ? '批注截图已保存' : '批注截图已下载')
  } catch {
    showPlaybackNotice('批注截图导出失败')
  } finally {
    annotationExporting.value = false
  }
}

async function updateAudioTrackEnabled(enabled: boolean) {
  const currentPreview = preview.value

  if (
    enabled === audioTrackEnabled.value
    || audioLoading.value
    || (enabled && !currentPreview?.chart.audioUrl)
  ) {
    return
  }

  const shouldResume = playing.value
  const currentTime = loadedChartAudio?.currentTime ?? playbackTimeSeconds.value
  const currentSequence = loadSequence

  stopPlayback()
  audioLoadSequence += 1
  audioLoading.value = false
  releaseLoadedChartAudio()
  audioTrackEnabled.value = enabled
  writeStoredAudioTrackEnabled(enabled)
  setPlaybackTime(currentTime)

  if (enabled && currentPreview) {
    await prepareChartAudio(currentPreview, currentSequence)
  }

  if (shouldResume && currentSequence === loadSequence) {
    void startPlayback()
  }
}

function setPlaybackTime(time: number) {
  const duration = timelineDurationSeconds.value
  playbackTimeSeconds.value = duration > 0
    ? Math.min(duration, Math.max(0, time))
    : 0
}

function seekViewerTime(time: number) {
  setPlaybackTime(time)

  if (loadedChartAudio) {
    loadedChartAudio.seek(playbackTimeSeconds.value)
  }

  if (playing.value && !loadedChartAudio) {
    playbackStartedAt = performance.now()
    playbackStartedTime = playbackTimeSeconds.value
  }
}

function seekViewerProgress(progress: number) {
  seekViewerTime(timelineDurationSeconds.value * Math.min(1, Math.max(0, progress)))
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

function seekViewerByPixelDelta(deltaY: number, startTime = playbackTimeSeconds.value) {
  if (timelineDurationSeconds.value <= 0) {
    return
  }

  const direction = realtimeReverse.value ? 1 : -1
  seekViewerTime(startTime + direction * deltaY / getChartPixelsPerSecond())
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
  resumeAfterChartSeek = playing.value

  if (resumeAfterChartSeek) {
    stopPlayback()
  }

  dynamicDragging.value = true
  activeChartPointerId = event.pointerId
  chartDragStartY = event.clientY
  chartDragStartTime = playbackTimeSeconds.value
  viewerShellRef.value?.setPointerCapture(event.pointerId)
}

function handleChartPointerMove(event: PointerEvent) {
  if (activeChartPointerId !== event.pointerId) {
    return
  }

  event.preventDefault()
  seekViewerByPixelDelta(event.clientY - chartDragStartY, chartDragStartTime)
}

function finishChartPointer(event: PointerEvent) {
  if (activeChartPointerId !== event.pointerId) {
    return
  }

  viewerShellRef.value?.releasePointerCapture(event.pointerId)
  activeChartPointerId = null
  dynamicDragging.value = false

  if (resumeAfterChartSeek) {
    resumeAfterChartSeek = false
    void startPlayback()
  }
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
  resumeAfterProgressSeek = playing.value

  if (resumeAfterProgressSeek) {
    stopPlayback()
  }

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

  if (resumeAfterProgressSeek) {
    resumeAfterProgressSeek = false
    void startPlayback()
  }
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
  playbackRequestSequence += 1
  audioPlaybackPending.value = false

  if (loadedChartAudio) {
    loadedChartAudio.pause()
    setPlaybackTime(loadedChartAudio.currentTime)
  }

  playing.value = false
  playbackStartedAt = 0
  playbackStartedTime = 0
  if (playbackFrame) {
    window.cancelAnimationFrame(playbackFrame)
    playbackFrame = 0
  }
}

function restartPlaybackLoopIfNeeded() {
  const loopTime = resolvePlaybackLoopSeekTime(
    playbackTimeSeconds.value,
    playbackLoopRange.value,
  )

  if (loopTime === null) {
    return false
  }

  stopPlayback()
  seekViewerTime(loopTime)
  void startPlayback()
  return true
}

function runPlayback(timestamp: number) {
  if (!playing.value) {
    return
  }

  const duration = timelineDurationSeconds.value

  if (!preview.value || duration <= 0) {
    stopPlayback()
    return
  }

  if (loadedChartAudio) {
    setPlaybackTime(loadedChartAudio.currentTime)

    if (restartPlaybackLoopIfNeeded()) {
      return
    }

    if (playbackTimeSeconds.value >= duration) {
      setPlaybackTime(duration)
      stopPlayback()
      return
    }

    playbackFrame = window.requestAnimationFrame(runPlayback)
    return
  }

  if (!playbackStartedAt) {
    playbackStartedAt = timestamp
    playbackStartedTime = playbackTimeSeconds.value
  }

  const elapsedSeconds = Math.max(0, (timestamp - playbackStartedAt) / 1000)
  const nextTime = Math.min(duration, playbackStartedTime + elapsedSeconds)
  setPlaybackTime(nextTime)

  if (restartPlaybackLoopIfNeeded()) {
    return
  }

  if (nextTime >= duration) {
    setPlaybackTime(duration)
    stopPlayback()
    return
  }

  playbackFrame = window.requestAnimationFrame(runPlayback)
}

async function startPlayback() {
  if (playbackDisabled.value) {
    return
  }

  const duration = timelineDurationSeconds.value

  if (duration <= 0) {
    return
  }

  const loopTime = resolvePlaybackLoopSeekTime(
    playbackTimeSeconds.value,
    playbackLoopRange.value,
  )

  if (loopTime !== null) {
    seekViewerTime(loopTime)
  } else if (playbackTimeSeconds.value >= duration - 0.01) {
    seekViewerTime(0)
  }

  settingsPanelOpen.value = false
  audioPlaybackPending.value = true
  const currentPlaybackRequest = ++playbackRequestSequence
  const currentAudio = loadedChartAudio
  const currentSequence = loadSequence

  if (currentAudio) {
    try {
      await currentAudio.play()

      if (
        currentPlaybackRequest !== playbackRequestSequence
        || currentSequence !== loadSequence
        || currentAudio !== loadedChartAudio
        || !audioTrackEnabled.value
      ) {
        currentAudio.pause()
        return
      }
    } catch {
      if (
        currentPlaybackRequest !== playbackRequestSequence
        || currentSequence !== loadSequence
        || currentAudio !== loadedChartAudio
      ) {
        return
      }

      const currentTime = playbackTimeSeconds.value
      releaseLoadedChartAudio()
      audioTrackEnabled.value = false
      setPlaybackTime(currentTime)
      showPlaybackNotice('音频播放失败，已切换为无声播放')
    }
  }

  if (currentPlaybackRequest !== playbackRequestSequence) {
    return
  }

  audioPlaybackPending.value = false
  playing.value = true
  playbackStartedAt = 0
  playbackStartedTime = playbackTimeSeconds.value
  playbackFrame = window.requestAnimationFrame(runPlayback)
}

function togglePlayback() {
  if (playing.value) {
    stopPlayback()
    return
  }

  void startPlayback()
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
  viewerShellRef,
  (element, _previousElement, onCleanup) => {
    viewerResizeObserver?.disconnect()
    viewerResizeObserver = null

    if (!element) {
      updateViewerShellSize()
      return
    }

    updateViewerShellSize()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(updateViewerShellSize)
    observer.observe(element)
    viewerResizeObserver = observer

    onCleanup(() => {
      observer.disconnect()

      if (viewerResizeObserver === observer) {
        viewerResizeObserver = null
      }
    })
  },
  { immediate: true },
)

watch(
  () => [
    route.params.musicId,
    route.query.instrument,
    route.query.level,
    route.query.version,
    route.query.speed,
    route.query.scale,
    route.query.barsPerColumn,
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

function pausePlaybackForBackground() {
  resumeAfterProgressSeek = false
  resumeAfterChartSeek = false
  stopPlayback()
}

function handleDocumentVisibilityChange() {
  if (document.hidden) {
    pausePlaybackForBackground()
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleDocumentVisibilityChange)
  void App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      pausePlaybackForBackground()
    }
  }).then((listener) => {
    if (viewUnmounted) {
      void listener.remove()
      return
    }

    appStateChangeListener = listener
  }).catch(() => {})
})

onBeforeUnmount(() => {
  viewUnmounted = true
  loadSequence += 1
  stopPlayback()
  releaseLoadedChartAudio()
  stopRafDebugMonitor()
  clearStaticZoomCommit()
  clearPlaybackNoticeTimer()
  resetStaticGesture()
  document.removeEventListener('visibilitychange', handleDocumentVisibilityChange)
  void appStateChangeListener?.remove()
  appStateChangeListener = null
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
        :class="{
          'chart-preview__viewer-shell--dragging': chartDragging,
          'chart-preview__viewer-shell--static': chartRenderMode === 'static',
        }"
        aria-label="谱面画布"
        @pointercancel="finishViewerPointer"
        @pointerdown="handleViewerPointerDown"
        @pointermove="handleViewerPointerMove"
        @pointerup="finishViewerPointer"
        @wheel="handleViewerWheel"
      >
        <div
          v-if="chartRenderMode === 'static'"
          class="chart-preview__static-stage"
        >
          <div class="chart-preview__static-stack" :style="staticStackStyle">
            <DtxChartCanvas
              v-for="(canvasData, canvasIndex) in preview.canvasData"
              :key="`${preview.chart.url}-${canvasIndex}`"
              :canvas-data="canvasData"
              :zoom="staticCanvasZoom"
            />
          </div>
        </div>
        <DtxRealtimeCanvas
          v-else
          :annotation-mode="annotationModeActive"
          :annotations="annotationDisplayActive ? chartAnnotations : undefined"
          :bookmark-times="visiblePlaybackBookmarks"
          :drawing-config="preview.drawingConfig"
          :dtx-json="preview.dtxJson"
          :progress="chartPlaybackProgress"
          :reverse="realtimeReverse"
          :selected-note-key="annotationSelectedNoteKey"
          @select-note="handleAnnotationSelectNote"
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
              :title="level.hasAudio ? '支持音轨' : undefined"
              @click="updateSelection(selectedInstrumentKey, level.key)"
            >
              <span>{{ level.label }}</span>
              <small>{{ level.difficultyText }}</small>
              <svg
                v-if="level.hasAudio"
                class="chart-preview__level-audio-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M11 5L6.5 9H3v6h3.5l4.5 4V5Z"></path>
                <path d="M15 9a4 4 0 010 6"></path>
                <path d="M18 6a8 8 0 010 12"></path>
              </svg>
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
            <span>每列小节</span>
            <div
              class="chart-preview__speed-stepper"
              :class="{ 'chart-preview__speed-stepper--disabled': !canAdjustBarsPerColumn }"
            >
              <button
                class="chart-preview__speed-button"
                type="button"
                :disabled="!canDecreaseBarsPerColumn"
                aria-label="减少每列小节"
                @click="adjustBarsPerColumn(-BARS_PER_COLUMN_STEP)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15 5L8 12L15 19"></path>
                </svg>
              </button>
              <div class="chart-preview__speed-value" aria-live="polite">
                {{ selectedBarsPerColumn }}
              </div>
              <button
                class="chart-preview__speed-button"
                type="button"
                :disabled="!canIncreaseBarsPerColumn"
                aria-label="增加每列小节"
                @click="adjustBarsPerColumn(BARS_PER_COLUMN_STEP)"
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

        <div class="chart-preview__panel-row chart-preview__panel-row--mode-dynamic">
          <div class="chart-preview__panel-section chart-preview__panel-section--mode">
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

          <div class="chart-preview__panel-section">
            <span>播放音轨</span>
            <button
              class="chart-preview__reverse-toggle"
              type="button"
              role="switch"
              :aria-checked="audioTrackEnabled"
              :aria-busy="audioLoading"
              :disabled="!audioTrackAvailable || audioLoading || audioPlaybackPending"
              @click="updateAudioTrackEnabled(!audioTrackEnabled)"
            >
              <span class="chart-preview__reverse-toggle-track">
                <span class="chart-preview__reverse-toggle-thumb"></span>
              </span>
            </button>
          </div>

          <div class="chart-preview__panel-section">
            <span>动态谱面</span>
            <button
              class="chart-preview__reverse-toggle"
              type="button"
              role="switch"
              :aria-checked="dynamicChartEnabled"
              @click="updateDynamicChartEnabled(!dynamicChartEnabled)"
            >
              <span class="chart-preview__reverse-toggle-track">
                <span class="chart-preview__reverse-toggle-thumb"></span>
              </span>
            </button>
          </div>
        </div>

        <div class="chart-preview__panel-section">
          <span>批注模式</span>
          <button
            class="chart-preview__reverse-toggle chart-preview__reverse-toggle--inline"
            type="button"
            role="switch"
            :aria-checked="annotationModeActive"
            :disabled="!annotationModeAvailable"
            @click="updateAnnotationMode(!annotationModeActive)"
          >
            <span class="chart-preview__reverse-toggle-track">
              <span class="chart-preview__reverse-toggle-thumb"></span>
            </span>
          </button>
        </div>

        <div class="chart-preview__panel-section">
          <span>显示批注</span>
          <button
            class="chart-preview__reverse-toggle chart-preview__reverse-toggle--inline"
            type="button"
            role="switch"
            :aria-checked="annotationDisplayActive"
            :disabled="selectedInstrumentKey !== 'drum'"
            @click="showAnnotations = annotationModeActive ? true : !showAnnotations"
          >
            <span class="chart-preview__reverse-toggle-track">
              <span class="chart-preview__reverse-toggle-thumb"></span>
            </span>
          </button>
        </div>

        <div class="chart-preview__panel-section">
          <span>导出批注</span>
          <button
            class="chart-preview__export-annotation-button"
            type="button"
            :disabled="!canExportAnnotations || annotationExporting"
            aria-label="导出批注截图"
            @click="exportAnnotationsImage"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3V15"></path>
              <path d="M7 10L12 15L17 10"></path>
              <path d="M5 20H19"></path>
            </svg>
          </button>
        </div>
      </section>
    </Transition>

    <Transition name="chart-preview-notice">
      <div v-if="playbackNotice" class="chart-preview__playback-notice" role="status">
        {{ playbackNotice }}
      </div>
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
        <span class="chart-preview__progress-track" aria-hidden="true">
          <span
            v-for="segment in annotationProgressSegments"
            :key="segment.barNumber"
            class="chart-preview__progress-annotation"
            :style="{ left: segment.left, width: segment.width }"
          ></span>
          <span
            v-for="marker in playbackBookmarkMarkers"
            :key="marker.index"
            class="chart-preview__progress-bookmark"
            :style="{ left: marker.left }"
          ></span>
        </span>
        <span
          class="chart-preview__progress-thumb"
          :style="{ left: progressThumbLeft }"
          aria-hidden="true"
        ></span>
      </div>

      <div
        class="chart-preview__player-inner"
        :class="{ 'chart-preview__player-inner--annotation': annotationModeActive }"
      >
        <div class="chart-preview__time">
          <span class="chart-preview__time-value">{{ playerProgressStartLabel }}</span>
          <button
            class="chart-preview__time-bookmark"
            type="button"
            :disabled="!preview || timelineDurationSeconds <= 0 || chartRenderMode === 'static'"
            :aria-label="playbackBookmarkButtonLabel"
            @click="setPlaybackBookmark"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 4H18V21L12 17L6 21V4Z"></path>
            </svg>
          </button>
          <span class="chart-preview__time-value">{{ playerProgressEndLabel }}</span>
        </div>
        <div v-if="annotationModeActive" class="chart-preview__annotation-controls">
          <button
            class="chart-preview__annotation-button chart-preview__annotation-button--left"
            type="button"
            :class="{ 'chart-preview__annotation-button--active': selectedAnnotationValue === 'L' }"
            :disabled="!annotationSelectedNoteKey"
            aria-label="标记左手"
            @click="setSelectedAnnotation('L')"
          >
            L
          </button>
          <button
            class="chart-preview__annotation-button chart-preview__annotation-button--right"
            type="button"
            :class="{ 'chart-preview__annotation-button--active': selectedAnnotationValue === 'R' }"
            :disabled="!annotationSelectedNoteKey"
            aria-label="标记右手"
            @click="setSelectedAnnotation('R')"
          >
            R
          </button>
          <button
            class="chart-preview__annotation-button chart-preview__annotation-button--clear"
            type="button"
            :disabled="!selectedAnnotationValue"
            aria-label="清除手序标记"
            @click="clearSelectedAnnotation"
          >
            ×
          </button>
        </div>
        <button
          v-else
          class="chart-preview__play-button"
          :class="{ 'chart-preview__play-button--loading': audioLoading }"
          type="button"
          :disabled="playbackDisabled"
          :aria-label="audioLoading ? '正在加载音轨' : playing ? '暂停播放' : '播放谱面'"
          @click="togglePlayback"
        >
          <span v-if="audioLoading" class="chart-preview__audio-spinner" aria-hidden="true"></span>
          <img v-else :src="playing ? pauseIconSrc : playIconSrc" alt="" aria-hidden="true" />
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

    <div class="chart-preview__annotation-export-stage" aria-hidden="true">
      <div ref="annotationExportStageRef" class="chart-preview__annotation-export-card">
        <canvas ref="annotationExportCanvasRef" class="chart-preview__annotation-export-canvas"></canvas>
        <header class="chart-preview__annotation-export-header">
          <div class="chart-preview__annotation-export-copy">
            <h1>{{ song?.displayTitle || '' }}</h1>
            <div class="chart-preview__annotation-export-meta">
              <span class="chart-preview__annotation-export-instrument">
                {{ INSTRUMENT_LABELS[selectedInstrumentKey] }}
              </span>
              <span
                class="chart-preview__annotation-export-difficulty"
                :class="`chart-preview__annotation-export-difficulty--${selectedLevelKey}`"
              >
                {{ LEVEL_LABELS[selectedLevelKey] }}
              </span>
              <strong
                class="chart-preview__annotation-export-level"
                :class="`chart-preview__annotation-export-level--${selectedLevelKey}`"
              >
                {{ annotationExportDifficultyText }}
              </strong>
            </div>
            <p class="chart-preview__annotation-export-author">
              由 <strong>{{ annotationExportAuthorName }}</strong> 制作
              <time>{{ annotationExportDateText }}</time>
            </p>
          </div>
          <div class="chart-preview__annotation-export-cover">
            <img v-if="annotationExportCoverSrc" :src="annotationExportCoverSrc" alt="" />
          </div>
        </header>
      </div>
    </div>
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

.chart-preview__viewer-shell--static {
  cursor: grab;
}

.chart-preview__static-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #000000;
}

.chart-preview__static-stack {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
  line-height: 0;
  transform-origin: 0 0;
  will-change: transform;
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

.chart-preview__playback-notice {
  position: fixed;
  right: 16px;
  bottom: calc(var(--note-player-height) + 14px);
  left: 16px;
  z-index: 48;
  width: fit-content;
  max-width: calc(100% - 32px);
  margin: 0 auto;
  padding: 9px 13px;
  border-radius: 6px;
  background: rgba(35, 29, 48, 0.94);
  color: #ffffff;
  font-size: 0.78rem;
  line-height: 1.35;
  text-align: center;
}

.chart-preview-notice-enter-active,
.chart-preview-notice-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.chart-preview-notice-enter-from,
.chart-preview-notice-leave-to {
  opacity: 0;
  transform: translateY(6px);
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

.chart-preview__player-inner--annotation {
  grid-template-columns: 1fr 136px 1fr;
}

.chart-preview__time {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  justify-self: start;
  color: #27213d;
  font-family: var(--font-figma-title);
  font-size: 14px;
  font-weight: 400;
  white-space: nowrap;
}

.chart-preview__time-value {
  display: inline-block;
  width: 5ch;
  font-feature-settings: 'tnum' 1;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.chart-preview__player-inner--annotation .chart-preview__time-value {
  width: 3ch;
}

.chart-preview__time-bookmark {
  display: inline-grid;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--note-purple);
  cursor: pointer;
}

.chart-preview__time-bookmark svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.chart-preview__time-bookmark:active {
  background: rgba(75, 59, 118, 0.12);
}

.chart-preview__time-bookmark:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}

.chart-preview__time-bookmark:disabled {
  cursor: default;
  opacity: 0.36;
}

.chart-preview__annotation-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  transform: translateX(10px);
}

.chart-preview__annotation-button {
  display: inline-grid;
  width: 40px;
  height: 40px;
  place-items: center;
  padding: 0;
  border: 2px solid rgba(75, 59, 118, 0.24);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.58);
  color: var(--note-purple);
  font-family: var(--font-figma-title);
  font-size: 17px;
  font-weight: 700;
}

.chart-preview__annotation-button--left.chart-preview__annotation-button--active {
  border-color: #5d74ff;
  background: #5d74ff;
  color: #ffffff;
}

.chart-preview__annotation-button--right.chart-preview__annotation-button--active {
  border-color: #ff5f9b;
  background: #ff5f9b;
  color: #ffffff;
}

.chart-preview__annotation-button--clear {
  font-size: 22px;
  line-height: 1;
}

.chart-preview__annotation-button:disabled {
  cursor: default;
  opacity: 0.36;
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

.chart-preview__play-button:disabled {
  cursor: default;
  opacity: 0.36;
}

.chart-preview__play-button:disabled img {
  filter: grayscale(1);
}

.chart-preview__play-button--loading:disabled {
  opacity: 1;
}

.chart-preview__audio-spinner {
  width: 25px;
  height: 25px;
  border: 3px solid rgba(75, 59, 118, 0.2);
  border-top-color: var(--note-purple);
  border-radius: 50%;
  animation: chartPreviewAudioSpin 0.7s linear infinite;
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
  overflow: hidden;
  height: 14px;
  background: var(--note-purple);
  transform: translateY(-50%);
}

.chart-preview__progress-annotation {
  position: absolute;
  top: 0;
  bottom: 0;
  background: #f4d24d;
}

.chart-preview__progress-bookmark {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 1;
  width: 2px;
  background: #e3374f;
  transform: translateX(-50%);
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  width: var(--note-player-width);
  margin: 0 auto;
  padding: 18px 20px 20px;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  background: #e8e1f6;
  box-shadow: 0 -14px 30px rgba(55, 43, 89, 0.22);
}

.chart-preview__settings-panel > .chart-preview__panel-row,
.chart-preview__settings-panel > .chart-preview__panel-section {
  grid-column: 1 / -1;
}

.chart-preview__settings-panel > .chart-preview__panel-section:nth-last-child(3) {
  grid-column: 1;
}

.chart-preview__settings-panel > .chart-preview__panel-section:nth-last-child(2) {
  grid-column: 2;
}

.chart-preview__settings-panel > .chart-preview__panel-section:last-child {
  grid-column: 3;
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
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 70px;
  gap: 8px;
  align-items: end;
}

.chart-preview__panel-row--mode-dynamic {
  grid-template-columns: minmax(0, 1fr) 70px 70px;
  gap: 8px;
  align-items: end;
}

.chart-preview__panel-section--mode {
  min-width: 0;
}

.chart-preview__panel-section--mode .chart-preview__panel-grid--two {
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
  position: relative;
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

.chart-preview__level-audio-icon {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 13px;
  height: 13px;
  fill: currentColor;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
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
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  align-items: stretch;
  min-height: 44px;
  overflow: hidden;
  border: 1px solid rgba(75, 59, 118, 0.24);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.58);
}

.chart-preview__speed-stepper--disabled {
  border-color: rgba(120, 111, 139, 0.12);
  background: rgba(217, 211, 224, 0.44);
  color: #9a93a9;
}

.chart-preview__speed-stepper--disabled .chart-preview__speed-value,
.chart-preview__speed-stepper--disabled .chart-preview__speed-button {
  color: #9a93a9;
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

.chart-preview__reverse-toggle--inline {
  transform: translateX(-6px);
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

.chart-preview__export-annotation-button {
  display: grid;
  place-items: center;
  min-height: 44px;
  padding: 0;
  border: 1px solid rgba(75, 59, 118, 0.24);
  border-radius: 8px;
  background: var(--note-purple);
  color: #ffffff;
}

.chart-preview__export-annotation-button svg {
  width: 23px;
  height: 23px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.chart-preview__export-annotation-button:disabled {
  background: rgba(217, 211, 224, 0.44);
  color: #9a93a9;
}

.chart-preview__annotation-export-stage {
  position: fixed;
  top: 0;
  left: -10000px;
  z-index: -1;
  pointer-events: none;
}

.chart-preview__annotation-export-card {
  width: 402px;
  background: #f4f1f8;
  color: #27213d;
  font-family: var(--font-figma-title);
}

.chart-preview__annotation-export-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px;
  gap: 16px;
  align-items: stretch;
  padding: 20px 20px 16px;
}

.chart-preview__annotation-export-copy {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.chart-preview__annotation-export-header h1,
.chart-preview__annotation-export-header p {
  margin: 0;
}

.chart-preview__annotation-export-header h1 {
  color: var(--note-purple);
  font-size: 24px;
  line-height: 1.08;
}

.chart-preview__annotation-export-meta {
  display: grid;
  grid-template-columns: repeat(3, max-content);
  gap: 14px;
  align-items: center;
}

.chart-preview__annotation-export-instrument,
.chart-preview__annotation-export-difficulty,
.chart-preview__annotation-export-level {
  display: inline-grid;
  min-height: 28px;
  place-items: center;
  padding: 0 10px 2px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1;
}

.chart-preview__annotation-export-instrument {
  background: rgba(75, 59, 118, 0.12);
  color: var(--note-purple);
  font-size: 14px;
  font-weight: 700;
}

.chart-preview__annotation-export-difficulty,
.chart-preview__annotation-export-level {
  border: 1px solid currentColor;
}

.chart-preview__annotation-export-difficulty--basic,
.chart-preview__annotation-export-level--basic {
  background: #e6f6eb;
  color: #23894b;
}

.chart-preview__annotation-export-difficulty--advanced,
.chart-preview__annotation-export-level--advanced {
  background: #fff4d6;
  color: #b97a00;
}

.chart-preview__annotation-export-difficulty--extreme,
.chart-preview__annotation-export-level--extreme {
  background: #fde7e9;
  color: #cb3c4a;
}

.chart-preview__annotation-export-difficulty--master,
.chart-preview__annotation-export-level--master {
  background: #f0e5fa;
  color: #7f43ad;
}

.chart-preview__annotation-export-author {
  color: rgba(39, 33, 61, 0.7);
  font-size: 12px;
  line-height: 1.4;
}

.chart-preview__annotation-export-author strong {
  color: var(--note-purple);
  font-weight: 700;
}

.chart-preview__annotation-export-author time {
  margin-left: 10px;
}

.chart-preview__annotation-export-cover {
  position: relative;
  min-height: 0;
  overflow: hidden;
  border-radius: 6px;
  background: rgba(75, 59, 118, 0.1);
}

.chart-preview__annotation-export-cover img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chart-preview__annotation-export-canvas {
  display: block;
  width: 402px;
  background: #000000;
}

@keyframes chartPreviewAudioSpin {
  to {
    transform: rotate(360deg);
  }
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

@media (max-width: 340px) {
  .chart-preview__player-inner--annotation {
    grid-template-columns: 1fr 112px 1fr;
  }

  .chart-preview__annotation-controls {
    gap: 4px;
  }

  .chart-preview__annotation-button {
    width: 34px;
    height: 34px;
  }
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
