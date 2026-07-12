<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import appLogoSrc from '../assets/app/app-logo-noback.svg'
import { showAppToast } from '../lib/app-toast'
import {
  FALLBACK_VERSION_NAME,
  checkForAppUpdate,
  getInstalledAppVersionLabel,
} from '../lib/app-update'
import { clearCoverImageCache, getCoverImageCacheSize } from '../lib/cover-cache'
import { clearBjmaniaRecentHistory, countBjmaniaRecentHistory } from '../lib/bjmania/recent-history'
import { clearPendingBjmaniaRecentHistoryAnnouncements } from '../lib/bjmania/snapshot-persistence'
import { setDebugModeEnabled, useDebugMode } from '../lib/debug-mode'

const router = useRouter()
const debugModeEnabled = useDebugMode()
const appVersionLabel = ref(FALLBACK_VERSION_NAME)
const cacheSizeBytes = ref(0)
const loadingCacheSize = ref(true)
const clearingCache = ref(false)
const checkingUpdate = ref(false)
const showClearConfirm = ref(false)
const historyRecordCount = ref(0)
const loadingHistoryCount = ref(true)
const clearingHistory = ref(false)
const showClearHistoryConfirm = ref(false)
const successMessage = ref('')
const errorMessage = ref('')
const logoTapCount = ref(0)
let logoTapTimer: ReturnType<typeof setTimeout> | null = null

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const fractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`
}

async function refreshCacheSize() {
  loadingCacheSize.value = true

  try {
    cacheSizeBytes.value = await getCoverImageCacheSize()
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '图片缓存大小读取失败'
  } finally {
    loadingCacheSize.value = false
  }
}

async function refreshAppVersion() {
  try {
    appVersionLabel.value = await getInstalledAppVersionLabel()
  } catch {
    appVersionLabel.value = FALLBACK_VERSION_NAME
  }
}

async function refreshHistoryCount() {
  loadingHistoryCount.value = true

  try {
    historyRecordCount.value = await countBjmaniaRecentHistory()
  } catch {
    historyRecordCount.value = 0
  } finally {
    loadingHistoryCount.value = false
  }
}

function openClearConfirm() {
  successMessage.value = ''
  errorMessage.value = ''
  showClearConfirm.value = true
}

function closeClearConfirm() {
  if (clearingCache.value) {
    return
  }

  showClearConfirm.value = false
}

async function confirmClearCache() {
  clearingCache.value = true
  successMessage.value = ''
  errorMessage.value = ''

  try {
    await clearCoverImageCache()
    await refreshCacheSize()
    showClearConfirm.value = false
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '图片缓存清理失败'
  } finally {
    clearingCache.value = false
  }
}

function openClearHistoryConfirm() {
  showClearHistoryConfirm.value = true
}

function closeClearHistoryConfirm() {
  if (!clearingHistory.value) {
    showClearHistoryConfirm.value = false
  }
}

async function confirmClearHistory() {
  if (clearingHistory.value) {
    return
  }

  clearingHistory.value = true

  try {
    await clearBjmaniaRecentHistory()
    clearPendingBjmaniaRecentHistoryAnnouncements()
    await refreshHistoryCount()
    showClearHistoryConfirm.value = false
    showAppToast('本地游玩历史已清除', { kind: 'success' })
  } catch {
    showAppToast('本地游玩历史清除失败', { kind: 'error' })
  } finally {
    clearingHistory.value = false
  }
}

async function handleCheckUpdate() {
  if (checkingUpdate.value) {
    return
  }

  checkingUpdate.value = true
  successMessage.value = ''
  errorMessage.value = ''

  try {
    const update = await checkForAppUpdate('manual')

    if (!update) {
      successMessage.value = '当前已是最新版本'
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '更新检查失败'
  } finally {
    checkingUpdate.value = false
  }
}

function resetLogoTapCount() {
  logoTapCount.value = 0

  if (logoTapTimer) {
    clearTimeout(logoTapTimer)
    logoTapTimer = null
  }
}

function handleLogoDebugTap() {
  if (logoTapTimer) {
    clearTimeout(logoTapTimer)
  }

  logoTapCount.value += 1

  if (logoTapCount.value >= 10) {
    const nextEnabled = !debugModeEnabled.value
    setDebugModeEnabled(nextEnabled)
    successMessage.value = nextEnabled ? '调试模式已开启' : '调试模式已关闭'
    errorMessage.value = ''
    resetLogoTapCount()
    return
  }

  logoTapTimer = setTimeout(resetLogoTapCount, 1400)
}

async function goBack() {
  if (window.history.length > 1) {
    await router.back()
    return
  }

  await router.replace({ name: 'home' })
}

onMounted(() => {
  void refreshAppVersion()
  void refreshCacheSize()
  void refreshHistoryCount()
})

onBeforeUnmount(() => {
  resetLogoTapCount()
})
</script>

<template>
  <section class="settings-view">
    <header class="settings-view__hero">
      <button class="settings-view__back" type="button" aria-label="返回曲库" @click="goBack">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5L8 12L15 19"></path>
        </svg>
      </button>

      <button
        class="settings-view__logo-button"
        type="button"
        aria-label="GITADORA Song Browser"
        @click="handleLogoDebugTap"
      >
        <img class="settings-view__logo" :src="appLogoSrc" alt="" aria-hidden="true" />
      </button>
    </header>

    <main class="settings-view__content">
      <section class="settings-panel" aria-label="软件设置">
        <div class="settings-row settings-row--version">
          <div class="settings-row__text">
            <span class="settings-row__label">版本号</span>
          </div>
          <div class="settings-row__actions">
            <span class="settings-row__value">v{{ appVersionLabel }}</span>
            <button
              class="settings-row__button"
              type="button"
              :disabled="checkingUpdate"
              @click="handleCheckUpdate"
            >
              {{ checkingUpdate ? '...' : '检查' }}
            </button>
          </div>
        </div>

        <div class="settings-row settings-row--cache">
          <div class="settings-row__text">
            <span class="settings-row__label">图片缓存大小</span>
          </div>
          <div class="settings-row__actions">
            <span class="settings-row__value">
              {{ loadingCacheSize ? '计算中...' : formatBytes(cacheSizeBytes) }}
            </span>
            <button
              class="settings-row__button"
              type="button"
              :disabled="clearingCache"
              @click="openClearConfirm"
            >
              清理
            </button>
          </div>
        </div>

        <div class="settings-row settings-row--history">
          <div class="settings-row__text">
            <span class="settings-row__label">本地游玩历史</span>
          </div>
          <div class="settings-row__actions">
            <span class="settings-row__value">
              {{ loadingHistoryCount ? '计算中...' : `${historyRecordCount} 条` }}
            </span>
            <button
              class="settings-row__button"
              type="button"
              :disabled="clearingHistory || historyRecordCount === 0"
              @click="openClearHistoryConfirm"
            >
              清理
            </button>
          </div>
        </div>

        <a
          class="settings-row settings-row--link"
          href="https://github.com/9DYnastY/GD-Data"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="打开项目主页"
        >
          <div class="settings-row__text">
            <span class="settings-row__label">项目主页</span>
          </div>
          <svg class="settings-row__github-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.04c-3.2.7-3.88-1.38-3.88-1.38-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18A10.9 10.9 0 0 1 12 6.12c.98 0 1.96.13 2.88.38 2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.08c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"></path>
          </svg>
        </a>
      </section>

      <p v-if="successMessage" class="settings-message settings-message--success">{{ successMessage }}</p>
      <p v-if="errorMessage" class="settings-message settings-message--error">{{ errorMessage }}</p>
    </main>

    <transition name="settings-dialog">
      <div v-if="showClearConfirm" class="settings-dialog" role="dialog" aria-modal="true" aria-label="确认清理图片缓存">
        <div class="settings-dialog__card">
          <h2>清理图片缓存？</h2>
          <p>这会删除本地已保存的封面图片。下次浏览时会按需重新下载。</p>
          <div class="settings-dialog__actions">
            <button class="settings-dialog__button settings-dialog__button--ghost" type="button" @click="closeClearConfirm">
              取消
            </button>
            <button class="settings-dialog__button" type="button" :disabled="clearingCache" @click="confirmClearCache">
              {{ clearingCache ? '清理中...' : '确认清理' }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <transition name="settings-dialog">
      <div
        v-if="showClearHistoryConfirm"
        class="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="确认清理本地游玩历史"
      >
        <div class="settings-dialog__card">
          <h2>清理本地游玩历史？</h2>
          <p>这会删除所有账号在本机累积保存的游玩记录，且无法恢复。</p>
          <div class="settings-dialog__actions">
            <button
              class="settings-dialog__button settings-dialog__button--ghost"
              type="button"
              @click="closeClearHistoryConfirm"
            >
              取消
            </button>
            <button
              class="settings-dialog__button"
              type="button"
              :disabled="clearingHistory"
              @click="confirmClearHistory"
            >
              {{ clearingHistory ? '清理中...' : '确认清理' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </section>
</template>

<style scoped>
.settings-view {
  --settings-safe-top: env(safe-area-inset-top, 0px);
  min-height: 100vh;
  padding: calc(var(--settings-safe-top) + 18px) 16px 36px;
  color: #1d1741;
}

.settings-view__hero {
  position: relative;
  display: flex;
  justify-content: center;
  width: min(100%, 402px);
  margin: 0 auto;
  padding: 8px 0 18px;
}

.settings-view__back {
  position: absolute;
  top: 22px;
  left: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: #4f378a;
  box-shadow: 0 8px 18px rgba(45, 32, 86, 0.14);
  cursor: pointer;
}

.settings-view__back svg {
  width: 25px;
  height: 25px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.4;
}

.settings-view__logo-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 86px;
  height: 86px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.settings-view__logo {
  display: block;
  width: 86px;
  height: 86px;
  object-fit: contain;
}

.settings-view__content {
  display: grid;
  gap: 12px;
  width: min(100%, 402px);
  margin: 0 auto;
}

.settings-panel {
  overflow: hidden;
  border: 1px solid rgba(79, 55, 138, 0.12);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 16px 34px rgba(46, 29, 104, 0.14);
  backdrop-filter: blur(10px);
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  min-height: 68px;
  padding: 13px 16px;
  border: 0;
  border-bottom: 1px solid rgba(79, 55, 138, 0.1);
  background: transparent;
  color: inherit;
  text-align: left;
}

.settings-row:last-child {
  border-bottom: 0;
}

.settings-row--button {
  cursor: pointer;
}

.settings-row--link {
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.settings-row--link:focus-visible {
  outline: none;
  background: rgba(232, 222, 248, 0.38);
  box-shadow: inset 0 0 0 3px rgba(79, 55, 138, 0.12);
}

.settings-row--button:disabled {
  opacity: 1;
  cursor: default;
}

.settings-row__text {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.settings-row__label {
  color: #1d1741;
  font-family: var(--font-sans);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
}

.settings-row__hint {
  color: rgba(73, 69, 79, 0.72);
  font-family: var(--font-sans);
  font-size: 0.78rem;
  line-height: 1.2;
}

.settings-row__value {
  flex: none;
  color: #4f378a;
  font-family: var(--font-sans);
  font-size: 0.92rem;
  font-weight: 700;
  white-space: nowrap;
}

.settings-row__actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.settings-row__button,
.settings-dialog__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: #4f378a;
  color: #ffffff;
  font-family: var(--font-sans);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.settings-row__button:disabled,
.settings-dialog__button:disabled {
  opacity: 0.68;
  cursor: default;
}

.settings-row__chevron {
  flex: none;
  color: rgba(79, 55, 138, 0.55);
  font-family: var(--font-sans);
  font-size: 1.6rem;
  line-height: 1;
}

.settings-row__github-icon {
  flex: none;
  width: 28px;
  height: 28px;
  color: #4f378a;
  fill: currentColor;
}

.settings-message {
  margin: 0;
  padding: 10px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 10px 22px rgba(46, 29, 104, 0.1);
  font-size: 0.88rem;
}

.settings-message--success {
  color: #286e32;
}

.settings-message--error {
  color: #b3261e;
}

.settings-dialog {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(20, 12, 48, 0.28);
  backdrop-filter: blur(8px);
}

.settings-dialog__card {
  display: grid;
  gap: 12px;
  width: min(100%, 332px);
  padding: 20px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 56px rgba(31, 16, 63, 0.24);
}

.settings-dialog__card h2,
.settings-dialog__card p {
  margin: 0;
}

.settings-dialog__card h2 {
  color: #1d1741;
  font-size: 1.18rem;
  line-height: 1.2;
}

.settings-dialog__card p {
  color: rgba(73, 69, 79, 0.82);
  font-size: 0.92rem;
  line-height: 1.5;
}

.settings-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.settings-dialog__button--ghost {
  background: rgba(79, 55, 138, 0.1);
  color: #4f378a;
}

.settings-dialog-enter-active,
.settings-dialog-leave-active {
  transition: opacity 0.16s ease;
}

.settings-dialog-enter-active .settings-dialog__card,
.settings-dialog-leave-active .settings-dialog__card {
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), opacity 0.16s ease;
}

.settings-dialog-enter-from,
.settings-dialog-leave-to {
  opacity: 0;
}

.settings-dialog-enter-from .settings-dialog__card,
.settings-dialog-leave-to .settings-dialog__card {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

@media (max-width: 360px) {
  .settings-row--cache,
  .settings-row--history {
    align-items: flex-start;
    flex-direction: column;
  }

  .settings-row__actions {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
