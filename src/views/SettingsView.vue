<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import appLogoSrc from '../assets/app/app-logo-noback.svg'
import {
  checkForAppUpdate,
  getInstalledAppVersionLabel,
} from '../lib/app-update'
import { clearCoverImageCache, getCoverImageCacheSize } from '../lib/cover-cache'
import { setDebugModeEnabled, useDebugMode } from '../lib/debug-mode'

const router = useRouter()
const debugModeEnabled = useDebugMode()
const appVersionLabel = ref('1.1.0')
const cacheSizeBytes = ref(0)
const loadingCacheSize = ref(true)
const clearingCache = ref(false)
const checkingUpdate = ref(false)
const showClearConfirm = ref(false)
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
    appVersionLabel.value = '1.1.0'
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

        <!-- <button class="settings-row settings-row--button" type="button" disabled>
          <div class="settings-row__text">
            <span class="settings-row__label">项目主页</span>
          </div>
          <span class="settings-row__chevron">›</span>
        </button> -->
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
  .settings-row--cache {
    align-items: flex-start;
    flex-direction: column;
  }

  .settings-row__actions {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
