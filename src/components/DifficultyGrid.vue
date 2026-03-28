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
        <span class="compact-grid__instrument">{{ compactInstrument.label.toUpperCase() }}</span>
        <span class="compact-grid__level">{{ level.label.toUpperCase() }}</span>
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
  grid-template-columns: repeat(2, 82px);
  grid-auto-rows: 45px;
  gap: 15px 25px;
  justify-content: start;
}

.compact-grid__cell {
  position: relative;
  width: 82px;
  height: 45px;
  padding: 1px 1px 0 2px;
  border: 0;
  background-color: #191919;
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  overflow: hidden;
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
  gap: 6px;
  width: 78px;
  height: 8px;
  color: rgba(245, 244, 250, 0.92);
  font-family: var(--font-figma-ui);
  font-size: 8px;
  font-weight: 400;
  letter-spacing: -0.08em;
  line-height: 20px;
  text-transform: uppercase;
}

.compact-grid__instrument {
  color: #747474;
  white-space: nowrap;
}

.compact-grid__level {
  color: rgba(27, 22, 29, 0.85);
  text-align: right;
  font-size: 11px;
  letter-spacing: -0.03em;
  line-height: 20px;
  white-space: nowrap;
}

.compact-grid__value {
  display: flex;
  align-items: center;
  min-height: 32px;
  margin-top: 3px;
  color: #ffffff;
  font-family: var(--font-figma-ui);
  font-size: 40px;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 20px;
  font-feature-settings: 'dlig' 1, 'lnum' 1, 'pnum' 1;
}

.difficulty-cell--master::before {
  content: none;
}

.difficulty-cell--extreme::before {
  content: none;
}

.difficulty-cell--advanced::before {
  content: none;
}

.difficulty-cell--basic::before {
  content: none;
}

.difficulty-cell--master {
  background-image: url('/figma-card/difficulty-master.png');
}

.difficulty-cell--extreme {
  background-image: url('/figma-card/difficulty-extreme.png');
}

.difficulty-cell--advanced {
  background-image: url('/figma-card/difficulty-advanced.png');
}

.difficulty-cell--basic {
  background-image: url('/figma-card/difficulty-basic.png');
}

.compact-grid__cell--empty {
  background-image: none;
  border: 1px solid rgba(122, 122, 122, 0.72);
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
  .detail-grid__levels {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
