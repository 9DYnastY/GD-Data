<script setup lang="ts">
import type { InstrumentDifficulty } from '../types/song'

defineProps<{
  instruments: InstrumentDifficulty[]
  compact?: boolean
  showNoteCount?: boolean
}>()
</script>

<template>
  <div class="difficulty-grid" :class="{ 'difficulty-grid--compact': compact }">
    <section
      v-for="instrument in instruments"
      :key="instrument.key"
      class="difficulty-panel"
    >
      <header class="difficulty-panel__header">
        <div>
          <p class="difficulty-panel__eyebrow">{{ instrument.label }}</p>
          <h3>{{ instrument.label }} Charts</h3>
        </div>
        <span class="difficulty-panel__max">
          Max {{ instrument.maxDifficulty?.toFixed(2) ?? '--' }}
        </span>
      </header>

      <div class="difficulty-panel__levels">
        <article
          v-for="level in instrument.levels"
          :key="`${instrument.key}-${level.level}`"
          class="difficulty-slot"
          :class="{ 'difficulty-slot--empty': !level.available }"
        >
          <p class="difficulty-slot__label">{{ level.label }}</p>
          <p class="difficulty-slot__value">{{ level.difficultyText }}</p>
          <p v-if="showNoteCount" class="difficulty-slot__meta">
            Notes {{ level.noteCountText }}
          </p>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.difficulty-grid {
  display: grid;
  gap: 16px;
}

.difficulty-grid--compact .difficulty-panel {
  padding: 14px;
}

.difficulty-grid--compact .difficulty-panel__header h3 {
  font-size: 1rem;
}

.difficulty-panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 24px;
  padding: 18px;
  box-shadow: var(--shadow-soft);
}

.difficulty-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.difficulty-panel__eyebrow {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.difficulty-panel__header h3 {
  margin: 0;
  color: var(--ink);
  font-size: 1.08rem;
}

.difficulty-panel__max {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(191, 87, 0, 0.08);
  color: var(--accent-strong);
  font-size: 0.84rem;
  font-weight: 700;
}

.difficulty-panel__levels {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.difficulty-slot {
  min-height: 92px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(31, 41, 55, 0.07);
}

.difficulty-slot--empty {
  background: rgba(209, 213, 219, 0.18);
  color: var(--muted);
}

.difficulty-slot__label,
.difficulty-slot__value,
.difficulty-slot__meta {
  margin: 0;
}

.difficulty-slot__label {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
}

.difficulty-slot__value {
  margin-top: 10px;
  color: var(--ink);
  font-size: 1.22rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.difficulty-slot--empty .difficulty-slot__value {
  color: var(--muted);
  font-size: 1rem;
}

.difficulty-slot__meta {
  margin-top: 8px;
  color: var(--muted);
  font-size: 0.78rem;
}

@media (max-width: 900px) {
  .difficulty-panel__levels {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
