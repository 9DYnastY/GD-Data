<script setup lang="ts">
import { computed, ref } from 'vue'

const ITEM_WIDTH = 58
const ITEM_GAP = 8
const STEP_WIDTH = ITEM_WIDTH + ITEM_GAP

const props = withDefaults(defineProps<{
  startValue: number
  minValue?: number
  maxValue?: number
  windowSize?: number
  stepValue?: number
  label?: string
  disabled?: boolean
}>(), {
  minValue: 0,
  maxValue: 1000,
  windowSize: 50,
  stepValue: 50,
  disabled: false,
})

const emit = defineEmits<{
  'update:startValue': [value: number]
}>()

const dragging = ref(false)
const dragOffset = ref(0)
let dragStartX = 0

const spanValue = computed(() => Math.max(props.maxValue - props.minValue, 1))
const windowValue = computed(() => Math.min(Math.max(props.windowSize, 1), spanValue.value))
const maxStartValue = computed(() => Math.max(props.minValue, props.maxValue - windowValue.value))

const stopValues = computed(() => {
  const stops: number[] = []
  const stepValue = Math.max(props.stepValue, 1)

  for (let value = props.minValue; value <= maxStartValue.value; value += stepValue) {
    stops.push(value)
  }

  if (stops[stops.length - 1] !== maxStartValue.value) {
    stops.push(maxStartValue.value)
  }

  return stops.length > 0 ? stops : [props.minValue]
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

function formatDifficulty(value: number) {
  return (value / 100).toFixed(1)
}

const startIndex = computed(() => findClosestIndex(props.startValue))
const currentStartValue = computed(() => valueAt(startIndex.value))
const currentEndValue = computed(() => currentStartValue.value + windowValue.value)
const rangeText = computed(() => `${formatDifficulty(currentStartValue.value)} - ${formatDifficulty(currentEndValue.value)}`)
const boundaryValues = computed(() => {
  const boundaries = [...stopValues.value]

  if (boundaries[boundaries.length - 1] !== props.maxValue) {
    boundaries.push(props.maxValue)
  }

  return boundaries
})
const selectedCenterOffset = computed(() => startIndex.value * STEP_WIDTH + ITEM_WIDTH + ITEM_GAP / 2)

const trackStyle = computed(() => ({
  transform: `translate3d(${dragOffset.value - selectedCenterOffset.value}px, -50%, 0)`,
}))

function updateStartIndex(rawIndex: number) {
  if (props.disabled) {
    return
  }

  emit('update:startValue', valueAt(rawIndex))
}

function stepWindow(delta: number) {
  updateStartIndex(startIndex.value + delta)
}

function handlePointerDown(event: PointerEvent) {
  if (props.disabled) {
    return
  }

  dragging.value = true
  dragOffset.value = 0
  dragStartX = event.clientX
  event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId)
}

function handlePointerMove(event: PointerEvent) {
  if (props.disabled || !dragging.value) {
    return
  }

  dragOffset.value = event.clientX - dragStartX
}

function finishDrag(event: PointerEvent) {
  if (!dragging.value) {
    return
  }

  const deltaSteps = Math.round(-dragOffset.value / STEP_WIDTH)
  dragging.value = false
  dragOffset.value = 0
  updateStartIndex(startIndex.value + deltaSteps)

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.releasePointerCapture(event.pointerId)
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (props.disabled) {
    return
  }

  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault()
      stepWindow(-1)
      break
    case 'ArrowRight':
      event.preventDefault()
      stepWindow(1)
      break
    case 'Home':
      event.preventDefault()
      updateStartIndex(0)
      break
    case 'End':
      event.preventDefault()
      updateStartIndex(stopValues.value.length - 1)
      break
  }
}
</script>

<template>
  <div class="difficulty-ruler">
    <div class="difficulty-ruler__controls">
      <div
        class="difficulty-ruler__viewport"
        :class="{
          'difficulty-ruler__viewport--dragging': dragging,
          'difficulty-ruler__viewport--disabled': props.disabled,
        }"
        role="slider"
        :tabindex="props.disabled ? -1 : 0"
        :aria-disabled="props.disabled"
        :aria-label="`${props.label ?? 'LEVEL'} ${rangeText}`"
        :aria-valuemin="0"
        :aria-valuemax="stopValues.length - 1"
        :aria-valuenow="startIndex"
        :aria-valuetext="rangeText"
        @keydown="handleKeydown"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="finishDrag"
        @pointercancel="finishDrag"
      >
        <div
          class="difficulty-ruler__track"
          :style="trackStyle"
          aria-hidden="true"
        >
          <button
            v-for="(boundary, index) in boundaryValues"
            :key="boundary"
            class="difficulty-ruler__tick"
            :class="{
              'difficulty-ruler__tick--selected': index === startIndex || index === startIndex + 1,
            }"
            type="button"
            tabindex="-1"
            :disabled="props.disabled"
            @click.stop="updateStartIndex(index > startIndex ? index - 1 : index)"
          >
            {{ formatDifficulty(boundary) }}
          </button>
        </div>
        <div class="difficulty-ruler__selection-line" aria-hidden="true"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.difficulty-ruler {
  display: grid;
  gap: 0;
}

.difficulty-ruler__controls {
  display: block;
}

.difficulty-ruler__viewport {
  position: relative;
  width: 100%;
  height: 58px;
  overflow: hidden;
  border: 0;
  background: transparent;
  cursor: grab;
  touch-action: pan-y;
  user-select: none;
}

.difficulty-ruler__viewport:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(79, 55, 138, 0.14);
}

.difficulty-ruler__viewport--dragging {
  cursor: grabbing;
}

.difficulty-ruler__viewport--disabled {
  background: transparent;
  cursor: default;
  filter: grayscale(0.28);
}

.difficulty-ruler__track {
  position: absolute;
  left: 50%;
  top: 50%;
  display: flex;
  gap: 8px;
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}

.difficulty-ruler__viewport--dragging .difficulty-ruler__track {
  transition: none;
}

.difficulty-ruler__tick {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 58px;
  width: 58px;
  height: 42px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 13px;
  background: transparent;
  color: rgba(79, 55, 138, 0.56);
  font-family: var(--font-figma-ui);
  font-size: 0.86rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}

.difficulty-ruler__tick:disabled {
  cursor: default;
  opacity: 1;
}

.difficulty-ruler__tick--selected {
  color: #39256b;
  font-size: 1.08rem;
  font-weight: 800;
}

.difficulty-ruler__viewport--disabled .difficulty-ruler__tick {
  color: rgba(87, 82, 96, 0.38);
}

.difficulty-ruler__viewport--disabled .difficulty-ruler__tick--selected {
  color: rgba(72, 67, 80, 0.7);
}

.difficulty-ruler__selection-line {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 24px;
  height: 4px;
  border-radius: 999px;
  background: #6750a4;
  pointer-events: none;
  opacity: 1;
  transform: translate(-50%, -50%) scaleX(1);
  transition: opacity 160ms ease, transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.difficulty-ruler__viewport--dragging .difficulty-ruler__selection-line {
  opacity: 0.42;
  transform: translate(-50%, -50%) scaleX(0.55);
}

.difficulty-ruler__viewport--disabled .difficulty-ruler__selection-line {
  background: rgba(112, 107, 120, 0.68);
  opacity: 0.68;
}
</style>
