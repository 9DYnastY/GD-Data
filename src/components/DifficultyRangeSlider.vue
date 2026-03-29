<script setup lang="ts">
import { computed } from 'vue'

const DEFAULT_STOPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99]

const props = defineProps<{
  minValue: number
  maxValue: number
  stops?: number[]
  label?: string
}>()

const emit = defineEmits<{
  'update:minValue': [value: number]
  'update:maxValue': [value: number]
}>()

const stopValues = computed(() => {
  const candidateStops = props.stops ?? DEFAULT_STOPS
  return candidateStops.length > 1 ? candidateStops : DEFAULT_STOPS
})

function clampIndex(index: number) {
  return Math.min(Math.max(index, 0), stopValues.value.length - 1)
}

function findClosestIndex(value: number) {
  let closestIndex = 0
  let closestDistance = Number.POSITIVE_INFINITY

  stopValues.value.forEach((stop, index) => {
    const distance = Math.abs(stop - value)

    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = index
    }
  })

  return closestIndex
}

function valueAt(index: number) {
  return stopValues.value[clampIndex(index)]
}

function percentAt(index: number) {
  if (stopValues.value.length === 1) {
    return 0
  }

  return (clampIndex(index) / (stopValues.value.length - 1)) * 100
}

function formatDifficulty(value: number) {
  return value === 99 ? '9.9' : `${Math.floor(value / 10)}.0`
}

const minIndex = computed(() => findClosestIndex(props.minValue))
const maxIndex = computed(() => findClosestIndex(props.maxValue))
const leftPercent = computed(() => percentAt(minIndex.value))
const rightPercent = computed(() => percentAt(maxIndex.value))
const activeWidth = computed(() => Math.max(rightPercent.value - leftPercent.value, 0))
const rangeText = computed(() => `${formatDifficulty(props.minValue)} - ${formatDifficulty(props.maxValue)}`)

function updateMinIndex(rawIndex: number) {
  const nextIndex = Math.min(clampIndex(rawIndex), maxIndex.value)
  emit('update:minValue', valueAt(nextIndex))
}

function updateMaxIndex(rawIndex: number) {
  const nextIndex = Math.max(clampIndex(rawIndex), minIndex.value)
  emit('update:maxValue', valueAt(nextIndex))
}
</script>

<template>
  <div class="range-slider">
    <div class="range-slider__track-shell">
      <div class="range-slider__rail">
        <div class="range-slider__track"></div>
        <div
          class="range-slider__track range-slider__track--active"
          :style="{ left: `${leftPercent}%`, width: `${activeWidth}%` }"
        ></div>

        <div class="range-slider__stops" aria-hidden="true">
          <span
            v-for="(stop, index) in stopValues"
            :key="stop"
            class="range-slider__stop"
            :class="{
              'range-slider__stop--active': index >= minIndex && index <= maxIndex,
            }"
          ></span>
        </div>

        <div
          class="range-slider__handle"
          :style="{ left: `calc(${leftPercent}% - 2px)` }"
          aria-hidden="true"
        ></div>
        <div
          class="range-slider__handle"
          :style="{ left: `calc(${rightPercent}% - 2px)` }"
          aria-hidden="true"
        ></div>

        <input
          class="range-slider__input range-slider__input--min"
          type="range"
          :min="0"
          :max="stopValues.length - 1"
          :value="minIndex"
          step="1"
          @input="updateMinIndex(Number(($event.target as HTMLInputElement).value))"
        />
        <input
          class="range-slider__input range-slider__input--max"
          type="range"
          :min="0"
          :max="stopValues.length - 1"
          :value="maxIndex"
          step="1"
          @input="updateMaxIndex(Number(($event.target as HTMLInputElement).value))"
        />
      </div>
    </div>

    <p class="range-slider__label">
      {{ props.label ?? 'LEVEL' }} {{ rangeText }}
    </p>
  </div>
</template>

<style scoped>
.range-slider {
  display: grid;
  gap: 10px;
}

.range-slider__track-shell {
  position: relative;
  height: 44px;
}

.range-slider__rail {
  position: absolute;
  top: 0;
  right: 22px;
  bottom: 0;
  left: 22px;
}

.range-slider__track {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 16px;
  transform: translateY(-50%);
  border-radius: 16px;
  background: #e8def8;
}

.range-slider__track--active {
  right: auto;
  height: 8px;
  border-radius: 999px;
  background: #6750a4;
}

.range-slider__stops {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}

.range-slider__stop {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: rgba(103, 80, 164, 0.32);
}

.range-slider__stop--active {
  background: #6750a4;
}

.range-slider__handle {
  position: absolute;
  top: 50%;
  width: 4px;
  height: 44px;
  transform: translateY(-50%);
  border-radius: 2px;
  background: #6750a4;
  box-shadow: 0 1px 3px rgba(79, 55, 138, 0.18);
  pointer-events: none;
}

.range-slider__input {
  position: absolute;
  inset: 0;
  margin: 0;
  width: 100%;
  background: transparent;
  pointer-events: none;
  -webkit-appearance: none;
  appearance: none;
}

.range-slider__input--min,
.range-slider__input--max {
  pointer-events: none;
}

.range-slider__input::-webkit-slider-runnable-track {
  height: 44px;
  background: transparent;
}

.range-slider__input::-webkit-slider-thumb {
  width: 24px;
  height: 44px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  -webkit-appearance: none;
  appearance: none;
}

.range-slider__input::-moz-range-track {
  height: 44px;
  background: transparent;
}

.range-slider__input::-moz-range-thumb {
  width: 24px;
  height: 44px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
}

.range-slider__label {
  margin: 0;
  color: #4f378a;
  font-family: var(--font-figma-ui);
  font-size: 0.92rem;
  line-height: 1;
  text-align: center;
  letter-spacing: 0.02em;
}
</style>
