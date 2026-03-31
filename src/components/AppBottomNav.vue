<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()

const items = [
  { name: 'library', label: 'Library', to: '/' },
  { name: 'skill', label: 'Skill', to: '/skill' },
]

const activeName = computed(() => String(route.name ?? ''))
</script>

<template>
  <nav class="bottom-nav" aria-label="Primary">
    <RouterLink
      v-for="item in items"
      :key="item.name"
      class="bottom-nav__item"
      :class="{ 'bottom-nav__item--active': activeName === item.name }"
      :to="item.to"
    >
      <span class="bottom-nav__icon" aria-hidden="true">
        <svg v-if="item.name === 'library'" viewBox="0 0 24 24">
          <path d="M5 7h14" />
          <path d="M5 12h14" />
          <path d="M5 17h10" />
        </svg>
        <svg v-else viewBox="0 0 24 24">
          <path d="M6 17.5V10" />
          <path d="M12 17.5V6.5" />
          <path d="M18 17.5V12" />
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: min(100%, 420px);
  padding: 10px 18px calc(env(safe-area-inset-bottom, 0px) + 12px);
  transform: translateX(-50%);
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  background: rgba(22, 16, 43, 0.94);
  box-shadow: 0 -12px 32px rgba(8, 6, 18, 0.36);
  backdrop-filter: blur(16px);
}

.bottom-nav__item {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 6px 0 4px;
  color: rgba(236, 232, 250, 0.6);
  text-decoration: none;
}

.bottom-nav__item--active {
  color: #ffffff;
}

.bottom-nav__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
}

.bottom-nav__icon svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.9;
}

.bottom-nav__label {
  font-family: var(--font-display);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
</style>
