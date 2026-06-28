<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  type DtxHandAnnotation,
  type DtxRealtimeNoteHitbox,
  prepareDtxRealtimeData,
  renderDtxRealtimeCanvas,
} from '../lib/chart-preview-realtime-renderer'
import type { DtxDrawingConfig, DtxJson } from '../lib/chart-preview-types'

const props = defineProps<{
  annotationMode?: boolean
  annotations?: Record<string, DtxHandAnnotation>
  bookmarkTimes?: number[]
  drawingConfig: DtxDrawingConfig
  dtxJson: DtxJson
  progress: number
  reverse: boolean
  selectedNoteKey?: string | null
}>()

const emit = defineEmits<{
  selectNote: [noteKey: string]
}>()

const rootEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const viewportWidth = ref(0)
const viewportHeight = ref(0)
const realtimeData = computed(() => prepareDtxRealtimeData(props.dtxJson))
let resizeObserver: ResizeObserver | null = null
let latestHitboxes: DtxRealtimeNoteHitbox[] = []

function syncViewportSize() {
  const root = rootEl.value

  viewportWidth.value = root?.clientWidth ?? 0
  viewportHeight.value = root?.clientHeight ?? 0
}

function renderCanvas() {
  const canvas = canvasEl.value

  if (!canvas) {
    return
  }

  latestHitboxes = renderDtxRealtimeCanvas(canvas, realtimeData.value, props.drawingConfig, {
    annotationMode: props.annotationMode,
    annotations: props.annotations,
    bookmarkTimes: props.bookmarkTimes,
    progress: props.progress,
    reverse: props.reverse,
    selectedNoteKey: props.selectedNoteKey,
    viewportWidth: viewportWidth.value,
    viewportHeight: viewportHeight.value,
  })
}

watch(
  () => [
    realtimeData.value,
    props.annotationMode,
    props.annotations,
    props.bookmarkTimes,
    props.drawingConfig,
    props.progress,
    props.reverse,
    props.selectedNoteKey,
    viewportWidth.value,
    viewportHeight.value,
  ] as const,
  () => {
    renderCanvas()
  },
)

function handlePointerDown(event: PointerEvent) {
  if (!props.annotationMode) {
    return
  }

  const rect = rootEl.value?.getBoundingClientRect()

  if (!rect) {
    return
  }

  const localX = event.clientX - rect.left
  const localY = event.clientY - rect.top
  const hitbox = latestHitboxes
    .filter((candidate) => {
      return (
        localX >= candidate.x
        && localX <= candidate.x + candidate.width
        && localY >= candidate.y
        && localY <= candidate.y + candidate.height
      )
    })
    .sort((a, b) => {
      return Math.hypot(localX - a.centerX, localY - a.centerY)
        - Math.hypot(localX - b.centerX, localY - b.centerY)
    })[0]

  if (!hitbox) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  emit('selectNote', hitbox.noteKey)
}

onMounted(async () => {
  await nextTick()
  syncViewportSize()

  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    resizeObserver = new ResizeObserver(() => {
      syncViewportSize()
    })
    resizeObserver.observe(rootEl.value)
  }

  renderCanvas()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div
    ref="rootEl"
    class="dtx-realtime-canvas"
    :class="{ 'dtx-realtime-canvas--interactive': annotationMode }"
    @pointerdown="handlePointerDown"
  >
    <canvas ref="canvasEl" class="dtx-realtime-canvas__surface"></canvas>
  </div>
</template>

<style scoped>
.dtx-realtime-canvas {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  background: #000000;
  pointer-events: none;
}

.dtx-realtime-canvas--interactive {
  pointer-events: auto;
}

.dtx-realtime-canvas__surface {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
