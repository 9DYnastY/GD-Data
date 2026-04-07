<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import skillPanelBackgroundSrc from '../assets/skill-page/Card_Skill/BACKGOUND.svg'
import backgroundSrc from '../assets/skill-page/Card_Skill/Background.svg'
import levelIconSrc from '../assets/skill-page/Card_Skill/LEVEL_icon.svg'
import achieveIconSrc from '../assets/skill-page/Card_Skill/achieve_icon.svg'
import skillIconSrc from '../assets/skill-page/Card_Skill/SKILL_ICON.svg'
import excellentStickerSrc from '../assets/skill-page/Card_Skill/stick/stick_Excellent.png'
import fullComboStickerSrc from '../assets/skill-page/Card_Skill/stick/stick_fullcombo.png'
import rankASrc from '../assets/skill-page/Card_Skill/stick/stick_rankA.png'
import rankBSrc from '../assets/skill-page/Card_Skill/stick/stick_rankB.png'
import rankCSrc from '../assets/skill-page/Card_Skill/stick/stick_rankC.png'
import rankSSSrc from '../assets/skill-page/Card_Skill/stick/stick_rankSS.png'
import rankSSingleSrc from '../assets/skill-page/Card_Skill/stick/stick_rankS.png'
import stageClearedStickerSrc from '../assets/skill-page/Card_Skill/stick/stick_StageCleared.png'
import type { BjmaniaScoreListItem } from '../types/bjmania'
import type { LevelKey } from '../types/song'
import LazyCoverImage from './LazyCoverImage.vue'

const CARD_WIDTH = 374
const CARD_HEIGHT = 110

const props = defineProps<{
  row: BjmaniaScoreListItem
}>()

const cardRoot = ref<HTMLElement | null>(null)
const cardScale = ref(1)
let cardResizeObserver: ResizeObserver | null = null

const LEVEL_COLORS: Record<LevelKey, string> = {
  master: '#C700CD',
  extreme: '#E10035',
  advanced: '#FFC800',
  basic: '#5297FF',
}

const RANK_STICKER_MAP: Record<string, string> = {
  SS: rankSSSrc,
  S: rankSSingleSrc,
  A: rankASrc,
  B: rankBSrc,
  C: rankCSrc,
  D: rankCSrc,
  E: rankCSrc,
}

function splitValueText(value: string) {
  const decimalIndex = value.indexOf('.')

  if (decimalIndex < 0) {
    return {
      whole: value,
      fraction: '',
    }
  }

  return {
    whole: value.slice(0, decimalIndex),
    fraction: value.slice(decimalIndex),
  }
}

function buildSkillIntegerPadding(value: string) {
  if (!/^\d+$/.test(value)) {
    return ''
  }

  return '0'.repeat(Math.max(0, 3 - value.length))
}

function updateCardScale() {
  if (!cardRoot.value) {
    return
  }

  const nextScale = Math.min(cardRoot.value.clientWidth / CARD_WIDTH, 1)
  cardScale.value = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1
}

onMounted(() => {
  updateCardScale()

  if (typeof ResizeObserver === 'undefined' || !cardRoot.value) {
    return
  }

  cardResizeObserver = new ResizeObserver(() => {
    updateCardScale()
  })
  cardResizeObserver.observe(cardRoot.value)
})

onBeforeUnmount(() => {
  cardResizeObserver?.disconnect()
})

const title = computed(() => {
  return props.row.song?.displayTitle ?? `Music #${props.row.musicId}`
})

const coverSrc = computed(() => props.row.song?.heroImageUrl ?? null)
const coverCacheKey = computed(() => props.row.song?.heroImageCacheKey ?? null)
const coverFallback = computed(() => props.row.song?.imageFallback ?? String(props.row.musicId))
const levelColor = computed(() => LEVEL_COLORS[props.row.level])
const instrumentLabel = computed(() => {
  return props.row.family === 'gf' ? (props.row.branchLabel ?? props.row.instrument) : ''
})
const rankStickerSrc = computed(() => {
  return RANK_STICKER_MAP[props.row.rankLabel] ?? rankCSrc
})
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
const levelValueParts = computed(() => splitValueText(props.row.difficultyText))
const displayRateText = computed(() => (props.row.percText === 'FAILED' ? 'Fail' : props.row.percText))
const rateValueParts = computed(() => splitValueText(displayRateText.value))
const skillValueParts = computed(() => splitValueText(props.row.skillCalcText))
const skillValuePadding = computed(() => buildSkillIntegerPadding(skillValueParts.value.whole))
</script>

<template>
  <article
    ref="cardRoot"
    class="skill-score-card-shell"
    :class="{
      'skill-score-card-shell--deleted': row.isDeleted,
      'skill-score-card-shell--classic': row.isClassic,
    }"
  >
    <div class="skill-score-card">
      <div
        class="skill-score-card__stage"
        :style="{
          width: `${CARD_WIDTH}px`,
          height: `${CARD_HEIGHT}px`,
          transform: `scale(${cardScale})`,
        }"
      >
        <img
          class="skill-score-card__background"
          :src="backgroundSrc"
          alt=""
          aria-hidden="true"
        />

        <div class="skill-score-card__stickers">
          <img class="skill-score-card__rank-sticker" :src="rankStickerSrc" alt="" aria-hidden="true" />
          <img
            v-if="statusStickerSrc"
            class="skill-score-card__status-sticker"
            :src="statusStickerSrc"
            alt=""
            aria-hidden="true"
          />
        </div>

        <div class="skill-score-card__cover-shell">
          <LazyCoverImage
            class="skill-score-card__cover"
            :src="coverSrc"
            :cache-key="coverCacheKey"
            :alt="`${title} cover`"
            :fallback-text="coverFallback"
          />
        </div>

        <div class="skill-score-card__title-area">
          <h3 :title="title">{{ title }}</h3>
          <span v-if="instrumentLabel" class="skill-score-card__instrument">{{ instrumentLabel }}</span>
        </div>

        <div class="skill-score-card__level-area">
          <img class="skill-score-card__level-icon" :src="levelIconSrc" alt="" aria-hidden="true" />
          <span class="skill-score-card__level-label">LEVEL</span>
          <strong class="skill-score-card__level-value">
            <span class="skill-score-card__value-main">{{ levelValueParts.whole }}</span>
            <span v-if="levelValueParts.fraction" class="skill-score-card__value-fraction">{{ levelValueParts.fraction }}</span>
          </strong>
          <div class="skill-score-card__level-bar" :style="{ background: levelColor }"></div>
        </div>

        <div class="skill-score-card__rate-area">
          <img class="skill-score-card__rate-icon" :src="achieveIconSrc" alt="" aria-hidden="true" />
          <span class="skill-score-card__rate-label">达成率</span>
          <strong
            class="skill-score-card__rate-value"
            :class="{ 'skill-score-card__rate-value--fail': displayRateText === 'Fail' }"
          >
            <span class="skill-score-card__value-main">{{ rateValueParts.whole }}</span>
            <span v-if="rateValueParts.fraction" class="skill-score-card__value-fraction">{{ rateValueParts.fraction }}</span>
          </strong>
        </div>

        <div class="skill-score-card__skill-area">
          <img
            class="skill-score-card__skill-background"
            :src="skillPanelBackgroundSrc"
            alt=""
            aria-hidden="true"
          />
          <img class="skill-score-card__skill-icon" :src="skillIconSrc" alt="" aria-hidden="true" />
          <span class="skill-score-card__skill-label">SKILL</span>
          <strong class="skill-score-card__skill-value">
            <span
              v-if="skillValuePadding"
              class="skill-score-card__value-padding"
              aria-hidden="true"
            >{{ skillValuePadding }}</span>
            <span class="skill-score-card__value-main">{{ skillValueParts.whole }}</span>
            <span v-if="skillValueParts.fraction" class="skill-score-card__value-fraction">{{ skillValueParts.fraction }}</span>
          </strong>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.skill-score-card-shell {
  position: relative;
  width: min(100%, 374px);
  margin: 0 auto;
  aspect-ratio: 374 / 110;
  min-height: 0;
  overflow: visible;
}

.skill-score-card {
  position: absolute;
  inset: 0;
  overflow: visible;
}

.skill-score-card__stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
  will-change: transform;
}

.skill-score-card__background,
.skill-score-card__stickers,
.skill-score-card__cover-shell,
.skill-score-card__title-area,
.skill-score-card__level-area,
.skill-score-card__rate-area,
.skill-score-card__skill-area {
  position: absolute;
}

.skill-score-card__background {
  top: 0;
  left: 0;
  width: 374px;
  height: 110px;
  pointer-events: none;
}

.skill-score-card__stickers {
  top: 0;
  left: 0;
  z-index: 3;
  width: 69px;
  pointer-events: none;
}

.skill-score-card__rank-sticker {
  position: absolute;
  top: -23px;
  left: -10px;
  width: 68.57px;
  height: 68.57px;
  object-fit: contain;
}

.skill-score-card__status-sticker {
  position: absolute;
  top: 23px;
  left: -10px;
  width: 68.55px;
  height: auto;
  object-fit: contain;
}

.skill-score-card__cover-shell {
  top: 9px;
  left: 10px;
  z-index: 1;
  width: 92px;
  height: 92px;
  overflow: hidden;
  border-radius: 10px;
}

.skill-score-card__cover {
  width: 100%;
  height: 100%;
}

.skill-score-card__title-area {
  top: 5px;
  left: 110px;
  width: 253px;
  height: 26px;
  z-index: 2;
}

.skill-score-card__title-area h3 {
  position: absolute;
  top: 0;
  left: 0;
  width: 186px;
  margin: 0;
  color: #14004c;
  font-family: var(--font-figma-title);
  font-size: 13px;
  font-weight: 700;
  line-height: 20px;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-feature-settings: 'pnum' 1, 'lnum' 1;
}

.skill-score-card__instrument {
  position: absolute;
  top: -4px;
  left: 218px;
  color: #21008d;
  font-family: 'Exo 2', var(--font-figma-title);
  font-size: 13px;
  font-weight: 400;
  line-height: 20px;
  letter-spacing: 0.01em;
  white-space: nowrap;
  font-feature-settings: 'pnum' 1, 'lnum' 1;
}

.skill-score-card__level-area {
  top: 31px;
  left: 110px;
  width: 65px;
  height: 70px;
  z-index: 2;
}

.skill-score-card__level-icon {
  position: absolute;
  top: 6px;
  left: 3px;
  width: 18.4px;
  height: 25px;
}

.skill-score-card__level-label,
.skill-score-card__rate-label,
.skill-score-card__skill-label {
  position: absolute;
  display: flex;
  align-items: center;
  color: #21008d;
  font-family: 'Exo 2', var(--font-figma-title);
  font-style: italic;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  font-feature-settings: 'pnum' 1, 'lnum' 1;
}

.skill-score-card__level-label {
  top: 6px;
  left: 17px;
  font-size: 14px;
  line-height: 20px;
}

.skill-score-card__level-value,
.skill-score-card__rate-value {
  position: absolute;
  display: flex;
  align-items: baseline;
  color: #201e21;
  font-family: var(--font-figma-ui);
  font-size: 28px;
  font-weight: 500;
  line-height: 20px;
  letter-spacing: -0.095em;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'pnum' 1, 'lnum' 1;
}

.skill-score-card__level-value {
  top: 32px;
  left: 12px;
}

.skill-score-card__level-bar {
  position: absolute;
  top: 59px;
  left: 7px;
  width: 51px;
  height: 3px;
  border-radius: 6px;
}

.skill-score-card__rate-area {
  top: 31px;
  left: 181px;
  width: 76px;
  height: 70px;
  z-index: 2;
}

.skill-score-card__rate-icon {
  position: absolute;
  top: 0;
  left: 0;
  width: 24.55px;
  height: 34.32px;
  transform: rotate(6.33deg);
  transform-origin: center;
}

.skill-score-card__rate-label {
  top: 7px;
  left: 17px;
  font-size: 14px;
  line-height: 20px;
  transform: skewX(-9deg) scaleX(0.94);
  transform-origin: left center;
}

.skill-score-card__rate-value {
  top: 33px;
  left: 3px;
  letter-spacing: -0.1em;
}

.skill-score-card__rate-value--fail {
  left: 11px;
  letter-spacing: 0;
}

.skill-score-card__skill-area {
  top: 31px;
  left: 263px;
  width: 103px;
  height: 70px;
  z-index: 2;
}

.skill-score-card__skill-background {
  position: absolute;
  top: 2px;
  left: 0;
  width: 103px;
  height: 65px;
}

.skill-score-card__skill-icon {
  position: absolute;
  top: 6px;
  left: 9px;
  width: 26px;
  height: auto;
}

.skill-score-card__skill-label {
  top: 8px;
  left: 46px;
  color: #dadce2;
  font-size: 15px;
  line-height: 20px;
}

.skill-score-card__skill-value {
  position: absolute;
  top: 30px;
  left: 12px;
  display: flex;
  align-items: baseline;
  color: #dcdee1;
  font-family: 'Exo 2', var(--font-figma-title);
  font-style: italic;
  font-weight: 600;
  font-size: 32px;
  line-height: 20px;
  letter-spacing: -0.04em;
  white-space: nowrap;
  transform: skewX(-5deg) scaleX(0.92);
  transform-origin: left center;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'pnum' 1, 'lnum' 1;
}

.skill-score-card__value-main {
  display: inline-block;
  line-height: 0.92;
  vertical-align: baseline;
}

.skill-score-card__value-padding {
  display: inline-block;
  line-height: 0.92;
  vertical-align: baseline;
  visibility: hidden;
}

.skill-score-card__value-fraction {
  display: inline-block;
  margin-left: 1px;
  font-size: 18px;
  line-height: 0.92;
  letter-spacing: -0.04em;
  vertical-align: baseline;
}

.skill-score-card__skill-value .skill-score-card__value-fraction {
  font-size: 20px;
  line-height: 0.92;
}

.skill-score-card-shell--classic {
  filter: saturate(0.94);
}

.skill-score-card-shell--deleted {
  opacity: 0.76;
}
</style>
