import type { DtxCanvasData, DtxChipPixelRectPos, DtxImageRectPos, DtxRect, DtxTextRectPos } from './chart-preview-types'

const DEFAULT_BACKGROUND_COLOR = '#1f1f1f'
const MAX_CANVAS_BITMAP_SIZE = 32767
const FRAME_RECT_BLEED_PX = 2

const CHIP_COLOR_INFO: Record<string, string> = {
  Bar: '#b1b1b1',
  QuarterBar: '#535353',
  BGM: '#278f50',
  EndLine: '#f05252',
  LeftCrashCymbal: '#ff4ca1',
  'Hi-Hat': '#579ead',
  LeftBassPedal: '#e7baff',
  LeftHiHatPedal: '#e7baff',
  Snare: '#fff040',
  'Hi-Tom': '#00ff00',
  RightBassPedal: '#e7baff',
  'Low-Tom': '#ff0000',
  'Floor-Tom': '#fea101',
  RightCrashCymbal: '#00ccff',
  RideCymbal: '#5a9cf9',
  BPMMarker: '#7f7f7f',
  Red: '#f03a3a',
  Green: '#41d05a',
  Blue: '#38a8ff',
  Yellow: '#ffe15c',
  Pink: '#ff62cf',
  Open: '#ffffff',
  OpenV: '#ffffff',
  Wail: '#c9c9ff',
}

const HOLD_COLOR_INFO: Record<string, string> = {
  RedHold: 'rgba(240, 58, 58, 0.56)',
  GreenHold: 'rgba(65, 208, 90, 0.56)',
  BlueHold: 'rgba(56, 168, 255, 0.56)',
  YellowHold: 'rgba(255, 225, 92, 0.56)',
  PinkHold: 'rgba(255, 98, 207, 0.56)',
}

const ASSET_URLS: Record<string, string> = {
  LeftCrashCymbal: new URL('../assets/chart-preview/leftcymbal_chip.png', import.meta.url).href,
  'Hi-Hat': new URL('../assets/chart-preview/hihat_chip.png', import.meta.url).href,
  Snare: new URL('../assets/chart-preview/snare_chip.png', import.meta.url).href,
  LeftBassPedal: new URL('../assets/chart-preview/leftbass_chip.png', import.meta.url).href,
  LeftHiHatPedal: new URL('../assets/chart-preview/lefthihatpedal_chip.png', import.meta.url).href,
  'Hi-Tom': new URL('../assets/chart-preview/hitom_chip.png', import.meta.url).href,
  RightBassPedal: new URL('../assets/chart-preview/rightbass_chip.png', import.meta.url).href,
  'Low-Tom': new URL('../assets/chart-preview/lowtom_chip.png', import.meta.url).href,
  'Floor-Tom': new URL('../assets/chart-preview/floortom_chip.png', import.meta.url).href,
  RightCrashCymbal: new URL('../assets/chart-preview/rightcymbal_chip.png', import.meta.url).href,
  RideCymbal: new URL('../assets/chart-preview/ridecymbal_chip.png', import.meta.url).href,
  Red: new URL('../assets/chart-preview/red_gfchip.png', import.meta.url).href,
  Green: new URL('../assets/chart-preview/green_gfchip.png', import.meta.url).href,
  Blue: new URL('../assets/chart-preview/blue_gfchip.png', import.meta.url).href,
  Yellow: new URL('../assets/chart-preview/yellow_gfchip.png', import.meta.url).href,
  Pink: new URL('../assets/chart-preview/mag_gfchip.png', import.meta.url).href,
  Wail: new URL('../assets/chart-preview/wail_gfchip.png', import.meta.url).href,
  Open: new URL('../assets/chart-preview/open_gfchip.png', import.meta.url).href,
  OpenV: new URL('../assets/chart-preview/open_gfvchip.png', import.meta.url).href,
  DrumBasicBannerSmall: new URL('../assets/chart-preview/DrumBasicBannerSmall.png', import.meta.url).href,
  DrumAdvancedBannerSmall: new URL('../assets/chart-preview/DrumAdvancedBannerSmall.png', import.meta.url).href,
  DrumExtremeBannerSmall: new URL('../assets/chart-preview/DrumExtremeBannerSmall.png', import.meta.url).href,
  DrumMasterBannerSmall: new URL('../assets/chart-preview/DrumMasterBannerSmall.png', import.meta.url).href,
  GuitarBasicBannerSmall: new URL('../assets/chart-preview/GuitarBasicBannerSmall.png', import.meta.url).href,
  GuitarAdvancedBannerSmall: new URL('../assets/chart-preview/GuitarAdvancedBannerSmall.png', import.meta.url).href,
  GuitarExtremeBannerSmall: new URL('../assets/chart-preview/GuitarExtremeBannerSmall.png', import.meta.url).href,
  GuitarMasterBannerSmall: new URL('../assets/chart-preview/GuitarMasterBannerSmall.png', import.meta.url).href,
  BassBasicBannerSmall: new URL('../assets/chart-preview/BassBasicBannerSmall.png', import.meta.url).href,
  BassAdvancedBannerSmall: new URL('../assets/chart-preview/BassAdvancedBannerSmall.png', import.meta.url).href,
  BassExtremeBannerSmall: new URL('../assets/chart-preview/BassExtremeBannerSmall.png', import.meta.url).href,
  BassMasterBannerSmall: new URL('../assets/chart-preview/BassMasterBannerSmall.png', import.meta.url).href,
  RedHold: new URL('../assets/chart-preview/red_holdrect_test2.png', import.meta.url).href,
  GreenHold: new URL('../assets/chart-preview/green_holdrect_test2.png', import.meta.url).href,
  BlueHold: new URL('../assets/chart-preview/blue_holdrect_test2.png', import.meta.url).href,
  YellowHold: new URL('../assets/chart-preview/yellow_holdrect_test2.png', import.meta.url).href,
  PinkHold: new URL('../assets/chart-preview/pink_holdrect_test2.png', import.meta.url).href,
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>()

function loadChartImage(name: string) {
  const url = ASSET_URLS[name]

  if (!url) {
    return Promise.resolve(null)
  }

  const cachedImage = imageCache.get(name)

  if (cachedImage) {
    return cachedImage
  }

  const imagePromise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })

  imageCache.set(name, imagePromise)
  return imagePromise
}

function setCanvasSize(canvas: HTMLCanvasElement, canvasData: DtxCanvasData, displayScale: number) {
  const width = Math.ceil(canvasData.canvasSize.width)
  const height = Math.ceil(canvasData.canvasSize.height)
  const safeDisplayScale = Math.max(0.01, Number.isFinite(displayScale) ? displayScale : 1)
  const displayWidth = Math.ceil(width * safeDisplayScale)
  const displayHeight = Math.ceil(height * safeDisplayScale)
  const ratio = Math.max(
    0.25,
    Math.min(
      window.devicePixelRatio || 1,
      MAX_CANVAS_BITMAP_SIZE / Math.max(1, displayWidth),
      MAX_CANVAS_BITMAP_SIZE / Math.max(1, displayHeight),
    ),
  )

  canvas.width = Math.ceil(displayWidth * ratio)
  canvas.height = Math.ceil(displayHeight * ratio)
  canvas.style.width = `${displayWidth}px`
  canvas.style.height = `${displayHeight}px`

  const context = canvas.getContext('2d')

  if (!context) {
    return null
  }

  context.setTransform(ratio * safeDisplayScale, 0, 0, ratio * safeDisplayScale, 0, 0)
  const logicalWidth = canvas.width / (ratio * safeDisplayScale)
  const logicalHeight = canvas.height / (ratio * safeDisplayScale)
  context.clearRect(0, 0, logicalWidth, logicalHeight)
  context.fillStyle = '#000000'
  context.fillRect(0, 0, logicalWidth, logicalHeight)

  return context
}

function drawRect(context: CanvasRenderingContext2D, rect: DtxRect, fill: string) {
  context.fillStyle = fill
  context.fillRect(rect.posX, rect.posY, rect.width, rect.height)
}

function drawFrameRect(context: CanvasRenderingContext2D, rect: DtxRect) {
  drawRect(
    context,
    {
      ...rect,
      posY: Math.max(0, rect.posY - FRAME_RECT_BLEED_PX),
      height: rect.height + FRAME_RECT_BLEED_PX * 2,
    },
    DEFAULT_BACKGROUND_COLOR,
  )
}

function drawChipFallback(context: CanvasRenderingContext2D, chip: DtxChipPixelRectPos) {
  context.fillStyle = CHIP_COLOR_INFO[chip.laneType] ?? '#d8d8d8'
  context.fillRect(
    chip.rectPos.posX,
    chip.rectPos.posY - chip.rectPos.height / 2,
    chip.rectPos.width,
    chip.rectPos.height,
  )
}

function drawText(context: CanvasRenderingContext2D, textPos: DtxTextRectPos) {
  context.save()
  context.fillStyle = textPos.color
  context.font = `${textPos.fontWeight} ${textPos.fontSize}px ${textPos.fontFamily}`
  context.textBaseline = 'middle'
  context.textAlign = 'left'

  const measuredWidth = context.measureText(textPos.text).width

  if (measuredWidth > textPos.rectPos.width && measuredWidth > 0) {
    const scale = textPos.rectPos.width / measuredWidth
    context.scale(scale, 1)
    context.fillText(textPos.text, textPos.rectPos.posX / scale, textPos.rectPos.posY)
  } else {
    context.fillText(textPos.text, textPos.rectPos.posX, textPos.rectPos.posY)
  }

  context.restore()
}

async function drawChip(context: CanvasRenderingContext2D, chip: DtxChipPixelRectPos) {
  const image = await loadChartImage(chip.laneType)

  if (!image) {
    drawChipFallback(context, chip)
    return
  }

  context.drawImage(image, chip.rectPos.posX, chip.rectPos.posY - image.naturalHeight / 2)
}

async function drawImageRect(context: CanvasRenderingContext2D, imageRect: DtxImageRectPos) {
  const image = await loadChartImage(imageRect.name)

  if (!image) {
    drawRect(context, imageRect.rectPos, HOLD_COLOR_INFO[imageRect.name] ?? 'rgba(255,255,255,0.28)')
    return
  }

  context.drawImage(
    image,
    imageRect.rectPos.posX,
    imageRect.rectPos.posY,
    imageRect.rectPos.width,
    imageRect.rectPos.height,
  )
}

async function drawHoldRect(context: CanvasRenderingContext2D, imageRect: DtxImageRectPos) {
  const image = await loadChartImage(imageRect.name)

  if (!image) {
    drawRect(context, imageRect.rectPos, HOLD_COLOR_INFO[imageRect.name] ?? 'rgba(255,255,255,0.28)')
    return
  }

  const pattern = context.createPattern(image, 'repeat-y')

  if (!pattern) {
    drawRect(context, imageRect.rectPos, HOLD_COLOR_INFO[imageRect.name] ?? 'rgba(255,255,255,0.28)')
    return
  }

  context.fillStyle = pattern
  context.fillRect(imageRect.rectPos.posX, imageRect.rectPos.posY, imageRect.rectPos.width, imageRect.rectPos.height)
}

export async function renderDtxCanvas(canvas: HTMLCanvasElement, canvasData: DtxCanvasData, displayScale = 1) {
  const context = setCanvasSize(canvas, canvasData, displayScale)

  if (!context) {
    return
  }

  canvasData.frameRect.forEach((rect) => {
    drawFrameRect(context, rect)
  })

  for (const chip of canvasData.chipPositions) {
    await drawChip(context, chip)
  }

  for (const holdRect of canvasData.holdNoteRect) {
    await drawHoldRect(context, holdRect)
  }

  for (const imageRect of canvasData.images) {
    await drawImageRect(context, imageRect)
  }

  canvasData.textPositions.forEach((textPos) => {
    drawText(context, textPos)
  })
}
