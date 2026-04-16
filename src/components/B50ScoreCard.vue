<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import cardBackgroundSrc from '../assets/b50-page/Card_B50/card_background.svg'
import infoBackgroundSrc from '../assets/b50-page/Card_B50/info_background.svg'
import achieveIconSrc from '../assets/b50-page/Card_B50/achieve_icon.svg'
import skillIconSrc from '../assets/b50-page/Card_B50/Skill_icon.svg'
import excellentStickerSrc from '../assets/b50-page/Card_B50/stick/stick_Excellent.png'
import fullComboStickerSrc from '../assets/b50-page/Card_B50/stick/stick_fullcombo.png'
import rankASrc from '../assets/b50-page/Card_B50/stick/stick_rankA.png'
import rankBSrc from '../assets/b50-page/Card_B50/stick/stick_rankB.png'
import rankCSrc from '../assets/b50-page/Card_B50/stick/stick_rankC.png'
import rankSSSrc from '../assets/b50-page/Card_B50/stick/stick_rankSS.png'
import rankSSingleSrc from '../assets/b50-page/Card_B50/stick/stick_rankS.png'
import stageClearedStickerSrc from '../assets/b50-page/Card_B50/stick/stick_StageCleared.png'
import type { BjmaniaScoreListItem } from '../types/bjmania'
import type { InstrumentKey, LevelKey } from '../types/song'

const props = defineProps<{
  row: BjmaniaScoreListItem
  coverSrcOverride?: string | null
}>()

const RANK_STICKER_MAP: Record<string, string> = {
  SS: rankSSSrc,
  S: rankSSingleSrc,
  A: rankASrc,
  B: rankBSrc,
  C: rankCSrc,
  D: rankCSrc,
  E: rankCSrc,
}

const LEVEL_COLORS: Record<LevelKey, string> = {
  master: '#C700CD',
  extreme: '#E10035',
  advanced: '#FFC800',
  basic: '#5297FF',
}

const LEVEL_LABELS: Record<LevelKey, string> = {
  master: 'MASTER',
  extreme: 'EXTREME',
  advanced: 'ADVANCE',
  basic: 'BASIC',
}

const CLASS_LABELS: Record<InstrumentKey, string> = {
  drum: 'DRUM',
  guitar: 'GUITAR',
  bass: 'BASS',
}
const TITLE_BASE_LEFT = 39
const TITLE_OVERFLOW_VISUAL_OFFSET = 6
const TITLE_ELLIPSIS = '…'

const titleTextRef = ref<HTMLElement | null>(null)
const displayTitle = ref('')
const titleVisualOffset = ref(0)
let titleResizeObserver: ResizeObserver | null = null
let titleMeasureContext: CanvasRenderingContext2D | null = null

function splitValueText(value: string) {
  const normalized = value.trim()
  const match = normalized.match(/^([+-]?\d+)(\.\d+%?)?$/)

  if (!match) {
    return {
      whole: normalized || '--',
      fraction: '',
    }
  }

  return {
    whole: match[1],
    fraction: match[2] ?? '',
  }
}

function splitRateValueText(value: string) {
  const normalized = value.trim()

  if (!normalized.endsWith('%')) {
    const parts = splitValueText(normalized)
    return {
      whole: parts.whole,
      fraction: parts.fraction,
      suffix: '',
    }
  }

  const numericPart = normalized.slice(0, -1)
  const decimalIndex = numericPart.indexOf('.')

  if (decimalIndex < 0) {
    return {
      whole: numericPart,
      fraction: '',
      suffix: '%',
    }
  }

  return {
    whole: numericPart.slice(0, decimalIndex),
    fraction: numericPart.slice(decimalIndex),
    suffix: '%',
  }
}

function splitPaddedValueText(value: string, width: number) {
  const parts = splitValueText(value)

  if (!/^\d+$/.test(parts.whole)) {
    return {
      ...parts,
      pad: '',
    }
  }

  return {
    ...parts,
    pad: '0'.repeat(Math.max(0, width - parts.whole.length)),
  }
}

const title = computed(() => props.row.song?.displayTitle ?? `Music #${props.row.musicId}`)
const coverSrc = computed(() => props.coverSrcOverride ?? props.row.song?.heroImageUrl ?? null)
const coverFallback = computed(() => props.row.song?.imageFallback ?? String(props.row.musicId))
const classLabel = computed(() => CLASS_LABELS[props.row.instrument])
const classLabelClass = computed(() => ({
  'b50-score-card__class-label--guitar': props.row.instrument === 'guitar',
}))
const difficultyLabel = computed(() => LEVEL_LABELS[props.row.level])
const difficultyColor = computed(() => LEVEL_COLORS[props.row.level])
const difficultyLabelClass = computed(() => ({
  'b50-score-card__difficulty-label--advance': props.row.level === 'advanced',
}))
const rankStickerSrc = computed(() => RANK_STICKER_MAP[props.row.rankLabel] ?? rankCSrc)
const statusStickerSrc = computed(() => {
  if (props.row.excellent) {
    return excellentStickerSrc
  }

  if (props.row.fullCombo) {
    return fullComboStickerSrc
  }

  if (props.row.clear) {
    return stageClearedStickerSrc
  }

  return null
})
const displayRateText = computed(() => {
  if (props.row.percText === 'FAILED' || props.row.percText === 'Fail') {
    return 'Fail'
  }

  return props.row.percText
})
const rateValueParts = computed(() => splitRateValueText(displayRateText.value))
const skillValueParts = computed(() => splitPaddedValueText(props.row.skillCalcText, 3))
const levelValueParts = computed(() => splitValueText(props.row.difficultyText))
const titleStyle = computed(() => ({
  left: `${TITLE_BASE_LEFT + titleVisualOffset.value}px`,
}))

function getTitleMeasureContext() {
  if (titleMeasureContext) {
    return titleMeasureContext
  }

  if (typeof document === 'undefined') {
    return null
  }

  titleMeasureContext = document.createElement('canvas').getContext('2d')
  return titleMeasureContext
}

function parsePixelValue(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function measureTitleWidth(text: string) {
  const element = titleTextRef.value
  const context = getTitleMeasureContext()

  if (!element || !context) {
    return text.length * 8
  }

  const style = getComputedStyle(element)
  context.font = [
    style.fontStyle,
    style.fontVariant,
    style.fontWeight,
    style.fontSize,
    style.fontFamily,
  ].join(' ')

  let width = context.measureText(text).width
  const letterSpacing = parsePixelValue(style.letterSpacing)

  if (letterSpacing !== 0 && text.length > 1) {
    width += letterSpacing * (text.length - 1)
  }

  return width
}

function fitTitleText() {
  const element = titleTextRef.value
  const fullTitle = title.value

  if (!element) {
    displayTitle.value = fullTitle
    titleVisualOffset.value = 0
    return
  }

  const availableWidth = element.clientWidth

  if (availableWidth <= 0) {
    displayTitle.value = fullTitle
    titleVisualOffset.value = 0
    return
  }

  if (measureTitleWidth(fullTitle) <= availableWidth) {
    displayTitle.value = fullTitle
    titleVisualOffset.value = 0
    return
  }

  let low = 0
  let high = fullTitle.length

  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const candidate = `${fullTitle.slice(0, mid)}${TITLE_ELLIPSIS}`

    if (measureTitleWidth(candidate) <= availableWidth) {
      low = mid
    } else {
      high = mid - 1
    }
  }

  const clippedLength = Math.max(low, 0)
  displayTitle.value = clippedLength > 0
    ? `${fullTitle.slice(0, clippedLength)}${TITLE_ELLIPSIS}`
    : TITLE_ELLIPSIS
  titleVisualOffset.value = TITLE_OVERFLOW_VISUAL_OFFSET
}

watch(title, async () => {
  displayTitle.value = title.value
  await nextTick()
  fitTitleText()
}, { immediate: true })

onMounted(async () => {
  await nextTick()
  fitTitleText()

  if (typeof document !== 'undefined' && 'fonts' in document) {
    void document.fonts.ready.then(() => {
      fitTitleText()
    }).catch(() => {})
  }

  if (typeof ResizeObserver === 'undefined' || !titleTextRef.value) {
    return
  }

  titleResizeObserver = new ResizeObserver(() => {
    fitTitleText()
  })
  titleResizeObserver.observe(titleTextRef.value)
})

onBeforeUnmount(() => {
  titleResizeObserver?.disconnect()
})
</script>

<template>
  <article class="b50-score-card">
    <img class="b50-score-card__background" :src="cardBackgroundSrc" alt="" aria-hidden="true" />

    <div class="b50-score-card__stickers">
      <img class="b50-score-card__rank-sticker" :src="rankStickerSrc" alt="" aria-hidden="true" />
      <img
        v-if="statusStickerSrc"
        class="b50-score-card__status-sticker"
        :src="statusStickerSrc"
        alt=""
        aria-hidden="true"
      />
    </div>

    <div class="b50-score-card__cover-shell">
      <img
        v-if="coverSrc"
        class="b50-score-card__cover-image"
        :src="coverSrc"
        :alt="`${title} cover`"
        decoding="async"
      />
      <span v-else class="b50-score-card__cover-fallback">{{ coverFallback }}</span>
    </div>

    <h3 class="b50-score-card__title" :style="titleStyle" :title="title">
      <span ref="titleTextRef">{{ displayTitle }}</span>
    </h3>

    <img
      class="b50-score-card__info-background"
      :src="infoBackgroundSrc"
      alt=""
      aria-hidden="true"
    />

    <img class="b50-score-card__rate-icon" :src="achieveIconSrc" alt="" aria-hidden="true" />
    <strong
      class="b50-score-card__rate-value"
      :class="{ 'b50-score-card__rate-value--fail': displayRateText === 'Fail' }"
    >
      <span class="b50-score-card__value-main">{{ rateValueParts.whole }}</span>
      <span v-if="rateValueParts.fraction" class="b50-score-card__value-fraction">
        {{ rateValueParts.fraction }}
      </span>
      <span v-if="rateValueParts.suffix" class="b50-score-card__value-suffix">
        {{ rateValueParts.suffix }}
      </span>
    </strong>

    <img class="b50-score-card__skill-icon" :src="skillIconSrc" alt="" aria-hidden="true" />
    <strong class="b50-score-card__skill-value">
      <span
        v-if="skillValueParts.pad"
        class="b50-score-card__value-pad"
      >
        {{ skillValueParts.pad }}
      </span>
      <span class="b50-score-card__value-main">{{ skillValueParts.whole }}</span>
      <span v-if="skillValueParts.fraction" class="b50-score-card__value-fraction">
        {{ skillValueParts.fraction }}
      </span>
    </strong>

    <div class="b50-score-card__difficulty-area">
      <div class="b50-score-card__difficulty-background-shell" aria-hidden="true">
        <svg
          class="b50-score-card__difficulty-background-svg"
          viewBox="0 0 65 10"
          preserveAspectRatio="none"
        >
          <path d="M65 10H25L19 0.90918H1V10H0V0H65V10Z" :fill="difficultyColor" />
        </svg>
      </div>

      <span class="b50-score-card__class-label" :class="classLabelClass">{{ classLabel }}</span>
      <span class="b50-score-card__difficulty-label" :class="difficultyLabelClass">{{ difficultyLabel }}</span>
      <strong class="b50-score-card__level-value">
        <span class="b50-score-card__value-main">{{ levelValueParts.whole }}</span>
        <span v-if="levelValueParts.fraction" class="b50-score-card__value-fraction">
          {{ levelValueParts.fraction }}
        </span>
      </strong>
    </div>
  </article>
</template>

<style scoped>
.b50-score-card {
  position: relative;
  width: 208px;
  height: 288px;
  overflow: hidden;
}

.b50-score-card__background,
.b50-score-card__stickers,
.b50-score-card__cover-shell,
.b50-score-card__title,
.b50-score-card__info-background,
.b50-score-card__rate-icon,
.b50-score-card__rate-value,
.b50-score-card__skill-icon,
.b50-score-card__skill-value,
.b50-score-card__level-value,
.b50-score-card__difficulty-area,
.b50-score-card__difficulty-background-shell,
.b50-score-card__class-label,
.b50-score-card__difficulty-label {
  position: absolute;
}

.b50-score-card__background {
  top: 0;
  left: 0;
  width: 208px;
  height: 288px;
  pointer-events: none;
}

.b50-score-card__stickers {
  top: 0;
  left: 0;
  z-index: 3;
  width: 86px;
  pointer-events: none;
}

.b50-score-card__rank-sticker {
  position: absolute;
  top: -14px;
  left: 0;
  width: 86px;
  height: 86px;
  object-fit: contain;
}

.b50-score-card__status-sticker {
  position: absolute;
  top: 43px;
  left: 0;
  width: 86px;
  height: auto;
  object-fit: contain;
}

.b50-score-card__cover-shell {
  top: 7px;
  left: 7px;
  z-index: 1;
  width: 194px;
  height: 194px;
  overflow: hidden;
  border: 1px solid #262527;
  border-radius: 0;
  background:
    linear-gradient(180deg, rgba(18, 14, 33, 0.94), rgba(37, 26, 69, 0.94)),
    linear-gradient(160deg, #161122, #31285d);
}

.b50-score-card__cover-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.b50-score-card__cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #ffffff;
  font-family: var(--font-figma-title);
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: lowercase;
}

.b50-score-card__title {
  top: 205px;
  left: 39px;
  z-index: 2;
  width: 130px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: none;
  margin: 0;
  color: #000000;
  font-family: var(--font-figma-title);
  font-size: 16px;
  font-weight: 400;
  line-height: 18px;
  letter-spacing: -1px;
  text-align: center;
  white-space: nowrap;
  font-feature-settings: 'pnum' 1, 'lnum' 1;
  overflow: hidden;
}

.b50-score-card__title span {
  display: block;
  width: 100%;
  line-height: 18px;
  overflow: hidden;
  white-space: nowrap;
}

.b50-score-card__info-background {
  top: 226px;
  left: 6px;
  width: 195px;
  height: 55px;
  pointer-events: none;
}

.b50-score-card__rate-icon {
  top: 225px;
  left: 7px;
  z-index: 2;
  width: 25.26px;
  height: 35.31px;
  transform: rotate(6.33deg);
  transform-origin: center;
}

.b50-score-card__rate-value,
.b50-score-card__skill-value,
.b50-score-card__level-value {
  display: flex;
  align-items: baseline;
  color: #201e21;
  font-family: var(--font-figma-ui);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'pnum' 1, 'lnum' 1;
  white-space: nowrap;
}

.b50-score-card__rate-value,
.b50-score-card__skill-value {
  font-size: 24px;
  font-weight: 500;
  line-height: 0;
  letter-spacing: -0.09em;
}

.b50-score-card__rate-value {
  top: 239px;
  left: 33px;
  z-index: 2;
  height: 15px;
  transform: translateY(-50%);
}

.b50-score-card__rate-value--fail {
  left: 36px;
  letter-spacing: 0;
}

.b50-score-card__skill-icon {
  top: 232px;
  left: 104px;
  z-index: 2;
  width: 30px;
  height: 23px;
}

.b50-score-card__skill-value {
  top: 239px;
  left: 134px;
  z-index: 2;
  width: 64px;
  height: 15px;
  transform: translateY(-50%);
}

.b50-score-card__level-value {
  top: 2px;
  left: 29px;
  z-index: 2;
  width: 29px;
  height: 8px;
  justify-content: flex-end;
  align-items: baseline;
  transform: translate(-100%, -50%);
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  letter-spacing: -0.03em;
  text-align: right;
}

.b50-score-card__difficulty-area {
  top: 268px;
  left: 105px;
  width: 96px;
  height: 10px;
  z-index: 2;
}

.b50-score-card__difficulty-background-shell {
  top: 0;
  left: 31px;
  width: 65px;
  height: 10px;
  z-index: 2;
}

.b50-score-card__difficulty-background-svg {
  display: block;
  width: 100%;
  height: 100%;
}

.b50-score-card__class-label,
.b50-score-card__difficulty-label {
  top: 5px;
  display: flex;
  align-items: center;
  transform: translateY(-50%);
  font-family: var(--font-figma-ui);
  font-style: normal;
  font-weight: 500;
  line-height: 20px;
  font-feature-settings: 'pnum' 1, 'lnum' 1;
  white-space: nowrap;
}

.b50-score-card__class-label {
  left: 33px;
  z-index: 2;
  width: 19px;
  height: 8px;
  color: #afafaf;
  font-size: 7px;
  letter-spacing: -0.08em;
}

.b50-score-card__class-label--guitar {
  letter-spacing: -0.12em;
}

.b50-score-card__difficulty-label {
  left: 96px;
  z-index: 2;
  width: 55px;
  height: 8px;
  justify-content: flex-end;
  transform: translate(-100%, -50%);
  color: rgba(5, 4, 5, 0.85);
  font-size: 11px;
  letter-spacing: -0.03em;
  text-align: right;
}

.b50-score-card__difficulty-label--advance {
  letter-spacing: -0.1em;
}

.b50-score-card__value-pad,
.b50-score-card__value-main,
.b50-score-card__value-fraction {
  display: inline-block;
  line-height: 0.92;
  vertical-align: baseline;
}

.b50-score-card__value-pad {
  visibility: hidden;
}

.b50-score-card__value-fraction {
  margin-left: 1px;
  font-size: 20px;
  letter-spacing: -0.06em;
}

.b50-score-card__value-suffix {
  display: inline-block;
  margin-left: 1px;
  font-size: 16px;
  line-height: 0.92;
  letter-spacing: -0.04em;
  vertical-align: baseline;
}

.b50-score-card__level-value .b50-score-card__value-fraction {
  font-size: inherit;
  letter-spacing: -0.03em;
}
</style>
