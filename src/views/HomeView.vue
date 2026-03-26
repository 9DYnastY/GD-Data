<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import EmptyState from '../components/EmptyState.vue'
import SongCard from '../components/SongCard.vue'
import { loadSongCatalog } from '../lib/song-catalog'
import type { SongFilters, SongViewModel, SortKey, ToggleFilterValue } from '../types/song'

const SEARCH_STORAGE_KEY = 'gddata:last-search'
const PAGE_SIZE = 20

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
const filters = reactive<SongFilters>({
  versionKey: '',
  typeKey: '',
  genreKey: '',
  classic: 'all',
  remaster: 'all',
  long: 'all',
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
const typeOptions = computed(() => createUniqueOptions(songs.value, 'type'))
const genreOptions = computed(() => createUniqueOptions(songs.value, 'genre'))
let loadMoreObserver: IntersectionObserver | null = null

const hasActiveFilters = computed(() => {
  return (
    filters.versionKey !== '' ||
    filters.typeKey !== '' ||
    filters.genreKey !== '' ||
    filters.classic !== 'all' ||
    filters.remaster !== 'all' ||
    filters.long !== 'all' ||
    filters.guitarMin !== '' ||
    filters.guitarMax !== '' ||
    filters.drumMin !== '' ||
    filters.drumMax !== '' ||
    filters.bassMin !== '' ||
    filters.bassMax !== ''
  )
})

function matchesToggle(value: boolean, filterValue: ToggleFilterValue) {
  if (filterValue === 'all') {
    return true
  }

  return filterValue === 'yes' ? value : !value
}

function parseRangeValue(value: string): number | null {
  if (!value.trim()) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getInstrumentMax(song: SongViewModel, instrumentKey: 'guitar' | 'drum' | 'bass') {
  return song.instruments.find((instrument) => instrument.key === instrumentKey)?.maxDifficulty ?? null
}

function matchesInstrumentRange(song: SongViewModel, instrumentKey: 'guitar' | 'drum' | 'bass') {
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

    if (filters.typeKey && song.typeKey !== filters.typeKey) {
      return false
    }

    if (filters.genreKey && song.genreKey !== filters.genreKey) {
      return false
    }

    if (!matchesToggle(song.tags.includes('Classic'), filters.classic)) {
      return false
    }

    if (!matchesToggle(song.tags.includes('Remaster'), filters.remaster)) {
      return false
    }

    if (!matchesToggle(song.tags.includes('Long'), filters.long)) {
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
          (right.maxDifficulty ?? -1) - (left.maxDifficulty ?? -1) ||
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
    () => filters.versionKey,
    () => filters.typeKey,
    () => filters.genreKey,
    () => filters.classic,
    () => filters.remaster,
    () => filters.long,
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
  filters.typeKey = ''
  filters.genreKey = ''
  filters.classic = 'all'
  filters.remaster = 'all'
  filters.long = 'all'
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
}

function openFilters() {
  showFilters.value = true
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

    <div class="home-view__inner">
      <section class="control-deck" :class="{ 'control-deck--expanded': showFilters }">
        <div class="control-deck__search">
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Search title / artist / music ID"
            @click="openFilters"
            @focus="openFilters"
          />
        </div>

      </section>

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

          <div class="filter-drawer__grid">
            <label>
              <span>Version</span>
              <select v-model="filters.versionKey">
                <option value="">All versions</option>
                <option v-for="option in versionOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label>
              <span>Type</span>
              <select v-model="filters.typeKey">
                <option value="">All types</option>
                <option v-for="option in typeOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label>
              <span>Genre</span>
              <select v-model="filters.genreKey">
                <option value="">All genres</option>
                <option v-for="option in genreOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label>
              <span>Classic</span>
              <select v-model="filters.classic">
                <option value="all">All</option>
                <option value="yes">Only classic</option>
                <option value="no">Exclude classic</option>
              </select>
            </label>

            <label>
              <span>Remaster</span>
              <select v-model="filters.remaster">
                <option value="all">All</option>
                <option value="yes">Only remaster</option>
                <option value="no">Exclude remaster</option>
              </select>
            </label>

            <label>
              <span>Long</span>
              <select v-model="filters.long">
                <option value="all">All</option>
                <option value="yes">Only long</option>
                <option value="no">Exclude long</option>
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
            <p>Difficulty range uses each instrument's highest available chart.</p>
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
    linear-gradient(rgba(10, 10, 15, 0.56), rgba(10, 10, 15, 0.72)),
    radial-gradient(circle at top, rgba(255, 159, 74, 0.12), transparent 28%);
}

.home-view__inner {
  position: relative;
  z-index: 2;
  width: min(100%, 388px);
  margin: 0 auto;
  padding: 0 16px 56px;
}

.control-deck,
.filter-drawer,
.state-card,
.load-more-card {
  background: rgba(61, 52, 119, 0.84);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(10px);
}

.control-deck {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  gap: 0;
  padding: 12px;
  margin-bottom: 0;
}

.control-deck__search {
  display: grid;
}

.control-deck__bar {
  display: none;
}

.sort-box,
.filter-drawer label {
  display: grid;
  gap: 6px;
}

.sort-box span,
.filter-drawer span {
  color: rgba(190, 183, 214, 0.84);
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.filter-drawer {
  display: grid;
  gap: 12px;
  padding: 12px;
  margin-bottom: 16px;
  margin-top: -1px;
  border-top: 0;
}

.control-deck--expanded {
  border-bottom: 0;
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
  color: rgba(190, 183, 214, 0.82);
  font-size: 0.74rem;
  line-height: 1.5;
}

.list-section {
  display: grid;
  gap: 20px;
  width: min(100%, 352px);
  margin: 0 auto;
  padding-top: 16px;
}

.state-card,
.load-more-card {
  padding: 18px;
}

.state-card {
  color: var(--ink);
}

.state-card--error {
  color: #ff9eb0;
}

.load-more-card {
  display: grid;
  gap: 10px;
  justify-items: center;
  background: rgba(81, 67, 162, 0.58);
}

.load-more-card p {
  margin: 0;
  color: rgba(190, 183, 214, 0.86);
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
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
  .filter-drawer__sort,
  .filter-drawer__grid,
  .filter-drawer__ranges {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
