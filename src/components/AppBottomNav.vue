<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()

const items = computed(() => {
  const baseItems = [
    { name: 'home', label: '曲库', to: '/' },
  ]

  if (Capacitor.getPlatform() !== 'web') {
    baseItems.push({ name: 'skill', label: 'SKILL', to: '/skill' })
    baseItems.push({ name: 'skill-history', label: '游玩历史', to: '/skill/history' })
  }

  return baseItems
})

const activeName = computed(() => String(route.name ?? ''))
const navStyle = computed(() => ({ '--bottom-nav-items': String(items.value.length) }))
</script>

<template>
  <nav class="bottom-nav" :style="navStyle" aria-label="Primary">
    <RouterLink
      v-for="item in items"
      :key="item.name"
      class="bottom-nav__item"
      :class="{ 'bottom-nav__item--active': activeName === item.name }"
      :to="item.to"
      replace
    >
      <span class="bottom-nav__icon-badge" aria-hidden="true">
        <svg v-if="item.name === 'home'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 7H19" />
          <path d="M5 12H19" />
          <path d="M5 17H15" />
        </svg>
        <!-- Stroke bolt, same line style as catalog / history icons. -->
        <svg v-else-if="item.name === 'skill'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13 3L6.5 13.5H11.5L10.5 21L17.5 10.5H12.5L13 3Z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 8.5A8 8 0 1 1 4 14" />
          <path d="M4.5 4.5V8.5H8.5" />
          <path d="M12 7.5V12L15 14" />
        </svg>
      </span>
      <span class="bottom-nav__label">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  left: 50%;
  bottom: 0;
  z-index: 48;
  display: grid;
  grid-template-columns: repeat(var(--bottom-nav-items), minmax(0, 1fr));
  width: min(100%, 402px);
  padding: 6px 22px calc(env(safe-area-inset-bottom, 0px) + 8px);
  transform: translateX(-50%);
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 -10px 26px rgba(69, 55, 118, 0.18);
  backdrop-filter: blur(12px);
}

.bottom-nav__item {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 2px 0 0;
  color: #625b71;
  text-decoration: none;
}

.bottom-nav__item--active {
  color: #4f378a;
}

.bottom-nav__icon-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 32px;
  border-radius: 999px;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.bottom-nav__item--active .bottom-nav__icon-badge {
  background: #e8def8;
}

.bottom-nav__icon-badge svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.9;
}

.bottom-nav__label {
  font-family: 'Roboto', var(--font-sans);
  font-size: 0.76rem;
  font-weight: 500;
  letter-spacing: 0.01em;
}
</style>
