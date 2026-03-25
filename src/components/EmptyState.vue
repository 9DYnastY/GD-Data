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
    <p class="empty-state__eyebrow">No matches found</p>
    <h2>No songs match the current conditions</h2>
    <p>
      <template v-if="query">
        Search term "{{ query }}" did not return any result in the current filtered set.
      </template>
      <template v-else>
        The current filter combination is too narrow. Relax version, flags, or difficulty ranges.
      </template>
    </p>
    <button class="action-button" type="button" @click="$emit('reset')">
      Reset search and filters
    </button>
    <p v-if="hasFilters" class="empty-state__hint">
      Start from the full catalog and narrow the list gradually.
    </p>
  </section>
</template>

<style scoped>
.empty-state {
  padding: 32px;
  border-radius: 28px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(249, 238, 226, 0.92));
  border: 1px dashed rgba(191, 87, 0, 0.28);
  display: grid;
  gap: 12px;
  text-align: center;
}

.empty-state__eyebrow,
.empty-state__hint,
.empty-state h2,
.empty-state p {
  margin: 0;
}

.empty-state__eyebrow {
  color: var(--accent-strong);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.empty-state h2 {
  color: var(--ink);
  font-size: 1.4rem;
}

.empty-state p {
  color: var(--muted);
  line-height: 1.6;
}

.empty-state__hint {
  font-size: 0.9rem;
}
</style>
