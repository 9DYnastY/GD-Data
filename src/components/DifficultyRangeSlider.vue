<script setup lang="ts">
import { computed, ref } from 'vue'

const ITEM_WIDTH = 58
const ITEM_GAP = 8
const STEP_WIDTH = ITEM_WIDTH + ITEM_GAP
const FINE_ITEM_HEIGHT = 22
const FINE_GESTURE_THRESHOLD = 6

const props = withDefaults(defineProps<{
  startValue: number
  fineOffset?: number
  minValue?: number
  maxValue?: number
  windowSize?: number
  stepValue?: number
  fineStepValue?: number
  label?: string
  disabled?: boolean
}>(), {
  fineOffset: 0,
  minValue: 0,
  maxValue: 1000,
  windowSize: 50,
  stepValue: 50,
  fineStepValue: 10,
  disabled: false,
})

const emit = defineEmits<{
  'update:startValue': [value: number]
  'update:fineOffset': [value: number]
}>()

const dragging = ref(false)
const fineGestureMode = ref<'idle' | 'pending' | 'fine' | 'window'>('idle')
const dragOffset = ref(0)
const fineDragOffset = ref(0)
let dragStartX = 0
let fineDragStartX = 0
let fineDragStartY = 0
let fineDragStartIndex = 0

const spanValue = computed(() => Math.max(props.maxValue - props.minValue, 1))
const windowValue = computed(() => Math.min(Math.max(props.windowSize, 1), spanValue.value))
const maxStartValue = computed(() => Math.max(props.minValue, props.maxValue - windowValue.value))

function buildSteppedValues(minValue: number, maxValue: number, rawStepValue: number) {
  const values: number[] = []
  const stepValue = Math.max(rawStepValue, 1)

  for (let value = minValue; value <= maxValue; value += stepValue) {
    values.push(value)
  }

  if (values[values.length - 1] !== maxValue) {
    values.push(maxValue)
  }

  return values.length > 0 ? values : [minValue]
}

const stopValues = computed(() => buildSteppedValues(props.minValue, maxStartValue.value, props.stepValue))
const fineStopOffsets = computed(() => {
  const fineStepValue = Math.max(props.fineStepValue, 1)
  const maxFineOffset = Math.max(0, windowValue.value - fineStepValue)

  return buildSteppedValues(0, maxFineOffset, fineStepValue)
})

function clampIndex(index: number) {
  return Math.min(Math.max(index, 0), stopValues.value.length - 1)
}

function clampFineIndex(index: number) {
  return Math.min(Math.max(index, 0), fineStopOffsets.value.length - 1)
}

function findClosestValueIndex(values: number[], value: number) {
  let closestIndex = 0
  let closestDistance = Number.POSITIVE_INFINITY

  values.forEach((stop, index) => {
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

function fineOffsetAt(index: number) {
  return fineStopOffsets.value[clampFineIndex(index)]
}

function formatDifficulty(value: number) {
  return (value / 100).toFixed(1)
}

const startIndex = computed(() => findClosestValueIndex(stopValues.value, props.startValue))
const fineIndex = computed(() => findClosestValueIndex(fineStopOffsets.value, props.fineOffset))
const currentStartValue = computed(() => valueAt(startIndex.value))
const currentFineOffset = computed(() => fineOffsetAt(fineIndex.value))
const currentFineStartValue = computed(() => currentStartValue.value + currentFineOffset.value)
const currentEndValue = computed(() => currentStartValue.value + windowValue.value)
const rangeText = computed(() => `${formatDifficulty(currentFineStartValue.value)} - ${formatDifficulty(currentEndValue.value)}`)
const boundaryValues = computed(() => {
  const boundaries = [...stopValues.value]

  if (boundaries[boundaries.length - 1] !== props.maxValue) {
    boundaries.push(props.maxValue)
  }

  return boundaries
})
const selectedCenterOffset = computed(() => startIndex.value * STEP_WIDTH + ITEM_WIDTH + ITEM_GAP / 2)
const fineDragging = computed(() => fineGestureMode.value === 'fine')
const windowDragging = computed(() => dragging.value || fineGestureMode.value === 'window')
const showFineWheel = computed(() => !windowDragging.value)
const finePreviewIndex = computed(() => {
  if (!fineDragging.value) {
    return fineIndex.value
  }

  return clampFineIndex(fineDragStartIndex + Math.round(fineDragOffset.value / FINE_ITEM_HEIGHT))
})
const fineWheelValues = computed(() => fineStopOffsets.value.map((offset, index) => ({
  index,
  label: formatDifficulty(currentStartValue.value + offset),
})))
const finePreviewText = computed(() => {
  return formatDifficulty(currentStartValue.value + fineOffsetAt(finePreviewIndex.value))
})

const trackStyle = computed(() => ({
  transform: `translate3d(${dragOffset.value - selectedCenterOffset.value}px, -50%, 0)`,
}))

function resetFineOffset() {
  if (currentFineOffset.value !== 0) {
    emit('update:fineOffset', 0)
  }
}

function updateStartIndex(rawIndex: number) {
  if (props.disabled) {
    return
  }

  const nextValue = valueAt(rawIndex)

  if (nextValue !== currentStartValue.value) {
    resetFineOffset()
  }

  emit('update:startValue', nextValue)
}

function updateFineIndex(rawIndex: number) {
  if (props.disabled) {
    return
  }

  emit('update:fineOffset', fineOffsetAt(rawIndex))
}

function stepWindow(delta: number) {
  updateStartIndex(startIndex.value + delta)
}

function stepFine(delta: number) {
  updateFineIndex(fineIndex.value + delta)
}

function clampFineDragOffset(offset: number) {
  const minOffset = -fineDragStartIndex * FINE_ITEM_HEIGHT
  const maxOffset = (fineStopOffsets.value.length - 1 - fineDragStartIndex) * FINE_ITEM_HEIGHT

  return Math.min(Math.max(offset, minOffset), maxOffset)
}

function getFineTickStyle(index: number) {
  const anchorIndex = fineDragging.value ? fineDragStartIndex : fineIndex.value
  const offset = (anchorIndex - index) * FINE_ITEM_HEIGHT + (fineDragging.value ? fineDragOffset.value : 0)
  const distance = Math.min(Math.abs(offset) / FINE_ITEM_HEIGHT, 2)
  const scale = 1 - Math.min(distance, 1) * 0.18
  const opacity = props.disabled && index !== fineIndex.value
    ? 0
    : Math.max(0, 1 - distance * 0.34)

  return {
    opacity,
    transform: `translate3d(-50%, calc(-50% + ${offset}px), 0) scale(${scale})`,
    zIndex: Math.max(1, 10 - Math.round(distance * 3)),
  }
}

function handlePointerDown(event: PointerEvent) {
  if (props.disabled) {
    return
  }

  resetFineOffset()
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

function handleFinePointerDown(event: PointerEvent) {
  if (props.disabled || dragging.value) {
    return
  }

  fineDragStartX = event.clientX
  fineDragStartY = event.clientY
  fineDragStartIndex = fineIndex.value
  fineDragOffset.value = 0
  fineGestureMode.value = 'pending'
  event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId)
}

function handleFinePointerMove(event: PointerEvent) {
  if (props.disabled || fineGestureMode.value === 'idle') {
    return
  }

  const deltaX = event.clientX - fineDragStartX
  const deltaY = event.clientY - fineDragStartY

  if (fineGestureMode.value === 'pending') {
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < FINE_GESTURE_THRESHOLD) {
      return
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      fineGestureMode.value = 'window'
      resetFineOffset()
      dragOffset.value = deltaX
      return
    }

    fineGestureMode.value = 'fine'
  }

  if (fineGestureMode.value === 'window') {
    dragOffset.value = deltaX
    return
  }

  fineDragOffset.value = clampFineDragOffset(deltaY)
}

function finishFineDrag(event: PointerEvent) {
  if (fineGestureMode.value === 'idle') {
    return
  }

  if (fineGestureMode.value === 'window') {
    const deltaSteps = Math.round(-dragOffset.value / STEP_WIDTH)
    fineGestureMode.value = 'idle'
    dragOffset.value = 0
    updateStartIndex(startIndex.value + deltaSteps)
  } else {
    const deltaSteps = Math.round(fineDragOffset.value / FINE_ITEM_HEIGHT)
    fineGestureMode.value = 'idle'
    fineDragOffset.value = 0
    updateFineIndex(fineDragStartIndex + deltaSteps)
  }

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

function handleFineKeydown(event: KeyboardEvent) {
  if (props.disabled) {
    return
  }

  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowRight':
      event.preventDefault()
      stepFine(1)
      break
    case 'ArrowDown':
    case 'ArrowLeft':
      event.preventDefault()
      stepFine(-1)
      break
    case 'Home':
      event.preventDefault()
      updateFineIndex(0)
      break
    case 'End':
      event.preventDefault()
      updateFineIndex(fineStopOffsets.value.length - 1)
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
          'difficulty-ruler__viewport--dragging': windowDragging,
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
              'difficulty-ruler__tick--fine-anchor': showFineWheel && index === startIndex,
            }"
            type="button"
            tabindex="-1"
            :disabled="props.disabled"
            @click.stop="updateStartIndex(index > startIndex ? index - 1 : index)"
          >
            {{ formatDifficulty(boundary) }}
          </button>
        </div>
        <div
          class="difficulty-ruler__fine-wheel"
          :class="{
            'difficulty-ruler__fine-wheel--dragging': fineDragging,
            'difficulty-ruler__fine-wheel--disabled': props.disabled,
            'difficulty-ruler__fine-wheel--hidden': !showFineWheel,
          }"
          role="slider"
          :tabindex="props.disabled ? -1 : 0"
          :aria-disabled="props.disabled"
          :aria-label="`左边界 ${finePreviewText}`"
          :aria-valuemin="0"
          :aria-valuemax="fineStopOffsets.length - 1"
          :aria-valuenow="finePreviewIndex"
          :aria-valuetext="finePreviewText"
          @keydown="handleFineKeydown"
          @pointerdown.stop.prevent="handleFinePointerDown"
          @pointermove.stop.prevent="handleFinePointerMove"
          @pointerup.stop.prevent="finishFineDrag"
          @pointercancel.stop.prevent="finishFineDrag"
        >
          <span
            v-for="item in fineWheelValues"
            :key="item.index"
            class="difficulty-ruler__fine-tick"
            :class="{ 'difficulty-ruler__fine-tick--selected': item.index === finePreviewIndex }"
            :style="getFineTickStyle(item.index)"
            aria-hidden="true"
          >
            {{ item.label }}
          </span>
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
  height: 78px;
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
  top: 58%;
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
  touch-action: pan-y;
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

.difficulty-ruler__tick--fine-anchor {
  color: transparent;
}

.difficulty-ruler__viewport--disabled .difficulty-ruler__tick {
  color: rgba(87, 82, 96, 0.38);
}

.difficulty-ruler__viewport--disabled .difficulty-ruler__tick--selected {
  color: rgba(72, 67, 80, 0.7);
}

.difficulty-ruler__viewport--disabled .difficulty-ruler__tick--fine-anchor {
  color: transparent;
}

.difficulty-ruler__selection-line {
  position: absolute;
  left: 50%;
  top: 58%;
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

.difficulty-ruler__fine-wheel {
  position: absolute;
  left: calc(50% - 33px);
  top: 58%;
  width: 58px;
  height: 78px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #4f378a;
  cursor: ns-resize;
  overflow: hidden;
  transform: translate(-50%, -50%);
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}

.difficulty-ruler__fine-wheel:focus-visible {
  outline: none;
}

.difficulty-ruler__fine-wheel--disabled {
  cursor: default;
  pointer-events: none;
}

.difficulty-ruler__fine-wheel--hidden {
  opacity: 0;
}

.difficulty-ruler__fine-tick {
  position: absolute;
  left: 50%;
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 42px;
  color: rgba(79, 55, 138, 0.56);
  font-family: var(--font-figma-ui);
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1;
  pointer-events: none;
  transform-origin: center;
  transition:
    color 140ms ease,
    opacity 140ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform, opacity;
}

.difficulty-ruler__fine-wheel--dragging .difficulty-ruler__fine-tick {
  transition: none;
}

.difficulty-ruler__fine-tick--selected {
  color: #39256b;
  font-size: 1.08rem;
  font-weight: 800;
}

.difficulty-ruler__viewport--disabled .difficulty-ruler__fine-tick--selected {
  color: rgba(72, 67, 80, 0.7);
}
</style>
