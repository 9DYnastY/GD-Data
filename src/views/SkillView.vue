<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import B50ScoreCard from '../components/B50ScoreCard.vue'
import SkillProfileBoard from '../components/SkillProfileBoard.vue'
import SkillScoreCard from '../components/SkillScoreCard.vue'
import dmModeToggleSrc from '../assets/skill-toggle/dm-mode.svg'
import gfModeToggleSrc from '../assets/skill-toggle/gf-mode.svg'
import { exportElementAsPng, preloadImageSource, resolveImageSourceForExport } from '../lib/b50-export'
import {
  clearBjmaniaSkillSnapshotCache,
  loadBjmaniaSkillSnapshotCache,
  saveBjmaniaSkillSnapshotCache,
} from '../lib/bjmania/cache'
import {
  filterRecentByFamily,
  filterScoresByFamily,
  getBjmaniaAuthMe,
  loadBjmaniaGitadoraSnapshot,
  mapBestScoresToList,
  mapRecentPlaysToList,
  rawSkillToText,
} from '../lib/bjmania/client'
import { BJMANIA_BASE_URL, clearBjmaniaCookies, isNativeBjmaniaHttp } from '../lib/bjmania/http'
import { openBjmaniaNativeLogin } from '../lib/bjmania/native-auth'
import { loadSongCatalog } from '../lib/song-catalog'
import type {
  BjmaniaAuthUser,
  BjmaniaGitadoraSnapshot,
  BjmaniaRecentListItem,
  BjmaniaScoreFamily,
  BjmaniaScoreFilterKey,
  BjmaniaScoreHotFilter,
  BjmaniaScoreListItem,
  BjmaniaScoreSortKey,
} from '../types/bjmania'
import type { SongViewModel } from '../types/song'

const SCORE_PAGE_SIZE = 50
const AUTH_RETRY_DELAYS_MS = [400, 900]
type SkillMenu = 'hot' | 'filter' | 'sort' | null
const router = useRouter()
const FAMILY_LABELS: Record<BjmaniaScoreFamily, string> = { dm: 'DM', gf: 'GF' }
const FAMILY_TOGGLE_ASSETS: Record<BjmaniaScoreFamily, string> = { dm: dmModeToggleSrc, gf: gfModeToggleSrc }
const HOT_FILTER_OPTIONS: Array<{ value: BjmaniaScoreHotFilter; label: string }> = [
  { value: 'all', label: '所有歌曲' },
  { value: 'hot', label: 'Hot' },
  { value: 'other', label: 'Other' },
]
const SCORE_FILTER_OPTIONS: Array<{ value: BjmaniaScoreFilterKey; label: string }> = [
  { value: 'current', label: '现有曲目' },
  { value: 'skill', label: 'Skill曲目' },
  { value: 'deleted', label: '删除曲目' },
  { value: 'classic', label: '展示Classic曲目' },
  { value: 'non-classic', label: '隐藏Classic曲目' },
]
const SCORE_SORT_OPTIONS: Array<{ value: BjmaniaScoreSortKey; label: string }> = [
  { value: 'skill-desc', label: 'Skill-降序' },
  { value: 'skill-asc', label: 'Skill-升序' },
  { value: 'rate-desc', label: '达成率-降序' },
  { value: 'rate-asc', label: '达成率-升序' },
  { value: 'difficulty-desc', label: 'Level-降序' },
  { value: 'difficulty-asc', label: 'Level-升序' },
]

const booting = ref(true)
const submitting = ref(false)
const loadingData = ref(false)
const loginError = ref('')
const dataError = ref('')
const authUser = ref<BjmaniaAuthUser | null>(null)
const snapshot = ref<BjmaniaGitadoraSnapshot | null>(null)
const scoreRows = ref<BjmaniaScoreListItem[]>([])
const recentRows = ref<BjmaniaRecentListItem[]>([])
const visibleScoreCount = ref(SCORE_PAGE_SIZE)
const selectedFamily = ref<BjmaniaScoreFamily>('dm')
const selectedHotFilter = ref<BjmaniaScoreHotFilter>('all')
const selectedScoreFilter = ref<BjmaniaScoreFilterKey>('current')
const selectedScoreSort = ref<BjmaniaScoreSortKey>('skill-desc')
const scoreSearch = ref('')
const showFilters = ref(false)
const showProfilePanel = ref(false)
const openMenu = ref<SkillMenu>(null)
const topShellRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const loadMoreTrigger = ref<HTMLElement | null>(null)
const b50ExportShellRef = ref<HTMLElement | null>(null)
const b50ExportRow = ref<BjmaniaScoreListItem | null>(null)
const b50ExportCoverSrc = ref<string | null>(null)
const generatingB50 = ref(false)

const isNativeRuntime = computed(() => isNativeBjmaniaHttp())
const isAuthenticated = computed(() => authUser.value !== null)
const avatarBadgeLabel = computed(() => {
  const name = snapshot.value?.gitadoraProfile.name?.trim() || authUser.value?.name?.trim()
  return name ? name.charAt(0) : 'B'
})
const selectedHotLabel = computed(() => HOT_FILTER_OPTIONS.find((option) => option.value === selectedHotFilter.value)?.label ?? '所有歌曲')
const selectedScoreFilterLabel = computed(() => SCORE_FILTER_OPTIONS.find((option) => option.value === selectedScoreFilter.value)?.label ?? '现有曲目')
const selectedScoreSortLabel = computed(() => SCORE_SORT_OPTIONS.find((option) => option.value === selectedScoreSort.value)?.label ?? 'Skill-降序')
const selectedFamilyToggleSrc = computed(() => FAMILY_TOGGLE_ASSETS[selectedFamily.value])

const filteredScores = computed(() => {
  const normalizedSearch = scoreSearch.value.trim().toLowerCase()
  let rows = filterScoresByFamily(scoreRows.value, selectedFamily.value)
  if (selectedHotFilter.value === 'hot') rows = rows.filter((row) => row.isHot)
  else if (selectedHotFilter.value === 'other') rows = rows.filter((row) => !row.isHot)
  rows = rows.filter((row) => {
    switch (selectedScoreFilter.value) {
      case 'skill': return row.inSkill
      case 'deleted': return row.isDeleted
      case 'classic': return row.isClassic
      case 'non-classic': return !row.isClassic && !row.isDeleted
      case 'current':
      default: return !row.isDeleted
    }
  })
  if (normalizedSearch) rows = rows.filter((row) => row.searchText.includes(normalizedSearch))
  return rows.slice().sort((left, right) => {
    switch (selectedScoreSort.value) {
      case 'skill-asc': return left.skillCalcRaw - right.skillCalcRaw || left.percRaw - right.percRaw
      case 'rate-desc': return right.percRaw - left.percRaw || right.skillCalcRaw - left.skillCalcRaw
      case 'rate-asc': return left.percRaw - right.percRaw || left.skillCalcRaw - right.skillCalcRaw
      case 'difficulty-asc': return left.difficultyRaw - right.difficultyRaw || left.skillCalcRaw - right.skillCalcRaw
      case 'difficulty-desc': return right.difficultyRaw - left.difficultyRaw || right.skillCalcRaw - left.skillCalcRaw
      case 'skill-desc':
      default: return right.skillCalcRaw - left.skillCalcRaw || right.percRaw - left.percRaw
    }
  })
})
const visibleScores = computed(() => filteredScores.value.slice(0, visibleScoreCount.value))
const hasMoreScores = computed(() => filteredScores.value.length > visibleScores.value.length)
// Keep recent-play data hydrated so the upcoming RECENT PLAYS redesign can reuse the same pipeline.
const filteredRecent = computed(() => filterRecentByFamily(recentRows.value, selectedFamily.value).slice(0, 8))
watch(filteredRecent, () => {}, { immediate: true })
const skillSummary = computed(() => {
  if (!snapshot.value) return null
  return {
    gf: rawSkillToText(snapshot.value.gitadoraProfile.gfSkillRaw),
    dm: rawSkillToText(snapshot.value.gitadoraProfile.dmSkillRaw),
  }
})
const activeSkillValue = computed(() => skillSummary.value?.[selectedFamily.value] ?? '--')

let loadMoreObserver: IntersectionObserver | null = null

function setErrorMessage(target: typeof loginError | typeof dataError, error: unknown, fallback: string) {
  if (error instanceof Error && error.message) target.value = error.message
  else target.value = fallback
}

function applySnapshotData(nextSnapshot: BjmaniaGitadoraSnapshot, songs: SongViewModel[]) {
  authUser.value = nextSnapshot.authUser
  snapshot.value = nextSnapshot
  scoreRows.value = mapBestScoresToList(nextSnapshot.bestScores.bestScores, songs, nextSnapshot.hotMusicIds)
  recentRows.value = mapRecentPlaysToList(nextSnapshot.recentPlays.recentPlayEntries, songs)
}

function clearSnapshotData() {
  authUser.value = null
  snapshot.value = null
  scoreRows.value = []
  recentRows.value = []
}

function isUnauthorizedAuthError(error: unknown) {
  return error instanceof Error && /status\s+(401|403)\b/.test(error.message)
}

function hasLocalSessionState() {
  return (
    authUser.value !== null ||
    snapshot.value !== null ||
    scoreRows.value.length > 0 ||
    recentRows.value.length > 0
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function runWithUnauthorizedRetry<T>(loader: () => Promise<T>) {
  let lastError: unknown

  for (let attempt = 0; attempt <= AUTH_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await loader()
    } catch (error) {
      lastError = error

      if (!isUnauthorizedAuthError(error) || attempt >= AUTH_RETRY_DELAYS_MS.length) {
        throw error
      }

      await sleep(AUTH_RETRY_DELAYS_MS[attempt])
    }
  }

  throw lastError instanceof Error ? lastError : new Error('BJMANIA auth retry failed.')
}

async function restoreCachedSnapshot() {
  const cached = loadBjmaniaSkillSnapshotCache()

  if (!cached) {
    return false
  }

  try {
    const songs = await loadSongCatalog()
    applySnapshotData(cached.snapshot, songs)
    return true
  } catch {
    return false
  }
}

async function hydrateSnapshot(options?: { preserveExisting?: boolean }) {
  const preserveExisting = options?.preserveExisting === true
  const hadExistingState = hasLocalSessionState()

  loadingData.value = true
  if (!preserveExisting) {
    dataError.value = ''
  }

  try {
    const [nextSnapshot, songs] = await Promise.all([
      runWithUnauthorizedRetry(() => loadBjmaniaGitadoraSnapshot()),
      loadSongCatalog(),
    ])
    applySnapshotData(nextSnapshot, songs)
    dataError.value = ''
    saveBjmaniaSkillSnapshotCache(nextSnapshot)
  } catch (error) {
    if (isUnauthorizedAuthError(error)) {
      dataError.value = ''
      return
    }

    if (!preserveExisting && !hadExistingState) {
      clearSnapshotData()
    }
    setErrorMessage(dataError, error, 'Could not load BJMANIA data.')
  } finally {
    loadingData.value = false
  }
}

async function bootstrapPage() {
  booting.value = true
  loginError.value = ''
  dataError.value = ''
  const restoredFromCache = await restoreCachedSnapshot()

  if (restoredFromCache) {
    booting.value = false
  }

  await hydrateSnapshot({ preserveExisting: restoredFromCache })
  booting.value = false
}

async function handleLogin() {
  showProfilePanel.value = false

  if (isNativeRuntime.value) {
    submitting.value = true
    loginError.value = ''
    dataError.value = ''
    try {
      const result = await openBjmaniaNativeLogin()
      if (!result.success) {
        try {
          authUser.value = await runWithUnauthorizedRetry(() => getBjmaniaAuthMe())
          await hydrateSnapshot()
          return
        } catch {
          loginError.value = result.cancelled ? '登录中断，请重试' : '登录未完成'
          return
        }
      }
      authUser.value = await runWithUnauthorizedRetry(() => getBjmaniaAuthMe())
      await hydrateSnapshot()
    } catch (error) {
      setErrorMessage(loginError, error, 'Could not open native BJMANIA login.')
    } finally {
      submitting.value = false
    }
    return
  }

  loginError.value = ''
  dataError.value = ''
  submitting.value = true
  try {
    if (typeof window === 'undefined') {
      throw new Error('BJMANIA login redirect is unavailable in this runtime.')
    }

    window.location.assign(BJMANIA_BASE_URL)
  } catch (error) {
    setErrorMessage(loginError, error, 'Could not open the BJMANIA login page.')
    submitting.value = false
  }
}

async function handleSignOut() {
  await clearBjmaniaCookies()
  clearBjmaniaSkillSnapshotCache()
  clearSnapshotData()
  dataError.value = ''
  loginError.value = ''
  showProfilePanel.value = false
}

function loadMoreScores() {
  if (!hasMoreScores.value) {
    return
  }

  visibleScoreCount.value = Math.min(visibleScoreCount.value + SCORE_PAGE_SIZE, filteredScores.value.length)
}

function setupLoadMoreObserver() {
  loadMoreObserver?.disconnect()
  loadMoreObserver = null

  if (!loadMoreTrigger.value || !hasMoreScores.value) {
    return
  }

  if (typeof IntersectionObserver === 'undefined') {
    return
  }

  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMoreScores()
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

function openFilters() { showProfilePanel.value = false; showFilters.value = true }
function closeFilters() { showFilters.value = false; openMenu.value = null }
function toggleFilters() { if (showFilters.value) closeFilters(); else openFilters() }
function toggleMenu(menu: Exclude<SkillMenu, null>) { openMenu.value = openMenu.value === menu ? null : menu }
function selectHotFilter(value: BjmaniaScoreHotFilter) { selectedHotFilter.value = value; openMenu.value = null }
function selectScoreFilter(value: BjmaniaScoreFilterKey) { selectedScoreFilter.value = value; openMenu.value = null }
function selectScoreSort(value: BjmaniaScoreSortKey) { selectedScoreSort.value = value; openMenu.value = null }
function submitSearch() { closeFilters(); searchInputRef.value?.blur() }
async function handleProfileBadgeClick() {
  showFilters.value = false
  openMenu.value = null

  if (booting.value || submitting.value) {
    return
  }

  if (!isAuthenticated.value) {
    await handleLogin()
    return
  }

  showProfilePanel.value = !showProfilePanel.value
}
function cycleFamily() { selectedFamily.value = selectedFamily.value === 'dm' ? 'gf' : 'dm' }

function pickTopB50Row() {
  const skillRows = filterScoresByFamily(scoreRows.value, selectedFamily.value)
    .filter((row) => row.inSkill && !row.isDeleted)
    .sort((left, right) => right.skillCalcRaw - left.skillCalcRaw || left.musicId - right.musicId)

  if (skillRows.length > 0) {
    return skillRows[0]
  }

  return filterScoresByFamily(scoreRows.value, selectedFamily.value)
    .filter((row) => !row.isDeleted)
    .sort((left, right) => right.skillCalcRaw - left.skillCalcRaw || left.musicId - right.musicId)[0] ?? null
}

async function handleGenerateB50() {
  showProfilePanel.value = false
  await router.push({
    name: 'skill-b50',
    query: { family: selectedFamily.value },
  })
  return

  if (generatingB50.value) {
    return
  }

  const topRow = pickTopB50Row()

  if (!topRow) {
    if (typeof window !== 'undefined') {
      window.alert('当前模式下没有可生成的 B50 卡片。')
    }
    return
  }

  generatingB50.value = true
  const resolvedCoverSrc = await resolveImageSourceForExport(
    topRow.song?.heroImageUrl ?? null,
    topRow.song?.heroImageCacheKey ?? `${selectedFamily.value}_${topRow.musicId}_${topRow.instrument}`,
  )

  const coverReady = await preloadImageSource(resolvedCoverSrc)
  b50ExportCoverSrc.value = coverReady ? resolvedCoverSrc : null
  b50ExportRow.value = topRow

  try {
    await nextTick()

    if (!b50ExportShellRef.value) {
      throw new Error('B50 export card did not render.')
    }

    const result = await exportElementAsPng(
      b50ExportShellRef.value!,
      `b50_${selectedFamily.value}_${topRow.musicId}_${topRow.instrument}`,
    )

    if (typeof window !== 'undefined') {
      const message = result.uri
        ? `B50 卡片已保存到本地：${result.filename}`
        : `B50 卡片已下载：${result.filename}`
      window.alert(message)
    }
  } catch (error: unknown) {
    let message = 'B50 export failed.'

    if (error instanceof Error) {
      message = (error as Error).message || message
    }


    if (typeof window !== 'undefined') {
      window.alert(message)
    }
  } finally {
    generatingB50.value = false
  }
}

async function handleOpenPlayHistory() {
  showProfilePanel.value = false
  await router.push({
    name: 'skill-history',
    query: { family: selectedFamily.value },
  })
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (!topShellRef.value || !(target instanceof Node)) return
  if (!topShellRef.value.contains(target)) {
    closeFilters()
    showProfilePanel.value = false
  }
}

watch([selectedFamily, selectedHotFilter, selectedScoreFilter, selectedScoreSort, scoreSearch], () => {
  visibleScoreCount.value = SCORE_PAGE_SIZE
})

watch(
  [visibleScores, hasMoreScores, loadMoreTrigger],
  async () => {
    await nextTick()
    setupLoadMoreObserver()
  },
  { flush: 'post' },
)

onMounted(async () => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  await bootstrapPage()
  await nextTick()
  setupLoadMoreObserver()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  loadMoreObserver?.disconnect()
})
</script>

<template>
  <section class="skill-view">
    <header ref="topShellRef" class="top-shell">
      <div class="top-shell__purple">
        <div class="top-shell__bar top-shell__bar--skill">
          <label class="search-shell">
            <input
              ref="searchInputRef"
              v-model="scoreSearch"
              class="search-shell__input"
              type="search"
              placeholder="搜索曲目/艺术家"
              @click="openFilters"
              @focus="openFilters"
              @keydown.enter.prevent="submitSearch"
            />
            <button class="search-shell__button" type="button" :aria-label="showFilters ? '收起筛选面板' : '展开筛选面板'" @click="toggleFilters">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16L21 21"></path></svg>
            </button>
          </label>

          <button class="profile-badge" type="button" :aria-label="isAuthenticated ? '打开 BJMANIA Profile 面板' : '打开 BJMANIA 登录页面'" @click="handleProfileBadgeClick">
            <span v-if="isAuthenticated" class="profile-badge__initial">{{ avatarBadgeLabel }}</span>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 12C14.4853 12 16.5 9.98528 16.5 7.5C16.5 5.01472 14.4853 3 12 3C9.51472 3 7.5 5.01472 7.5 7.5C7.5 9.98528 9.51472 12 12 12Z"></path>
              <path d="M4 20C4.83333 17.1667 7.5 15.75 12 15.75C16.5 15.75 19.1667 17.1667 20 20"></path>
            </svg>
          </button>
        </div>
      </div>

      <transition name="panel-fade">
        <section v-if="showFilters" class="filter-drawer">
          <div class="filter-drawer__controls">
            <div class="pill-menu">
              <button class="pill-menu__button" :class="{ 'pill-menu__button--filled': selectedHotFilter !== 'all' }" type="button" :title="selectedHotLabel" :aria-label="`Hot 过滤，当前 ${selectedHotLabel}`" :aria-expanded="openMenu === 'hot'" @click.stop="toggleMenu('hot')">
                <span class="pill-menu__label">分类</span>
                <span class="pill-menu__icon" aria-hidden="true"><svg viewBox="0 0 18 18"><path d="M4 7L9 12L14 7"></path></svg></span>
              </button>
              <transition name="menu-fade">
                <div v-if="openMenu === 'hot'" class="pill-menu__sheet">
                  <button v-for="option in HOT_FILTER_OPTIONS" :key="option.value" class="pill-menu__option" :class="{ 'pill-menu__option--active': selectedHotFilter === option.value }" type="button" @click="selectHotFilter(option.value)">{{ option.label }}</button>
                </div>
              </transition>
            </div>

            <div class="pill-menu pill-menu--filter">
              <button class="pill-menu__button" :class="{ 'pill-menu__button--filled': selectedScoreFilter !== 'current' }" type="button" :title="selectedScoreFilterLabel" :aria-label="`曲目筛选，当前 ${selectedScoreFilterLabel}`" :aria-expanded="openMenu === 'filter'" @click.stop="toggleMenu('filter')">
                <span class="pill-menu__label">筛选</span>
                <span class="pill-menu__icon" aria-hidden="true"><svg viewBox="0 0 18 18"><path d="M4 7L9 12L14 7"></path></svg></span>
              </button>
              <transition name="menu-fade">
                <div v-if="openMenu === 'filter'" class="pill-menu__sheet">
                  <button v-for="option in SCORE_FILTER_OPTIONS" :key="option.value" class="pill-menu__option" :class="{ 'pill-menu__option--active': selectedScoreFilter === option.value }" type="button" @click="selectScoreFilter(option.value)">{{ option.label }}</button>
                </div>
              </transition>
            </div>

            <div class="pill-menu pill-menu--sort">
              <button class="pill-menu__button" :class="{ 'pill-menu__button--filled': selectedScoreSort !== 'skill-desc' }" type="button" :title="selectedScoreSortLabel" :aria-label="`排序方式，当前 ${selectedScoreSortLabel}`" :aria-expanded="openMenu === 'sort'" @click.stop="toggleMenu('sort')">
                <span class="pill-menu__label">排序</span>
                <span class="pill-menu__icon" aria-hidden="true"><svg viewBox="0 0 18 18"><path d="M4 7L9 12L14 7"></path></svg></span>
              </button>
              <transition name="menu-fade">
                <div v-if="openMenu === 'sort'" class="pill-menu__sheet">
                  <button v-for="option in SCORE_SORT_OPTIONS" :key="option.value" class="pill-menu__option" :class="{ 'pill-menu__option--active': selectedScoreSort === option.value }" type="button" @click="selectScoreSort(option.value)">{{ option.label }}</button>
                </div>
              </transition>
            </div>
          </div>
        </section>
      </transition>

      <transition name="menu-fade">
        <div v-if="showProfilePanel && isAuthenticated" class="profile-flyout-shell">
          <section class="profile-flyout">
            <SkillProfileBoard
              v-if="snapshot"
              :display-name="snapshot.gitadoraProfile.name || authUser?.name || 'BJMANIA'"
              :title="snapshot.gitadoraProfile.title || 'No title'"
              :mode-label="FAMILY_LABELS[selectedFamily]"
              :skill-value="activeSkillValue"
              @generate-b50="handleGenerateB50"
              @play-history="handleOpenPlayHistory"
              @sign-out="handleSignOut"
            />
            <div v-else class="profile-panel-card profile-panel-card--state">
              <p class="profile-panel-card__eyebrow">BJMANIA</p>
              <h2>档案读取失败</h2>
              <p>{{ dataError || '登录态已确认，但技能数据暂时不可用。' }}</p>
              <div class="profile-panel-card__actions">
                <button class="profile-panel-card__button" type="button" @click="() => hydrateSnapshot()">Retry</button>
                <button class="profile-panel-card__button profile-panel-card__button--muted" type="button" @click="handleSignOut">Sign out</button>
              </div>
            </div>
          </section>
        </div>
      </transition>
    </header>

    <div class="skill-view__inner">
      <section class="skill-list">
        <div v-if="booting" class="state-card"><p class="state-card__eyebrow">BJMANIA</p><h2>检查账号信息中...</h2></div>
        <div v-else-if="!isAuthenticated" class="state-card state-card--centered">
          <p>暂无账号信息，请点击右上角头像登录，建议勾上“记住我”</p>
          <p v-if="submitting" class="state-card__message">正在打开 BJMANIA 登录...</p>
          <p v-if="loginError" class="state-card__message state-card__message--error">{{ loginError }}</p>
          <p v-if="dataError" class="state-card__message state-card__message--error">{{ dataError }}</p>
        </div>
        <div v-else-if="loadingData && !snapshot" class="state-card"><p class="state-card__eyebrow">BJMANIA</p><h2>获取skill数据中...</h2></div>
        <div v-else-if="dataError && !snapshot" class="state-card state-card--error"><p class="state-card__eyebrow">BJMANIA</p><h2>数据拉取失败</h2><p>{{ dataError }}</p><button class="state-card__button" type="button" @click="() => hydrateSnapshot()">Retry</button></div>
        <template v-else>
          <SkillScoreCard v-for="row in visibleScores" :key="`${row.musicId}-${row.instrument}-${row.level}`" :row="row" />
          <div v-if="!visibleScores.length" class="state-card"><p class="state-card__eyebrow">Filter</p><h2>没有匹配到成绩</h2><p>当前筛选条件下没有 {{ FAMILY_LABELS[selectedFamily] }} 成绩记录。</p></div>
          <div v-if="hasMoreScores" ref="loadMoreTrigger" class="skill-list__load-trigger" aria-hidden="true"></div>
        </template>
      </section>
    </div>

    <button class="family-fab" type="button" :aria-label="`切换 skill 模式，当前 ${FAMILY_LABELS[selectedFamily]}`" @click="cycleFamily">
      <img class="family-fab__image" :src="selectedFamilyToggleSrc" alt="" aria-hidden="true" />
    </button>

    <div class="b50-export-stage" aria-hidden="true">
      <div
        v-if="b50ExportRow"
        ref="b50ExportShellRef"
        class="b50-export-stage__shell"
      >
        <B50ScoreCard :row="b50ExportRow" :cover-src-override="b50ExportCoverSrc" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.skill-view {
  --skill-safe-top: env(safe-area-inset-top, 0px);
  --skill-top-bar-padding: calc(var(--skill-safe-top) + 15px);
  --skill-content-top-padding: calc(var(--skill-safe-top) + 100px);
  position: relative;
  min-height: 100vh;
}

.skill-view__inner {
  position: relative;
  z-index: 2;
  width: min(100%, 403px);
  margin: 0 auto;
  padding: var(--skill-content-top-padding) 14px 44px;
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
  padding: var(--skill-top-bar-padding) 11px 15px;
}

.top-shell__bar--skill {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
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

.search-shell__button,
.profile-badge {
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
.profile-badge svg,
.family-fab svg,
.pill-menu__icon svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.profile-badge {
  flex: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: #65558f;
  box-shadow: 0 4px 10px rgba(39, 28, 78, 0.18);
}

.profile-badge__initial {
  color: #4f378a;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
}

.filter-drawer {
  width: min(100%, 402px);
  margin: 0 auto;
  padding: 14px 11px 0;
}

.profile-flyout-shell {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  padding-top: 10px;
  pointer-events: none;
}

.filter-drawer {
  background: #ffffff;
  padding-bottom: 22px;
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
  flex: 0 0 108px;
  width: 108px;
  min-width: 108px;
}

.pill-menu__button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  align-items: center;
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

.pill-menu--filter .pill-menu__sheet {
  width: 172px;
  min-width: 172px;
  left: 0;
  right: auto;
}

.pill-menu--sort .pill-menu__sheet {
  width: 184px;
  min-width: 184px;
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

.profile-flyout-shell {
  display: flex;
  justify-content: center;
}

.profile-flyout {
  display: flex;
  justify-content: flex-end;
  width: min(100%, 402px);
  margin: 0 auto;
  padding: 0 11px;
  pointer-events: auto;
}

.profile-panel-card,
.profile-login,
.state-card,
.load-more-card {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 2px solid rgba(47, 0, 178, 0.72);
  border-radius: 18px;
  background: rgba(232, 229, 241, 0.9);
  box-shadow: 0 10px 24px rgba(36, 24, 88, 0.12);
}

.profile-panel-card,
.profile-login {
  border-width: 1.6px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 36px rgba(46, 29, 104, 0.18);
}

.profile-panel-card--state {
  color: #1d1741;
}

.profile-panel-card__eyebrow,
.profile-login__eyebrow,
.state-card__eyebrow {
  margin: 0;
  color: rgba(79, 55, 138, 0.74);
  font-family: var(--font-display);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.profile-panel-card h2,
.profile-login h2,
.state-card h2 {
  margin: 0;
  color: #1d1741;
  font-size: 1.35rem;
  line-height: 1.15;
}

.profile-panel-card p,
.profile-login__note,
.profile-login__message,
.state-card p,
.load-more-card p {
  margin: 0;
  color: rgba(63, 54, 89, 0.9);
  line-height: 1.5;
}

.profile-panel-card__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.profile-panel-card__button,
.profile-login__submit,
.state-card__button,
.load-more-card__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid #4f378a;
  border-radius: 999px;
  background: #4f378a;
  color: #ffffff;
  box-shadow: none;
  cursor: pointer;
  font-family: 'Roboto', var(--font-sans);
  font-size: 0.84rem;
  font-weight: 500;
}

.profile-panel-card__button--muted {
  background: transparent;
  color: #4f378a;
}

.profile-login__form {
  display: grid;
  gap: 10px;
}

.profile-login__field {
  display: grid;
  gap: 6px;
}

.profile-login__field span,
.profile-login__checkbox span {
  color: #433d4d;
  font-size: 0.88rem;
}

.profile-login__field input {
  min-height: 44px;
  border: 1px solid rgba(79, 55, 138, 0.18);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
  color: #1d1741;
  box-shadow: none;
  font-size: 16px;
}

.profile-login__field input:focus {
  border-color: rgba(79, 55, 138, 0.38);
  box-shadow: 0 0 0 3px rgba(79, 55, 138, 0.08);
  background: #ffffff;
}

.profile-login__checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.profile-login__checkbox input {
  width: 18px;
  min-height: 18px;
  margin: 0;
}

.profile-login__message--error {
  color: #b3261e;
}

.skill-list {
  display: grid;
  gap: 22px;
  width: min(100%, 375px);
  margin: 0 auto;
}

.state-card--error {
  border-color: rgba(179, 38, 30, 0.32);
}

.state-card--centered {
  justify-items: center;
  text-align: center;
}

.state-card__message {
  max-width: 22rem;
}

.state-card__message--error {
  color: #b3261e;
}

.skill-list__load-trigger {
  width: 100%;
  height: 1px;
}

.family-fab {
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

.family-fab__image {
  display: block;
  width: 56px;
  height: 56px;
}

.b50-export-stage {
  position: fixed;
  top: 0;
  left: -9999px;
  z-index: -1;
  width: 208px;
  height: 288px;
  overflow: hidden;
  pointer-events: none;
}

.b50-export-stage__shell {
  width: 208px;
  height: 288px;
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
  .filter-drawer__controls {
    width: 100%;
  }
}

@media (max-width: 440px) {
  .skill-view__inner {
    padding-left: 12px;
    padding-right: 12px;
  }

  .top-shell__bar,
  .filter-drawer,
  .profile-flyout {
    padding-left: 10px;
    padding-right: 10px;
  }

}
</style>
