<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppPrimaryTopBar from '../components/AppPrimaryTopBar.vue'
import SkillProfileBoard from '../components/SkillProfileBoard.vue'
import SkillScoreCard from '../components/SkillScoreCard.vue'
import dmModeToggleSrc from '../assets/skill-toggle/dm-mode.svg'
import gfModeToggleSrc from '../assets/skill-toggle/gf-mode.svg'
import {
  clearBjmaniaSkillSnapshotCache,
  loadBjmaniaSkillSnapshotCache,
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
import { persistBjmaniaSnapshot } from '../lib/bjmania/snapshot-persistence'
import { formatDebugJson, formatDebugValue, useDebugMode } from '../lib/debug-mode'
import { loadSongCatalog, onSongCatalogUpdated } from '../lib/song-catalog'
import { useElementScale } from '../lib/use-element-scale'
import { useWindowVirtualList } from '../lib/use-window-virtual-list'
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

const AUTH_RETRY_DELAYS_MS = [400, 900]
const PROFILE_AVATAR_GUIDE_STORAGE_KEY = 'gddata:skill-profile-avatar-guide-shown'
const SKILL_SCORE_CARD_WIDTH = 374
type SkillMenu = 'hot' | 'filter' | 'sort' | null
const router = useRouter()
const debugModeEnabled = useDebugMode()
const FAMILY_LABELS: Record<BjmaniaScoreFamily, string> = { dm: 'DM', gf: 'GF' }
const FAMILY_TOGGLE_ASSETS: Record<BjmaniaScoreFamily, string> = { dm: dmModeToggleSrc, gf: gfModeToggleSrc }
const GITADORA_VERSION_LABELS: Record<number, string> = {
  11: 'GALAXY WAVE DELTA',
  10: 'GALAXY WAVE',
  9: 'FUZZ-UP',
  8: 'HIGH-VOLTAGE',
  7: 'NEX+AGE',
  6: 'EXCHAIN',
}
const HOT_FILTER_OPTIONS: Array<{ value: BjmaniaScoreHotFilter; label: string }> = [
  { value: 'all', label: '所有歌曲' },
  { value: 'hot', label: 'Hot' },
  { value: 'other', label: 'Other' },
]
const SCORE_FILTER_OPTIONS: Array<{ value: BjmaniaScoreFilterKey; label: string }> = [
  { value: 'current', label: '现有曲目' },
  { value: 'skill', label: 'Skill曲目' },
  { value: 'skill-candidate', label: '候选Skill曲目' },
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
const selectedFamily = ref<BjmaniaScoreFamily>('dm')
const selectedHotFilter = ref<BjmaniaScoreHotFilter>('all')
const selectedScoreFilter = ref<BjmaniaScoreFilterKey>('current')
const selectedScoreSort = ref<BjmaniaScoreSortKey>('skill-desc')
const scoreSearch = ref('')
const showFilters = ref(false)
const showProfilePanel = ref(false)
const openMenu = ref<SkillMenu>(null)
const topShellRef = ref<HTMLElement | null>(null)
const primaryTopBarRef = ref<InstanceType<typeof AppPrimaryTopBar> | null>(null)
const showAvatarGuide = ref(false)
const showSignOutConfirm = ref(false)
const showVersionPanel = ref(false)
const signingOut = ref(false)
let stopSongCatalogUpdateListener: (() => void) | null = null

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
const availableVersionOptions = computed(() => {
  if (!snapshot.value) {
    return []
  }

  const versions = snapshot.value.availableVersions.length > 0
    ? snapshot.value.availableVersions
    : [snapshot.value.currentVersion]

  return [...new Set(versions.filter((version) => Number.isFinite(version)))]
    .sort((left, right) => right - left)
})
const selectedMdbVersion = computed(() => snapshot.value?.currentVersion ?? null)
const versionPanelOptions = computed(() => availableVersionOptions.value.map((version) => ({
  version,
  label: GITADORA_VERSION_LABELS[version] ?? `VERSION ${version}`,
})))

const filteredScores = computed(() => {
  const normalizedSearch = scoreSearch.value.trim().toLowerCase()
  let rows = filterScoresByFamily(scoreRows.value, selectedFamily.value)
  if (selectedHotFilter.value === 'hot') rows = rows.filter((row) => row.isHot)
  else if (selectedHotFilter.value === 'other') rows = rows.filter((row) => !row.isHot)
  rows = rows.filter((row) => {
    switch (selectedScoreFilter.value) {
      case 'skill': return row.inSkill
      case 'skill-candidate': return !row.inSkill && !row.isDeleted
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
const {
  setContainerElement: setScoreListElement,
  totalSize: virtualScoresHeight,
  virtualItems: virtualScores,
  isFastScrolling: isFastScoreScrolling,
  measureElement: measureScoreElement,
  resetMeasurements: resetScoreMeasurements,
} = useWindowVirtualList(filteredScores, {
  estimateSize: 110,
  gap: 22,
  overscan: 900,
})
const {
  scale: skillCardScale,
  setElement: setSkillCardScaleElement,
} = useElementScale(SKILL_SCORE_CARD_WIDTH)

function setScoreListRef(element: unknown) {
  setScoreListElement(element)
  setSkillCardScaleElement(element)
}
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
const skillApiDebugSections = computed(() => {
  if (!snapshot.value) {
    return []
  }

  return [
    { title: 'GetAccountInfo', data: authUser.value },
    { title: 'GetProfiles', data: snapshot.value.profiles },
    { title: 'GetGitadoraProfile', data: snapshot.value.gitadoraProfile },
  ]
})

function setErrorMessage(target: typeof loginError | typeof dataError, error: unknown, fallback: string) {
  if (error instanceof Error && error.message) target.value = error.message
  else target.value = fallback
}

function skillScoreDebugRows(row: BjmaniaScoreListItem) {
  const rawScore = row.rawScore
  const rows = [
    ['mapped.family', row.family],
    ['mapped.instrument', row.instrument],
    ['mapped.branchLabel', row.branchLabel],
    ['mapped.level', row.level],
    ['mapped.difficultyRaw', row.difficultyRaw],
    ['mapped.skillCalcRaw', row.skillCalcRaw],
    ['mapped.inSkill', row.inSkill],
    ['raw.musicId', rawScore?.musicId],
    ['raw.fumen', rawScore?.fumen],
    ['raw.percRaw', rawScore?.percRaw],
    ['raw.rank', rawScore?.rank],
    ['raw.autoClear', rawScore?.autoClear],
    ['raw.clear', rawScore?.clear],
    ['raw.fullCombo', rawScore?.fullCombo],
    ['raw.excellent', rawScore?.excellent],
    ['raw.meter', rawScore?.meter],
    ['raw.meterProg', rawScore?.meterProg],
  ] as const

  return rows.map(([label, value]) => ({
    label,
    value: formatDebugValue(value),
  }))
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

function hasSeenAvatarGuide() {
  if (typeof window === 'undefined') {
    return true
  }

  try {
    return window.localStorage.getItem(PROFILE_AVATAR_GUIDE_STORAGE_KEY) === '1'
  } catch {
    return true
  }
}

function markAvatarGuideSeen() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(PROFILE_AVATAR_GUIDE_STORAGE_KEY, '1')
  } catch {
    // Ignore localStorage failures; the guide is non-critical UI.
  }
}

function openAvatarGuide(options?: { persist?: boolean }) {
  showFilters.value = false
  openMenu.value = null
  showProfilePanel.value = false
  showAvatarGuide.value = true

  if (options?.persist) {
    markAvatarGuideSeen()
  }
}

function requestAvatarGuideOnce() {
  if (!isAuthenticated.value || hasSeenAvatarGuide()) {
    return
  }

  openAvatarGuide({ persist: true })
}

function dismissAvatarGuide() {
  showAvatarGuide.value = false
}

function handleAvatarGuideHotspotClick() {
  dismissAvatarGuide()

  if (!isAuthenticated.value) {
    return
  }

  showFilters.value = false
  openMenu.value = null
  showProfilePanel.value = true
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
    const songs = await loadSongCatalog({ mdbVersion: cached.snapshot.currentVersion })
    applySnapshotData(cached.snapshot, songs)
    await persistBjmaniaSnapshot(cached.snapshot)
    return true
  } catch {
    return false
  }
}

async function hydrateSnapshot(options?: { preserveExisting?: boolean; version?: number }) {
  const preserveExisting = options?.preserveExisting === true
  const hadExistingState = hasLocalSessionState()

  loadingData.value = true
  if (!preserveExisting) {
    dataError.value = ''
  }

  try {
    const nextSnapshot = await runWithUnauthorizedRetry(() => (
      loadBjmaniaGitadoraSnapshot({ version: options?.version ?? snapshot.value?.currentVersion })
    ))
    const songs = await loadSongCatalog({ mdbVersion: nextSnapshot.currentVersion })
    applySnapshotData(nextSnapshot, songs)
    dataError.value = ''
    await persistBjmaniaSnapshot(nextSnapshot, { trackNewRecentPlays: true })
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
  showAvatarGuide.value = false
  showSignOutConfirm.value = false
  showVersionPanel.value = false
}

function openSignOutConfirm() {
  showAvatarGuide.value = false
  showVersionPanel.value = false
  showSignOutConfirm.value = true
}

function cancelSignOut() {
  if (signingOut.value) {
    return
  }

  showSignOutConfirm.value = false
}

function openVersionSelectPanel() {
  if (loadingData.value || availableVersionOptions.value.length === 0) {
    return
  }

  showAvatarGuide.value = false
  showSignOutConfirm.value = false
  showProfilePanel.value = false
  showVersionPanel.value = true
}

function closeVersionSelectPanel() {
  if (!loadingData.value) {
    showVersionPanel.value = false
  }
}

async function confirmSignOut() {
  if (signingOut.value) {
    return
  }

  signingOut.value = true
  try {
    await handleSignOut()
  } finally {
    signingOut.value = false
  }
}

function openFilters() { showProfilePanel.value = false; showFilters.value = true }
function closeFilters() { showFilters.value = false; openMenu.value = null }
function toggleFilters() { if (showFilters.value) closeFilters(); else openFilters() }
function toggleMenu(menu: Exclude<SkillMenu, null>) { openMenu.value = openMenu.value === menu ? null : menu }
function selectHotFilter(value: BjmaniaScoreHotFilter) { selectedHotFilter.value = value; openMenu.value = null }
function selectScoreFilter(value: BjmaniaScoreFilterKey) { selectedScoreFilter.value = value; openMenu.value = null }
function selectScoreSort(value: BjmaniaScoreSortKey) { selectedScoreSort.value = value; openMenu.value = null }
function submitSearch() { closeFilters(); primaryTopBarRef.value?.blurSearch() }
async function handleProfileBadgeClick() {
  if (showAvatarGuide.value) {
    dismissAvatarGuide()
  }

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

async function handleGenerateB50() {
  showProfilePanel.value = false
  await router.push({
    name: 'skill-b50',
    query: {
      family: selectedFamily.value,
      version: selectedMdbVersion.value ?? undefined,
    },
  })
}

function selectMdbVersion(version: number) {
  if (loadingData.value) {
    return
  }

  if (version === selectedMdbVersion.value) {
    showVersionPanel.value = false
    return
  }

  showVersionPanel.value = false
  void hydrateSnapshot({ preserveExisting: true, version })
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (!topShellRef.value || !(target instanceof Node)) return
  if (!topShellRef.value.contains(target)) {
    closeFilters()
    showProfilePanel.value = false
  }
}

watch(
  [isAuthenticated, booting],
  ([authenticated, isBooting]) => {
    if (!authenticated) {
      showAvatarGuide.value = false
      return
    }

    if (!isBooting) {
      requestAvatarGuideOnce()
    }
  },
  { flush: 'post' },
)

watch(debugModeEnabled, () => {
  void resetScoreMeasurements()
}, { flush: 'post' })

onMounted(async () => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  stopSongCatalogUpdateListener = onSongCatalogUpdated((songs, catalog) => {
    if (snapshot.value && catalog.mdbVersion === snapshot.value.currentVersion) {
      applySnapshotData(snapshot.value, songs)
      void resetScoreMeasurements()
    }
  }, { mdbVersion: 'all' })
  await bootstrapPage()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  stopSongCatalogUpdateListener?.()
  stopSongCatalogUpdateListener = null
})
</script>

<template>
  <section class="skill-view">
    <header ref="topShellRef" class="top-shell">
      <AppPrimaryTopBar
        ref="primaryTopBarRef"
        v-model="scoreSearch"
        :authenticated="isAuthenticated"
        :avatar-label="avatarBadgeLabel"
        :search-action-label="showFilters ? '收起筛选面板' : '展开筛选面板'"
        @search-focus="openFilters"
        @search-action="toggleFilters"
        @search-submit="submitSearch"
        @avatar="handleProfileBadgeClick"
      />

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
            <template v-if="snapshot">
              <SkillProfileBoard
                :display-name="snapshot.gitadoraProfile.name || authUser?.name || 'BJMANIA'"
                :title="snapshot.gitadoraProfile.title || 'No title'"
                :mode-label="FAMILY_LABELS[selectedFamily]"
                :show-version-switch="availableVersionOptions.length > 0"
                :skill-value="activeSkillValue"
                :version-switch-disabled="loadingData"
                @generate-b50="handleGenerateB50"
                @select-version="openVersionSelectPanel"
                @sign-out="openSignOutConfirm"
              />
            </template>
            <div v-else class="profile-panel-card profile-panel-card--state">
              <p class="profile-panel-card__eyebrow">BJMANIA</p>
              <h2>档案读取失败</h2>
              <p>{{ dataError || '登录态已确认，但Skill数据暂时不可用。' }}</p>
              <div class="profile-panel-card__actions">
                <button class="profile-panel-card__button" type="button" @click="() => hydrateSnapshot()">Retry</button>
                <button class="profile-panel-card__button profile-panel-card__button--muted" type="button" @click="openSignOutConfirm">Sign out</button>
              </div>
            </div>
          </section>
        </div>
      </transition>
    </header>

    <transition name="avatar-guide">
      <div v-if="showAvatarGuide" class="avatar-guide" role="presentation" @click="dismissAvatarGuide">
        <div class="avatar-guide__ring" aria-hidden="true"></div>
        <button
          class="avatar-guide__hotspot"
          type="button"
          aria-label="再次点击头像展开信息面板"
          @click.stop="handleAvatarGuideHotspotClick"
        ></button>
        <div class="avatar-guide__card" @click.stop>
          <p>再次点击头像可展开信息面板</p>
        </div>
      </div>
    </transition>

    <transition name="sign-out-dialog">
      <div
        v-if="showVersionPanel"
        class="version-select-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-select-dialog-title"
        @click.self="closeVersionSelectPanel"
      >
        <div class="version-select-dialog__card">
          <h2 id="version-select-dialog-title">选择版本</h2>
          <div class="version-select-dialog__options">
            <button
              v-for="option in versionPanelOptions"
              :key="option.version"
              class="version-select-dialog__option"
              :class="{ 'version-select-dialog__option--active': option.version === selectedMdbVersion }"
              type="button"
              :disabled="loadingData"
              @click="selectMdbVersion(option.version)"
            >
              {{ option.label }}
            </button>
          </div>
          <button
            class="version-select-dialog__cancel"
            type="button"
            :disabled="loadingData"
            @click="closeVersionSelectPanel"
          >
            取消
          </button>
        </div>
      </div>
    </transition>

    <transition name="sign-out-dialog">
      <div
        v-if="showSignOutConfirm"
        class="sign-out-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-out-dialog-title"
        @click.self="cancelSignOut"
      >
        <div class="sign-out-dialog__card">
          <h2 id="sign-out-dialog-title">确定要登出账号吗？</h2>
          <div class="sign-out-dialog__actions">
            <button
              class="sign-out-dialog__button sign-out-dialog__button--ghost"
              type="button"
              :disabled="signingOut"
              @click="cancelSignOut"
            >
              取消
            </button>
            <button
              class="sign-out-dialog__button"
              type="button"
              :disabled="signingOut"
              @click="confirmSignOut"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </transition>

    <div class="skill-view__inner">
      <section :ref="setScoreListRef" class="skill-list">
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
          <section
            v-if="debugModeEnabled && snapshot"
            class="skill-debug-panel skill-debug-panel--api"
            aria-label="skill api debug"
          >
            <details
              v-for="section in skillApiDebugSections"
              :key="section.title"
              class="skill-debug-details"
              open
            >
              <summary>{{ section.title }}</summary>
              <pre>{{ formatDebugJson(section.data) }}</pre>
            </details>
          </section>

          <div v-if="!filteredScores.length" class="state-card"><h2>没有匹配到成绩</h2><p>当前筛选条件下没有 {{ FAMILY_LABELS[selectedFamily] }} 成绩记录。</p></div>
          <div
            v-else
            class="virtual-list"
            :style="{ height: `${virtualScoresHeight}px` }"
          >
            <div
              v-for="virtualScore in virtualScores"
              :key="`${virtualScore.item.musicId}-${virtualScore.item.instrument}-${virtualScore.item.level}`"
              :ref="(element) => measureScoreElement(virtualScore.index, element)"
              class="virtual-list__item"
              :style="{ transform: `translateY(${virtualScore.start}px)` }"
            >
              <SkillScoreCard
                :animate-cover-loading="!isFastScoreScrolling"
                :card-scale="skillCardScale"
                :mdb-version="selectedMdbVersion"
                :row="virtualScore.item"
              />
              <section
                v-if="debugModeEnabled"
                class="skill-debug-panel skill-debug-panel--score"
                aria-label="skill score debug"
              >
                <div class="skill-debug-grid">
                  <div
                    v-for="debugRow in skillScoreDebugRows(virtualScore.item)"
                    :key="debugRow.label"
                    class="skill-debug-row"
                  >
                    <span>{{ debugRow.label }}</span>
                    <strong>{{ debugRow.value }}</strong>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </template>
      </section>
    </div>

    <button class="family-fab" type="button" :aria-label="`切换 skill 模式，当前 ${FAMILY_LABELS[selectedFamily]}`" @click="cycleFamily">
      <img class="family-fab__image" :src="selectedFamilyToggleSrc" alt="" aria-hidden="true" />
    </button>

  </section>
</template>

<style scoped>
.skill-view {
  --skill-safe-top: env(safe-area-inset-top, 0px);
  --skill-top-bar-padding: calc(var(--skill-safe-top) + 15px);
  --skill-content-top-padding: calc(var(--skill-safe-top) + 100px);
  --primary-top-bar-padding: var(--skill-top-bar-padding);
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
  overflow: visible;
}

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

.avatar-guide {
  --avatar-guide-x: min(calc(100vw - 35px), calc(50vw + 166px));
  --avatar-guide-y: calc(var(--skill-top-bar-padding) + 20px);
  position: fixed;
  inset: 0;
  z-index: 80;
  background:
    radial-gradient(
      circle at var(--avatar-guide-x) var(--avatar-guide-y),
      transparent 0,
      transparent 38px,
      rgba(7, 4, 24, 0.78) 40px
    );
}

.avatar-guide__ring,
.avatar-guide__hotspot {
  position: fixed;
  left: var(--avatar-guide-x);
  top: var(--avatar-guide-y);
  border-radius: 999px;
  transform: translate(-50%, -50%);
}

.avatar-guide__ring {
  width: 64px;
  height: 64px;
  border: 2px solid rgba(255, 255, 255, 0.94);
  box-shadow:
    0 0 0 10px rgba(255, 255, 255, 0.08),
    0 0 28px rgba(255, 255, 255, 0.45);
  pointer-events: none;
  animation: avatarGuidePulse 1.6s ease-in-out infinite;
}

.avatar-guide__hotspot {
  width: 76px;
  height: 76px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.avatar-guide__card {
  position: fixed;
  top: calc(var(--avatar-guide-y) + 58px);
  right: max(16px, calc((100vw - 402px) / 2 + 11px));
  width: min(270px, calc(100vw - 32px));
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(72, 49, 132, 0.94);
  color: #ffffff;
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.26);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.5;
}

.avatar-guide__card::before {
  content: '';
  position: absolute;
  top: -8px;
  right: 19px;
  width: 16px;
  height: 16px;
  background: inherit;
  transform: rotate(45deg);
}

.avatar-guide__card p {
  position: relative;
  margin: 0;
}

.sign-out-dialog,
.version-select-dialog {
  position: fixed;
  inset: 0;
  z-index: 96;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(20, 12, 48, 0.34);
  backdrop-filter: blur(8px);
}

.sign-out-dialog__card,
.version-select-dialog__card {
  display: grid;
  gap: 18px;
  width: min(100%, 312px);
  padding: 22px 20px 18px;
  box-sizing: border-box;
  border: 1px solid rgba(79, 55, 138, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 56px rgba(31, 16, 63, 0.24);
}

.sign-out-dialog__card h2,
.version-select-dialog__card h2 {
  margin: 0;
  color: #1d1741;
  font-family: var(--font-sans);
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}

.version-select-dialog__options {
  display: grid;
  gap: 8px;
}

.version-select-dialog__option,
.version-select-dialog__cancel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgba(79, 55, 138, 0.12);
  border-radius: 8px;
  font-family: var(--font-sans);
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.version-select-dialog__option {
  background: rgba(79, 55, 138, 0.08);
  color: #4f378a;
}

.version-select-dialog__option--active {
  background: #4f378a;
  color: #ffffff;
  border-color: #4f378a;
}

.version-select-dialog__cancel {
  background: transparent;
  color: rgba(29, 23, 65, 0.72);
}

.version-select-dialog__option:disabled,
.version-select-dialog__cancel:disabled {
  opacity: 0.68;
  cursor: default;
}

.sign-out-dialog__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.sign-out-dialog__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: #4f378a;
  color: #ffffff;
  font-family: var(--font-sans);
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.sign-out-dialog__button:disabled {
  opacity: 0.68;
  cursor: default;
}

.sign-out-dialog__button--ghost {
  background: rgba(79, 55, 138, 0.1);
  color: #4f378a;
}

.sign-out-dialog-enter-active,
.sign-out-dialog-leave-active {
  transition: opacity 0.16s ease;
}

.sign-out-dialog-enter-active .sign-out-dialog__card,
.sign-out-dialog-enter-active .version-select-dialog__card,
.sign-out-dialog-leave-active .sign-out-dialog__card,
.sign-out-dialog-leave-active .version-select-dialog__card {
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), opacity 0.16s ease;
}

.sign-out-dialog-enter-from,
.sign-out-dialog-leave-to {
  opacity: 0;
}

.sign-out-dialog-enter-from .sign-out-dialog__card,
.sign-out-dialog-enter-from .version-select-dialog__card,
.sign-out-dialog-leave-to .sign-out-dialog__card,
.sign-out-dialog-leave-to .version-select-dialog__card {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

@keyframes avatarGuidePulse {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
  }

  50% {
    transform: translate(-50%, -50%) scale(1.08);
  }
}

.filter-drawer {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1;
  width: min(100%, 402px);
  margin: 0 auto;
  padding: 14px 11px 0;
  transform-origin: top center;
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
  flex-direction: column;
  align-items: flex-end;
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

.skill-debug-panel {
  display: grid;
  gap: 8px;
  width: min(100%, 374px);
  margin: 0 auto;
  padding: 10px;
  border: 1px solid rgba(79, 55, 138, 0.24);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.86);
  color: #261b53;
  box-shadow: 0 8px 18px rgba(41, 26, 90, 0.1);
  backdrop-filter: blur(8px);
}

.skill-debug-panel--api {
  gap: 10px;
}

.skill-debug-grid {
  display: grid;
  gap: 4px;
}

.skill-debug-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 8px;
  align-items: start;
  font-family: var(--font-figma-title);
  font-size: 11px;
  line-height: 1.35;
}

.skill-debug-row span {
  color: rgba(46, 33, 94, 0.68);
  overflow-wrap: anywhere;
}

.skill-debug-row strong {
  color: #23164d;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.skill-debug-details {
  font-family: var(--font-figma-title);
  font-size: 11px;
  line-height: 1.35;
}

.skill-debug-details summary {
  color: #4f378a;
  cursor: pointer;
  font-weight: 800;
}

.skill-debug-details pre {
  max-height: 220px;
  margin: 8px 0 0;
  padding: 8px;
  overflow: auto;
  border-radius: 6px;
  background: rgba(35, 22, 77, 0.08);
  color: #201546;
  white-space: pre-wrap;
  word-break: break-word;
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

.avatar-guide-enter-active,
.avatar-guide-leave-active {
  transition: opacity 0.22s cubic-bezier(0.2, 0, 0, 1);
}

.avatar-guide-enter-from,
.avatar-guide-leave-to {
  opacity: 0;
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

  .filter-drawer,
  .profile-flyout {
    padding-left: 10px;
    padding-right: 10px;
  }

}
</style>
