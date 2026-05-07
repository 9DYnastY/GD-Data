<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import skillCardChromeSrc from '../assets/skill-page/Card_Skill/skill-card-chrome.png'
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
  cardScale?: number
  animateCoverLoading?: boolean
}>()

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
  <RouterLink
    class="skill-score-card-shell"
    :class="{
      'skill-score-card-shell--deleted': row.isDeleted,
      'skill-score-card-shell--classic': row.isClassic,
    }"
    :to="{
      name: 'song-detail',
      params: { musicId: row.musicId },
      query: { instrument: row.instrument },
    }"
    :aria-label="`查看 ${title} 的歌曲详情`"
  >
    <div class="skill-score-card">
      <div
        class="skill-score-card__stage"
        :style="{
          width: `${CARD_WIDTH}px`,
          height: `${CARD_HEIGHT}px`,
          transform: `scale(${cardScale ?? 1})`,
        }"
      >
        <img class="skill-score-card__chrome" :src="skillCardChromeSrc" alt="" aria-hidden="true" />

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
            :animate-loading="animateCoverLoading"
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
          <strong class="skill-score-card__level-value">
            <span class="skill-score-card__value-main">{{ levelValueParts.whole }}</span>
            <span v-if="levelValueParts.fraction" class="skill-score-card__value-fraction">{{ levelValueParts.fraction }}</span>
          </strong>
          <div class="skill-score-card__level-bar" :style="{ background: levelColor }"></div>
        </div>

        <div class="skill-score-card__rate-area">
          <strong
            class="skill-score-card__rate-value"
            :class="{ 'skill-score-card__rate-value--fail': displayRateText === 'Fail' }"
          >
            <span class="skill-score-card__value-main">{{ rateValueParts.whole }}</span>
            <span v-if="rateValueParts.fraction" class="skill-score-card__value-fraction">{{ rateValueParts.fraction }}</span>
          </strong>
        </div>

        <div class="skill-score-card__skill-area">
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
  </RouterLink>
</template>

<style scoped>
.skill-score-card-shell {
  position: relative;
  display: block;
  width: min(100%, 374px);
  margin: 0 auto;
  aspect-ratio: 374 / 110;
  min-height: 0;
  overflow: visible;
  color: inherit;
  text-decoration: none;
  outline: none;
}

.skill-score-card-shell:focus-visible {
  border-radius: 12px;
  box-shadow: 0 0 0 3px rgba(255, 159, 74, 0.42);
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

.skill-score-card__chrome,
.skill-score-card__stickers,
.skill-score-card__cover-shell,
.skill-score-card__title-area,
.skill-score-card__level-area,
.skill-score-card__rate-area,
.skill-score-card__skill-area {
  position: absolute;
}

.skill-score-card__chrome {
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

</style>
