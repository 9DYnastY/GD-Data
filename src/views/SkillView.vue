<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { requestBjmaniaCaptchaToken } from '../lib/bjmania/captcha'
import {
  filterRecentByInstrument,
  filterScoresByInstrument,
  getBjmaniaAuthMe,
  loadBjmaniaGitadoraSnapshot,
  loginBjmania,
  mapBestScoresToList,
  mapRecentPlaysToList,
  rawSkillToText,
} from '../lib/bjmania/client'
import { clearBjmaniaCookies, isNativeBjmaniaHttp } from '../lib/bjmania/http'
import { openBjmaniaNativeLogin } from '../lib/bjmania/native-auth'
import { loadSongCatalog } from '../lib/song-catalog'
import type {
  BjmaniaAuthUser,
  BjmaniaGitadoraSnapshot,
  BjmaniaRecentListItem,
  BjmaniaScoreListItem,
} from '../types/bjmania'
import type { InstrumentKey } from '../types/song'

const LOGIN_EMAIL_STORAGE_KEY = 'gddata:bjmania-email'
const SCORE_PAGE_SIZE = 50
const INSTRUMENT_LABELS: Record<InstrumentKey, string> = {
  drum: 'Drum',
  guitar: 'Guitar',
  bass: 'Bass',
}

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
const selectedInstrument = ref<InstrumentKey>('drum')

const loginForm = reactive({
  email: typeof window === 'undefined' ? '' : window.localStorage.getItem(LOGIN_EMAIL_STORAGE_KEY) ?? '',
  password: '',
  remember: true,
})

const platformLabel = computed(() => Capacitor.getPlatform())
const isNativeRuntime = computed(() => isNativeBjmaniaHttp())
const isAuthenticated = computed(() => authUser.value !== null)

const filteredScores = computed(() => {
  return filterScoresByInstrument(scoreRows.value, selectedInstrument.value)
})

const visibleScores = computed(() => {
  return filteredScores.value.slice(0, visibleScoreCount.value)
})

const hasMoreScores = computed(() => {
  return filteredScores.value.length > visibleScores.value.length
})

const filteredRecent = computed(() => {
  return filterRecentByInstrument(recentRows.value, selectedInstrument.value).slice(0, 8)
})

const skillSummary = computed(() => {
  if (!snapshot.value) {
    return null
  }

  return {
    gf: rawSkillToText(snapshot.value.gitadoraProfile.gfSkillRaw),
    dm: rawSkillToText(snapshot.value.gitadoraProfile.dmSkillRaw),
    version: snapshot.value.currentVersion,
  }
})

function setErrorMessage(target: typeof loginError | typeof dataError, error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    target.value = error.message
    return
  }

  target.value = fallback
}

async function hydrateSnapshot() {
  loadingData.value = true
  dataError.value = ''

  try {
    const [nextSnapshot, songs] = await Promise.all([
      loadBjmaniaGitadoraSnapshot(),
      loadSongCatalog(),
    ])

    authUser.value = nextSnapshot.authUser
    snapshot.value = nextSnapshot
    scoreRows.value = mapBestScoresToList(nextSnapshot.bestScores.bestScores, songs)
    recentRows.value = mapRecentPlaysToList(nextSnapshot.recentPlays.recentPlayEntries, songs)
  } catch (error) {
    snapshot.value = null
    scoreRows.value = []
    recentRows.value = []
    setErrorMessage(dataError, error, 'Could not load BJMANIA data.')
  } finally {
    loadingData.value = false
  }
}

async function bootstrapPage() {
  booting.value = true
  loginError.value = ''
  dataError.value = ''

  try {
    authUser.value = await getBjmaniaAuthMe()
    await hydrateSnapshot()
  } catch {
    authUser.value = null
    snapshot.value = null
  } finally {
    booting.value = false
  }
}

async function handleLogin() {
  if (isNativeRuntime.value) {
    submitting.value = true
    loginError.value = ''
    dataError.value = ''

    try {
      const result = await openBjmaniaNativeLogin()

      if (!result.success) {
        try {
          authUser.value = await getBjmaniaAuthMe()
          await hydrateSnapshot()
          return
        } catch {
          loginError.value = result.cancelled
            ? 'Login was cancelled before the session could be confirmed.'
            : 'BJMANIA login did not complete.'
          return
        }
      }

      authUser.value = await getBjmaniaAuthMe()
      await hydrateSnapshot()
    } catch (error) {
      setErrorMessage(loginError, error, 'Could not open native BJMANIA login.')
    } finally {
      submitting.value = false
    }

    return
  }

  if (!loginForm.email.trim() || !loginForm.password) {
    loginError.value = 'Enter email and password first.'
    return
  }

  submitting.value = true
  loginError.value = ''
  dataError.value = ''

  try {
    const captcha = await requestBjmaniaCaptchaToken()

    await loginBjmania({
      email: loginForm.email.trim(),
      password: loginForm.password,
      remember: loginForm.remember,
      captcha,
    })

    authUser.value = await getBjmaniaAuthMe()

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOGIN_EMAIL_STORAGE_KEY, loginForm.email.trim())
    }

    await hydrateSnapshot()
  } catch (error) {
    setErrorMessage(loginError, error, 'Login failed.')
  } finally {
    submitting.value = false
  }
}

async function handleSignOut() {
  await clearBjmaniaCookies()
  authUser.value = null
  snapshot.value = null
  scoreRows.value = []
  recentRows.value = []
  dataError.value = ''
  loginError.value = ''
  loginForm.password = ''
}

function loadMoreScores() {
  visibleScoreCount.value += SCORE_PAGE_SIZE
}

function formatTimestamp(timestamp: number) {
  if (!timestamp) {
    return '--'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000))
}

function songTitle(row: BjmaniaScoreListItem | BjmaniaRecentListItem) {
  return row.song?.displayTitle ?? `Music #${'musicId' in row ? row.musicId : '--'}`
}

function songArtist(row: BjmaniaScoreListItem | BjmaniaRecentListItem) {
  return row.song?.displayArtist ?? 'Unknown artist'
}

watch(selectedInstrument, () => {
  visibleScoreCount.value = SCORE_PAGE_SIZE
})

onMounted(() => {
  void bootstrapPage()
})
</script>

<template>
  <main class="skill-view">
    <div class="skill-view__inner">
      <section class="skill-hero">
        <div>
          <p class="skill-hero__eyebrow">BJMANIA / GITADORA</p>
          <h1>Skill</h1>
          <p class="skill-hero__copy">
            Validate login, session, profile, best scores, and recent plays first. We can polish the
            layout later in Figma.
          </p>
        </div>

        <div class="skill-hero__meta">
          <span class="meta-pill">Platform {{ platformLabel }}</span>
          <span class="meta-pill">{{ isNativeRuntime ? 'Native HTTP ready' : 'Browser fallback mode' }}</span>
        </div>
      </section>

      <section v-if="booting" class="skill-card">
        <p class="skill-card__eyebrow">Session</p>
        <h2>Checking current login state...</h2>
      </section>

      <section v-else-if="!isAuthenticated" class="skill-card skill-card--login">
        <div class="skill-card__header">
          <div>
            <p class="skill-card__eyebrow">Login</p>
            <h2>Sign in to BJMANIA</h2>
          </div>
          <span class="meta-pill meta-pill--light">
            {{ isNativeRuntime ? 'Native WebView login' : 'Captcha required' }}
          </span>
        </div>

        <p v-if="isNativeRuntime" class="skill-login__note">
          The Android app now opens the real <code>u.bjmania.com/login</code> page inside a native
          WebView. After login completes there, the app reads the site cookies and reuses them for the
          native score requests.
        </p>

        <div v-if="!isNativeRuntime" class="skill-form">
          <p class="skill-login__note">
            Browser mode still uses Tencent captcha before posting <code>/api/auth/login</code>.
            Android should use the native login button below instead.
          </p>

          <label class="skill-field">
            <span>Email</span>
            <input v-model="loginForm.email" autocomplete="username" placeholder="your@email.com" />
          </label>

          <label class="skill-field">
            <span>Password</span>
            <input
              v-model="loginForm.password"
              type="password"
              autocomplete="current-password"
              placeholder="password"
              @keydown.enter.prevent="handleLogin"
            />
          </label>

          <label class="skill-checkbox">
            <input v-model="loginForm.remember" type="checkbox" />
            <span>Remember this session</span>
          </label>
        </div>

        <p v-if="loginError" class="skill-message skill-message--error">{{ loginError }}</p>
        <p v-if="dataError" class="skill-message skill-message--error">{{ dataError }}</p>

        <div class="skill-card__actions">
          <button class="action-button" :disabled="submitting" @click="handleLogin">
            {{
              submitting
                ? (isNativeRuntime ? 'Opening login...' : 'Verifying...')
                : (isNativeRuntime ? 'Open BJMANIA Login' : 'Verify and Sign In')
            }}
          </button>
        </div>
      </section>

      <template v-else>
        <section class="skill-card skill-card--profile">
          <div class="skill-card__header">
            <div>
              <p class="skill-card__eyebrow">Profile</p>
              <h2>{{ snapshot?.gitadoraProfile.name || authUser?.name }}</h2>
              <p class="skill-profile__title">{{ snapshot?.gitadoraProfile.title || 'No title' }}</p>
            </div>

            <div class="skill-card__actions">
              <button class="action-button action-button--muted" @click="handleSignOut">Sign out</button>
            </div>
          </div>

          <div class="skill-profile__stats">
            <article class="skill-stat">
              <span class="skill-stat__label">DM Skill</span>
              <strong>{{ skillSummary?.dm ?? '--' }}</strong>
            </article>
            <article class="skill-stat">
              <span class="skill-stat__label">GF Skill</span>
              <strong>{{ skillSummary?.gf ?? '--' }}</strong>
            </article>
            <article class="skill-stat">
              <span class="skill-stat__label">Version</span>
              <strong>M32 / {{ skillSummary?.version ?? '--' }}</strong>
            </article>
            <article class="skill-stat">
              <span class="skill-stat__label">Best Scores</span>
              <strong>{{ scoreRows.length }}</strong>
            </article>
          </div>
        </section>

        <section class="skill-card">
          <div class="skill-card__header">
            <div>
              <p class="skill-card__eyebrow">Instrument</p>
              <h2>Score list</h2>
            </div>
          </div>

          <div class="instrument-tabs" role="tablist" aria-label="Instrument">
            <button
              v-for="(label, instrument) in INSTRUMENT_LABELS"
              :key="instrument"
              class="instrument-tabs__item"
              :class="{ 'instrument-tabs__item--active': selectedInstrument === instrument }"
              @click="selectedInstrument = instrument"
            >
              {{ label }}
            </button>
          </div>

          <p v-if="loadingData" class="skill-message">Loading live GITADORA data...</p>
          <p v-else-if="dataError" class="skill-message skill-message--error">{{ dataError }}</p>

          <div v-else class="score-list">
            <article v-for="row in visibleScores" :key="`${row.musicId}-${row.instrument}-${row.level}`" class="score-row">
              <div class="score-row__main">
                <div class="score-row__title">
                  <h3>{{ songTitle(row) }}</h3>
                  <p>{{ songArtist(row) }}</p>
                </div>

                <div class="score-row__meta">
                  <span class="meta-pill meta-pill--light">{{ row.sheetLabel }}</span>
                  <span class="meta-pill">{{ row.rankLabel }}</span>
                </div>
              </div>

              <div class="score-row__stats">
                <div>
                  <span class="score-row__stat-label">Rate</span>
                  <strong>{{ row.percText }}</strong>
                </div>
                <div>
                  <span class="score-row__stat-label">Meter</span>
                  <strong>{{ row.meter }}</strong>
                </div>
              </div>

              <div class="score-row__badges">
                <span v-if="row.clear" class="tag-chip tag-chip--soft">CLEAR</span>
                <span v-if="row.fullCombo" class="tag-chip tag-chip--soft">FC</span>
                <span v-if="row.excellent" class="tag-chip tag-chip--soft">EXC</span>
              </div>
            </article>

            <p v-if="!visibleScores.length" class="skill-message">No scores found for {{ INSTRUMENT_LABELS[selectedInstrument] }}.</p>

            <div v-if="hasMoreScores" class="score-list__more">
              <button class="action-button action-button--muted" @click="loadMoreScores">
                Load 50 more
              </button>
            </div>
          </div>
        </section>

        <section class="skill-card">
          <div class="skill-card__header">
            <div>
              <p class="skill-card__eyebrow">Recent plays</p>
              <h2>Latest activity</h2>
            </div>
          </div>

          <div class="recent-list">
            <article v-for="entry in filteredRecent" :key="`${entry.timestamp}-${entry.sheetLabel}-${songTitle(entry)}`" class="recent-row">
              <div>
                <h3>{{ songTitle(entry) }}</h3>
                <p>{{ songArtist(entry) }}</p>
              </div>

              <div class="recent-row__side">
                <span class="meta-pill meta-pill--light">{{ entry.sheetLabel }}</span>
                <span class="recent-row__time">{{ formatTimestamp(entry.timestamp) }}</span>
                <span class="recent-row__score">{{ entry.percText }} / {{ entry.rankLabel }}</span>
              </div>
            </article>

            <p v-if="!filteredRecent.length" class="skill-message">
              No recent plays detected for {{ INSTRUMENT_LABELS[selectedInstrument] }}.
            </p>
          </div>
        </section>
      </template>
    </div>
  </main>
</template>

<style scoped>
.skill-view {
  min-height: 100vh;
  padding: 18px 14px 0;
}

.skill-view__inner {
  display: grid;
  gap: 16px;
  width: min(100%, 420px);
  margin: 0 auto;
}

.skill-hero,
.skill-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 22px;
  background: rgba(18, 13, 35, 0.84);
  box-shadow: 0 20px 40px rgba(7, 6, 18, 0.24);
  backdrop-filter: blur(18px);
}

.skill-hero {
  display: grid;
  gap: 14px;
  padding: 22px 18px;
}

.skill-hero__eyebrow,
.skill-card__eyebrow {
  margin: 0 0 8px;
  color: rgba(190, 183, 214, 0.84);
  font-family: var(--font-display);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.skill-hero h1,
.skill-card h2 {
  margin: 0;
  color: var(--ink);
  font-size: 1.8rem;
}

.skill-hero__copy,
.skill-login__note,
.skill-profile__title,
.skill-message,
.score-row__title p,
.recent-row p,
.recent-row__time {
  margin: 0;
  color: rgba(236, 232, 250, 0.68);
  line-height: 1.5;
}

.skill-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-pill--light {
  background: rgba(255, 255, 255, 0.12);
}

.skill-card {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.skill-card__header,
.skill-card__actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.skill-form {
  display: grid;
  gap: 12px;
}

.skill-field {
  display: grid;
  gap: 6px;
  color: var(--ink);
}

.skill-field span,
.skill-checkbox span {
  font-size: 0.9rem;
}

.skill-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: rgba(236, 232, 250, 0.84);
}

.skill-checkbox input {
  width: 18px;
  min-height: 18px;
  margin: 0;
}

.skill-message--error {
  color: #ff9fb7;
}

.skill-profile__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.skill-stat {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
}

.skill-stat__label,
.score-row__stat-label {
  color: rgba(190, 183, 214, 0.74);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.skill-stat strong,
.score-row__stats strong,
.recent-row__score {
  color: var(--ink);
  font-size: 1.05rem;
}

.instrument-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.instrument-tabs__item {
  min-height: 42px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(236, 232, 250, 0.72);
  cursor: pointer;
}

.instrument-tabs__item--active {
  border-color: rgba(255, 159, 74, 0.52);
  background: rgba(255, 159, 74, 0.14);
  color: var(--accent-strong);
}

.score-list,
.recent-list {
  display: grid;
  gap: 10px;
}

.score-row,
.recent-row {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.score-row__main,
.score-row__stats,
.recent-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.score-row__title,
.recent-row > div:first-child {
  min-width: 0;
}

.score-row__title h3,
.recent-row h3 {
  margin: 0 0 4px;
  color: var(--ink);
  font-family: var(--font-figma-title);
  font-size: 1rem;
}

.score-row__meta,
.score-row__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.score-row__stats {
  justify-content: flex-start;
}

.score-row__stats > div {
  display: grid;
  gap: 4px;
  min-width: 92px;
}

.tag-chip--soft {
  min-height: 24px;
  padding: 0 8px;
  background: rgba(162, 150, 252, 0.14);
  border-color: rgba(162, 150, 252, 0.3);
  color: #ddd5ff;
}

.score-list__more {
  display: flex;
  justify-content: center;
  padding-top: 4px;
}

.recent-row__side {
  display: grid;
  justify-items: end;
  gap: 6px;
  text-align: right;
}

@media (max-width: 380px) {
  .skill-view {
    padding-left: 10px;
    padding-right: 10px;
  }

  .skill-card,
  .skill-hero {
    padding: 16px;
  }

  .skill-profile__stats {
    grid-template-columns: minmax(0, 1fr);
  }

  .score-row__main,
  .score-row__stats,
  .recent-row {
    flex-direction: column;
  }

  .score-row__meta,
  .score-row__badges,
  .recent-row__side {
    justify-content: flex-start;
    justify-items: start;
    text-align: left;
  }
}
</style>
