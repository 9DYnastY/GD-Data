<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import EmptyState from '../components/EmptyState.vue'
import SongCard from '../components/SongCard.vue'
import { loadSongCatalog } from '../lib/song-catalog'
import type { InstrumentKey, SongFilters, SongViewModel, SortKey } from '../types/song'

const SEARCH_STORAGE_KEY = 'gddata:last-search'
const PAGE_SIZE = 20
const INSTRUMENT_ORDER: InstrumentKey[] = ['drum', 'guitar', 'bass']
const INSTRUMENT_LABELS: Record<InstrumentKey, string> = {
  drum: 'Drum',
  guitar: 'Guitar',
  bass: 'Bass',
}

const songs = ref<SongViewModel[]>([])
const loading = ref(true)
const errorMessage = ref('')
const showFilters = ref(false)
const visibleCount = ref(PAGE_SIZE)
const loadMoreTrigger = ref<HTMLElement | null>(null)
const searchQuery = ref(
  typeof window === 'undefined' ? '' : window.localStorage.getItem(SEARCH_STORAGE_KEY) ?? '',
)
const sortKey = ref<SortKey>('default')
const sortDirection = ref<'asc' | 'desc'>('asc')
const selectedInstrument = ref<InstrumentKey>('drum')
const filters = reactive<SongFilters>({
  versionKey: '',
  guitarMin: '',
  guitarMax: '',
  drumMin: '',
  drumMax: '',
  bassMin: '',
  bassMax: '',
})

const rangeFieldMap = {
  guitar: ['guitarMin', 'guitarMax'],
  drum: ['drumMin', 'drumMax'],
  bass: ['bassMin', 'bassMax'],
} as const

const sortOptions: Array<{ label: string; value: SortKey }> = [
  { label: 'Default', value: 'default' },
  { label: 'Title', value: 'title' },
  { label: 'Artist', value: 'artist' },
  { label: 'Version', value: 'version' },
  { label: 'BPM', value: 'bpm' },
  { label: 'Difficulty', value: 'difficulty' },
]

function createUniqueOptions(songsList: SongViewModel[], field: 'version' | 'type' | 'genre') {
  const uniqueMap = new Map<string, string>()

  songsList.forEach((song) => {
    if (field === 'version') {
      uniqueMap.set(song.versionKey, song.versionLabel)
      return
    }

    if (field === 'type') {
      uniqueMap.set(song.typeKey, song.typeLabel)
      return
    }

    uniqueMap.set(song.genreKey, song.genreLabel)
  })

  return Array.from(uniqueMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

const versionOptions = computed(() => createUniqueOptions(songs.value, 'version'))
const selectedInstrumentLabel = computed(() => INSTRUMENT_LABELS[selectedInstrument.value])
let loadMoreObserver: IntersectionObserver | null = null

const hasActiveFilters = computed(() => {
  return (
    filters.versionKey !== '' ||
    filters.guitarMin !== '' ||
    filters.guitarMax !== '' ||
    filters.drumMin !== '' ||
    filters.drumMax !== '' ||
    filters.bassMin !== '' ||
    filters.bassMax !== ''
  )
})

function parseRangeValue(value: string): number | null {
  if (!value.trim()) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getInstrumentMax(song: SongViewModel, instrumentKey: InstrumentKey) {
  return song.instruments.find((instrument) => instrument.key === instrumentKey)?.maxDifficulty ?? null
}

function matchesInstrumentRange(song: SongViewModel, instrumentKey: InstrumentKey) {
  const [minField, maxField] = rangeFieldMap[instrumentKey]
  const minValue = parseRangeValue(filters[minField])
  const maxValue = parseRangeValue(filters[maxField])

  if (minValue === null && maxValue === null) {
    return true
  }

  const instrumentDifficulty = getInstrumentMax(song, instrumentKey)

  if (instrumentDifficulty === null) {
    return false
  }

  if (minValue !== null && instrumentDifficulty < minValue) {
    return false
  }

  if (maxValue !== null && instrumentDifficulty > maxValue) {
    return false
  }

  return true
}

function getSelectedInstrumentMax(song: SongViewModel) {
  return getInstrumentMax(song, selectedInstrument.value)
}

function parseVersionKey(versionKey: string): number[] {
  return versionKey
    .split('-')
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
}

function compareText(left: string, right: string) {
  return left.localeCompare(right)
}

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

    if (!matchesInstrumentRange(song, 'guitar')) {
      return false
    }

    if (!matchesInstrumentRange(song, 'drum')) {
      return false
    }

    if (!matchesInstrumentRange(song, 'bass')) {
      return false
    }

    return true
  })

  return nextSongs.slice().sort((left, right) => {
    let result = 0

    switch (sortKey.value) {
      case 'title':
        result = (
          left.sortKeys.titleAsciiOrder - right.sortKeys.titleAsciiOrder ||
          compareText(left.displayTitle, right.displayTitle)
        )
        break
      case 'artist':
        result = (
          left.sortKeys.artistAsciiOrder - right.sortKeys.artistAsciiOrder ||
          compareText(left.displayArtist, right.displayArtist)
        )
        break
      case 'version': {
        const leftVersion = parseVersionKey(left.versionKey)
        const rightVersion = parseVersionKey(right.versionKey)
        result = (
          (leftVersion[0] ?? Number.MAX_SAFE_INTEGER) - (rightVersion[0] ?? Number.MAX_SAFE_INTEGER) ||
          (leftVersion[1] ?? Number.MAX_SAFE_INTEGER) - (rightVersion[1] ?? Number.MAX_SAFE_INTEGER) ||
          compareText(left.displayTitle, right.displayTitle)
        )
        break
      }
      case 'bpm':
        result = (
          (left.bpmPrimary ?? Number.MAX_SAFE_INTEGER) - (right.bpmPrimary ?? Number.MAX_SAFE_INTEGER) ||
          compareText(left.displayTitle, right.displayTitle)
        )
        break
      case 'difficulty':
        result = (
          (getSelectedInstrumentMax(right) ?? -1) - (getSelectedInstrumentMax(left) ?? -1) ||
          compareText(left.displayTitle, right.displayTitle)
        )
        break
      default:
        result = left.sortKeys.defaultOrder - right.sortKeys.defaultOrder
        break
    }

    return sortDirection.value === 'asc' ? result : result * -1
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
    sortKey,
    sortDirection,
    selectedInstrument,
    () => filters.versionKey,
    () => filters.guitarMin,
    () => filters.guitarMax,
    () => filters.drumMin,
    () => filters.drumMax,
    () => filters.bassMin,
    () => filters.bassMax,
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
  filters.guitarMin = ''
  filters.guitarMax = ''
  filters.drumMin = ''
  filters.drumMax = ''
  filters.bassMin = ''
  filters.bassMax = ''
}

function clearAllConditions() {
  searchQuery.value = ''
  resetFilters()
  sortKey.value = 'default'
  sortDirection.value = 'asc'
}

function openFilters() {
  showFilters.value = true
}

function cycleInstrument() {
  const currentIndex = INSTRUMENT_ORDER.indexOf(selectedInstrument.value)
  selectedInstrument.value = INSTRUMENT_ORDER[(currentIndex + 1) % INSTRUMENT_ORDER.length]
}

onMounted(async () => {
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
  loadMoreObserver?.disconnect()
})
</script>

<template>
  <section class="home-view">
    <video class="home-view__video" autoplay loop muted playsinline>
      <source src="/5_background.mp4" type="video/mp4" />
    </video>
    <div class="home-view__overlay"></div>

    <header class="top-shell" :class="{ 'top-shell--expanded': showFilters }">
      <div class="top-shell__bar">
        <label class="search-shell">
          <input
            class="search-shell__input"
            v-model="searchQuery"
            type="search"
            placeholder="Search title / artist / music ID"
            @click="openFilters"
            @focus="openFilters"
          />
          <button class="search-shell__button" type="button" @click="openFilters" aria-label="Open filters">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5"></circle>
              <path d="M16 16L21 21"></path>
            </svg>
          </button>
        </label>
      </div>

      <transition name="panel-fade">
        <section v-if="showFilters" class="filter-drawer">
          <div class="filter-drawer__sort">
            <label class="sort-box">
              <span>Sort</span>
              <select v-model="sortKey">
                <option v-for="option in sortOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label class="sort-box">
              <span>Direction</span>
              <select v-model="sortDirection">
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
            </label>
          </div>

          <div class="filter-drawer__grid filter-drawer__grid--single">
            <label>
              <span>Version</span>
              <select v-model="filters.versionKey">
                <option value="">All versions</option>
                <option v-for="option in versionOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>

          <div class="filter-drawer__ranges">
            <label>
              <span>Guitar min</span>
              <input v-model="filters.guitarMin" type="number" min="0" max="15" step="0.01" />
            </label>
            <label>
              <span>Guitar max</span>
              <input v-model="filters.guitarMax" type="number" min="0" max="15" step="0.01" />
            </label>
            <label>
              <span>Drum min</span>
              <input v-model="filters.drumMin" type="number" min="0" max="15" step="0.01" />
            </label>
            <label>
              <span>Drum max</span>
              <input v-model="filters.drumMax" type="number" min="0" max="15" step="0.01" />
            </label>
            <label>
              <span>Bass min</span>
              <input v-model="filters.bassMin" type="number" min="0" max="15" step="0.01" />
            </label>
            <label>
              <span>Bass max</span>
              <input v-model="filters.bassMax" type="number" min="0" max="15" step="0.01" />
            </label>
          </div>

          <div class="filter-drawer__footer">
            <p>Difficulty filters still apply across all three instruments.</p>
            <div class="filter-drawer__footer-actions">
              <button class="action-button action-button--ghost" type="button" @click="resetFilters">
                Clear filters
              </button>
              <button class="action-button action-button--muted" type="button" @click="showFilters = false">
                Hide panel
              </button>
            </div>
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

    <nav class="bottom-nav" aria-label="Primary">
      <button class="bottom-nav__item bottom-nav__item--active" type="button">
        <span class="bottom-nav__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 7H20"></path>
            <path d="M7 12H17"></path>
            <path d="M9 17H15"></path>
          </svg>
        </span>
        <span>Song List</span>
      </button>
      <button class="bottom-nav__item" type="button">
        <span class="bottom-nav__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M10 18V7L18 5V16"></path>
            <circle cx="8" cy="18" r="2"></circle>
            <circle cx="16" cy="16" r="2"></circle>
          </svg>
        </span>
        <span>Skill</span>
      </button>
    </nav>
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
  padding: 149px 14px 116px;
}

.top-shell,
.load-more-card,
.bottom-nav {
  backdrop-filter: blur(10px);
}

.top-shell {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  background: #4b3b76;
  box-shadow: 0 8px 24px rgba(48, 36, 87, 0.26);
}

.top-shell__bar {
  width: min(100%, 402px);
  margin: 0 auto;
  padding: 62px 11px 14px;
}

.top-shell--expanded {
  padding-bottom: 10px;
}

.search-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  min-height: 47px;
  padding-left: 18px;
  border-radius: 28px;
  background: #ece6f0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

.search-shell__input {
  min-height: 47px;
  padding: 0 10px 0 0;
  border: 0;
  background: transparent;
  color: #49454f;
  box-shadow: none;
  font-size: 1rem;
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
  border-radius: 999px;
  background: transparent;
  color: #49454f;
  cursor: pointer;
}

.search-shell__button svg,
.bottom-nav__icon svg,
.instrument-fab svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.sort-box,
.filter-drawer label {
  display: grid;
  gap: 6px;
}

.sort-box span,
.filter-drawer span {
  color: rgba(74, 68, 89, 0.76);
  font-size: 0.64rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.filter-drawer {
  display: grid;
  gap: 12px;
  width: min(100%, 402px);
  margin: 0 auto;
  padding: 0 11px 12px;
}

.filter-drawer__sort {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px;
  gap: 10px;
}

.filter-drawer__grid,
.filter-drawer__ranges {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.filter-drawer__grid--single {
  grid-template-columns: 1fr;
}

.filter-drawer select,
.filter-drawer input {
  min-height: 42px;
  border: 0;
  border-radius: 12px;
  background: rgba(236, 230, 240, 0.96);
  color: #3f3b45;
  box-shadow: inset 0 0 0 1px rgba(75, 59, 118, 0.16);
}

.filter-drawer select:focus,
.filter-drawer input:focus {
  box-shadow:
    inset 0 0 0 1px rgba(75, 59, 118, 0.28),
    0 0 0 3px rgba(234, 221, 255, 0.16);
}

.filter-drawer__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.filter-drawer__footer-actions {
  display: flex;
  gap: 8px;
}

.filter-drawer__footer p {
  margin: 0;
  color: rgba(236, 230, 240, 0.86);
  font-size: 0.74rem;
  line-height: 1.5;
}

.list-section {
  display: grid;
  gap: 16px;
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
  bottom: 86px;
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

.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 31;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  min-height: 64px;
  background: rgba(255, 255, 255, 0.95);
  border-top: 1px solid rgba(102, 84, 166, 0.14);
}

.bottom-nav__item {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 6px 10px 8px;
  border: 0;
  background: transparent;
  color: #49454f;
  cursor: pointer;
}

.bottom-nav__item span:last-child {
  font-size: 0.8rem;
}

.bottom-nav__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 32px;
  border-radius: 16px;
}

.bottom-nav__item--active {
  color: #625b71;
}

.bottom-nav__item--active .bottom-nav__icon {
  background: #e8def8;
  color: #4a4459;
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 720px) {
  .home-view__inner {
    padding-left: 14px;
    padding-right: 14px;
  }

  .filter-drawer__sort,
  .filter-drawer__ranges {
    grid-template-columns: 1fr 1fr;
  }

  .filter-drawer__footer {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-drawer__footer-actions {
    justify-content: flex-end;
  }
}
</style>
