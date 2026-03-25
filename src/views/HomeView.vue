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
  { label: 'Default order', value: 'default' },
  { label: 'Title order', value: 'title' },
  { label: 'Artist order', value: 'artist' },
  { label: 'Version order', value: 'version' },
  { label: 'BPM order', value: 'bpm' },
  { label: 'Difficulty order', value: 'difficulty' },
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
    switch (sortKey.value) {
      case 'title':
        return (
          left.sortKeys.titleAsciiOrder - right.sortKeys.titleAsciiOrder ||
          compareText(left.displayTitle, right.displayTitle)
        )
      case 'artist':
        return (
          left.sortKeys.artistAsciiOrder - right.sortKeys.artistAsciiOrder ||
          compareText(left.displayArtist, right.displayArtist)
        )
      case 'version': {
        const leftVersion = parseVersionKey(left.versionKey)
        const rightVersion = parseVersionKey(right.versionKey)
        return (
          (leftVersion[0] ?? Number.MAX_SAFE_INTEGER) - (rightVersion[0] ?? Number.MAX_SAFE_INTEGER) ||
          (leftVersion[1] ?? Number.MAX_SAFE_INTEGER) - (rightVersion[1] ?? Number.MAX_SAFE_INTEGER) ||
          compareText(left.displayTitle, right.displayTitle)
        )
      }
      case 'bpm':
        return (
          (left.bpmPrimary ?? Number.MAX_SAFE_INTEGER) - (right.bpmPrimary ?? Number.MAX_SAFE_INTEGER) ||
          compareText(left.displayTitle, right.displayTitle)
        )
      case 'difficulty':
        return (
          (right.maxDifficulty ?? -1) - (left.maxDifficulty ?? -1) ||
          compareText(left.displayTitle, right.displayTitle)
        )
      default:
        return left.sortKeys.defaultOrder - right.sortKeys.defaultOrder
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
      rootMargin: '280px 0px',
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
    <div class="hero-panel">
      <div class="hero-panel__copy">
        <p class="hero-panel__eyebrow">M32 catalog / phase one foundation</p>
        <h1>Build the query flow first, then enrich the data surface.</h1>
        <p class="hero-panel__body">
          This first slice follows the manual: searchable list page, filter drawer, result stats,
          sorting controls, and a dedicated song detail page backed by normalized JSON data.
        </p>
      </div>
      <div class="hero-panel__stats">
        <article class="stat-card">
          <p>Catalog songs</p>
          <strong>{{ songs.length || '--' }}</strong>
        </article>
        <article class="stat-card">
          <p>Current result</p>
          <strong>{{ filteredSongs.length || '0' }}</strong>
        </article>
        <article class="stat-card">
          <p>Sort mode</p>
          <strong>{{ sortOptions.find((option) => option.value === sortKey)?.label }}</strong>
        </article>
      </div>
    </div>

    <section class="control-panel">
      <div class="search-row">
        <label class="search-field">
          <span>Search title / artist / music ID</span>
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Onion man / 2987 / ELIZABETH"
          />
        </label>

        <div class="search-row__actions">
          <button class="action-button action-button--muted" type="button" @click="showFilters = !showFilters">
            {{ showFilters ? 'Hide filters' : 'Show filters' }}
          </button>
          <button class="action-button action-button--ghost" type="button" @click="clearAllConditions">
            Reset all
          </button>
        </div>
      </div>

      <transition name="panel-fade">
        <div v-if="showFilters" class="filter-panel">
          <div class="filter-grid">
            <label>
              <span>Debut version</span>
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
              <span>Classic flag</span>
              <select v-model="filters.classic">
                <option value="all">All</option>
                <option value="yes">Classic only</option>
                <option value="no">Exclude classic</option>
              </select>
            </label>

            <label>
              <span>Remaster flag</span>
              <select v-model="filters.remaster">
                <option value="all">All</option>
                <option value="yes">Remaster only</option>
                <option value="no">Exclude remaster</option>
              </select>
            </label>

            <label>
              <span>Long flag</span>
              <select v-model="filters.long">
                <option value="all">All</option>
                <option value="yes">Long only</option>
                <option value="no">Exclude long</option>
              </select>
            </label>
          </div>

          <div class="range-grid">
            <label>
              <span>Guitar max difficulty min</span>
              <input v-model="filters.guitarMin" type="number" min="0" max="15" step="0.01" />
            </label>
            <label>
              <span>Guitar max difficulty max</span>
              <input v-model="filters.guitarMax" type="number" min="0" max="15" step="0.01" />
            </label>
            <label>
              <span>Drum max difficulty min</span>
              <input v-model="filters.drumMin" type="number" min="0" max="15" step="0.01" />
            </label>
            <label>
              <span>Drum max difficulty max</span>
              <input v-model="filters.drumMax" type="number" min="0" max="15" step="0.01" />
            </label>
            <label>
              <span>Bass max difficulty min</span>
              <input v-model="filters.bassMin" type="number" min="0" max="15" step="0.01" />
            </label>
            <label>
              <span>Bass max difficulty max</span>
              <input v-model="filters.bassMax" type="number" min="0" max="15" step="0.01" />
            </label>
          </div>

          <div class="filter-footer">
            <p>Difficulty filters currently target each instrument's highest available chart.</p>
            <button class="action-button action-button--ghost" type="button" @click="resetFilters">
              Clear filters only
            </button>
          </div>
        </div>
      </transition>

      <div class="result-bar">
        <div class="result-bar__summary">
          <p>Result count</p>
          <strong>{{ visibleSongs.length }} shown / {{ filteredSongs.length }} matched / {{ songs.length }} total</strong>
        </div>

        <label class="result-bar__sort">
          <span>Sort order</span>
          <select v-model="sortKey">
            <option v-for="option in sortOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>
    </section>

    <section v-if="loading" class="state-panel">
      Loading catalog data...
    </section>

    <section v-else-if="errorMessage" class="state-panel state-panel--error">
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
        class="load-more-sentinel"
      >
        <p>Scroll to load 20 more songs</p>
        <button class="action-button action-button--ghost" type="button" @click="loadMoreSongs">
          Load more now
        </button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.home-view {
  display: grid;
  gap: 20px;
}

.hero-panel,
.control-panel,
.state-panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 32px;
  box-shadow: var(--shadow-soft);
}

.hero-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.9fr);
  gap: 18px;
  padding: 24px;
}

.hero-panel__eyebrow,
.hero-panel__body {
  margin: 0;
}

.hero-panel__eyebrow {
  color: var(--accent-strong);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.hero-panel h1 {
  margin: 12px 0;
  color: var(--ink);
  font-size: clamp(2rem, 4vw, 3.2rem);
  line-height: 0.98;
  letter-spacing: -0.05em;
}

.hero-panel__body {
  max-width: 52ch;
  color: var(--muted);
  line-height: 1.75;
}

.hero-panel__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.stat-card {
  padding: 18px;
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 241, 233, 0.98));
  border: 1px solid rgba(31, 41, 55, 0.08);
}

.stat-card p,
.stat-card strong {
  margin: 0;
}

.stat-card p {
  color: var(--muted);
  font-size: 0.82rem;
}

.stat-card strong {
  display: block;
  margin-top: 8px;
  color: var(--ink);
  font-size: 1.55rem;
  line-height: 1.1;
}

.control-panel {
  display: grid;
  gap: 18px;
  padding: 20px;
}

.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: end;
}

.search-row__actions {
  display: flex;
  gap: 10px;
}

.search-field,
.filter-grid label,
.range-grid label,
.result-bar__sort {
  display: grid;
  gap: 8px;
}

.search-field span,
.filter-grid span,
.range-grid span,
.result-bar__sort span {
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 700;
}

.filter-panel {
  display: grid;
  gap: 18px;
  padding-top: 4px;
}

.filter-grid,
.range-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.filter-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.filter-footer p {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
}

.result-bar {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  padding-top: 8px;
  border-top: 1px solid rgba(31, 41, 55, 0.08);
}

.result-bar__summary p,
.result-bar__summary strong {
  margin: 0;
}

.result-bar__summary p {
  color: var(--muted);
  font-size: 0.82rem;
}

.result-bar__summary strong {
  display: block;
  margin-top: 4px;
  color: var(--ink);
  font-size: 1.12rem;
}

.list-section {
  display: grid;
  gap: 16px;
}

.load-more-sentinel {
  display: grid;
  gap: 12px;
  justify-items: center;
  padding: 22px;
  border-radius: 24px;
  border: 1px dashed rgba(31, 41, 55, 0.14);
  background: rgba(255, 255, 255, 0.5);
}

.load-more-sentinel p {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}

.state-panel {
  padding: 28px;
  color: var(--ink);
}

.state-panel--error {
  color: var(--danger);
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 960px) {
  .hero-panel,
  .search-row,
  .filter-grid,
  .range-grid {
    grid-template-columns: 1fr;
  }

  .hero-panel__stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .search-row__actions,
  .filter-footer,
  .result-bar {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (max-width: 720px) {
  .hero-panel,
  .control-panel,
  .state-panel {
    border-radius: 24px;
  }

  .hero-panel,
  .control-panel,
  .state-panel {
    padding: 18px;
  }

  .hero-panel__stats {
    grid-template-columns: 1fr;
  }
}
</style>
