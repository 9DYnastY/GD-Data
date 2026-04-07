<script setup lang="ts">
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import AppBottomNav from './components/AppBottomNav.vue'

const route = useRoute()
const router = useRouter()
const showBottomNav = computed(() => route.meta.showBottomNav === true)
const showSharedBackground = computed(() => route.meta.showBottomNav === true)
const exitToastVisible = ref(false)
const backgroundVideoRef = ref<HTMLVideoElement | null>(null)
const backgroundVideoReady = ref(false)

let backButtonListener: { remove: () => Promise<void> } | null = null
let exitToastTimer: ReturnType<typeof setTimeout> | null = null
let lastExitAttemptAt = 0

function clearExitToast() {
  exitToastVisible.value = false

  if (exitToastTimer) {
    clearTimeout(exitToastTimer)
    exitToastTimer = null
  }
}

function markBackgroundVideoReady() {
  backgroundVideoReady.value = true
}

function showExitToast() {
  clearExitToast()
  exitToastVisible.value = true
  exitToastTimer = setTimeout(() => {
    exitToastVisible.value = false
    exitToastTimer = null
  }, 1800)
}

async function handleAndroidBackButton() {
  if (route.name === 'skill-b50') {
    await router.replace({ name: 'skill' })
    return
  }

  if (route.name === 'song-detail') {
    if (window.history.length > 1) {
      await router.back()
      return
    }

    await router.replace({ name: 'home' })
    return
  }

  if (route.meta.showBottomNav === true) {
    const now = Date.now()

    if (now - lastExitAttemptAt < 1800) {
      clearExitToast()
      await App.exitApp()
      return
    }

    lastExitAttemptAt = now
    showExitToast()
  }
}

async function attachAndroidBackButtonListener() {
  if (Capacitor.getPlatform() !== 'android') {
    return
  }

  backButtonListener = await App.addListener('backButton', () => {
    void handleAndroidBackButton()
  })
}

onMounted(() => {
  void attachAndroidBackButtonListener()

  if (backgroundVideoRef.value && backgroundVideoRef.value.readyState >= 2) {
    backgroundVideoReady.value = true
  }
})

onBeforeUnmount(() => {
  clearExitToast()
  void backButtonListener?.remove()
  backButtonListener = null
})
</script>

<template>
  <div v-if="showSharedBackground" class="app-background" aria-hidden="true">
    <img
      class="app-background__poster"
      :class="{ 'app-background__poster--hidden': backgroundVideoReady }"
      src="/5_background_poster.jpg"
      alt=""
      decoding="async"
    />
    <video
      ref="backgroundVideoRef"
      class="app-background__video"
      :class="{ 'app-background__video--ready': backgroundVideoReady }"
      autoplay
      loop
      muted
      poster="/5_background_poster.jpg"
      playsinline
      preload="auto"
      @loadeddata="markBackgroundVideoReady"
      @canplay="markBackgroundVideoReady"
    >
      <source src="/5_background.mp4" type="video/mp4" />
    </video>
    <div class="app-background__overlay"></div>
  </div>
  <div class="app-shell" :class="{ 'app-shell--with-nav': showBottomNav }">
    <RouterView />
  </div>
  <AppBottomNav v-if="showBottomNav" />
  <transition name="exit-toast">
    <div v-if="exitToastVisible" class="exit-toast" role="status" aria-live="polite">
      再次返回回到桌面
    </div>
  </transition>
</template>

<style scoped>
.app-shell {
  position: relative;
  z-index: 2;
  min-height: 100vh;
}

.app-shell--with-nav {
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 92px);
}

.app-background,
.app-background__poster,
.app-background__video,
.app-background__overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.app-background {
  z-index: 0;
}

.app-background__poster {
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.28s ease;
}

.app-background__poster--hidden {
  opacity: 0;
}

.app-background__video {
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.28s ease;
}

.app-background__video--ready {
  opacity: 1;
}

.app-background__overlay {
  z-index: 1;
  background:
    linear-gradient(rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.48)),
    radial-gradient(circle at top, rgba(111, 88, 188, 0.16), transparent 30%);
}

.exit-toast {
  position: fixed;
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 104px);
  z-index: 64;
  min-width: 180px;
  padding: 10px 18px;
  border-radius: 999px;
  background: rgba(44, 28, 86, 0.92);
  color: #fff;
  font-family: 'Roboto', var(--font-sans);
  font-size: 0.86rem;
  font-weight: 500;
  text-align: center;
  box-shadow: 0 12px 28px rgba(31, 16, 63, 0.24);
  transform: translateX(-50%);
  backdrop-filter: blur(10px);
}

.exit-toast-enter-active,
.exit-toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.exit-toast-enter-from,
.exit-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}
</style>
