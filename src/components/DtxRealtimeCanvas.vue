<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  prepareDtxRealtimeData,
  renderDtxRealtimeCanvas,
} from '../lib/chart-preview-realtime-renderer'
import type { DtxDrawingConfig, DtxJson } from '../lib/chart-preview-types'

const props = defineProps<{
  drawingConfig: DtxDrawingConfig
  dtxJson: DtxJson
  progress: number
  reverse: boolean
}>()

const rootEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const viewportWidth = ref(0)
const viewportHeight = ref(0)
const realtimeData = computed(() => prepareDtxRealtimeData(props.dtxJson))
let resizeObserver: ResizeObserver | null = null

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

  renderDtxRealtimeCanvas(canvas, realtimeData.value, props.drawingConfig, {
    progress: props.progress,
    reverse: props.reverse,
    viewportWidth: viewportWidth.value,
    viewportHeight: viewportHeight.value,
  })
}

watch(
  () => [realtimeData.value, props.drawingConfig, props.progress, props.reverse, viewportWidth.value, viewportHeight.value] as const,
  () => {
    renderCanvas()
  },
)

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
  <div ref="rootEl" class="dtx-realtime-canvas">
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

.dtx-realtime-canvas__surface {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
