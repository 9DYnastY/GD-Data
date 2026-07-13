<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SongSkillHistoryPoint } from '../lib/bjmania/song-skill-history'
import {
  groupSongSkillHistoryByLevel,
  SONG_SKILL_LEVEL_LABELS,
} from '../lib/bjmania/song-skill-history'

const props = defineProps<{
  points: SongSkillHistoryPoint[]
}>()

const PADDING = { top: 16, right: 12, bottom: 28, left: 40 }
const VIEW_WIDTH = 320
const VIEW_HEIGHT = 168

const activePointId = ref<string | null>(null)

const seriesList = computed(() => groupSongSkillHistoryByLevel(props.points))

const timeRange = computed(() => {
  if (props.points.length === 0) {
    return { min: 0, max: 1 }
  }

  const timestamps = props.points.map((point) => point.timestamp)
  const min = Math.min(...timestamps)
  const max = Math.max(...timestamps)

  if (min === max) {
    return { min: min - 1, max: max + 1 }
  }

  return { min, max }
})

const skillRange = computed(() => {
  const values = props.points.map((point) => point.skillRaw)
  const maxRaw = values.length > 0 ? Math.max(...values, 0) : 0
  // Always include 0 so failed points sit on the baseline.
  const paddedMax = maxRaw <= 0 ? 100 : Math.ceil(maxRaw * 1.08)

  return { min: 0, max: paddedMax }
})

const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right
const plotHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom

function xFor(timestamp: number) {
  const { min, max } = timeRange.value
  return PADDING.left + ((timestamp - min) / (max - min)) * plotWidth
}

function yFor(skillRaw: number) {
  const { min, max } = skillRange.value
  const ratio = (skillRaw - min) / (max - min)
  return PADDING.top + (1 - ratio) * plotHeight
}

function seriesPath(points: SongSkillHistoryPoint[]) {
  if (points.length === 0) {
    return ''
  }

  return points
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L'
      return `${command}${xFor(point.timestamp).toFixed(2)} ${yFor(point.skillRaw).toFixed(2)}`
    })
    .join(' ')
}

const yTicks = computed(() => {
  const { max } = skillRange.value
  const steps = 3
  return Array.from({ length: steps + 1 }, (_, index) => {
    const raw = (max / steps) * index
    return {
      raw,
      label: (raw / 100).toFixed(raw % 100 === 0 ? 0 : 1),
      y: yFor(raw),
    }
  })
})

const activePoint = computed(() => (
  props.points.find((point) => point.id === activePointId.value) ?? null
))

const activeBubbleStyle = computed(() => {
  if (!activePoint.value) {
    return null
  }

  const x = xFor(activePoint.value.timestamp)
  const y = yFor(activePoint.value.skillRaw)
  const preferLeft = x > VIEW_WIDTH * 0.62

  return {
    left: `${(preferLeft ? x - 8 : x + 8) / VIEW_WIDTH * 100}%`,
    top: `${Math.max(8, y - 10) / VIEW_HEIGHT * 100}%`,
    transform: preferLeft ? 'translate(-100%, -100%)' : 'translate(0, -100%)',
  }
})

function selectPoint(pointId: string) {
  activePointId.value = activePointId.value === pointId ? null : pointId
}

function clearActivePoint() {
  activePointId.value = null
}
</script>

<template>
  <section class="skill-chart" aria-label="游玩记录曲线">
    <header class="skill-chart__header">
      <h2>游玩记录</h2>
      <div class="skill-chart__legend" aria-label="难度图例">
        <span
          v-for="series in seriesList"
          :key="series.level"
          class="skill-chart__legend-item"
        >
          <i :style="{ background: series.color }"></i>
          {{ series.label }}
        </span>
      </div>
    </header>

    <div class="skill-chart__canvas-wrap">
      <svg
        class="skill-chart__svg"
        :viewBox="`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`"
        role="img"
        aria-label="单曲 Skill 曲线"
        @click="clearActivePoint"
      >
        <rect
          class="skill-chart__plot"
          :x="PADDING.left"
          :y="PADDING.top"
          :width="plotWidth"
          :height="plotHeight"
        />

        <g class="skill-chart__grid">
          <line
            v-for="tick in yTicks"
            :key="`grid-${tick.raw}`"
            :x1="PADDING.left"
            :x2="VIEW_WIDTH - PADDING.right"
            :y1="tick.y"
            :y2="tick.y"
          />
        </g>

        <g class="skill-chart__y-labels">
          <text
            v-for="tick in yTicks"
            :key="`label-${tick.raw}`"
            :x="PADDING.left - 6"
            :y="tick.y + 3"
            text-anchor="end"
          >
            {{ tick.label }}
          </text>
        </g>

        <g
          v-for="series in seriesList"
          :key="series.level"
          class="skill-chart__series"
        >
          <path
            v-if="series.points.length > 1"
            :d="seriesPath(series.points)"
            fill="none"
            :stroke="series.color"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle
            v-for="point in series.points"
            :key="point.id"
            :cx="xFor(point.timestamp)"
            :cy="yFor(point.skillRaw)"
            :r="activePointId === point.id ? 5 : 3.5"
            :fill="series.color"
            :class="{ 'skill-chart__point--active': activePointId === point.id }"
            @click.stop="selectPoint(point.id)"
          />
        </g>
      </svg>

      <div
        v-if="activePoint && activeBubbleStyle"
        class="skill-chart__bubble"
        :style="activeBubbleStyle"
        role="status"
      >
        <strong>{{ activePoint.playedAtText }}</strong>
        <span>
          {{ SONG_SKILL_LEVEL_LABELS[activePoint.level] }}
          ·
          {{ activePoint.skillText }}
        </span>
        <span>
          {{ activePoint.percText }}
          ·
          {{ activePoint.clearLabel }}
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.skill-chart {
  display: grid;
  gap: 10px;
  width: 100%;
  padding: 14px 14px 12px;
  border-radius: 14px;
  background: #fdfcff;
  box-shadow: 0 8px 20px rgba(45, 32, 86, 0.08);
}

.skill-chart__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.skill-chart__header h2 {
  margin: 0;
  color: #2d205e;
  font-family: var(--font-figma-title);
  font-size: 0.95rem;
  font-weight: 700;
}

.skill-chart__legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.skill-chart__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: rgba(45, 32, 94, 0.72);
  font-size: 0.68rem;
  font-weight: 600;
}

.skill-chart__legend-item i {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.skill-chart__canvas-wrap {
  position: relative;
  width: 100%;
}

.skill-chart__svg {
  display: block;
  width: 100%;
  height: auto;
  touch-action: manipulation;
}

.skill-chart__plot {
  fill: rgba(79, 55, 138, 0.03);
}

.skill-chart__grid line {
  stroke: rgba(79, 55, 138, 0.1);
  stroke-width: 1;
}

.skill-chart__y-labels text {
  fill: rgba(45, 32, 94, 0.55);
  font-size: 9px;
  font-family: var(--font-figma-ui);
}

.skill-chart__point--active {
  stroke: #ffffff;
  stroke-width: 1.5;
}

.skill-chart__bubble {
  position: absolute;
  z-index: 2;
  display: grid;
  gap: 2px;
  min-width: 118px;
  max-width: 170px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(45, 32, 94, 0.92);
  color: #ffffff;
  box-shadow: 0 8px 18px rgba(30, 20, 60, 0.22);
  pointer-events: none;
}

.skill-chart__bubble strong {
  font-size: 0.72rem;
  font-weight: 700;
}

.skill-chart__bubble span {
  color: rgba(255, 255, 255, 0.86);
  font-size: 0.68rem;
  line-height: 1.25;
}
</style>
