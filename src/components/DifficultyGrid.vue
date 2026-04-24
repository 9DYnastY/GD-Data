<script setup lang="ts">
import { computed } from 'vue'
import bassAdvSrc from '../assets/song-page/Card_Song/difficulty/bass_adv.png'
import bassBasSrc from '../assets/song-page/Card_Song/difficulty/bass_bas.png'
import bassExtSrc from '../assets/song-page/Card_Song/difficulty/bass_ext.png'
import bassMasSrc from '../assets/song-page/Card_Song/difficulty/bass_mas.png'
import drumAdvSrc from '../assets/song-page/Card_Song/difficulty/drum_adv.png'
import drumBasSrc from '../assets/song-page/Card_Song/difficulty/drum_bas.png'
import drumExtSrc from '../assets/song-page/Card_Song/difficulty/drum_ext.png'
import drumMasSrc from '../assets/song-page/Card_Song/difficulty/drum_mas.png'
import guitarAdvSrc from '../assets/song-page/Card_Song/difficulty/guitar_adv.png'
import guitarBasSrc from '../assets/song-page/Card_Song/difficulty/guitar_bas.png'
import guitarExtSrc from '../assets/song-page/Card_Song/difficulty/guitar_ext.png'
import guitarMasSrc from '../assets/song-page/Card_Song/difficulty/guitar_mas.png'
import type { DifficultySlot, InstrumentDifficulty, InstrumentKey, LevelKey } from '../types/song'

const props = defineProps<{
  instruments: InstrumentDifficulty[]
  compact?: boolean
  showNoteCount?: boolean
  selectedInstrument?: InstrumentKey
}>()

const COMPACT_CELL_BACKGROUNDS: Record<InstrumentKey, Record<LevelKey, string>> = {
  bass: {
    advanced: bassAdvSrc,
    basic: bassBasSrc,
    extreme: bassExtSrc,
    master: bassMasSrc,
  },
  drum: {
    advanced: drumAdvSrc,
    basic: drumBasSrc,
    extreme: drumExtSrc,
    master: drumMasSrc,
  },
  guitar: {
    advanced: guitarAdvSrc,
    basic: guitarBasSrc,
    extreme: guitarExtSrc,
    master: guitarMasSrc,
  },
}

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

function displayDifficultyText(level: DifficultySlot) {
  return level.available ? level.difficultyText : '-.--'
}

function compactCellBackground(level: LevelKey) {
  const instrument = compactInstrument.value
  return instrument ? COMPACT_CELL_BACKGROUNDS[instrument.key][level] : ''
}
</script>

<template>
  <div v-if="compact && compactInstrument" class="compact-grid">
    <div
      v-for="level in compactLevels"
      :key="`${compactInstrument.key}-${level.level}`"
      class="compact-grid__cell"
      :class="levelClass(level.level)"
      :style="{ backgroundImage: `url(${compactCellBackground(level.level)})` }"
    >
      <div class="compact-grid__value" :class="{ 'compact-grid__value--missing': !level.available }">
        {{ displayDifficultyText(level) }}
      </div>
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
      <div class="compact-grid__value compact-grid__value--missing">-.--</div>
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
          <p class="detail-grid__value">{{ displayDifficultyText(level) }}</p>
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
  overflow: hidden;
  background-repeat: no-repeat;
  background-size: 100% 100%;
}

.compact-grid__value {
  position: relative;
  z-index: 1;
}

.compact-grid__value {
  position: absolute;
  left: 2px;
  right: 0;
  top: 11px;
  bottom: 3px;
  display: flex;
  align-items: center;
  color: #ffffff;
  font-family: var(--font-figma-ui);
  font-size: 40px;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 20px;
  font-feature-settings: 'dlig' 1, 'lnum' 1, 'pnum' 1;
}

.compact-grid__value--missing {
  left: 0;
  right: 0;
  justify-content: center;
}

.compact-grid__cell--empty {
  background: #262527;
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
