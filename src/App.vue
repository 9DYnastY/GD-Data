<script setup lang="ts">
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import AppBottomNav from './components/AppBottomNav.vue'

const MAIN_ROUTE_ORDER: Record<string, number> = {
  home: 0,
  skill: 1,
}
const MAIN_ROUTE_TRANSITION_MS = 360
const MAIN_ROUTE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

const route = useRoute()
const router = useRouter()
const showBottomNav = computed(() => route.meta.showBottomNav === true)
const showSharedBackground = computed(() => (
  route.meta.showBottomNav === true || route.meta.showSharedBackground === true
))
const exitToastVisible = ref(false)
const backgroundVideoRef = ref<HTMLVideoElement | null>(null)
const backgroundVideoReady = ref(false)
const routeTransitionName = ref('')

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

function routeNameToKey(name: unknown) {
  return typeof name === 'string' ? name : ''
}

function shouldReduceMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function getMainRouteInner(element: Element) {
  return element.querySelector<HTMLElement>('.home-view__inner, .skill-view__inner')
}

function getMainRouteDirection() {
  return routeTransitionName.value === 'main-route-back' ? -1 : 1
}

function resetRouteTransitionStyles(root: HTMLElement, inner: HTMLElement | null) {
  root.style.position = ''
  root.style.inset = ''
  root.style.width = ''
  root.style.pointerEvents = ''

  if (!inner) {
    return
  }

  inner.style.transition = ''
  inner.style.transform = ''
  inner.style.opacity = ''
  inner.style.willChange = ''
}

function finishAfterMainRouteAnimation(callback: () => void) {
  window.setTimeout(callback, MAIN_ROUTE_TRANSITION_MS + 40)
}

function handleMainRouteBeforeEnter(element: Element) {
  if (!routeTransitionName.value || shouldReduceMotion()) {
    return
  }

  const inner = getMainRouteInner(element)

  if (!inner) {
    return
  }

  inner.style.transition = 'none'
  inner.style.transform = `translateX(${getMainRouteDirection() * 100}%)`
  inner.style.opacity = '0.98'
  inner.style.willChange = 'transform, opacity'
}

function handleMainRouteEnter(element: Element, done: () => void) {
  if (!routeTransitionName.value || shouldReduceMotion()) {
    done()
    return
  }

  const root = element as HTMLElement
  const inner = getMainRouteInner(element)

  if (!inner) {
    done()
    return
  }

  requestAnimationFrame(() => {
    inner.style.transition = `transform ${MAIN_ROUTE_TRANSITION_MS}ms ${MAIN_ROUTE_EASING}, opacity 240ms ease`
    inner.style.transform = 'translateX(0)'
    inner.style.opacity = '1'
  })

  finishAfterMainRouteAnimation(() => {
    resetRouteTransitionStyles(root, inner)
    done()
  })
}

function handleMainRouteLeave(element: Element, done: () => void) {
  if (!routeTransitionName.value || shouldReduceMotion()) {
    done()
    return
  }

  const root = element as HTMLElement
  const inner = getMainRouteInner(element)

  root.style.position = 'absolute'
  root.style.inset = '0'
  root.style.width = '100%'
  root.style.pointerEvents = 'none'

  if (!inner) {
    done()
    return
  }

  requestAnimationFrame(() => {
    inner.style.transition = `transform ${MAIN_ROUTE_TRANSITION_MS}ms ${MAIN_ROUTE_EASING}, opacity 240ms ease`
    inner.style.transform = `translateX(${getMainRouteDirection() * -100}%)`
    inner.style.opacity = '0.86'
    inner.style.willChange = 'transform, opacity'
  })

  finishAfterMainRouteAnimation(() => {
    resetRouteTransitionStyles(root, inner)
    done()
  })
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

  if (route.name === 'skill-history') {
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

watch(
  () => route.name,
  (nextName, previousName) => {
    const nextKey = routeNameToKey(nextName)
    const previousKey = routeNameToKey(previousName)

    if (
      !(nextKey in MAIN_ROUTE_ORDER) ||
      !(previousKey in MAIN_ROUTE_ORDER) ||
      nextKey === previousKey
    ) {
      routeTransitionName.value = ''
      return
    }

    routeTransitionName.value = MAIN_ROUTE_ORDER[nextKey] > MAIN_ROUTE_ORDER[previousKey]
      ? 'main-route-forward'
      : 'main-route-back'
  },
)

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
    <RouterView v-slot="{ Component, route: viewRoute }">
      <transition
        :css="false"
        @before-enter="handleMainRouteBeforeEnter"
        @enter="handleMainRouteEnter"
        @leave="handleMainRouteLeave"
      >
        <component
          :is="Component"
          :key="viewRoute.name ?? viewRoute.fullPath"
        />
      </transition>
    </RouterView>
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
  overflow-x: clip;
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
