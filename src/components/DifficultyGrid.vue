<script setup lang="ts">
import type { DifficultySlot, InstrumentDifficulty, LevelKey } from '../types/song'

const props = defineProps<{
  instruments: InstrumentDifficulty[]
  compact?: boolean
  showNoteCount?: boolean
}>()

function orderedLevels(levels: DifficultySlot[]) {
  return [...levels].reverse()
}

function levelClass(level: LevelKey) {
  switch (level) {
    case 'master':
      return 'difficulty-cell--master'
    case 'extreme':
      return 'difficulty-cell--extreme'
    case 'advanced':
      return 'difficulty-cell--advanced'
    default:
      return 'difficulty-cell--basic'
  }
}
</script>

<template>
  <div v-if="compact" class="arcade-grid">
    <div class="arcade-grid__columns">
      <div
        v-for="instrument in props.instruments"
        :key="instrument.key"
        class="arcade-grid__column"
      >
        <div class="arcade-grid__heading">{{ instrument.label }}</div>
        <div
          v-for="level in orderedLevels(instrument.levels)"
          :key="`${instrument.key}-${level.level}`"
          class="difficulty-cell"
          :class="levelClass(level.level)"
        >
          {{ level.available ? level.difficultyText : '--' }}
        </div>
      </div>
    </div>
    <p class="arcade-grid__legend">Rows: Master / Extreme / Advanced / Basic</p>
  </div>

  <div v-else class="detail-grid">
    <section
      v-for="instrument in props.instruments"
      :key="instrument.key"
      class="detail-grid__panel"
    >
      <header class="detail-grid__header">
        <div>
          <p class="detail-grid__eyebrow">{{ instrument.label }}</p>
          <h3>{{ instrument.label }} charts</h3>
        </div>
        <span class="detail-grid__max">Max {{ instrument.maxDifficulty?.toFixed(2) ?? '--' }}</span>
      </header>

      <div class="detail-grid__levels">
        <article
          v-for="level in orderedLevels(instrument.levels)"
          :key="`${instrument.key}-${level.level}`"
          class="detail-grid__cell"
          :class="levelClass(level.level)"
        >
          <p class="detail-grid__label">{{ level.label }}</p>
          <p class="detail-grid__value">{{ level.available ? level.difficultyText : '--' }}</p>
          <p v-if="showNoteCount" class="detail-grid__notes">
            Notes {{ level.noteCountText }}
          </p>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.arcade-grid {
  display: grid;
  gap: 10px;
  padding: 12px;
  background: rgba(81, 67, 162, 0.34);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.arcade-grid__columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.arcade-grid__column {
  display: grid;
  gap: 3px;
}

.arcade-grid__heading {
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.74);
  font-family: var(--font-display);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
  text-transform: uppercase;
}

.difficulty-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  color: white;
  font-family: var(--font-display);
  font-size: 0.86rem;
  font-weight: 700;
}

.difficulty-cell--master {
  background: rgba(147, 51, 234, 0.48);
}

.difficulty-cell--extreme {
  background: rgba(220, 38, 38, 0.4);
}

.difficulty-cell--advanced {
  background: rgba(202, 138, 4, 0.36);
}

.difficulty-cell--basic {
  background: rgba(37, 99, 235, 0.42);
}

.arcade-grid__legend {
  margin: 0;
  color: rgba(190, 183, 214, 0.8);
  font-size: 0.66rem;
  text-align: right;
}

.detail-grid {
  display: grid;
  gap: 14px;
}

.detail-grid__panel {
  padding: 16px;
  background: rgba(81, 67, 162, 0.38);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.detail-grid__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.detail-grid__eyebrow,
.detail-grid__header h3,
.detail-grid__max,
.detail-grid__label,
.detail-grid__value,
.detail-grid__notes {
  margin: 0;
}

.detail-grid__eyebrow {
  color: var(--muted);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.detail-grid__header h3 {
  color: var(--ink);
  font-size: 1.12rem;
}

.detail-grid__max {
  color: var(--accent);
  font-family: var(--font-display);
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.detail-grid__levels {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.detail-grid__cell {
  padding: 10px;
}

.detail-grid__label {
  color: rgba(255, 255, 255, 0.76);
  font-size: 0.72rem;
}

.detail-grid__value {
  margin-top: 8px;
  color: white;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
}

.detail-grid__notes {
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.7rem;
}

@media (max-width: 720px) {
  .difficulty-cell {
    min-height: 28px;
    font-size: 0.8rem;
  }

  .detail-grid__levels {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
