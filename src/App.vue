<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppBottomNav from './components/AppBottomNav.vue'

const route = useRoute()
const showBottomNav = computed(() => route.meta.showBottomNav === true)
const showSharedBackground = computed(() => route.meta.showBottomNav === true)
</script>

<template>
  <div v-if="showSharedBackground" class="app-background" aria-hidden="true">
    <video class="app-background__video" autoplay loop muted playsinline preload="auto">
      <source src="/5_background.mp4" type="video/mp4" />
    </video>
    <div class="app-background__overlay"></div>
  </div>
  <div class="app-shell" :class="{ 'app-shell--with-nav': showBottomNav }">
    <RouterView />
  </div>
  <AppBottomNav v-if="showBottomNav" />
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
.app-background__video,
.app-background__overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.app-background {
  z-index: 0;
}

.app-background__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.app-background__overlay {
  z-index: 1;
  background:
    linear-gradient(rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.48)),
    radial-gradient(circle at top, rgba(111, 88, 188, 0.16), transparent 30%);
}
</style>
