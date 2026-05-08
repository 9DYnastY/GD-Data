<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { renderDtxCanvas } from '../lib/chart-preview-renderer'
import type { DtxCanvasData } from '../lib/chart-preview-types'

const props = defineProps<{
  canvasData: DtxCanvasData
  zoom: number
}>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
let renderSequence = 0

const scaledWidth = computed(() => `${Math.ceil(props.canvasData.canvasSize.width * props.zoom)}px`)
const scaledHeight = computed(() => `${Math.ceil(props.canvasData.canvasSize.height * props.zoom)}px`)

async function renderCanvas() {
  const canvas = canvasEl.value

  if (!canvas) {
    return
  }

  const currentSequence = ++renderSequence
  await renderDtxCanvas(canvas, props.canvasData, props.zoom)

  if (currentSequence !== renderSequence) {
    return
  }
}

watch(
  () => [props.canvasData, props.zoom] as const,
  () => {
    void renderCanvas()
  },
)

onMounted(() => {
  void renderCanvas()
})

onBeforeUnmount(() => {
  renderSequence += 1
})
</script>

<template>
  <div
    class="dtx-chart-canvas"
    :style="{
      width: scaledWidth,
      height: scaledHeight,
    }"
  >
    <canvas
      ref="canvasEl"
      class="dtx-chart-canvas__surface"
    />
  </div>
</template>

<style scoped>
.dtx-chart-canvas {
  position: relative;
  display: block;
  flex: 0 0 auto;
  overflow: hidden;
  background: #000000;
  line-height: 0;
}

.dtx-chart-canvas__surface {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
}
</style>
