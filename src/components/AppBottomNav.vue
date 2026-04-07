<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()

const items = [
  { name: 'home', label: '歌曲列表', to: '/' },
  { name: 'skill', label: 'SKILL', to: '/skill' },
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
      replace
    >
      <span class="bottom-nav__icon-badge" aria-hidden="true">
        <svg v-if="item.name === 'home'" viewBox="0 0 24 24">
          <path d="M5 7H19" />
          <path d="M5 12H19" />
          <path d="M5 17H15" />
        </svg>
        <svg v-else class="bottom-nav__skill-icon" viewBox="0 0 93 139" aria-hidden="true">
          <path
            d="M59.9967 16.351C59.5356 16.3843 59.0994 16.6138 58.7662 16.9983L14.197 63.0332C13.9946 63.2227 13.8358 63.4711 13.7356 63.7548C13.6354 64.0386 13.5971 64.3484 13.6243 64.6549C13.6552 64.9783 13.7529 65.2872 13.9083 65.5537C14.0638 65.8203 14.2721 66.036 14.5145 66.1813L35.9486 80.6132C38.7838 82.5211 40.0993 86.5754 39.09 90.2889L30.987 120.018L24.7382 117.558L30.987 120.011C30.8169 120.645 30.8906 120.979 30.9643 121.197C31.1615 121.64 31.4561 122.01 31.816 122.266C32.176 122.522 32.5874 122.654 33.0057 122.648C33.4668 122.615 33.903 122.385 34.2361 122.001L78.8054 75.9661C79.0084 75.7769 79.1679 75.5288 79.2691 75.2451C79.3703 74.9614 79.4098 74.6514 79.3838 74.3443C79.3528 74.021 79.2552 73.7121 79.0997 73.4455C78.9442 73.179 78.7359 72.9633 78.4935 72.818L57.0594 58.3861C55.6842 57.4603 54.6191 55.9893 54.0462 54.2246C53.4732 52.4598 53.4279 50.5108 53.918 48.7103L62.0154 18.9812C62.1855 18.3611 62.1174 18.0204 62.0437 17.8024C61.8466 17.3591 61.552 16.9894 61.192 16.7335C60.8321 16.4776 60.4206 16.3453 60.0024 16.351H59.9967ZM74.9495 24.0712L68.593 47.4089L85.1392 58.5497C94.3819 64.7708 95.7882 79.9931 87.6795 88.3674L43.1103 134.409C37.2301 140.474 29.6998 140.01 24.4604 136.038C19.1926 132.045 15.5976 123.957 18.0528 114.928L24.415 91.5904L7.85747 80.4496C-1.38526 74.2285 -2.78585 59.0062 5.32281 50.6319L49.8921 4.59697C55.7723 -1.47424 63.3025 -1.0109 68.5477 2.96163C73.8098 6.95459 77.4105 15.0427 74.9495 24.0712ZM9.7287 56.7917L24.5114 117.47H24.5227"
            fill="currentColor"
          />
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

.bottom-nav__skill-icon {
  display: block;
  width: 15px;
  height: 22px;
  flex: none;
}

.bottom-nav__label {
  font-family: 'Roboto', var(--font-sans);
  font-size: 0.76rem;
  font-weight: 500;
  letter-spacing: 0.01em;
}
</style>
