<script setup lang="ts">
defineProps<{
  query: string
  hasFilters: boolean
}>()

defineEmits<{
  reset: []
}>()
</script>

<template>
  <section class="empty-state">
    <p class="empty-state__eyebrow">搜索结果</p>
    <h2>没有匹配到歌曲</h2>
    <p>
      <template v-if="query">
        没有找到包含“{{ query }}”的歌曲，请尝试更换关键词或调整筛选条件。
      </template>
      <template v-else>
        当前筛选条件下没有可显示的歌曲，请放宽版本、曲目状态或难度范围。
      </template>
    </p>
    <button class="empty-state__button" type="button" @click="$emit('reset')">
      清空搜索和筛选
    </button>
    <p v-if="hasFilters" class="empty-state__hint">
      清空后会回到完整曲库。
    </p>
  </section>
</template>

<style scoped>
.empty-state {
  display: grid;
  gap: 12px;
  justify-items: center;
  padding: 18px;
  border: 2px solid rgba(47, 0, 178, 0.72);
  border-radius: 18px;
  background: rgba(232, 229, 241, 0.9);
  box-shadow: 0 10px 24px rgba(36, 24, 88, 0.12);
  color: #1d1741;
  text-align: center;
}

.empty-state__eyebrow,
.empty-state__hint,
.empty-state h2,
.empty-state p {
  margin: 0;
}

.empty-state__eyebrow {
  color: rgba(79, 55, 138, 0.74);
  font-family: var(--font-display);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.empty-state h2 {
  color: #1d1741;
  font-size: 1.35rem;
  line-height: 1.15;
}

.empty-state p {
  max-width: 22rem;
  color: rgba(63, 54, 89, 0.9);
  line-height: 1.5;
}

.empty-state__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid #4f378a;
  border-radius: 999px;
  background: #4f378a;
  color: #ffffff;
  box-shadow: none;
  cursor: pointer;
  font-family: 'Roboto', var(--font-sans);
  font-size: 0.84rem;
  font-weight: 500;
}

.empty-state__hint {
  font-size: 0.86rem;
}
</style>
