<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import DifficultyRangeSlider from '../components/DifficultyRangeSlider.vue'
import EmptyState from '../components/EmptyState.vue'
import SongCard from '../components/SongCard.vue'
import settingsIconSrc from '../assets/search-bar/settings.svg'
import bassModeToggleSrc from '../assets/songlist-toggle/bass-mode.svg'
import drumModeToggleSrc from '../assets/songlist-toggle/drum-mode.svg'
import guitarModeToggleSrc from '../assets/songlist-toggle/guitar-mode.svg'
import { loadBjmaniaSkillSnapshotCache } from '../lib/bjmania/cache'
import {
  filterScoresByFamily,
  mapBestScoresToList,
} from '../lib/bjmania/client'
import { preloadCoverImages, preloadCoverImagesNow } from '../lib/cover-preload'
import { useDebugMode } from '../lib/debug-mode'
import { loadSongCatalog, onSongCatalogUpdated } from '../lib/song-catalog'
import { favoriteMusicIds } from '../lib/song-favorites'
import { useElementScale } from '../lib/use-element-scale'
import { useWindowVirtualList } from '../lib/use-window-virtual-list'
import type {
  BjmaniaScoreFamily,
  BjmaniaScoreListItem,
} from '../types/bjmania'
import type { InstrumentKey, SongViewModel } from '../types/song'

type SearchSortOption =
  | 'id-asc'
  | 'id-desc'
  | 'title-asc'
  | 'title-desc'
  | 'artist-asc'
  | 'artist-desc'
  | 'difficulty-asc'
  | 'difficulty-desc'

type SearchMenu = 'version' | 'filter' | 'sort' | null
type SongCatalogFilterKey = 'current' | 'deleted' | 'favorite' | 'classic' | 'non-classic'

type SearchFilters = {
  versionOrder: number | null
  difficultyMin: number
  difficultyMax: number
}

const SEARCH_STORAGE_KEY = 'gddata:last-search'
const INSTRUMENT_GUIDE_STORAGE_KEY = 'gddata:home-instrument-guide-shown'
const VISIBLE_COVER_PRELOAD_LIMIT = 8
const SKILL_COVER_PRELOAD_LIMIT_PER_FAMILY = 8
const STARTUP_COVER_PRELOAD_TIMEOUT_MS = 2800
const SONG_CARD_WIDTH = 375
const FULL_DIFFICULTY_MIN = 0
const FULL_DIFFICULTY_MAX = 99
const DIFFICULTY_STOPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99]
const INSTRUMENT_ORDER: InstrumentKey[] = ['drum', 'guitar', 'bass']
const GF_DELTA_VERSION_ORDER = 30
const DM_DELTA_VERSION_ORDER = 29
const INSTRUMENT_LABELS: Record<InstrumentKey, string> = {
  drum: 'Drum',
  guitar: 'Guitar',
  bass: 'Bass',
}
const INSTRUMENT_TOGGLE_ASSETS: Record<InstrumentKey, string> = {
  drum: drumModeToggleSrc,
  guitar: guitarModeToggleSrc,
  bass: bassModeToggleSrc,
}
const router = useRouter()
const debugModeEnabled = useDebugMode()
const showNativeSettingsEntry = computed(() => Capacitor.getPlatform() !== 'web')
const GF_VERSION_MAP: Record<number, string> = {
  0: 'GF1st',
  1: 'GF2nd',
  2: 'GF3rd',
  3: 'GF4th',
  4: 'GF5th',
  5: 'GF6th',
  6: 'GF7th',
  7: 'GF8th',
  8: 'GF9th',
  9: 'GF10th',
  10: 'GF11th',
  11: 'V',
  12: 'V2',
  13: 'V3',
  14: 'V4',
  15: 'V5',
  16: 'V6',
  17: 'XG',
  18: 'XG2',
  19: 'XG3',
  20: 'GITADORA',
  21: 'OverDrive',
  22: 'Tri-Boost',
  23: 'Tri-Boost Re:EVOLVE',
  24: 'Matixx',
  25: 'EXCHAIN',
  26: 'NEX+AGE',
  27: 'HIGH-VOLTAGE',
  28: 'FUZZ-UP',
  29: 'GALAXY WAVE',
  30: 'GALAXY WAVE DELTA',
}
const DM_VERSION_MAP: Record<number, string> = {
  0: 'DM1st',
  1: 'DM2nd',
  2: 'DM3rd',
  3: 'DM4th',
  4: 'DM5th',
  5: 'DM6th',
  6: 'DM7th',
  7: 'DM8th',
  8: 'DM9th',
  9: 'DM10th',
  10: 'V',
  11: 'V2',
  12: 'V3',
  13: 'V4',
  14: 'V5',
  15: 'V6',
  16: 'XG',
  17: 'XG2',
  18: 'XG3',
  19: 'GITADORA',
  20: 'OverDrive',
  21: 'Tri-Boost',
  22: 'Tri-Boost Re:EVOLVE',
  23: 'Matixx',
  24: 'EXCHAIN',
  25: 'NEX+AGE',
  26: 'HIGH-VOLTAGE',
  27: 'FUZZ-UP',
  28: 'GALAXY WAVE',
  29: 'GALAXY WAVE DELTA',
}

const songs = ref<SongViewModel[]>([])
const loading = ref(true)
const errorMessage = ref('')
const showFilters = ref(false)
const openMenu = ref<SearchMenu>(null)
const topShellRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchQuery = ref(
  typeof window === 'undefined' ? '' : window.localStorage.getItem(SEARCH_STORAGE_KEY) ?? '',
)
const sortOption = ref<SearchSortOption>('id-desc')
const selectedInstrument = ref<InstrumentKey>('drum')
const selectedCatalogFilter = ref<SongCatalogFilterKey>('current')
const showInstrumentGuide = ref(false)
const filters = reactive<SearchFilters>({
  versionOrder: null,
  difficultyMin: FULL_DIFFICULTY_MIN,
  difficultyMax: FULL_DIFFICULTY_MAX,
})

let stopSongCatalogUpdateListener: (() => void) | null = null

const SONG_FILTER_OPTIONS: Array<{ value: SongCatalogFilterKey; label: string }> = [
  { value: 'current', label: '现有曲目' },
  { value: 'deleted', label: '删除曲目' },
  { value: 'favorite', label: '收藏曲目' },
  { value: 'classic', label: '展示Classic曲目' },
  { value: 'non-classic', label: '隐藏Classic曲目' },
]
const sortOptions: Array<{ label: string; value: SearchSortOption }> = [
  { label: '默认-降序', value: 'id-desc' },
  { label: '默认-升序', value: 'id-asc' },
  { label: '标题-降序', value: 'title-desc' },
  { label: '标题-升序', value: 'title-asc' },
  { label: '艺术家-降序', value: 'artist-desc' },
  { label: '艺术家-升序', value: 'artist-asc' },
  { label: 'MAS难度-降序', value: 'difficulty-desc' },
  { label: 'MAS难度-升序', value: 'difficulty-asc' },
]

function sortDefaultSkillRows(rows: BjmaniaScoreListItem[]) {
  return rows
    .filter((row) => !row.isDeleted)
    .slice()
    .sort((left, right) => (
      right.skillCalcRaw - left.skillCalcRaw ||
      right.percRaw - left.percRaw
    ))
}

function buildCoverPreloadTargetsFromSongs(nextSongs: SongViewModel[], limit: number) {
  return nextSongs.slice(0, limit).map((song) => ({
    src: song.heroImageUrl,
    cacheKey: song.heroImageCacheKey,
  }))
}

function buildCoverPreloadTargetsFromSkillRows(rows: BjmaniaScoreListItem[], family: BjmaniaScoreFamily) {
  return sortDefaultSkillRows(filterScoresByFamily(rows, family))
    .slice(0, SKILL_COVER_PRELOAD_LIMIT_PER_FAMILY)
    .map((row) => ({
      src: row.song?.heroImageUrl ?? null,
      cacheKey: row.song?.heroImageCacheKey ?? `${family}_${row.musicId}_${row.instrument}`,
    }))
}

function preloadVisibleSongCovers(nextSongs: SongViewModel[]) {
  preloadCoverImages(
    buildCoverPreloadTargetsFromSongs(nextSongs, VISIBLE_COVER_PRELOAD_LIMIT),
    {
      limit: VISIBLE_COVER_PRELOAD_LIMIT,
      concurrency: 2,
    },
  )
}

function preloadCachedSkillCovers(songCatalog: SongViewModel[]) {
  const cached = loadBjmaniaSkillSnapshotCache()

  if (!cached) {
    return
  }

  const rows = mapBestScoresToList(
    cached.snapshot.bestScores.bestScores,
    songCatalog,
    cached.snapshot.hotMusicIds,
  )

  preloadCoverImages(
    [
      ...buildCoverPreloadTargetsFromSkillRows(rows, 'dm'),
      ...buildCoverPreloadTargetsFromSkillRows(rows, 'gf'),
    ],
    {
      limit: SKILL_COVER_PRELOAD_LIMIT_PER_FAMILY * 2,
      concurrency: 2,
    },
  )
}

function parseVersionKey(versionKey: string) {
  const [gfRaw, dmRaw] = versionKey.split('-')
  const gfIndex = Number(gfRaw)
  const dmIndex = Number(dmRaw)

  return {
    gfIndex: Number.isFinite(gfIndex) ? gfIndex : -1,
    dmIndex: Number.isFinite(dmIndex) ? dmIndex : -1,
  }
}

function resolveInstrumentVersionLabel(versionKey: string, instrument: InstrumentKey) {
  const { gfIndex, dmIndex } = parseVersionKey(versionKey)

  if (instrument === 'drum') {
    return DM_VERSION_MAP[dmIndex] ?? 'Unknown'
  }

  return GF_VERSION_MAP[gfIndex] ?? 'Unknown'
}

function resolveInstrumentVersionOrder(versionKey: string, instrument: InstrumentKey) {
  const { gfIndex, dmIndex } = parseVersionKey(versionKey)
  return instrument === 'drum' ? dmIndex : gfIndex
}

function isDeltaVersionOrder(versionOrder: number, instrument: InstrumentKey) {
  return instrument === 'drum'
    ? versionOrder === DM_DELTA_VERSION_ORDER
    : versionOrder === GF_DELTA_VERSION_ORDER
}

function shouldHideIncompleteDeltaSong(song: SongViewModel, instrument: InstrumentKey) {
  const versionOrder = resolveInstrumentVersionOrder(song.versionKey, instrument)
  return isDeltaVersionOrder(versionOrder, instrument) && !song.links.remyUrl
}

function compareText(left: string, right: string) {
  return left.localeCompare(right)
}

function getInstrumentDifficulty(song: SongViewModel, instrumentKey: InstrumentKey) {
  return song.instruments.find((instrument) => instrument.key === instrumentKey) ?? null
}

function getSelectedInstrumentMaster(song: SongViewModel) {
  return (
    getInstrumentDifficulty(song, selectedInstrument.value)?.levels.find((level) => level.level === 'master')
      ?.difficulty ?? null
  )
}

function isFullDifficultyRange() {
  return (
    filters.difficultyMin === FULL_DIFFICULTY_MIN &&
    filters.difficultyMax === FULL_DIFFICULTY_MAX
  )
}

function matchesSelectedDifficultyRange(song: SongViewModel) {
  if (isFullDifficultyRange()) {
    return true
  }

  const selectedDifficulty = getInstrumentDifficulty(song, selectedInstrument.value)

  if (!selectedDifficulty) {
    return false
  }

  const minValue = filters.difficultyMin / 10
  const maxValue = filters.difficultyMax / 10

  return selectedDifficulty.levels.some((level) => {
    return level.available && level.difficulty !== null && level.difficulty >= minValue && level.difficulty <= maxValue
  })
}

const selectedInstrumentLabel = computed(() => INSTRUMENT_LABELS[selectedInstrument.value])
const selectedInstrumentToggleSrc = computed(() => INSTRUMENT_TOGGLE_ASSETS[selectedInstrument.value])

const displayableSongs = computed(() => {
  return songs.value.filter((song) => !shouldHideIncompleteDeltaSong(song, selectedInstrument.value))
})

const versionOptions = computed(() => {
  const uniqueVersions = new Map<number, { value: number; label: string; order: number }>()

  displayableSongs.value.forEach((song) => {
    const order = resolveInstrumentVersionOrder(song.versionKey, selectedInstrument.value)

    if (uniqueVersions.has(order)) {
      return
    }

    uniqueVersions.set(order, {
      value: order,
      label: resolveInstrumentVersionLabel(song.versionKey, selectedInstrument.value),
      order,
    })
  })

  return Array.from(uniqueVersions.values()).sort((left, right) => {
    return right.order - left.order || compareText(left.label, right.label)
  })
})

const hasActiveFilters = computed(() => {
  return filters.versionOrder !== null || selectedCatalogFilter.value !== 'current' || !isFullDifficultyRange()
})

const selectedVersionLabel = computed(() => {
  if (filters.versionOrder === null) {
    return '所有版本'
  }

  return versionOptions.value.find((option) => option.value === filters.versionOrder)?.label ?? '所有版本'
})

const selectedCatalogFilterLabel = computed(() => {
  return SONG_FILTER_OPTIONS.find((option) => option.value === selectedCatalogFilter.value)?.label ?? '现有曲目'
})

const selectedSortLabel = computed(() => {
  return sortOptions.find((option) => option.value === sortOption.value)?.label ?? '默认-降序'
})

watch(
  versionOptions,
  (options) => {
    if (filters.versionOrder !== null && !options.some((option) => option.value === filters.versionOrder)) {
      filters.versionOrder = null
    }
  },
  { immediate: true },
)

const filteredSongs = computed(() => {
  const normalizedQuery = searchQuery.value.trim().toLowerCase()

  const nextSongs = displayableSongs.value.filter((song) => {
    const matchesSearch =
      normalizedQuery.length === 0 ||
      song.searchText.includes(normalizedQuery) ||
      String(song.musicId) === normalizedQuery

    if (!matchesSearch) {
      return false
    }

    if (
      filters.versionOrder !== null &&
      resolveInstrumentVersionOrder(song.versionKey, selectedInstrument.value) !== filters.versionOrder
    ) {
      return false
    }

    switch (selectedCatalogFilter.value) {
      case 'deleted':
        if (!song.metadata.isDeleted) {
          return false
        }
        break
      case 'favorite':
        if (!favoriteMusicIds.value.has(song.musicId)) {
          return false
        }
        break
      case 'classic':
        if (!song.metadata.isClassic) {
          return false
        }
        break
      case 'non-classic':
        if (song.metadata.isClassic || song.metadata.isDeleted) {
          return false
        }
        break
      case 'current':
      default:
        if (song.metadata.isDeleted) {
          return false
        }
        break
    }

    if (!matchesSelectedDifficultyRange(song)) {
      return false
    }

    return true
  })

  return nextSongs.slice().sort((left, right) => {
    switch (sortOption.value) {
      case 'id-asc':
        return (
          resolveInstrumentVersionOrder(left.versionKey, selectedInstrument.value) -
            resolveInstrumentVersionOrder(right.versionKey, selectedInstrument.value) ||
          left.musicId - right.musicId
        )
      case 'id-desc':
        return (
          resolveInstrumentVersionOrder(right.versionKey, selectedInstrument.value) -
            resolveInstrumentVersionOrder(left.versionKey, selectedInstrument.value) ||
          Number(left.metadata.isClassic) - Number(right.metadata.isClassic) ||
          right.musicId - left.musicId
        )
      case 'title-asc':
        return (
          left.sortKeys.titleAsciiOrder - right.sortKeys.titleAsciiOrder ||
          compareText(left.displayTitle, right.displayTitle)
        )
      case 'title-desc':
        return (
          right.sortKeys.titleAsciiOrder - left.sortKeys.titleAsciiOrder ||
          compareText(left.displayTitle, right.displayTitle)
        )
      case 'artist-asc':
        return (
          left.sortKeys.artistAsciiOrder - right.sortKeys.artistAsciiOrder ||
          compareText(left.displayArtist, right.displayArtist)
        )
      case 'artist-desc':
        return (
          right.sortKeys.artistAsciiOrder - left.sortKeys.artistAsciiOrder ||
          compareText(left.displayArtist, right.displayArtist)
        )
      case 'difficulty-asc':
        return (
          compareMasterDifficulty(left, right, 'asc') ||
          compareText(left.displayTitle, right.displayTitle)
        )
      case 'difficulty-desc':
        return (
          compareMasterDifficulty(left, right, 'desc') ||
          compareText(left.displayTitle, right.displayTitle)
        )
      default:
        return 0
    }
  })
})

const {
  setContainerElement: setSongListElement,
  totalSize: virtualSongsHeight,
  virtualItems: virtualSongs,
  isFastScrolling: isFastSongScrolling,
  measureElement: measureSongElement,
  resetMeasurements: resetSongMeasurements,
} = useWindowVirtualList(filteredSongs, {
  estimateSize: 199,
  gap: 36,
  overscan: 900,
})
const {
  scale: songCardScale,
  setElement: setSongCardScaleElement,
} = useElementScale(SONG_CARD_WIDTH)

function setSongListRef(element: unknown) {
  setSongListElement(element)
  setSongCardScaleElement(element)
}

function formatDebugValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return '--'
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

function songMdbDebugRows(song: SongViewModel) {
  const rawMdb = song.rawMdb
  const rows = [
    ['raw.music_id', rawMdb.music_id],
    ['raw.title_name', rawMdb.title_name],
    ['raw.title_ascii', rawMdb.title_ascii],
    ['raw.artist_title_ascii', rawMdb.artist_title_ascii],
    ['raw.first_ver', rawMdb.first_ver],
    ['raw.music_type', rawMdb.music_type],
    ['raw.genre', rawMdb.genre],
    ['raw.bpm', rawMdb.bpm],
    ['raw.bpm2', rawMdb.bpm2],
    ['raw.xg_diff_list', rawMdb.xg_diff_list],
    ['raw.disable_area', rawMdb.disable_area],
    ['raw.is_classic_seq', rawMdb.is_classic_seq],
    ['raw.is_remaster', rawMdb.is_remaster],
    ['raw.b_long', rawMdb.b_long],
    ['raw.xg_b_session', rawMdb.xg_b_session],
  ] as const

  return rows.map(([label, value]) => ({
    label,
    value: formatDebugValue(value),
  }))
}

watch(searchQuery, (value) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SEARCH_STORAGE_KEY, value)
  }
})

watch(debugModeEnabled, () => {
  void resetSongMeasurements()
}, { flush: 'post' })

function resetFilters() {
  filters.versionOrder = null
  selectedCatalogFilter.value = 'current'
  filters.difficultyMin = FULL_DIFFICULTY_MIN
  filters.difficultyMax = FULL_DIFFICULTY_MAX
}

function clearAllConditions() {
  searchQuery.value = ''
  sortOption.value = 'id-desc'
  resetFilters()
  showFilters.value = false
  openMenu.value = null
}

function openFilters() {
  showFilters.value = true
}

function closeFilters() {
  showFilters.value = false
  openMenu.value = null
}

function toggleFilters() {
  showFilters.value = !showFilters.value
  if (!showFilters.value) {
    openMenu.value = null
  }
}

function submitSearch() {
  closeFilters()
  searchInputRef.value?.blur()
}

async function handleOpenSettings() {
  closeFilters()
  await router.push({ name: 'settings' })
}

function cycleInstrument() {
  const currentIndex = INSTRUMENT_ORDER.indexOf(selectedInstrument.value)
  selectedInstrument.value = INSTRUMENT_ORDER[(currentIndex + 1) % INSTRUMENT_ORDER.length]
}

function hasSeenInstrumentGuide() {
  if (typeof window === 'undefined') {
    return true
  }

  try {
    return window.localStorage.getItem(INSTRUMENT_GUIDE_STORAGE_KEY) === '1'
  } catch {
    return true
  }
}

function markInstrumentGuideSeen() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(INSTRUMENT_GUIDE_STORAGE_KEY, '1')
  } catch {
    // Ignore localStorage failures; this guide is only a first-run hint.
  }
}

function openInstrumentGuide(options?: { persist?: boolean }) {
  closeFilters()
  showInstrumentGuide.value = true

  if (options?.persist) {
    markInstrumentGuideSeen()
  }
}

function requestInstrumentGuideOnce() {
  if (hasSeenInstrumentGuide()) {
    return
  }

  openInstrumentGuide({ persist: true })
}

function dismissInstrumentGuide() {
  showInstrumentGuide.value = false
}

function handleInstrumentGuideHotspotClick() {
  dismissInstrumentGuide()
  cycleInstrument()
}

function toggleMenu(menu: Exclude<SearchMenu, null>) {
  openMenu.value = openMenu.value === menu ? null : menu
}

function selectVersion(value: number | null) {
  filters.versionOrder = value
  openMenu.value = null
}

function selectCatalogFilter(value: SongCatalogFilterKey) {
  selectedCatalogFilter.value = value
  openMenu.value = null
}

function selectSort(value: SearchSortOption) {
  sortOption.value = value
  openMenu.value = null
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!showFilters.value) {
    return
  }

  const target = event.target

  if (!topShellRef.value || !(target instanceof Node)) {
    return
  }

  if (!topShellRef.value.contains(target)) {
    closeFilters()
  }
}

onMounted(async () => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  stopSongCatalogUpdateListener = onSongCatalogUpdated((nextSongs) => {
    songs.value = nextSongs
    void resetSongMeasurements()
    preloadVisibleSongCovers(filteredSongs.value)
    preloadCachedSkillCovers(nextSongs)
  })

  try {
    songs.value = await loadSongCatalog()
    await preloadCoverImagesNow(
      buildCoverPreloadTargetsFromSongs(filteredSongs.value, VISIBLE_COVER_PRELOAD_LIMIT),
      {
        limit: VISIBLE_COVER_PRELOAD_LIMIT,
        concurrency: 3,
        timeoutMs: STARTUP_COVER_PRELOAD_TIMEOUT_MS,
      },
    )
    preloadCachedSkillCovers(songs.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load catalog'
  } finally {
    loading.value = false
    requestInstrumentGuideOnce()
  }
})

watch(
  virtualSongs,
  (nextSongs) => {
    preloadVisibleSongCovers(nextSongs.map((virtualSong) => virtualSong.item))
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  stopSongCatalogUpdateListener?.()
  stopSongCatalogUpdateListener = null
})

function compareMasterDifficulty(
  left: SongViewModel,
  right: SongViewModel,
  direction: 'asc' | 'desc',
) {
  const leftDifficulty = getSelectedInstrumentMaster(left)
  const rightDifficulty = getSelectedInstrumentMaster(right)

  if (leftDifficulty === null && rightDifficulty === null) {
    return 0
  }

  if (leftDifficulty === null) {
    return 1
  }

  if (rightDifficulty === null) {
    return -1
  }

  return direction === 'asc'
    ? leftDifficulty - rightDifficulty
    : rightDifficulty - leftDifficulty
}
</script>

<template>
  <section class="home-view">
    <header ref="topShellRef" class="top-shell">
      <div class="top-shell__purple">
        <div class="top-shell__bar" :class="{ 'top-shell__bar--with-settings': showNativeSettingsEntry }">
          <label class="search-shell">
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              class="search-shell__input"
              type="search"
              placeholder="搜索曲目/艺术家"
              @click="openFilters"
              @focus="openFilters"
              @keydown.enter.prevent="submitSearch"
            />
            <button
              class="search-shell__button"
              type="button"
              :aria-label="showFilters ? '收起筛选面板' : '展开筛选面板'"
              @click="toggleFilters"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5"></circle>
                <path d="M16 16L21 21"></path>
              </svg>
            </button>
          </label>

          <button
            v-if="showNativeSettingsEntry"
            class="settings-badge"
            type="button"
            aria-label="打开软件设置"
            @click="handleOpenSettings"
          >
            <img class="settings-badge__icon" :src="settingsIconSrc" alt="" aria-hidden="true" />
          </button>
        </div>
      </div>

      <transition name="panel-fade">
        <section v-if="showFilters" class="filter-drawer">
          <div class="filter-drawer__controls">
            <div class="pill-menu pill-menu--version">
              <button
                class="pill-menu__button"
                :class="{ 'pill-menu__button--filled': filters.versionOrder !== null }"
                type="button"
                :title="selectedVersionLabel"
                :aria-label="`版本筛选，当前 ${selectedVersionLabel}`"
                :aria-expanded="openMenu === 'version'"
                @click.stop="toggleMenu('version')"
              >
                <span class="pill-menu__label">版本</span>
                <span class="pill-menu__icon" aria-hidden="true">
                  <svg viewBox="0 0 18 18">
                    <path d="M4 7L9 12L14 7"></path>
                  </svg>
                </span>
              </button>

              <transition name="menu-fade">
                <div v-if="openMenu === 'version'" class="pill-menu__sheet">
                  <button
                    class="pill-menu__option"
                    :class="{ 'pill-menu__option--active': filters.versionOrder === null }"
                    type="button"
                    @click="selectVersion(null)"
                  >
                    所有版本
                  </button>
                  <button
                    v-for="option in versionOptions"
                    :key="option.value"
                    class="pill-menu__option"
                    :class="{ 'pill-menu__option--active': filters.versionOrder === option.value }"
                    type="button"
                    @click="selectVersion(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </transition>
            </div>

            <div class="pill-menu pill-menu--filter">
              <button
                class="pill-menu__button"
                :class="{ 'pill-menu__button--filled': selectedCatalogFilter !== 'current' }"
                type="button"
                :title="selectedCatalogFilterLabel"
                :aria-label="`曲目筛选，当前 ${selectedCatalogFilterLabel}`"
                :aria-expanded="openMenu === 'filter'"
                @click.stop="toggleMenu('filter')"
              >
                <span class="pill-menu__label">筛选</span>
                <span class="pill-menu__icon" aria-hidden="true">
                  <svg viewBox="0 0 18 18">
                    <path d="M4 7L9 12L14 7"></path>
                  </svg>
                </span>
              </button>

              <transition name="menu-fade">
                <div v-if="openMenu === 'filter'" class="pill-menu__sheet">
                  <button
                    v-for="option in SONG_FILTER_OPTIONS"
                    :key="option.value"
                    class="pill-menu__option"
                    :class="{ 'pill-menu__option--active': selectedCatalogFilter === option.value }"
                    type="button"
                    @click="selectCatalogFilter(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </transition>
            </div>

            <div class="pill-menu pill-menu--sort">
              <button
                class="pill-menu__button"
                :class="{ 'pill-menu__button--filled': sortOption !== 'id-desc' }"
                type="button"
                :title="selectedSortLabel"
                :aria-label="`排序方式，当前 ${selectedSortLabel}`"
                :aria-expanded="openMenu === 'sort'"
                @click.stop="toggleMenu('sort')"
              >
                <span class="pill-menu__label">排序</span>
                <span class="pill-menu__icon" aria-hidden="true">
                  <svg viewBox="0 0 18 18">
                    <path d="M4 7L9 12L14 7"></path>
                  </svg>
                </span>
              </button>

              <transition name="menu-fade">
                <div v-if="openMenu === 'sort'" class="pill-menu__sheet">
                  <button
                    v-for="option in sortOptions"
                    :key="option.value"
                    class="pill-menu__option"
                    :class="{ 'pill-menu__option--active': sortOption === option.value }"
                    type="button"
                    @click="selectSort(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </transition>
            </div>
          </div>

          <div class="filter-drawer__slider">
            <DifficultyRangeSlider
              :stops="DIFFICULTY_STOPS"
              :min-value="filters.difficultyMin"
              :max-value="filters.difficultyMax"
              label="LEVEL"
              @update:min-value="filters.difficultyMin = $event"
              @update:max-value="filters.difficultyMax = $event"
            />
          </div>
        </section>
      </transition>
    </header>

    <transition name="instrument-guide">
      <div v-if="showInstrumentGuide" class="instrument-guide" role="presentation" @click="dismissInstrumentGuide">
        <div class="instrument-guide__ring" aria-hidden="true"></div>
        <button
          class="instrument-guide__hotspot"
          type="button"
          aria-label="切换展示模式"
          @click.stop="handleInstrumentGuideHotspotClick"
        ></button>
        <div class="instrument-guide__card" @click.stop>
          <p>可切换展示模式</p>
        </div>
      </div>
    </transition>

    <div class="home-view__inner">
      <section v-if="loading" class="state-card">
        加载中...
      </section>

      <section v-else-if="errorMessage" class="state-card state-card--error">
        {{ errorMessage }}
      </section>

      <section v-else :ref="setSongListRef" class="list-section">
        <EmptyState
          v-if="filteredSongs.length === 0"
          :has-filters="hasActiveFilters"
          :query="searchQuery"
          @reset="clearAllConditions"
        />

        <div
          v-else
          class="virtual-list"
          :style="{ height: `${virtualSongsHeight}px` }"
        >
          <div
            v-for="virtualSong in virtualSongs"
            :key="virtualSong.item.musicId"
            :ref="(element) => measureSongElement(virtualSong.index, element)"
            class="virtual-list__item"
            :style="{ transform: `translateY(${virtualSong.start}px)` }"
          >
            <SongCard
              :animate-cover-loading="!isFastSongScrolling"
              :card-scale="songCardScale"
              :eager-cover="virtualSong.index < VISIBLE_COVER_PRELOAD_LIMIT"
              :song="virtualSong.item"
              :selected-instrument="selectedInstrument"
            />
            <section
              v-if="debugModeEnabled"
              class="song-debug-panel"
              aria-label="song mdb debug"
            >
              <div class="song-debug-grid">
                <div
                  v-for="debugRow in songMdbDebugRows(virtualSong.item)"
                  :key="debugRow.label"
                  class="song-debug-row"
                >
                  <span>{{ debugRow.label }}</span>
                  <strong>{{ debugRow.value }}</strong>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>

    <button
      class="instrument-fab"
      type="button"
      @click="cycleInstrument"
      :aria-label="`Switch instrument, current ${selectedInstrumentLabel}`"
    >
      <img class="instrument-fab__image" :src="selectedInstrumentToggleSrc" alt="" aria-hidden="true" />
    </button>
  </section>
</template>

<style scoped>
.home-view {
  --home-safe-top: env(safe-area-inset-top, 0px);
  --home-top-bar-padding: calc(var(--home-safe-top) + 15px);
  --home-content-top-padding: calc(var(--home-safe-top) + 100px);
  position: relative;
  min-height: 100vh;
}

.home-view__inner {
  position: relative;
  z-index: 2;
  width: min(100%, 403px);
  margin: 0 auto;
  padding: var(--home-content-top-padding) 14px 36px;
}

.load-more-card {
  backdrop-filter: blur(10px);
}

.top-shell {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  overflow: visible;
}

.top-shell__purple {
  position: relative;
  z-index: 2;
  background: #4b3b76;
  box-shadow: 0 4px 15.8px rgba(133, 121, 168, 0.82);
}

.top-shell__bar {
  width: min(100%, 402px);
  margin: 0 auto;
  padding: var(--home-top-bar-padding) 11px 15px;
}

.top-shell__bar--with-settings {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.search-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  min-height: 40px;
  padding-left: 4px;
  border-radius: 28px;
  background: #ece6f0;
  overflow: hidden;
}

.search-shell__input {
  min-height: 40px;
  padding: 4px 20px 4px 20px;
  border: 0;
  background: transparent;
  color: #49454f;
  box-shadow: none;
  font-family: 'Roboto', var(--font-sans);
  font-size: 16px;
  letter-spacing: 0.03em;
}

.search-shell__input::placeholder {
  color: #6b6670;
}

.search-shell__input:focus {
  border: 0;
  background: transparent;
  box-shadow: none;
}

.search-shell__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #49454f;
  cursor: pointer;
}

.settings-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  box-shadow: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.settings-badge__icon {
  display: block;
  width: 30px;
  height: 30px;
}

.search-shell__button svg,
.instrument-fab svg,
.pill-menu__icon svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.filter-drawer {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1;
  width: min(100%, 402px);
  margin: 0 auto;
  background: #ffffff;
  padding: 14px 11px 22px;
  transform-origin: top center;
}

.filter-drawer__controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(100%, 360px);
  min-height: 38px;
  margin: 0 auto;
  gap: 0;
  flex-wrap: nowrap;
}

.pill-menu {
  position: relative;
  z-index: 2;
  flex: 1 1 0;
  width: auto;
  min-width: 0;
  max-width: 108px;
}

.pill-menu__button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  width: 100%;
  height: 38px;
  min-height: 38px;
  padding: 0 18px;
  border: 1px solid #4f378a;
  border-radius: 25px;
  background: #ffffff;
  color: #4f378a;
  box-shadow: none;
  font-family: 'Roboto', var(--font-sans);
  font-size: 14px;
  cursor: pointer;
}

.pill-menu__button--filled {
  background: rgba(232, 222, 248, 0.38);
}

.pill-menu__button:focus-visible {
  outline: none;
  border-color: #4f378a;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(79, 55, 138, 0.12);
}

.pill-menu__label {
  font-weight: 500;
  line-height: 20px;
  text-align: center;
  white-space: nowrap;
}

.pill-menu__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: #4f378a;
}

.pill-menu__icon svg {
  width: 18px;
  height: 18px;
  stroke-width: 1.7;
}

.pill-menu__sheet {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  right: 0;
  min-width: 108px;
  max-height: 280px;
  padding: 8px;
  overflow-y: auto;
  border: 1px solid rgba(79, 55, 138, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow:
    0 18px 40px rgba(43, 29, 85, 0.18),
    0 6px 18px rgba(43, 29, 85, 0.1);
}

.pill-menu--version .pill-menu__sheet {
  width: 176px;
  min-width: 176px;
  left: 0;
  right: auto;
}

.pill-menu--filter .pill-menu__sheet {
  width: 172px;
  min-width: 172px;
  left: 0;
  right: auto;
}

.pill-menu--sort .pill-menu__sheet {
  width: 172px;
  min-width: 172px;
  left: auto;
  right: 0;
}

.pill-menu__option {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 40px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #4f378a;
  font-family: 'Roboto', var(--font-sans);
  font-size: 0.92rem;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.pill-menu__option:hover {
  background: rgba(232, 222, 248, 0.72);
}

.pill-menu__option--active {
  background: #e8def8;
  color: #39256b;
  font-weight: 500;
}

.filter-drawer__slider {
  margin-top: 22px;
}

.list-section {
  display: grid;
  gap: 36px;
  width: min(100%, 375px);
  margin: 0 auto;
}

.virtual-list {
  position: relative;
  width: 100%;
}

.virtual-list__item {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  contain: layout style;
  display: grid;
  gap: 8px;
  will-change: transform;
}

.song-debug-panel {
  display: grid;
  gap: 8px;
  width: min(100%, 375px);
  margin: 0 auto;
  padding: 10px;
  border: 1px solid rgba(79, 55, 138, 0.24);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.86);
  color: #261b53;
  box-shadow: 0 8px 18px rgba(41, 26, 90, 0.1);
  backdrop-filter: blur(8px);
}

.song-debug-grid {
  display: grid;
  gap: 4px;
}

.song-debug-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 8px;
  align-items: start;
  font-family: var(--font-figma-title);
  font-size: 11px;
  line-height: 1.35;
}

.song-debug-row span {
  color: rgba(46, 33, 94, 0.68);
  overflow-wrap: anywhere;
}

.song-debug-row strong {
  color: #23164d;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.state-card,
.load-more-card {
  padding: 18px;
  border: 2px solid rgba(47, 0, 178, 0.72);
  border-radius: 18px;
  background: rgba(232, 229, 241, 0.84);
  box-shadow: 0 10px 24px rgba(36, 24, 88, 0.12);
}

.state-card {
  color: #1d1741;
}

.state-card--error {
  color: #a81f47;
}

.load-more-card {
  display: grid;
  gap: 10px;
  justify-items: center;
}

.load-more-card p {
  margin: 0;
  color: rgba(70, 61, 95, 0.9);
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.instrument-fab {
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

.instrument-fab__image {
  display: block;
  width: 56px;
  height: 56px;
}

.instrument-guide {
  --instrument-guide-x: calc(100vw - 42px);
  --instrument-guide-y: calc(100vh - env(safe-area-inset-bottom, 0px) - 120px);
  position: fixed;
  inset: 0;
  z-index: 80;
  background:
    radial-gradient(
      circle at var(--instrument-guide-x) var(--instrument-guide-y),
      transparent 0,
      transparent 44px,
      rgba(7, 4, 24, 0.78) 46px
    );
}

.instrument-guide__ring,
.instrument-guide__hotspot {
  position: fixed;
  left: var(--instrument-guide-x);
  top: var(--instrument-guide-y);
  border-radius: 999px;
  transform: translate(-50%, -50%);
}

.instrument-guide__ring {
  width: 72px;
  height: 72px;
  border: 2px solid rgba(255, 255, 255, 0.94);
  box-shadow:
    0 0 0 10px rgba(255, 255, 255, 0.08),
    0 0 28px rgba(255, 255, 255, 0.45);
  pointer-events: none;
  animation: instrumentGuidePulse 1.6s ease-in-out infinite;
}

.instrument-guide__hotspot {
  width: 86px;
  height: 86px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.instrument-guide__card {
  position: fixed;
  right: 16px;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 164px);
  width: min(218px, calc(100vw - 32px));
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(72, 49, 132, 0.94);
  color: #ffffff;
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.26);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.5;
  text-align: center;
}

.instrument-guide__card::after {
  content: '';
  position: absolute;
  right: 18px;
  bottom: -8px;
  width: 16px;
  height: 16px;
  background: inherit;
  transform: rotate(45deg);
}

.instrument-guide__card p {
  position: relative;
  margin: 0;
}

@keyframes instrumentGuidePulse {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
  }

  50% {
    transform: translate(-50%, -50%) scale(1.08);
  }
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.24s cubic-bezier(0.2, 0, 0, 1);
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0.92;
  transform: translateY(calc(-100% - 1px));
}

.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.instrument-guide-enter-active,
.instrument-guide-leave-active {
  transition: opacity 0.22s cubic-bezier(0.2, 0, 0, 1);
}

.instrument-guide-enter-from,
.instrument-guide-leave-to {
  opacity: 0;
}

@media (max-width: 720px) {
  .home-view__inner {
    padding-left: 14px;
    padding-right: 14px;
  }

  .filter-drawer__controls {
    gap: 0;
  }
}

@media (max-width: 440px) {
  .home-view__inner {
    padding-left: 12px;
    padding-right: 12px;
  }

  .top-shell__bar,
  .filter-drawer {
    padding-left: 10px;
    padding-right: 10px;
  }
}
</style>
