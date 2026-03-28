<script setup lang="ts">
import { computed } from 'vue'
import type { DifficultySlot, InstrumentDifficulty, InstrumentKey, LevelKey } from '../types/song'

const props = defineProps<{
  instruments: InstrumentDifficulty[]
  compact?: boolean
  showNoteCount?: boolean
  selectedInstrument?: InstrumentKey
}>()

function orderedLevels(levels: DifficultySlot[]) {
  return [...levels].reverse()
}

const compactInstrument = computed(() => {
  if (props.instruments.length === 0) {
    return null
  }

  if (!props.selectedInstrument) {
    return props.instruments[0]
  }

  return props.instruments.find((instrument) => instrument.key === props.selectedInstrument) ?? props.instruments[0]
})

const compactLevels = computed(() => {
  return compactInstrument.value ? orderedLevels(compactInstrument.value.levels) : []
})

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
  <div v-if="compact && compactInstrument" class="compact-grid">
    <div
      v-for="level in compactLevels"
      :key="`${compactInstrument.key}-${level.level}`"
      class="compact-grid__cell"
      :class="levelClass(level.level)"
    >
      <div class="compact-grid__header">
        <span class="compact-grid__instrument">{{ compactInstrument.label }}</span>
        <span class="compact-grid__level">{{ level.label }}</span>
      </div>
      <div class="compact-grid__value">{{ level.available ? level.difficultyText : '--' }}</div>
    </div>
  </div>

  <div v-else-if="compact" class="compact-grid">
    <div
      v-for="index in 4"
      :key="index"
      class="compact-grid__cell compact-grid__cell--empty"
    >
      <div class="compact-grid__header">
        <span class="compact-grid__instrument">Chart</span>
        <span class="compact-grid__level">N/A</span>
      </div>
      <div class="compact-grid__value">--</div>
    </div>
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
.compact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
}

.compact-grid__cell {
  position: relative;
  min-height: 58px;
  padding: 4px 8px 8px;
  border: 1px solid rgba(26, 12, 79, 0.55);
  background: rgba(32, 32, 32, 0.88);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.compact-grid__cell::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 14px;
  opacity: 0.96;
}

.compact-grid__header,
.compact-grid__value {
  position: relative;
  z-index: 1;
}

.compact-grid__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: rgba(245, 244, 250, 0.92);
  font-family: var(--font-display);
  font-size: 0.54rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.compact-grid__instrument {
  color: rgba(223, 223, 223, 0.72);
}

.compact-grid__level {
  text-align: right;
}

.compact-grid__value {
  margin-top: 8px;
  color: #ffffff;
  font-family: var(--font-display);
  font-size: 2.15rem;
  font-weight: 500;
  letter-spacing: -0.06em;
  line-height: 0.92;
}

.difficulty-cell--master::before {
  background: linear-gradient(90deg, rgba(91, 31, 113, 0.95), rgba(223, 0, 255, 0.95));
}

.difficulty-cell--extreme::before {
  background: linear-gradient(90deg, rgba(87, 21, 21, 0.95), rgba(255, 0, 52, 0.95));
}

.difficulty-cell--advanced::before {
  background: linear-gradient(90deg, rgba(84, 63, 0, 0.95), rgba(255, 222, 0, 0.95));
}

.difficulty-cell--basic::before {
  background: linear-gradient(90deg, rgba(14, 54, 116, 0.95), rgba(47, 152, 255, 0.95));
}

.compact-grid__cell--empty::before {
  background: linear-gradient(90deg, rgba(67, 67, 67, 0.95), rgba(128, 128, 128, 0.95));
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
  .compact-grid {
    gap: 10px 12px;
  }

  .compact-grid__cell {
    min-height: 54px;
    padding: 4px 7px 7px;
  }

  .compact-grid__value {
    font-size: 1.95rem;
  }

  .detail-grid__levels {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
