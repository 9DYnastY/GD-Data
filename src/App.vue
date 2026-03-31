<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppBottomNav from './components/AppBottomNav.vue'

const route = useRoute()
const showBottomNav = computed(() => route.meta.showBottomNav === true)
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--with-nav': showBottomNav }">
    <RouterView />
  </div>
  <AppBottomNav v-if="showBottomNav" />
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-shell--with-nav {
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 92px);
}
</style>
