<script setup lang="ts">
import { computed } from 'vue'
import newRecordSrc from '../assets/recent-play/NEW_RECORD.svg'
import { rawSkillToText } from '../lib/bjmania/client'
import type { BjmaniaRecentListItem, BjmaniaScoreListItem } from '../types/bjmania'
import B50ScoreCard from './B50ScoreCard.vue'

const props = defineProps<{
  row: BjmaniaRecentListItem
}>()

type JudgementKey = 'Perfect' | 'Great' | 'Good' | 'Ok' | 'Miss'

const JUDGEMENT_LINES: Array<{
  key: JudgementKey
  countKey: JudgementKey
  percentKey: `${JudgementKey}Perc`
  rgb: string
  alpha?: number
  top: number
}> = [
  { key: 'Perfect', countKey: 'Perfect', percentKey: 'PerfectPerc', rgb: '253, 233, 0', top: 18.5 },
  { key: 'Great', countKey: 'Great', percentKey: 'GreatPerc', rgb: '32, 186, 48', alpha: 0.879, top: 38.28 },
  { key: 'Good', countKey: 'Good', percentKey: 'GoodPerc', rgb: '93, 196, 252', top: 58.06 },
  { key: 'Ok', countKey: 'Ok', percentKey: 'OkPerc', rgb: '165, 133, 250', top: 77.83 },
  { key: 'Miss', countKey: 'Miss', percentKey: 'MissPerc', rgb: '248, 87, 89', top: 97.61 },
]
const RECORD_LINE_HEIGHT = 18.5

function normalizeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizePercentInteger(value: unknown) {
  const raw = normalizeNumber(value)

  if (raw === null) {
    return null
  }

  const absolute = Math.abs(raw)

  if (absolute <= 1 && absolute > 0) {
    return Math.round(raw * 100)
  }

  if (absolute > 100) {
    return Math.round(raw / 100)
  }

  return Math.round(raw)
}

function splitPaddedNumber(value: unknown, width: number) {
  const raw = normalizeNumber(value)

  if (raw === null) {
    return {
      pad: '',
      value: '--',
    }
  }

  const text = String(Math.max(0, Math.trunc(raw)))
  const padded = text.padStart(width, '0')

  return {
    pad: padded.slice(0, Math.max(0, padded.length - text.length)),
    value: text,
  }
}

function splitPaddedPercent(value: unknown, width = 3) {
  const normalized = normalizePercentInteger(value)

  if (normalized === null) {
    return {
      pad: '',
      value: '--',
    }
  }

  const text = String(Math.max(0, normalized))
  const padded = text.padStart(width, '0')

  return {
    pad: padded.slice(0, Math.max(0, padded.length - text.length)),
    value: text,
  }
}

const b50Row = computed<BjmaniaScoreListItem | null>(() => {
  if (
    props.row.musicId === null ||
    !props.row.family ||
    !props.row.instrument ||
    !props.row.level
  ) {
    return null
  }

  return {
    musicId: props.row.musicId,
    song: props.row.song,
    family: props.row.family,
    instrument: props.row.instrument,
    branchLabel: props.row.branchLabel,
    level: props.row.level,
    sheetLabel: props.row.sheetLabel,
    percRaw: props.row.percRaw ?? -2,
    percText: props.row.percText,
    rank: props.row.rank ?? 0,
    rankLabel: props.row.rankLabel === '--' ? 'C' : props.row.rankLabel,
    clear: props.row.clear,
    autoClear: props.row.autoClear,
    fullCombo: props.row.fullCombo,
    excellent: props.row.excellent,
    difficultyRaw: props.row.difficultyRaw,
    difficultyText: props.row.difficultyText,
    skillCalcRaw: props.row.skillRaw ?? 0,
    skillCalcText: props.row.skillText,
    isHot: false,
    isDeleted: props.row.song?.metadata.isDeleted ?? false,
    isClassic: props.row.song?.metadata.isClassic ?? false,
    inSkill: false,
    searchText: props.row.song?.searchText ?? String(props.row.musicId),
  }
})

const recordSkillText = computed(() => {
  const raw = props.row.newSkillRaw
  return raw === null ? '--' : rawSkillToText(raw)
})
const hasNewRecord = computed(() => {
  const raw = normalizeNumber(props.row.newSkillRaw)
  return raw !== null && Math.abs(raw) > 0
})
const scoreListStyle = computed(() => ({
  '--record-offset': hasNewRecord.value ? '0px' : `-${RECORD_LINE_HEIGHT}px`,
  '--record-background-trim': hasNewRecord.value ? '0px' : `${RECORD_LINE_HEIGHT}px`,
}))

const judgementRows = computed(() => JUDGEMENT_LINES.map((line) => ({
  ...line,
  count: splitPaddedNumber(props.row.payload?.[line.countKey], 4),
  percent: splitPaddedPercent(props.row.payload?.[line.percentKey]),
})))

const maxCombo = computed(() => splitPaddedNumber(props.row.comboRaw, 4))
const maxComboPercent = computed(() => splitPaddedPercent(props.row.payload?.MaxComboPerc, 3))
const scoreValue = computed(() => {
  const score = normalizeNumber(props.row.scoreRaw)
  return score === null ? '--' : String(Math.trunc(score))
})
</script>

<template>
  <article
    class="recent-play-card"
    :class="{ 'recent-play-card--no-record': !hasNewRecord }"
    :style="scoreListStyle"
  >
    <div class="recent-play-card__mist" aria-hidden="true"></div>

    <div class="recent-play-card__b50">
      <div v-if="b50Row" class="recent-play-card__b50-scale">
        <B50ScoreCard :row="b50Row" />
      </div>
      <div v-else class="recent-play-card__b50-fallback">
        <span>{{ row.musicId ?? 'RECENT' }}</span>
      </div>
    </div>

    <div class="recent-play-card__score-list">
      <div v-if="hasNewRecord" class="recent-play-card__record-line">
        <div class="recent-play-card__record-band" aria-hidden="true"></div>
        <img
          class="recent-play-card__record-logo"
          :src="newRecordSrc"
          alt="NEW RECORD"
        />
        <span class="recent-play-card__record-plus">+</span>
        <span class="recent-play-card__record-value">{{ recordSkillText }}</span>
      </div>

      <div
        v-for="line in judgementRows"
        :key="line.key"
        class="recent-play-card__judge-line"
        :style="{
          top: `calc(${line.top}px + var(--record-offset))`,
          '--judge-rgb': line.rgb,
          '--judge-alpha': String(line.alpha ?? 1),
        }"
      >
        <div class="recent-play-card__judge-band" aria-hidden="true"></div>
        <span class="recent-play-card__judge-label">{{ line.key }}</span>
        <span class="recent-play-card__judge-count">
          <span class="recent-play-card__pad">{{ line.count.pad }}</span>{{ line.count.value }}
        </span>
        <span class="recent-play-card__judge-percent">
          <span class="recent-play-card__pad">{{ line.percent.pad }}</span>{{ line.percent.value }}<small>%</small>
        </span>
      </div>

      <div class="recent-play-card__plain-line recent-play-card__plain-line--max">
        <span class="recent-play-card__plain-label">Max combo</span>
        <span class="recent-play-card__plain-count">
          <span class="recent-play-card__plain-pad recent-play-card__plain-pad--hidden">{{ maxCombo.pad }}</span>{{ maxCombo.value }}
        </span>
        <span class="recent-play-card__plain-percent">
          <span class="recent-play-card__plain-pad recent-play-card__plain-pad--hidden">{{ maxComboPercent.pad }}</span>{{ maxComboPercent.value }}<small>%</small>
        </span>
      </div>

      <div class="recent-play-card__plain-line recent-play-card__plain-line--score">
        <span class="recent-play-card__plain-label">Score</span>
        <span class="recent-play-card__score-value">
          <span class="recent-play-card__plain-pad"> </span>{{ scoreValue }}
        </span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.recent-play-card {
  --record-offset: 0px;
  --record-background-trim: 0px;
  position: relative;
  width: 366px;
  height: 184px;
  overflow: visible;
}

.recent-play-card__mist,
.recent-play-card__b50,
.recent-play-card__score-list,
.recent-play-card__record-line,
.recent-play-card__record-band,
.recent-play-card__record-logo,
.recent-play-card__record-plus,
.recent-play-card__record-value,
.recent-play-card__judge-line,
.recent-play-card__judge-band,
.recent-play-card__judge-label,
.recent-play-card__judge-count,
.recent-play-card__judge-percent,
.recent-play-card__plain-line,
.recent-play-card__plain-label,
.recent-play-card__plain-count,
.recent-play-card__plain-percent,
.recent-play-card__score-value {
  position: absolute;
}

.recent-play-card__mist {
  top: 9px;
  left: 146px;
  width: 218.259px;
  height: calc(170.952px - var(--record-background-trim));
  background: linear-gradient(
    90deg,
    rgba(228, 228, 228, 0) 0%,
    rgba(228, 228, 228, 0.5) 25.481%,
    rgba(228, 228, 228, 0.5) 80.288%,
    rgba(228, 228, 228, 0) 99.99%
  );
  filter: blur(1.344px);
}

.recent-play-card__b50 {
  top: 0;
  left: 0;
  width: 135.716px;
  height: 184px;
  overflow: hidden;
}

.recent-play-card__b50-scale {
  width: 208px;
  height: 288px;
  transform: scale(0.6525, 0.6389);
  transform-origin: top left;
}

.recent-play-card__b50-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border: 2px solid #2f00b2;
  border-radius: 4px;
  background: rgba(29, 19, 65, 0.86);
  color: #fff;
  font-family: var(--font-figma-title);
  font-size: 0.84rem;
  font-weight: 800;
}

.recent-play-card__score-list {
  top: 16px;
  left: 161px;
  width: 185px;
  height: calc(156px - var(--record-background-trim));
  color: #1c1c1c;
  font-feature-settings: 'dlig' 1, 'lnum' 1, 'pnum' 1;
}

.recent-play-card__record-line {
  top: 1px;
  left: -9px;
  width: 180px;
  height: 16px;
}

.recent-play-card__record-band {
  top: -0.81px;
  left: 0;
  width: 122.569px;
  height: 15.052px;
  background: linear-gradient(
    90deg,
    rgba(0, 0, 75, 0) 0%,
    rgb(0, 0, 75) 5%,
    rgb(0, 0, 75) 95%,
    rgba(0, 0, 75, 0) 100%
  );
}

.recent-play-card__record-logo {
  top: 1.26px;
  left: 3.78px;
  width: 66.947px;
  height: 11.346px;
}

.recent-play-card__record-plus,
.recent-play-card__record-value {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-family:
    'ITC Avant Garde Gothic Std Medium Condensed',
    var(--font-figma-ui);
  font-weight: 500;
  line-height: 30.256px;
  letter-spacing: 0.6303px;
  white-space: nowrap;
}

.recent-play-card__record-plus {
  top: -0.26px;
  left: 73.12px;
  width: 6.303px;
  height: 15.128px;
  font-size: 10.085px;
}

.recent-play-card__record-value {
  top: 1.26px;
  left: 75.26px;
  width: 54.208px;
  height: 15.128px;
  font-size: 11.827px;
}

.recent-play-card__judge-line {
  left: 5px;
  right: 0;
  height: 18.278px;
}

.recent-play-card__judge-band {
  top: 0;
  left: -4.3px;
  width: 182.779px;
  height: 16.128px;
  background: linear-gradient(
    90deg,
    rgba(var(--judge-rgb), 0) 0%,
    rgb(var(--judge-rgb)) 5%,
    rgba(var(--judge-rgb), var(--judge-alpha)) 95%,
    rgba(var(--judge-rgb), 0) 100%
  );
}

.recent-play-card__judge-label,
.recent-play-card__judge-count,
.recent-play-card__judge-percent,
.recent-play-card__plain-label,
.recent-play-card__plain-count,
.recent-play-card__plain-percent,
.recent-play-card__score-value {
  top: 50%;
  display: flex;
  align-items: center;
  height: 15.052px;
  transform: translateY(-50%);
  white-space: nowrap;
}

.recent-play-card__judge-label,
.recent-play-card__judge-count,
.recent-play-card__judge-percent {
  margin-top: 1px;
}

.recent-play-card__judge-label,
.recent-play-card__plain-label {
  left: 0;
  width: 80.638px;
  font-family:
    'rpt',
    var(--font-b50-poster),
    var(--font-figma-ui);
  font-size: 17.203px;
  line-height: 25.804px;
}

.recent-play-card__judge-label {
  color: rgba(0, 0, 0, 0.75);
  letter-spacing: 0.5376px;
}

.recent-play-card__judge-count,
.recent-play-card__judge-percent,
.recent-play-card__plain-count,
.recent-play-card__plain-percent,
.recent-play-card__score-value {
  font-family:
    'ITC Avant Garde Gothic Std Medium Condensed',
    var(--font-figma-ui);
  font-size: 17.203px;
  font-weight: 500;
  line-height: 25.804px;
  letter-spacing: 0.5376px;
}

.recent-play-card__judge-count,
.recent-play-card__plain-count {
  left: 76.34px;
  width: 43.007px;
}

.recent-play-card__judge-percent,
.recent-play-card__plain-percent {
  left: 135.47px;
  width: 40.856px;
}

.recent-play-card__judge-percent small,
.recent-play-card__plain-percent small {
  font-size: 10.752px;
  line-height: 25.804px;
}

.recent-play-card__pad,
.recent-play-card__plain-pad {
  color: #fff;
}

.recent-play-card__plain-line {
  left: 5px;
  right: 0;
  height: 18.278px;
}

.recent-play-card__plain-line--max {
  top: calc(117.39px + var(--record-offset));
}

.recent-play-card__plain-line--score {
  top: calc(137.17px + var(--record-offset));
}

.recent-play-card__plain-label {
  color: #00004b;
  letter-spacing: -0.5376px;
}

.recent-play-card__score-value {
  left: 76.34px;
  width: 74.187px;
}

.recent-play-card__plain-pad--hidden {
  visibility: hidden;
}
</style>
