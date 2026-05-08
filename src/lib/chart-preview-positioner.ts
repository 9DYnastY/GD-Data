import type {
  DtxBar,
  DtxCanvasData,
  DtxChartMode,
  DtxChip,
  DtxChipPixelRectPos,
  DtxDrawingConfig,
  DtxGameMode,
  DtxImageRectPos,
  DtxJson,
  DtxLine,
  DtxRect,
  DtxTextRectPos,
} from './chart-preview-types'

interface DtxChipRelativePosSize {
  posX: number
  width: number
  height: number
}

interface DtxChipDrawingLane {
  drawingLane: string
  chipRelativePosSize: DtxChipRelativePosSize
}

interface DtxInterimBarPos {
  absoluteTime: number
  relativePosY: number
  frameIndex: number
  canvasSheetIndex: number
}

interface DtxFrameRect {
  rectPos: DtxRect
  canvasSheetIndex: number
}

const DEFAULT_CHIP_HEIGHT = 5
const DEFAULT_CHIP_WIDTH = 18
const DEFAULT_FRAME_RECT_WIDTH = 201
const FRAME_RECT_POS_X = 60
const BAR_NUM_MARKER_WIDTH = 39
const MIN_CANVAS_SEGMENT_HEIGHT = 512
const CHIP_SEGMENT_VISUAL_HEIGHT = 48

const COMMON_CHIP_POS_SIZE_INFO: Record<string, DtxChipRelativePosSize> = {
  Bar: { posX: FRAME_RECT_POS_X, width: DEFAULT_FRAME_RECT_WIDTH, height: 2 },
  QuarterBar: { posX: FRAME_RECT_POS_X, width: DEFAULT_FRAME_RECT_WIDTH, height: 1 },
  BGM: { posX: FRAME_RECT_POS_X, width: DEFAULT_FRAME_RECT_WIDTH, height: 2 },
  EndLine: { posX: FRAME_RECT_POS_X, width: DEFAULT_FRAME_RECT_WIDTH, height: 2 },
  BPMMarker: { posX: 50, width: 10, height: 2 },
}

const DM_CHIP_POS_SIZE_INFO: Record<string, DtxChipRelativePosSize> = {
  LeftCrashCymbal: { posX: 60, width: DEFAULT_CHIP_WIDTH + 6, height: DEFAULT_CHIP_HEIGHT },
  'Hi-Hat': { posX: 84, width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT },
  LeftBassPedal: { posX: 102, width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT },
  LeftHiHatPedal: { posX: 102, width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT },
  Snare: { posX: 120, width: DEFAULT_CHIP_WIDTH + 3, height: DEFAULT_CHIP_HEIGHT },
  'Hi-Tom': { posX: 141, width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT },
  RightBassPedal: { posX: 159, width: DEFAULT_CHIP_WIDTH + 5, height: DEFAULT_CHIP_HEIGHT },
  'Low-Tom': { posX: 182, width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT },
  'Floor-Tom': { posX: 200, width: DEFAULT_CHIP_WIDTH, height: DEFAULT_CHIP_HEIGHT },
  RightCrashCymbal: { posX: 218, width: DEFAULT_CHIP_WIDTH + 6, height: DEFAULT_CHIP_HEIGHT },
  RideCymbal: { posX: 242, width: DEFAULT_CHIP_WIDTH + 1, height: DEFAULT_CHIP_HEIGHT },
}

const GUITAR_BASS_CHIP_POS_SIZE_INFO: Record<string, DtxChipRelativePosSize> = {
  Red: { posX: 60, width: DEFAULT_CHIP_WIDTH + 1, height: DEFAULT_CHIP_HEIGHT },
  Green: { posX: 78, width: DEFAULT_CHIP_WIDTH + 1, height: DEFAULT_CHIP_HEIGHT },
  Blue: { posX: 96, width: DEFAULT_CHIP_WIDTH + 1, height: DEFAULT_CHIP_HEIGHT },
  Yellow: { posX: 114, width: DEFAULT_CHIP_WIDTH + 1, height: DEFAULT_CHIP_HEIGHT },
  Pink: { posX: 132, width: DEFAULT_CHIP_WIDTH + 1, height: DEFAULT_CHIP_HEIGHT },
  Open: { posX: 60, width: (DEFAULT_CHIP_WIDTH + 1) * 5, height: DEFAULT_CHIP_HEIGHT },
  OpenV: { posX: 60, width: (DEFAULT_CHIP_WIDTH + 1) * 3, height: DEFAULT_CHIP_HEIGHT },
  Wail: { posX: 155, width: 15, height: 19 },
}

const GUITAR_BASS_BUTTON_ORDER = ['Red', 'Green', 'Blue', 'Yellow', 'Pink'] as const
const GUITAR_BASS_V_BUTTON_ORDER = ['Red', 'Green', 'Blue', 'Green', 'Blue'] as const

function getFrameRectRelativePosX() {
  return FRAME_RECT_POS_X
}

function getFrameRectWidth(gameMode: DtxGameMode, chartMode: DtxChartMode) {
  if (gameMode === 'Drum' && (chartMode === 'Classic' || chartMode === 'XG/Gitadora')) {
    return DEFAULT_FRAME_RECT_WIDTH - DM_CHIP_POS_SIZE_INFO.RideCymbal.width
  }

  if (gameMode !== 'Drum') {
    return (DEFAULT_CHIP_WIDTH + 1) * 5 + GUITAR_BASS_CHIP_POS_SIZE_INFO.Wail.width
  }

  return DEFAULT_FRAME_RECT_WIDTH
}

function getFullBodyFrameWidth(gameMode: DtxGameMode, chartMode: DtxChartMode) {
  return FRAME_RECT_POS_X + getFrameRectWidth(gameMode, chartMode) + BAR_NUM_MARKER_WIDTH
}

function convertLaneCodeToButtonPressArray(laneCode: string, gameMode: DtxGameMode, chartMode: DtxChartMode) {
  const prefix = gameMode === 'Bass' ? 'B' : 'G'

  if (!new RegExp(`^${prefix}\\d{5}$`).test(laneCode)) {
    return null
  }

  const buttonOrder = chartMode === 'Classic' ? GUITAR_BASS_V_BUTTON_ORDER : GUITAR_BASS_BUTTON_ORDER
  const pressedButtons: string[] = []
  const seenButtons = new Set<string>()

  laneCode.slice(1).split('').forEach((digit, index) => {
    const buttonName = buttonOrder[index]

    if (digit === '1' && buttonName && !seenButtons.has(buttonName)) {
      seenButtons.add(buttonName)
      pressedButtons.push(buttonName)
    }
  })

  if (!pressedButtons.length) {
    pressedButtons.push(chartMode === 'Classic' ? 'OpenV' : 'Open')
  }

  return pressedButtons
}

function getRelativeSizePosOfChipsForLaneCode(
  laneCode: string,
  gameMode: DtxGameMode,
  chartMode: DtxChartMode,
) {
  const commonSize = COMMON_CHIP_POS_SIZE_INFO[laneCode]

  if (commonSize) {
    return [{
      drawingLane: laneCode,
      chipRelativePosSize: laneCode === 'BGM'
        ? { ...commonSize, width: getFrameRectWidth(gameMode, chartMode) }
        : commonSize,
    }]
  }

  if (gameMode === 'Drum') {
    let remappedLaneCode = laneCode

    if (chartMode === 'XG/Gitadora') {
      if (remappedLaneCode === 'RideCymbal') {
        remappedLaneCode = 'RightCrashCymbal'
      } else if (remappedLaneCode === 'LeftBassPedal') {
        remappedLaneCode = 'LeftHiHatPedal'
      }
    } else if (chartMode === 'Classic') {
      if (remappedLaneCode === 'LeftCrashCymbal') {
        remappedLaneCode = 'Hi-Hat'
      } else if (remappedLaneCode === 'LeftBassPedal' || remappedLaneCode === 'LeftHiHatPedal') {
        remappedLaneCode = 'RightBassPedal'
      } else if (remappedLaneCode === 'Floor-Tom') {
        remappedLaneCode = 'Low-Tom'
      } else if (remappedLaneCode === 'RideCymbal') {
        remappedLaneCode = 'RightCrashCymbal'
      }
    }

    const drumSize = DM_CHIP_POS_SIZE_INFO[remappedLaneCode]
    return drumSize ? [{ drawingLane: remappedLaneCode, chipRelativePosSize: drumSize }] : []
  }

  if (laneCode === 'GWail' && gameMode === 'Guitar' || laneCode === 'BWail' && gameMode === 'Bass') {
    return [{ drawingLane: 'Wail', chipRelativePosSize: GUITAR_BASS_CHIP_POS_SIZE_INFO.Wail }]
  }

  return (convertLaneCodeToButtonPressArray(laneCode, gameMode, chartMode) ?? [])
    .map((buttonPress) => ({
      drawingLane: buttonPress,
      chipRelativePosSize: GUITAR_BASS_CHIP_POS_SIZE_INFO[buttonPress],
    }))
    .filter((chip): chip is DtxChipDrawingLane => Boolean(chip.chipRelativePosSize))
}

function convertHoldNoteRectsToDrawingImageRects(
  holdNoteRect: DtxRect,
  laneCode: string,
  gameMode: DtxGameMode,
  chartMode: DtxChartMode,
) {
  const buttonPressArray = convertLaneCodeToButtonPressArray(laneCode, gameMode, chartMode)

  if (!buttonPressArray) {
    return []
  }

  return buttonPressArray.flatMap((buttonPress) => {
    const buttonSize = GUITAR_BASS_CHIP_POS_SIZE_INFO[buttonPress]

    if (!buttonSize || buttonPress === 'Open' || buttonPress === 'OpenV') {
      return []
    }

    return [{
      name: `${buttonPress}Hold`,
      rectPos: {
        posX: holdNoteRect.posX + buttonSize.posX,
        posY: holdNoteRect.posY,
        width: buttonSize.width,
        height: holdNoteRect.height,
      },
    }]
  })
}

function convertNumberToFormattedText(value: number, length: number) {
  return value.toString().padStart(length, '0')
}

export class DtxCanvasPositioner {
  private readonly bodyFrameMargins = { top: 24, bottom: 24, left: 0, right: 0 }
  private readonly basePixelsPerSecond = 192
  private readonly canvasDtxObjects: DtxCanvasData[] = []

  private readonly barIndexToFrameSheetMapping: DtxInterimBarPos[]
  private readonly actualPixelsPerSecond: number
  private readonly isDrawFromDownToUp: boolean
  private readonly bodySectionHeightPerCanvas: number[]
  private readonly barInfoArray: DtxBar[]

  constructor(dtxJson: DtxJson, drawingOptions: DtxDrawingConfig) {
    this.barInfoArray = dtxJson.bars
    this.actualPixelsPerSecond = drawingOptions.scale * this.basePixelsPerSecond
    this.isDrawFromDownToUp = drawingOptions.gameMode === 'Drum'

    const mapping = this.computeContinuousBarIndexToFrameSheetMapping(
      dtxJson,
      drawingOptions.gameMode,
      drawingOptions.chartMode,
    )

    this.barIndexToFrameSheetMapping = mapping.barFrameSheetMapping
    this.bodySectionHeightPerCanvas = mapping.bodySectionHeightPerCanvas

    for (let index = 0; index < mapping.numOfCanvas; index += 1) {
      this.canvasDtxObjects.push({
        chipPositions: [],
        textPositions: [],
        frameRect: [],
        holdNoteRect: [],
        images: [],
        canvasSize: {
          width: mapping.widthPerCanvas[index] ?? 0,
          height: this.canvasHeightGivenBodySectionHeight(mapping.bodySectionHeightPerCanvas[index] ?? 0),
        },
      })
    }

    this.placeFrameRects(mapping.partialFrameRect)
    this.computeChipPositionInCanvas(dtxJson, drawingOptions.gameMode, drawingOptions.chartMode)
    this.splitContinuousCanvasIfNeeded(drawingOptions.maxHeight)
  }

  public getCanvasDataForDrawing() {
    return this.canvasDtxObjects
  }

  private createEmptyCanvasData(width: number, height: number): DtxCanvasData {
    return {
      chipPositions: [],
      textPositions: [],
      frameRect: [],
      holdNoteRect: [],
      images: [],
      canvasSize: {
        width,
        height,
      },
    }
  }

  private getSegmentIndexesForRange(top: number, bottom: number, segmentHeight: number, segmentCount: number) {
    const safeTop = Math.max(0, Math.min(top, bottom))
    const safeBottom = Math.max(safeTop, Math.max(top, bottom))
    const startIndex = Math.max(0, Math.min(segmentCount - 1, Math.floor(safeTop / segmentHeight)))
    const endIndex = Math.max(
      startIndex,
      Math.min(segmentCount - 1, Math.floor(Math.max(0, safeBottom - 0.001) / segmentHeight)),
    )

    return Array.from({ length: endIndex - startIndex + 1 }, (_, offset) => startIndex + offset)
  }

  private clipRectToSegment(rect: DtxRect, segmentStartY: number, segmentEndY: number) {
    const rectTop = rect.posY
    const rectBottom = rect.posY + rect.height
    const clippedTop = Math.max(rectTop, segmentStartY)
    const clippedBottom = Math.min(rectBottom, segmentEndY)

    if (clippedBottom <= clippedTop) {
      return null
    }

    return {
      ...rect,
      posY: clippedTop - segmentStartY,
      height: clippedBottom - clippedTop,
    }
  }

  private addClippedRectToSegments(
    segments: DtxCanvasData[],
    rect: DtxRect,
    segmentHeight: number,
    targetKey: 'frameRect',
  ) {
    this.getSegmentIndexesForRange(rect.posY, rect.posY + rect.height, segmentHeight, segments.length)
      .forEach((segmentIndex) => {
        const segmentStartY = segmentIndex * segmentHeight
        const clippedRect = this.clipRectToSegment(rect, segmentStartY, segmentStartY + segments[segmentIndex].canvasSize.height)

        if (clippedRect) {
          segments[segmentIndex][targetKey].push(clippedRect)
        }
      })
  }

  private addClippedImageRectToSegments(
    segments: DtxCanvasData[],
    imageRect: DtxImageRectPos,
    segmentHeight: number,
    targetKey: 'holdNoteRect' | 'images',
  ) {
    this.getSegmentIndexesForRange(
      imageRect.rectPos.posY,
      imageRect.rectPos.posY + imageRect.rectPos.height,
      segmentHeight,
      segments.length,
    ).forEach((segmentIndex) => {
      const segmentStartY = segmentIndex * segmentHeight
      const clippedRect = this.clipRectToSegment(
        imageRect.rectPos,
        segmentStartY,
        segmentStartY + segments[segmentIndex].canvasSize.height,
      )

      if (clippedRect) {
        segments[segmentIndex][targetKey].push({
          ...imageRect,
          rectPos: clippedRect,
        })
      }
    })
  }

  private addCenteredChipToSegments(segments: DtxCanvasData[], chip: DtxChipPixelRectPos, segmentHeight: number) {
    const visualHeight = Math.max(chip.rectPos.height, CHIP_SEGMENT_VISUAL_HEIGHT)
    const top = chip.rectPos.posY - visualHeight / 2
    const bottom = chip.rectPos.posY + visualHeight / 2

    this.getSegmentIndexesForRange(top, bottom, segmentHeight, segments.length)
      .forEach((segmentIndex) => {
        const segmentStartY = segmentIndex * segmentHeight
        segments[segmentIndex].chipPositions.push({
          ...chip,
          rectPos: {
            ...chip.rectPos,
            posY: chip.rectPos.posY - segmentStartY,
          },
        })
      })
  }

  private addCenteredTextToSegments(segments: DtxCanvasData[], textPos: DtxTextRectPos, segmentHeight: number) {
    const top = textPos.rectPos.posY - textPos.rectPos.height / 2
    const bottom = textPos.rectPos.posY + textPos.rectPos.height / 2

    this.getSegmentIndexesForRange(top, bottom, segmentHeight, segments.length)
      .forEach((segmentIndex) => {
        const segmentStartY = segmentIndex * segmentHeight
        segments[segmentIndex].textPositions.push({
          ...textPos,
          rectPos: {
            ...textPos.rectPos,
            posY: textPos.rectPos.posY - segmentStartY,
          },
        })
      })
  }

  private splitContinuousCanvasIfNeeded(maxCanvasHeight: number) {
    const fullCanvas = this.canvasDtxObjects[0]

    if (!fullCanvas) {
      return
    }

    const segmentHeight = Math.max(
      MIN_CANVAS_SEGMENT_HEIGHT,
      Math.floor(Number.isFinite(maxCanvasHeight) && maxCanvasHeight > 0 ? maxCanvasHeight : fullCanvas.canvasSize.height),
    )
    const totalHeight = Math.ceil(fullCanvas.canvasSize.height)

    if (totalHeight <= segmentHeight) {
      return
    }

    const segmentCount = Math.ceil(totalHeight / segmentHeight)
    const segments = Array.from({ length: segmentCount }, (_, segmentIndex) => {
      const segmentStartY = segmentIndex * segmentHeight
      const segmentEndY = Math.min(totalHeight, segmentStartY + segmentHeight)
      return this.createEmptyCanvasData(fullCanvas.canvasSize.width, segmentEndY - segmentStartY)
    })

    fullCanvas.frameRect.forEach((rect) => {
      this.addClippedRectToSegments(segments, rect, segmentHeight, 'frameRect')
    })

    fullCanvas.chipPositions.forEach((chip) => {
      this.addCenteredChipToSegments(segments, chip, segmentHeight)
    })

    fullCanvas.holdNoteRect.forEach((holdRect) => {
      this.addClippedImageRectToSegments(segments, holdRect, segmentHeight, 'holdNoteRect')
    })

    fullCanvas.images.forEach((imageRect) => {
      this.addClippedImageRectToSegments(segments, imageRect, segmentHeight, 'images')
    })

    fullCanvas.textPositions.forEach((textPos) => {
      this.addCenteredTextToSegments(segments, textPos, segmentHeight)
    })

    this.canvasDtxObjects.splice(0, this.canvasDtxObjects.length, ...segments)
  }

  private placeFrameRects(partialFrameRect: DtxFrameRect[]) {
    partialFrameRect.forEach((frameRect) => {
      const canvasData = this.canvasDtxObjects[frameRect.canvasSheetIndex]

      if (!canvasData) {
        return
      }

      frameRect.rectPos.posY = this.bodyFrameMargins.top
      canvasData.frameRect.push({ ...frameRect.rectPos })
    })
  }

  private computeChipPositionInCanvas(dtxJson: DtxJson, gameMode: DtxGameMode, chartMode: DtxChartMode) {
    dtxJson.bars.forEach((barInfo, index) => {
      const chipLinePos = this.computePixelPosFromAbsoluteTime(index, barInfo.startTimePos, gameMode, chartMode)
      const chipPixelPos: DtxChipPixelRectPos = {
        laneType: 'Bar',
        rectPos: {
          posX: chipLinePos.posX + getFrameRectRelativePosX(),
          posY: chipLinePos.posY,
          width: getFrameRectWidth(gameMode, chartMode),
          height: COMMON_CHIP_POS_SIZE_INFO.Bar.height,
        },
      }
      const textPos: DtxTextRectPos = {
        rectPos: {
          posX: chipLinePos.posX + getFrameRectRelativePosX() + getFrameRectWidth(gameMode, chartMode) + 5,
          posY: chipLinePos.posY,
          width: 50,
          height: 21,
        },
        fontFamily: 'Arial',
        fontWeight: 200,
        fontSize: 18,
        color: '#ffffff',
        text: convertNumberToFormattedText(index, 3),
      }

      this.canvasDtxObjects[chipLinePos.canvasSheetIndex]?.chipPositions.push(chipPixelPos)
      this.canvasDtxObjects[chipLinePos.canvasSheetIndex]?.textPositions.push(textPos)
    })

    dtxJson.quarterBarLines.forEach((quarterBarLine) => {
      const chipLinePos = this.computePixelPosFromAbsoluteTime(
        quarterBarLine.barNumber,
        quarterBarLine.timePosition,
        gameMode,
        chartMode,
      )

      this.canvasDtxObjects[chipLinePos.canvasSheetIndex]?.chipPositions.push({
        laneType: 'QuarterBar',
        rectPos: {
          posX: chipLinePos.posX + getFrameRectRelativePosX(),
          posY: chipLinePos.posY,
          width: getFrameRectWidth(gameMode, chartMode),
          height: COMMON_CHIP_POS_SIZE_INFO.QuarterBar.height,
        },
      })
    })

    dtxJson.bpmSegments.forEach((bpmSegment) => {
      const chipLinePos = this.computePixelPosFromAbsoluteTime(
        bpmSegment.startBarNum,
        bpmSegment.startTimePos,
        gameMode,
        chartMode,
      )
      const bpmMarkerSize = COMMON_CHIP_POS_SIZE_INFO.BPMMarker

      this.canvasDtxObjects[chipLinePos.canvasSheetIndex]?.chipPositions.push({
        laneType: 'BPMMarker',
        rectPos: {
          posX: chipLinePos.posX + bpmMarkerSize.posX,
          posY: chipLinePos.posY,
          width: bpmMarkerSize.width,
          height: bpmMarkerSize.height,
        },
      })
      this.canvasDtxObjects[chipLinePos.canvasSheetIndex]?.textPositions.push({
        rectPos: { posX: chipLinePos.posX + 10, posY: chipLinePos.posY, width: 50, height: 15 },
        fontFamily: 'Arial',
        fontWeight: 100,
        fontSize: 12,
        color: '#ffffff',
        text: bpmSegment.bpm.toFixed(2),
      })
    })

    dtxJson.chips.forEach((chip) => {
      const chipLinePos = this.computePixelPosFromAbsoluteTime(
        chip.lineTimePosition.barNumber,
        chip.lineTimePosition.timePosition,
        gameMode,
        chartMode,
      )

      this.computeRectsForHoldNotes(chip, gameMode, chartMode).forEach((holdNoteFrameRect) => {
        convertHoldNoteRectsToDrawingImageRects(holdNoteFrameRect.rectPos, chip.laneType, gameMode, chartMode)
          .forEach((drawRect) => {
            this.canvasDtxObjects[holdNoteFrameRect.canvasSheetIndex]?.holdNoteRect.push(drawRect)
          })
      })

      getRelativeSizePosOfChipsForLaneCode(chip.laneType, gameMode, chartMode).forEach((chipPosSizeInfo) => {
        this.canvasDtxObjects[chipLinePos.canvasSheetIndex]?.chipPositions.push({
          laneType: chipPosSizeInfo.drawingLane,
          rectPos: {
            posX: chipLinePos.posX + chipPosSizeInfo.chipRelativePosSize.posX,
            posY: chipLinePos.posY,
            width: chipPosSizeInfo.chipRelativePosSize.width,
            height: chipPosSizeInfo.chipRelativePosSize.height,
          },
        })
      })
    })

    this.addEndLine(dtxJson, gameMode, chartMode)
  }

  private addEndLine(dtxJson: DtxJson, gameMode: DtxGameMode, chartMode: DtxChartMode) {
    if (!dtxJson.bars.length) {
      return
    }

    const endLinePos = this.computePixelPosFromAbsoluteTime(
      dtxJson.bars.length - 1,
      dtxJson.songInfo.songDuration,
      gameMode,
      chartMode,
    )

    this.canvasDtxObjects[endLinePos.canvasSheetIndex]?.chipPositions.push({
      laneType: 'EndLine',
      rectPos: {
        posX: endLinePos.posX + COMMON_CHIP_POS_SIZE_INFO.EndLine.posX,
        posY: endLinePos.posY,
        width: getFrameRectWidth(gameMode, chartMode),
        height: COMMON_CHIP_POS_SIZE_INFO.EndLine.height,
      },
    })
  }

  private computeRectsForHoldNotes(holdNoteChip: DtxChip, gameMode: DtxGameMode, chartMode: DtxChartMode) {
    const endLineTimePosition = holdNoteChip.endLineTimePosition

    if (!endLineTimePosition || gameMode === 'Drum') {
      return []
    }

    const gameModePrefix = gameMode === 'Bass' ? 'B' : 'G'

    if (!holdNoteChip.laneType.startsWith(gameModePrefix)) {
      return []
    }

    const retRectArray: DtxFrameRect[] = []
    let currentTimePos: DtxLine = { ...holdNoteChip.lineTimePosition }
    let barNumDifference = endLineTimePosition.barNumber - holdNoteChip.lineTimePosition.barNumber
    let currentOffset = 1

    while (barNumDifference > 0) {
      const nextBarMapping = this.barIndexToFrameSheetMapping[currentTimePos.barNumber + currentOffset]

      if (!nextBarMapping) {
        break
      }

      const currentFrameIndex = this.barIndexToFrameSheetMapping[currentTimePos.barNumber]?.frameIndex
      const currentCanvasIndex = this.barIndexToFrameSheetMapping[currentTimePos.barNumber]?.canvasSheetIndex

      if (nextBarMapping.canvasSheetIndex === currentCanvasIndex && nextBarMapping.frameIndex === currentFrameIndex) {
        if (currentTimePos.barNumber + currentOffset === endLineTimePosition.barNumber) {
          barNumDifference = 0
        } else {
          currentOffset += 1
        }
        continue
      }

      const prevBarNumber = currentTimePos.barNumber + currentOffset - 1
      const currentPixPos = this.computePixelPosFromAbsoluteTime(
        currentTimePos.barNumber,
        currentTimePos.timePosition,
        gameMode,
        chartMode,
      )
      const previousMapping = this.barIndexToFrameSheetMapping[prevBarNumber]
      const endFramePos = previousMapping
        ? this.getEndPositionOfFrameRect(previousMapping.canvasSheetIndex, previousMapping.frameIndex, this.isDrawFromDownToUp)
        : null

      if (endFramePos) {
        retRectArray.push({
          rectPos: {
            posX: currentPixPos.posX,
            posY: Math.min(currentPixPos.posY, endFramePos.posY),
            width: 19,
            height: Math.abs(endFramePos.posY - currentPixPos.posY),
          },
          canvasSheetIndex: currentPixPos.canvasSheetIndex,
        })
      }

      currentTimePos = {
        barNumber: currentTimePos.barNumber + currentOffset,
        timePosition: this.barInfoArray[currentTimePos.barNumber + currentOffset]?.startTimePos ?? currentTimePos.timePosition,
        lineNumberInBar: 0,
      }
      barNumDifference = endLineTimePosition.barNumber - currentTimePos.barNumber
      currentOffset = 1
    }

    const startPixPos = this.computePixelPosFromAbsoluteTime(
      currentTimePos.barNumber,
      currentTimePos.timePosition,
      gameMode,
      chartMode,
    )
    const endPixPos = this.computePixelPosFromAbsoluteTime(
      endLineTimePosition.barNumber,
      endLineTimePosition.timePosition,
      gameMode,
      chartMode,
    )

    retRectArray.push({
      rectPos: {
        posX: startPixPos.posX,
        posY: Math.min(startPixPos.posY, endPixPos.posY),
        width: 19,
        height: Math.abs(endPixPos.posY - startPixPos.posY),
      },
      canvasSheetIndex: startPixPos.canvasSheetIndex,
    })

    return retRectArray
  }

  private getEndPositionOfFrameRect(canvasSheetIndex: number, frameIndex: number, isBottomUp: boolean) {
    const currentFrameRect = this.canvasDtxObjects[canvasSheetIndex]?.frameRect[frameIndex]

    if (!currentFrameRect) {
      return null
    }

    return {
      posX: currentFrameRect.posX,
      posY: isBottomUp ? currentFrameRect.posY : currentFrameRect.posY + currentFrameRect.height,
    }
  }

  private computeActualPixelPosY(relativePosY: number, bodySectionRect: DtxRect, isBottomUp: boolean) {
    return isBottomUp
      ? bodySectionRect.posY + bodySectionRect.height - relativePosY
      : bodySectionRect.posY + relativePosY
  }

  private canvasWidthForFrames(numOfFrames: number, gameMode: DtxGameMode, chartMode: DtxChartMode) {
    return numOfFrames
      * (getFullBodyFrameWidth(gameMode, chartMode) + this.bodyFrameMargins.left + this.bodyFrameMargins.right)
  }

  private canvasHeightGivenBodySectionHeight(bodySectionHeight: number) {
    return bodySectionHeight + this.bodyFrameMargins.top + this.bodyFrameMargins.bottom
  }

  private computeContinuousBarIndexToFrameSheetMapping(
    dtxJson: DtxJson,
    gameMode: DtxGameMode,
    chartMode: DtxChartMode,
  ) {
    const barFrameSheetMapping: DtxInterimBarPos[] = []
    let currentFramePosY = 0

    dtxJson.bars.forEach((barInfo) => {
      const currentBarHeightInPx = barInfo.duration * this.actualPixelsPerSecond

      barFrameSheetMapping.push({
        absoluteTime: barInfo.startTimePos,
        relativePosY: currentFramePosY,
        frameIndex: 0,
        canvasSheetIndex: 0,
      })
      currentFramePosY += currentBarHeightInPx
    })

    const bodyHeight = Math.max(1, currentFramePosY)

    const returnedFrameRect: DtxFrameRect[] = [{
      rectPos: {
        posX: this.bodyFrameMargins.left + getFrameRectRelativePosX(),
        posY: 0,
        width: getFrameRectWidth(gameMode, chartMode),
        height: bodyHeight,
      },
      canvasSheetIndex: 0,
    }]

    return {
      barFrameSheetMapping,
      numOfCanvas: 1,
      bodySectionHeightPerCanvas: [bodyHeight],
      widthPerCanvas: [this.canvasWidthForFrames(1, gameMode, chartMode)],
      partialFrameRect: returnedFrameRect,
    }
  }

  private computePixelPosFromAbsoluteTime(
    barNum: number,
    absTime: number,
    gameMode: DtxGameMode,
    chartMode: DtxChartMode,
  ) {
    const mapping = this.barIndexToFrameSheetMapping[Math.max(0, Math.min(barNum, this.barIndexToFrameSheetMapping.length - 1))]
    const safeMapping = mapping ?? { absoluteTime: 0, relativePosY: 0, frameIndex: 0, canvasSheetIndex: 0 }
    const posX = this.bodyFrameMargins.left
      + safeMapping.frameIndex * (getFullBodyFrameWidth(gameMode, chartMode) + this.bodyFrameMargins.left + this.bodyFrameMargins.right)
    const canvasSheetIndex = safeMapping.canvasSheetIndex
    const currentCanvasBodySectionHeight = this.bodySectionHeightPerCanvas[canvasSheetIndex] ?? 0
    const currentCanvasBodySectionRect: DtxRect = {
      posX: this.bodyFrameMargins.left,
      posY: this.bodyFrameMargins.top,
      width: getFullBodyFrameWidth(gameMode, chartMode),
      height: currentCanvasBodySectionHeight,
    }
    const timeDiff = absTime - safeMapping.absoluteTime
    const relativePosY = safeMapping.relativePosY + timeDiff * this.actualPixelsPerSecond

    return {
      posX,
      posY: this.computeActualPixelPosY(relativePosY, currentCanvasBodySectionRect, this.isDrawFromDownToUp),
      canvasSheetIndex,
    }
  }
}
