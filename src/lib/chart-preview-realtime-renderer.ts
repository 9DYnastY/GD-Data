import {
  FRAME_RECT_POS_X,
  convertHoldNoteRectsToDrawingImageRects,
  getFrameRectRelativePosX,
  getFrameRectWidth,
  getFullBodyFrameWidth,
  getRelativeSizePosOfChipsForLaneCode,
} from './chart-preview-positioner'
import {
  CHIP_COLOR_INFO,
  drawProgrammaticHoldRect,
  getLoadedChartImage,
} from './chart-preview-renderer'
import type { DtxBpmSegment, DtxChip, DtxDrawingConfig, DtxJson, DtxLine, DtxRect } from './chart-preview-types'

interface RealtimeBarLine {
  barNumber: number
  timePosition: number
}

export interface DtxRealtimeData {
  bars: RealtimeBarLine[]
  bpmSegments: DtxBpmSegment[]
  chips: DtxRealtimeChip[]
  holdChips: DtxChip[]
  quarterBarLines: DtxLine[]
  songDuration: number
}

export type DtxHandAnnotation = 'L' | 'R'

export interface DtxRealtimeChip extends DtxChip {
  annotationEligible: boolean
  noteKey: string
}

export interface DtxRealtimeNoteHitbox {
  centerX: number
  centerY: number
  height: number
  noteKey: string
  width: number
  x: number
  y: number
}

interface RenderDtxRealtimeOptions {
  annotationMode?: boolean
  annotations?: Record<string, DtxHandAnnotation>
  bookmarkTimes?: number[]
  progress: number
  reverse: boolean
  selectedNoteKey?: string | null
  viewportHeight: number
  viewportWidth: number
}

interface RenderDtxAnnotationExportOptions {
  annotations: Record<string, DtxHandAnnotation>
  endTime: number
  reverse: boolean
  startTime: number
  width: number
}

const DEFAULT_BACKGROUND_COLOR = '#1f1f1f'
const END_LINE_COLOR = '#ff0000'
const ANNOTATION_BOOKMARK_COLOR = '#e3374f'
const LINE_OVERSCAN_PX = 140
const JUDGMENT_LINE_BOTTOM_OFFSET_PX = 92
const JUDGMENT_LINE_TOP_OFFSET_PX = 92
const MIN_JUDGMENT_LINE_Y_PX = 120
const FOOT_LANES = new Set(['LeftBassPedal', 'RightBassPedal', 'LeftHiHatPedal'])

export const REALTIME_BASE_PIXELS_PER_SECOND = 192

const canvasSizeCache = new WeakMap<HTMLCanvasElement, {
  height: number
  ratio: number
  width: number
}>()

export function getRealtimeJudgmentLineY(viewportHeight: number, reverse: boolean) {
  const safeViewportHeight = Math.max(1, viewportHeight)

  if (reverse) {
    return Math.max(
      MIN_JUDGMENT_LINE_Y_PX,
      safeViewportHeight - JUDGMENT_LINE_BOTTOM_OFFSET_PX,
    )
  }

  return Math.min(
    JUDGMENT_LINE_TOP_OFFSET_PX,
    Math.max(0, safeViewportHeight - MIN_JUDGMENT_LINE_Y_PX),
  )
}

export function prepareDtxRealtimeData(dtxJson: DtxJson): DtxRealtimeData {
  const sortedChips = [...dtxJson.chips].sort((a, b) => a.lineTimePosition.timePosition - b.lineTimePosition.timePosition)
  const duplicateCounter = new Map<string, number>()
  const chips = sortedChips.map((chip) => {
    const baseKey = [
      chip.lineTimePosition.barNumber,
      chip.lineTimePosition.lineNumberInBar,
      chip.lineTimePosition.timePosition,
      chip.laneType,
    ].join(':')
    const duplicateIndex = duplicateCounter.get(baseKey) ?? 0
    duplicateCounter.set(baseKey, duplicateIndex + 1)

    return {
      ...chip,
      annotationEligible: !FOOT_LANES.has(chip.laneType),
      noteKey: `${baseKey}:${duplicateIndex}`,
    }
  })

  return {
    bars: dtxJson.bars
      .map((bar, barNumber) => ({
        barNumber,
        timePosition: bar.startTimePos,
      }))
      .sort((a, b) => a.timePosition - b.timePosition),
    bpmSegments: [...dtxJson.bpmSegments].sort((a, b) => a.startTimePos - b.startTimePos),
    chips,
    holdChips: sortedChips.filter((chip) => typeof chip.endLineTimePosition?.timePosition === 'number'),
    quarterBarLines: [...dtxJson.quarterBarLines].sort((a, b) => a.timePosition - b.timePosition),
    songDuration: dtxJson.songInfo.songDuration,
  }
}

function lowerBoundByTime<T>(items: T[], target: number, getTime: (item: T) => number) {
  let low = 0
  let high = items.length

  while (low < high) {
    const middle = Math.floor((low + high) / 2)

    if (getTime(items[middle] as T) < target) {
      low = middle + 1
    } else {
      high = middle
    }
  }

  return low
}

function getItemsInTimeRange<T>(items: T[], minTime: number, maxTime: number, getTime: (item: T) => number) {
  const startIndex = lowerBoundByTime(items, minTime, getTime)
  const visibleItems: T[] = []

  for (let index = startIndex; index < items.length; index += 1) {
    const item = items[index] as T

    if (getTime(item) > maxTime) {
      break
    }

    visibleItems.push(item)
  }

  return visibleItems
}

function setCanvasSize(canvas: HTMLCanvasElement, viewportWidth: number, viewportHeight: number) {
  const safeWidth = Math.max(1, Math.ceil(viewportWidth))
  const safeHeight = Math.max(1, Math.ceil(viewportHeight))
  const ratio = Math.max(1, window.devicePixelRatio || 1)
  const targetWidth = Math.ceil(safeWidth * ratio)
  const targetHeight = Math.ceil(safeHeight * ratio)
  const cachedSize = canvasSizeCache.get(canvas)

  if (
    !cachedSize
    || cachedSize.width !== targetWidth
    || cachedSize.height !== targetHeight
    || cachedSize.ratio !== ratio
  ) {
    canvas.width = targetWidth
    canvas.height = targetHeight
    canvasSizeCache.set(canvas, {
      height: targetHeight,
      ratio,
      width: targetWidth,
    })
  }

  const styleWidth = `${safeWidth}px`
  const styleHeight = `${safeHeight}px`

  if (canvas.style.width !== styleWidth) {
    canvas.style.width = styleWidth
  }

  if (canvas.style.height !== styleHeight) {
    canvas.style.height = styleHeight
  }

  const context = canvas.getContext('2d')

  if (!context) {
    return null
  }

  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, safeWidth, safeHeight)
  context.fillStyle = '#000000'
  context.fillRect(0, 0, safeWidth, safeHeight)

  return context
}

function drawRect(context: CanvasRenderingContext2D, rect: DtxRect, fill: string) {
  context.fillStyle = fill
  context.fillRect(rect.posX, rect.posY, rect.width, rect.height)
}

function drawHorizontalRect(context: CanvasRenderingContext2D, rect: DtxRect, fill: string) {
  context.fillStyle = fill
  context.fillRect(rect.posX, rect.posY - rect.height / 2, rect.width, rect.height)
}

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  color = '#ffffff',
  fontWeight = 200,
  maxWidth?: number,
) {
  context.save()
  context.fillStyle = color
  context.font = `${fontWeight} ${fontSize}px Arial`
  context.textBaseline = 'middle'
  context.textAlign = 'left'

  if (maxWidth && maxWidth > 0) {
    const measuredWidth = context.measureText(text).width

    if (measuredWidth > maxWidth && measuredWidth > 0) {
      const scale = maxWidth / measuredWidth
      context.scale(scale, 1)
      context.fillText(text, x / scale, y)
      context.restore()
      return
    }
  }

  context.fillText(text, x, y)
  context.restore()
}

function drawChip(
  context: CanvasRenderingContext2D,
  laneName: string,
  x: number,
  centerY: number,
  fallbackWidth: number,
  fallbackHeight: number,
  zoom: number,
) {
  const image = getLoadedChartImage(laneName)
  const rect = image
    ? {
      posX: x,
      posY: centerY - image.naturalHeight * zoom / 2,
      width: image.naturalWidth * zoom,
      height: image.naturalHeight * zoom,
    }
    : {
      posX: x,
      posY: centerY - fallbackHeight / 2,
      width: fallbackWidth,
      height: fallbackHeight,
    }

  if (image) {
    context.drawImage(image, rect.posX, rect.posY, rect.width, rect.height)
    return rect
  }

  drawRect(context, rect, CHIP_COLOR_INFO[laneName] ?? '#d8d8d8')
  return rect
}

function drawAnnotationBadge(
  context: CanvasRenderingContext2D,
  chipRect: DtxRect,
  value: DtxHandAnnotation | undefined,
  selected: boolean,
  zoom: number,
) {
  if (!value) {
    return
  }

  const radius = Math.max(8, 9 * zoom)
  const centerX = chipRect.posX + chipRect.width + radius * 1.35
  const centerY = chipRect.posY + chipRect.height / 2
  context.save()
  context.beginPath()
  context.arc(centerX, centerY, radius, 0, Math.PI * 2)
  context.fillStyle = value === 'L' ? '#5d74ff' : '#ff5f9b'
  context.fill()
  context.lineWidth = selected ? 2.5 : 1.5
  context.strokeStyle = selected ? '#ffffff' : 'rgba(255,255,255,0.82)'
  context.stroke()

  context.fillStyle = '#ffffff'
  context.font = `700 ${Math.max(10, 12 * zoom)}px Arial`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(value, centerX, centerY - 0.8)

  context.restore()
}

function drawSelectedChipGlow(context: CanvasRenderingContext2D, chipRect: DtxRect, zoom: number) {
  const padding = Math.max(3, 4 * zoom)

  context.save()
  context.shadowColor = 'rgba(255, 255, 255, 0.88)'
  context.shadowBlur = Math.max(10, 14 * zoom)
  context.strokeStyle = 'rgba(255, 255, 255, 0.95)'
  context.lineWidth = Math.max(2, 2.5 * zoom)
  context.strokeRect(
    chipRect.posX - padding,
    chipRect.posY - padding,
    chipRect.width + padding * 2,
    chipRect.height + padding * 2,
  )
  context.restore()
}

function drawHoldRect(context: CanvasRenderingContext2D, name: string, rect: DtxRect) {
  drawProgrammaticHoldRect(context, name, rect)
}

function formatBarNumber(value: number) {
  return value.toString().padStart(3, '0')
}

interface DrawDtxRangeOptions {
  annotationMode?: boolean
  annotations?: Record<string, DtxHandAnnotation>
  drawEndLine?: boolean
  height: number
  hitboxes?: DtxRealtimeNoteHitbox[]
  maxTime: number
  minTime: number
  selectedNoteKey?: string | null
  timeToY: (timePosition: number) => number
  zoom: number
}

function drawDtxRange(
  context: CanvasRenderingContext2D,
  realtimeData: DtxRealtimeData,
  drawingConfig: DtxDrawingConfig,
  options: DrawDtxRangeOptions,
) {
  const { height, maxTime, minTime, timeToY, zoom } = options
  const frameWidth = getFrameRectWidth(drawingConfig.gameMode, drawingConfig.chartMode)
  const frameX = getFrameRectRelativePosX() * zoom

  drawRect(context, {
    posX: frameX,
    posY: 0,
    width: frameWidth * zoom,
    height,
  }, DEFAULT_BACKGROUND_COLOR)

  getItemsInTimeRange(realtimeData.quarterBarLines, minTime, maxTime, (line) => line.timePosition)
    .forEach((line) => {
      drawHorizontalRect(context, {
        posX: frameX,
        posY: timeToY(line.timePosition),
        width: frameWidth * zoom,
        height: Math.max(1, zoom),
      }, '#535353')
    })

  getItemsInTimeRange(realtimeData.bars, minTime, maxTime, (line) => line.timePosition)
    .forEach((bar) => {
      const y = timeToY(bar.timePosition)
      drawHorizontalRect(context, {
        posX: frameX,
        posY: y,
        width: frameWidth * zoom,
        height: Math.max(1.5, 2 * zoom),
      }, '#b1b1b1')
      drawText(
        context,
        formatBarNumber(bar.barNumber),
        (FRAME_RECT_POS_X + frameWidth + 5) * zoom,
        y,
        Math.max(12, 18 * zoom),
      )
    })

  getItemsInTimeRange(realtimeData.bpmSegments, minTime, maxTime, (segment) => segment.startTimePos)
    .forEach((segment) => {
      const y = timeToY(segment.startTimePos)
      drawHorizontalRect(context, {
        posX: 50 * zoom,
        posY: y,
        width: 10 * zoom,
        height: Math.max(1, 2 * zoom),
      }, '#7f7f7f')
      drawText(
        context,
        segment.bpm.toFixed(2),
        10 * zoom,
        y,
        Math.max(9, 12 * zoom),
        '#ffffff',
        100,
        50 * zoom,
      )
    })

  if (options.drawEndLine && realtimeData.songDuration >= minTime && realtimeData.songDuration <= maxTime) {
    drawHorizontalRect(context, {
      posX: frameX,
      posY: timeToY(realtimeData.songDuration),
      width: frameWidth * zoom,
      height: Math.max(1.5, 2 * zoom),
    }, END_LINE_COLOR)
  }

  realtimeData.holdChips
    .filter((chip) => {
      const startTime = chip.lineTimePosition.timePosition
      const endTime = chip.endLineTimePosition?.timePosition
      return typeof endTime === 'number' && startTime <= maxTime && endTime >= minTime
    })
    .forEach((chip) => {
      const endTime = chip.endLineTimePosition?.timePosition

      if (typeof endTime !== 'number') {
        return
      }

      const startY = timeToY(Math.max(minTime, chip.lineTimePosition.timePosition))
      const endY = timeToY(Math.min(maxTime, endTime))
      const top = Math.max(0, Math.min(startY, endY))
      const bottom = Math.min(height, Math.max(startY, endY))

      if (bottom <= top) {
        return
      }

      convertHoldNoteRectsToDrawingImageRects(
        { posX: 0, posY: 0, width: 19, height: 1 },
        chip.laneType,
        drawingConfig.gameMode,
        drawingConfig.chartMode,
      ).forEach((holdRect) => {
        drawHoldRect(context, holdRect.name, {
          posX: holdRect.rectPos.posX * zoom,
          posY: top,
          width: holdRect.rectPos.width * zoom,
          height: bottom - top,
        })
      })
    })

  getItemsInTimeRange(realtimeData.chips, minTime, maxTime, (chip) => chip.lineTimePosition.timePosition)
    .forEach((chip) => {
      const y = timeToY(chip.lineTimePosition.timePosition)

      getRelativeSizePosOfChipsForLaneCode(chip.laneType, drawingConfig.gameMode, drawingConfig.chartMode)
        .forEach((lane) => {
          const chipRect = drawChip(
            context,
            lane.drawingLane,
            lane.chipRelativePosSize.posX * zoom,
            y,
            lane.chipRelativePosSize.width * zoom,
            lane.chipRelativePosSize.height * zoom,
            zoom,
          )
          const annotationEligible = drawingConfig.gameMode === 'Drum' && chip.annotationEligible
          const selected = options.selectedNoteKey === chip.noteKey

          if (selected && annotationEligible) {
            drawSelectedChipGlow(context, chipRect, zoom)
          }

          if (annotationEligible) {
            drawAnnotationBadge(context, chipRect, options.annotations?.[chip.noteKey], selected, zoom)
          }

          if (options.annotationMode && annotationEligible && options.hitboxes) {
            const hitPadding = Math.max(8, 8 * zoom)
            options.hitboxes.push({
              centerX: chipRect.posX + chipRect.width / 2,
              centerY: chipRect.posY + chipRect.height / 2,
              height: chipRect.height + hitPadding * 2,
              noteKey: chip.noteKey,
              width: chipRect.width + hitPadding * 2,
              x: chipRect.posX - hitPadding,
              y: chipRect.posY - hitPadding,
            })
          }
        })
    })
}

export function renderDtxRealtimeCanvas(
  canvas: HTMLCanvasElement,
  realtimeData: DtxRealtimeData,
  drawingConfig: DtxDrawingConfig,
  options: RenderDtxRealtimeOptions,
) {
  const hitboxes: DtxRealtimeNoteHitbox[] = []
  const context = setCanvasSize(canvas, options.viewportWidth, options.viewportHeight)

  if (!context || options.viewportWidth <= 0 || options.viewportHeight <= 0) {
    return hitboxes
  }

  const frameWidth = getFrameRectWidth(drawingConfig.gameMode, drawingConfig.chartMode)
  const bodyWidth = getFullBodyFrameWidth(drawingConfig.gameMode, drawingConfig.chartMode)
  const zoom = options.viewportWidth / Math.max(1, bodyWidth)
  const frameX = getFrameRectRelativePosX() * zoom
  const pixelsPerSecond = Math.max(1, drawingConfig.scale * REALTIME_BASE_PIXELS_PER_SECOND * zoom)
  const currentTime = realtimeData.songDuration * Math.min(1, Math.max(0, options.progress))
  const reverse = options.reverse
  const judgmentLineY = getRealtimeJudgmentLineY(options.viewportHeight, reverse)
  const minTime = reverse
    ? currentTime - (options.viewportHeight - judgmentLineY + LINE_OVERSCAN_PX) / pixelsPerSecond
    : currentTime - (judgmentLineY + LINE_OVERSCAN_PX) / pixelsPerSecond
  const maxTime = reverse
    ? currentTime + (judgmentLineY + LINE_OVERSCAN_PX) / pixelsPerSecond
    : currentTime + (options.viewportHeight - judgmentLineY + LINE_OVERSCAN_PX) / pixelsPerSecond
  const timeToY = reverse
    ? (timePosition: number) => judgmentLineY - (timePosition - currentTime) * pixelsPerSecond
    : (timePosition: number) => judgmentLineY + (timePosition - currentTime) * pixelsPerSecond

  drawDtxRange(context, realtimeData, drawingConfig, {
    annotationMode: options.annotationMode,
    annotations: options.annotations,
    drawEndLine: true,
    height: options.viewportHeight,
    hitboxes,
    maxTime,
    minTime,
    selectedNoteKey: options.selectedNoteKey,
    timeToY,
    zoom,
  })

  drawHorizontalRect(context, {
    posX: frameX,
    posY: judgmentLineY,
    width: frameWidth * zoom,
    height: Math.max(2, 2 * zoom),
  }, 'rgba(255,255,255,0.64)')

  if (options.annotationMode) {
    options.bookmarkTimes?.forEach((bookmarkTime) => {
      if (bookmarkTime < minTime || bookmarkTime > maxTime) {
        return
      }

      drawHorizontalRect(context, {
        posX: frameX,
        posY: timeToY(bookmarkTime),
        width: frameWidth * zoom,
        height: Math.max(2, 2 * zoom),
      }, ANNOTATION_BOOKMARK_COLOR)
    })
  }

  return hitboxes
}

export function renderDtxAnnotationExportCanvas(
  canvas: HTMLCanvasElement,
  realtimeData: DtxRealtimeData,
  drawingConfig: DtxDrawingConfig,
  options: RenderDtxAnnotationExportOptions,
) {
  const startTime = Math.max(0, Math.min(options.startTime, options.endTime, realtimeData.songDuration))
  const endTime = Math.max(startTime, Math.min(Math.max(options.startTime, options.endTime), realtimeData.songDuration))
  const width = Math.max(1, Math.ceil(options.width))
  const bodyWidth = getFullBodyFrameWidth(drawingConfig.gameMode, drawingConfig.chartMode)
  const zoom = width / Math.max(1, bodyWidth)
  const pixelsPerSecond = Math.max(1, drawingConfig.scale * REALTIME_BASE_PIXELS_PER_SECOND * zoom)
  const padding = Math.max(18, 24 * zoom)
  const height = Math.max(180, Math.ceil((endTime - startTime) * pixelsPerSecond + padding * 2))
  const context = setCanvasSize(canvas, width, height)

  if (!context) {
    return height
  }

  const timeToY = options.reverse
    ? (timePosition: number) => padding + (endTime - timePosition) * pixelsPerSecond
    : (timePosition: number) => padding + (timePosition - startTime) * pixelsPerSecond

  drawDtxRange(context, realtimeData, drawingConfig, {
    annotations: options.annotations,
    height,
    maxTime: endTime,
    minTime: startTime,
    timeToY,
    zoom,
  })

  return height
}
