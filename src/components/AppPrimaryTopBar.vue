<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{
  modelValue: string
  authenticated: boolean
  avatarLabel?: string
  placeholder?: string
  searchActionLabel?: string
}>(), {
  avatarLabel: 'B',
  placeholder: '搜索曲目/艺术家',
  searchActionLabel: '搜索',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  searchFocus: []
  searchAction: []
  searchSubmit: []
  avatar: []
}>()

const searchInputRef = ref<HTMLInputElement | null>(null)

function updateSearch(event: Event) {
  const target = event.target
  emit('update:modelValue', target instanceof HTMLInputElement ? target.value : '')
}

function focusSearch() {
  searchInputRef.value?.focus()
}

function blurSearch() {
  searchInputRef.value?.blur()
}

defineExpose({ focusSearch, blurSearch })
</script>

<template>
  <div class="top-shell__purple">
    <div class="top-shell__bar top-shell__bar--primary">
      <label class="search-shell">
        <input
          ref="searchInputRef"
          :value="modelValue"
          class="search-shell__input"
          type="search"
          :placeholder="placeholder"
          @input="updateSearch"
          @click="emit('searchFocus')"
          @focus="emit('searchFocus')"
          @keydown.enter.prevent="emit('searchSubmit')"
        />
        <button
          class="search-shell__button"
          type="button"
          :aria-label="searchActionLabel"
          @click="emit('searchAction')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5"></circle>
            <path d="M16 16L21 21"></path>
          </svg>
        </button>
      </label>

      <button
        class="profile-badge"
        type="button"
        :aria-label="authenticated ? '打开 BJMANIA Profile 面板' : '打开 BJMANIA 登录页面'"
        @click="emit('avatar')"
      >
        <span v-if="authenticated" class="profile-badge__initial">{{ avatarLabel }}</span>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 12C14.4853 12 16.5 9.98528 16.5 7.5C16.5 5.01472 14.4853 3 12 3C9.51472 3 7.5 5.01472 7.5 7.5C7.5 9.98528 9.51472 12 12 12Z"></path>
          <path d="M4 20C4.83333 17.1667 7.5 15.75 12 15.75C16.5 15.75 19.1667 17.1667 20 20"></path>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.top-shell__purple {
  position: relative;
  z-index: 2;
  background: #4b3b76;
  box-shadow: 0 4px 15.8px rgba(133, 121, 168, 0.82);
}

.top-shell__bar {
  width: min(100%, 402px);
  margin: 0 auto;
  padding: var(--primary-top-bar-padding, calc(env(safe-area-inset-top, 0px) + 15px)) 11px 15px;
}

.top-shell__bar--primary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.search-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  min-height: 40px;
  padding-left: 4px;
  overflow: hidden;
  border-radius: 28px;
  background: #ece6f0;
}

.search-shell__input {
  min-height: 40px;
  padding: 4px 20px;
  border: 0;
  background: transparent;
  color: #49454f;
  box-shadow: none;
  font-family: 'Roboto', var(--font-sans);
  font-size: 16px;
  letter-spacing: 0.03em;
}

.search-shell__input::placeholder {
  color: #6b6670;
}

.search-shell__input:focus {
  border: 0;
  background: transparent;
  box-shadow: none;
}

.search-shell__button,
.profile-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #49454f;
  cursor: pointer;
}

.search-shell__button svg,
.profile-badge svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.profile-badge {
  flex: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: #65558f;
  box-shadow: 0 4px 10px rgba(39, 28, 78, 0.18);
}

.profile-badge__initial {
  color: #4f378a;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
}

@media (max-width: 440px) {
  .top-shell__bar {
    padding-right: 10px;
    padding-left: 10px;
  }
}
</style>
