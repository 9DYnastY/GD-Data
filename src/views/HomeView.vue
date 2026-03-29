<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import DifficultyRangeSlider from '../components/DifficultyRangeSlider.vue'
import EmptyState from '../components/EmptyState.vue'
import SongCard from '../components/SongCard.vue'
import { loadSongCatalog } from '../lib/song-catalog'
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

type SearchMenu = 'version' | 'sort' | null

type SearchFilters = {
  versionKey: string
  difficultyMin: number
  difficultyMax: number
}

const SEARCH_STORAGE_KEY = 'gddata:last-search'
const PAGE_SIZE = 20
const FULL_DIFFICULTY_MIN = 0
const FULL_DIFFICULTY_MAX = 99
const DIFFICULTY_STOPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99]
const INSTRUMENT_ORDER: InstrumentKey[] = ['drum', 'guitar', 'bass']
const INSTRUMENT_LABELS: Record<InstrumentKey, string> = {
  drum: 'Drum',
  guitar: 'Guitar',
  bass: 'Bass',
}
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
const visibleCount = ref(PAGE_SIZE)
const loadMoreTrigger = ref<HTMLElement | null>(null)
const topShellRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchQuery = ref(
  typeof window === 'undefined' ? '' : window.localStorage.getItem(SEARCH_STORAGE_KEY) ?? '',
)
const sortOption = ref<SearchSortOption>('id-asc')
const selectedInstrument = ref<InstrumentKey>('drum')
const filters = reactive<SearchFilters>({
  versionKey: '',
  difficultyMin: FULL_DIFFICULTY_MIN,
  difficultyMax: FULL_DIFFICULTY_MAX,
})

const sortOptions: Array<{ label: string; value: SearchSortOption }> = [
  { label: 'ID-升序', value: 'id-asc' },
  { label: 'ID-降序', value: 'id-desc' },
  { label: '标题-升序', value: 'title-asc' },
  { label: '标题-降序', value: 'title-desc' },
  { label: '艺术家-升序', value: 'artist-asc' },
  { label: '艺术家-降序', value: 'artist-desc' },
  { label: 'MAS难度-升序', value: 'difficulty-asc' },
  { label: 'MAS难度-降序', value: 'difficulty-desc' },
]

let loadMoreObserver: IntersectionObserver | null = null

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

const versionOptions = computed(() => {
  const uniqueVersions = new Map<string, { value: string; label: string; order: number }>()

  songs.value.forEach((song) => {
    if (uniqueVersions.has(song.versionKey)) {
      return
    }

    uniqueVersions.set(song.versionKey, {
      value: song.versionKey,
      label: resolveInstrumentVersionLabel(song.versionKey, selectedInstrument.value),
      order: resolveInstrumentVersionOrder(song.versionKey, selectedInstrument.value),
    })
  })

  return Array.from(uniqueVersions.values()).sort((left, right) => {
    return right.order - left.order || compareText(left.label, right.label)
  })
})

const hasActiveFilters = computed(() => {
  return filters.versionKey !== '' || !isFullDifficultyRange()
})

const selectedVersionLabel = computed(() => {
  if (!filters.versionKey) {
    return '版本'
  }

  return versionOptions.value.find((option) => option.value === filters.versionKey)?.label ?? '版本'
})

const selectedSortLabel = computed(() => {
  return sortOptions.find((option) => option.value === sortOption.value)?.label ?? '排序'
})

const filteredSongs = computed(() => {
  const normalizedQuery = searchQuery.value.trim().toLowerCase()

  const nextSongs = songs.value.filter((song) => {
    const matchesSearch =
      normalizedQuery.length === 0 ||
      song.searchText.includes(normalizedQuery) ||
      String(song.musicId) === normalizedQuery

    if (!matchesSearch) {
      return false
    }

    if (filters.versionKey && song.versionKey !== filters.versionKey) {
      return false
    }

    if (!matchesSelectedDifficultyRange(song)) {
      return false
    }

    return true
  })

  return nextSongs.slice().sort((left, right) => {
    switch (sortOption.value) {
      case 'id-asc':
        return left.musicId - right.musicId
      case 'id-desc':
        return right.musicId - left.musicId
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

const visibleSongs = computed(() => filteredSongs.value.slice(0, visibleCount.value))
const hasMoreSongs = computed(() => visibleSongs.value.length < filteredSongs.value.length)

watch(searchQuery, (value) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SEARCH_STORAGE_KEY, value)
  }
})

watch(
  [
    searchQuery,
    sortOption,
    selectedInstrument,
    () => filters.versionKey,
    () => filters.difficultyMin,
    () => filters.difficultyMax,
  ],
  () => {
    visibleCount.value = PAGE_SIZE
  },
)

function loadMoreSongs() {
  if (!hasMoreSongs.value) {
    return
  }

  visibleCount.value = Math.min(visibleCount.value + PAGE_SIZE, filteredSongs.value.length)
}

function setupLoadMoreObserver() {
  loadMoreObserver?.disconnect()
  loadMoreObserver = null

  if (!loadMoreTrigger.value || !hasMoreSongs.value) {
    return
  }

  if (typeof IntersectionObserver === 'undefined') {
    return
  }

  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMoreSongs()
      }
    },
    {
      root: null,
      rootMargin: '220px 0px',
      threshold: 0.01,
    },
  )

  loadMoreObserver.observe(loadMoreTrigger.value)
}

function resetFilters() {
  filters.versionKey = ''
  filters.difficultyMin = FULL_DIFFICULTY_MIN
  filters.difficultyMax = FULL_DIFFICULTY_MAX
}

function clearAllConditions() {
  searchQuery.value = ''
  sortOption.value = 'id-asc'
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

function cycleInstrument() {
  const currentIndex = INSTRUMENT_ORDER.indexOf(selectedInstrument.value)
  selectedInstrument.value = INSTRUMENT_ORDER[(currentIndex + 1) % INSTRUMENT_ORDER.length]
}

function toggleMenu(menu: Exclude<SearchMenu, null>) {
  openMenu.value = openMenu.value === menu ? null : menu
}

function selectVersion(value: string) {
  filters.versionKey = value
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

  try {
    songs.value = await loadSongCatalog()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load catalog'
  } finally {
    loading.value = false
    await nextTick()
    setupLoadMoreObserver()
  }
})

watch(
  [visibleSongs, hasMoreSongs, loadMoreTrigger],
  async () => {
    await nextTick()
    setupLoadMoreObserver()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  loadMoreObserver?.disconnect()
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
    <video class="home-view__video" autoplay loop muted playsinline>
      <source src="/5_background.mp4" type="video/mp4" />
    </video>
    <div class="home-view__overlay"></div>

    <header ref="topShellRef" class="top-shell">
      <div class="top-shell__purple">
        <div class="top-shell__bar">
          <label class="search-shell">
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              class="search-shell__input"
              type="search"
              placeholder="搜索曲名 / 艺术家 / ID"
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
        </div>
      </div>

      <transition name="panel-fade">
        <section v-if="showFilters" class="filter-drawer">
          <div class="filter-drawer__controls">
            <div class="pill-menu">
              <button
                class="pill-menu__button"
                type="button"
                aria-label="版本筛选"
                :aria-expanded="openMenu === 'version'"
                @click.stop="toggleMenu('version')"
              >
                <span class="pill-menu__label">{{ selectedVersionLabel }}</span>
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
                    :class="{ 'pill-menu__option--active': filters.versionKey === '' }"
                    type="button"
                    @click="selectVersion('')"
                  >
                    All versions
                  </button>
                  <button
                    v-for="option in versionOptions"
                    :key="option.value"
                    class="pill-menu__option"
                    :class="{ 'pill-menu__option--active': filters.versionKey === option.value }"
                    type="button"
                    @click="selectVersion(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </transition>
            </div>

            <div class="pill-menu">
              <button
                class="pill-menu__button"
                type="button"
                aria-label="排序方式"
                :aria-expanded="openMenu === 'sort'"
                @click.stop="toggleMenu('sort')"
              >
                <span class="pill-menu__label">{{ selectedSortLabel }}</span>
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

    <div class="home-view__inner">
      <section v-if="loading" class="state-card">
        Loading catalog data...
      </section>

      <section v-else-if="errorMessage" class="state-card state-card--error">
        {{ errorMessage }}
      </section>

      <section v-else class="list-section">
        <EmptyState
          v-if="filteredSongs.length === 0"
          :has-filters="hasActiveFilters"
          :query="searchQuery"
          @reset="clearAllConditions"
        />

        <SongCard
          v-for="song in visibleSongs"
          v-else
          :key="song.musicId"
          :song="song"
          :selected-instrument="selectedInstrument"
        />

        <div
          v-if="hasMoreSongs"
          ref="loadMoreTrigger"
          class="load-more-card"
        >
          <p>Scroll to load 20 more songs</p>
          <button class="action-button action-button--ghost" type="button" @click="loadMoreSongs">
            Load more
          </button>
        </div>
      </section>
    </div>

    <button
      class="instrument-fab"
      type="button"
      @click="cycleInstrument"
      :aria-label="`Switch instrument, current ${selectedInstrumentLabel}`"
    >
      <span class="instrument-fab__eyebrow">View</span>
      <span class="instrument-fab__value">{{ selectedInstrumentLabel }}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5L15 12L8 19"></path>
        <path d="M13 5L20 12L13 19"></path>
      </svg>
    </button>
  </section>
</template>

<style scoped>
.home-view {
  position: relative;
  min-height: 100vh;
}

.home-view__video,
.home-view__overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.home-view__video {
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.home-view__overlay {
  z-index: 1;
  background:
    linear-gradient(rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.48)),
    radial-gradient(circle at top, rgba(111, 88, 188, 0.16), transparent 30%);
}

.home-view__inner {
  position: relative;
  z-index: 2;
  width: min(100%, 403px);
  margin: 0 auto;
  padding: 156px 14px 36px;
}

.top-shell,
.load-more-card {
  backdrop-filter: blur(10px);
}

.top-shell {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  box-shadow: 0 4px 15.8px rgba(133, 121, 168, 0.82);
}

.top-shell__purple {
  background: #4b3b76;
}

.top-shell__bar {
  width: min(100%, 402px);
  margin: 0 auto;
  padding: 63px 11px 15px;
}

.search-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  min-height: 47px;
  padding-left: 4px;
  border-radius: 28px;
  background: #ece6f0;
  overflow: hidden;
}

.search-shell__input {
  min-height: 47px;
  padding: 4px 20px 4px 20px;
  border: 0;
  background: transparent;
  color: #49454f;
  box-shadow: none;
  font-family: 'Roboto', var(--font-sans);
  font-size: 1rem;
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
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #49454f;
  cursor: pointer;
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
  width: min(100%, 402px);
  margin: 0 auto;
  padding: 16px 11px 18px;
  background: #ffffff;
}

.filter-drawer__controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 36px;
}

.pill-menu {
  position: relative;
  z-index: 2;
}

.pill-menu__button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 38px;
  padding: 0 12px 0 18px;
  border: 1px solid #4f378a;
  border-radius: 25px;
  background: #ffffff;
  color: #4f378a;
  box-shadow: none;
  font-family: 'Roboto', var(--font-sans);
  font-size: 0.95rem;
  cursor: pointer;
}

.pill-menu__button:focus-visible {
  outline: none;
  border-color: #4f378a;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(79, 55, 138, 0.12);
}

.pill-menu__label {
  min-width: 0;
  overflow: hidden;
  font-weight: 500;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
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
  bottom: 24px;
  z-index: 32;
  display: inline-grid;
  justify-items: center;
  gap: 2px;
  width: 68px;
  height: 68px;
  padding: 10px 0 8px;
  border: 0;
  border-radius: 999px;
  background: #eaddff;
  color: #4f378a;
  box-shadow: 0 4px 8px 3px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3);
  cursor: pointer;
}

.instrument-fab__eyebrow,
.instrument-fab__value {
  font-family: var(--font-display);
  line-height: 1;
  text-transform: uppercase;
}

.instrument-fab__eyebrow {
  font-size: 0.52rem;
  letter-spacing: 0.1em;
  opacity: 0.72;
}

.instrument-fab__value {
  font-size: 0.8rem;
  font-weight: 700;
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
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

@media (max-width: 720px) {
  .home-view__inner {
    padding-left: 14px;
    padding-right: 14px;
  }

  .filter-drawer__controls {
    gap: 16px;
  }
}
</style>
