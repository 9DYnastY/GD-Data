<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import pageBackgroundSrc from '../assets/b50-page/Page_B50/b50_background.png'
import decorationBackgroundSrc from '../assets/b50-page/Page_B50/decoration_background.png'
import { B50_POSTER_HEIGHT, B50_POSTER_WIDTH, formatB50SkillTotal, getB50RowKey } from '../lib/b50'
import { resolveGitadoraMdbVersionLogo } from '../lib/version-logos'
import type { BjmaniaScoreFamily, BjmaniaScoreListItem } from '../types/bjmania'
import B50PlayerBoard from './B50PlayerBoard.vue'
import B50ScoreCard from './B50ScoreCard.vue'

const props = defineProps<{
  family: BjmaniaScoreFamily
  playerName: string
  playerTitle: string
  skillValue: string
  hotRows: BjmaniaScoreListItem[]
  otherRows: BjmaniaScoreListItem[]
  coverMap?: Record<string, string | null>
  mdbVersion?: number | null
  playerNameToneStyle?: CSSProperties | null
}>()

const POSTER_TEXT_TOP = {
  hot: 240,
  other: 240,
  mode: 160,
} as const
const VERSION_LOGO_BOX = {
  width: 561,
  height: 201,
} as const
const VERSION_LOGO_SIZE_BY_MDB_VERSION: Record<number, { width: number; height: number }> = {
  6: { width: 962, height: 308 },
  7: { width: 252, height: 104 },
  8: { width: 980, height: 320 },
  9: { width: 2000, height: 1021 },
  10: { width: 1024, height: 367 },
  11: { width: 546, height: 305 },
}
const FALLBACK_VERSION_LOGO_SIZE = VERSION_LOGO_SIZE_BY_MDB_VERSION[10]

function padRows(rows: BjmaniaScoreListItem[]) {
  return Array.from({ length: 25 }, (_, index) => rows[index] ?? null)
}

function resolveCoverSrc(row: BjmaniaScoreListItem) {
  return props.coverMap?.[getB50RowKey(row)] ?? null
}

const hotSlots = computed(() => padRows(props.hotRows))
const otherSlots = computed(() => padRows(props.otherRows))
const hotTotalText = computed(() => formatB50SkillTotal(props.hotRows))
const otherTotalText = computed(() => formatB50SkillTotal(props.otherRows))
const gameLabel = computed(() => (props.family === 'dm' ? 'Drummania' : 'GuitarFreaks'))
const modeLabelLeft = computed(() => (props.family === 'gf' ? 2235 : 2265))
const modeLabelTop = computed(() => (props.mdbVersion === 7 ? 232 : POSTER_TEXT_TOP.mode))
const versionLogoSrc = computed(() => resolveGitadoraMdbVersionLogo(props.mdbVersion))
const versionLogoStyle = computed(() => {
  const naturalSize = props.mdbVersion
    ? VERSION_LOGO_SIZE_BY_MDB_VERSION[props.mdbVersion] ?? FALLBACK_VERSION_LOGO_SIZE
    : FALLBACK_VERSION_LOGO_SIZE
  const scale = Math.min(
    VERSION_LOGO_BOX.width / naturalSize.width,
    VERSION_LOGO_BOX.height / naturalSize.height,
  )

  return {
    width: `${Math.round(naturalSize.width * scale)}px`,
    height: `${Math.round(naturalSize.height * scale)}px`,
  }
})
</script>

<template>
  <article
    class="b50-poster"
    :style="{ width: `${B50_POSTER_WIDTH}px`, height: `${B50_POSTER_HEIGHT}px` }"
  >
    <img class="b50-poster__background" :src="pageBackgroundSrc" alt="" aria-hidden="true" />
    <img
      class="b50-poster__decoration"
      :src="decorationBackgroundSrc"
      alt=""
      aria-hidden="true"
    />

    <div
      class="b50-poster__label b50-poster__label--hot"
      :style="{ top: `${POSTER_TEXT_TOP.hot}px` }"
    >
      <span>Hot : {{ hotTotalText }}</span>
    </div>
    <div
      class="b50-poster__label b50-poster__label--other"
      :style="{ top: `${POSTER_TEXT_TOP.other}px` }"
    >
      <span>Other : {{ otherTotalText }}</span>
    </div>

    <div class="b50-poster__player-board">
      <B50PlayerBoard
        :display-name="props.playerName"
        :title="props.playerTitle"
        :skill-value="props.skillValue"
        :name-tone-style="props.playerNameToneStyle"
      />
    </div>

    <div class="b50-poster__version-logo">
      <img :src="versionLogoSrc" :style="versionLogoStyle" alt="" aria-hidden="true" />
    </div>
    <div
      class="b50-poster__mode-label"
      :style="{ top: `${modeLabelTop}px`, left: `${modeLabelLeft}px` }"
    >
      <span>{{ gameLabel }}</span>
    </div>

    <section class="b50-poster__grid b50-poster__grid--hot" aria-label="Hot top 25">
      <template v-for="(row, index) in hotSlots" :key="row ? getB50RowKey(row) : `hot-empty-${index}`">
        <B50ScoreCard
          v-if="row"
          :row="row"
          :cover-src-override="resolveCoverSrc(row)"
        />
        <div v-else class="b50-poster__card-placeholder" aria-hidden="true"></div>
      </template>
    </section>

    <section class="b50-poster__grid b50-poster__grid--other" aria-label="Other top 25">
      <template v-for="(row, index) in otherSlots" :key="row ? getB50RowKey(row) : `other-empty-${index}`">
        <B50ScoreCard
          v-if="row"
          :row="row"
          :cover-src-override="resolveCoverSrc(row)"
        />
        <div v-else class="b50-poster__card-placeholder" aria-hidden="true"></div>
      </template>
    </section>
  </article>
</template>

<style scoped>
.b50-poster {
  position: relative;
  overflow: hidden;
  background: #dad4ee;
}

.b50-poster__background,
.b50-poster__decoration {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  user-select: none;
}

.b50-poster__background {
  object-fit: cover;
}

.b50-poster__decoration {
  top: 265px;
  height: auto;
}

.b50-poster__label,
.b50-poster__player-board,
.b50-poster__version-logo,
.b50-poster__mode-label,
.b50-poster__grid {
  position: absolute;
}

.b50-poster__label {
  display: flex;
  align-items: center;
  height: 98px;
  color: #f7f5f3;
  font-family: var(--font-b50-poster);
  font-size: 61px;
  font-style: normal;
  letter-spacing: -1px;
  line-height: 1;
  text-shadow:
    -3px 0 0 #21008d,
    3px 0 0 #21008d,
    0 -3px 0 #21008d,
    0 3px 0 #21008d,
    -2px -2px 0 #21008d,
    2px -2px 0 #21008d,
    -2px 2px 0 #21008d,
    2px 2px 0 #21008d,
    -3px -1px 0 #21008d,
    3px -1px 0 #21008d,
    -3px 1px 0 #21008d,
    3px 1px 0 #21008d,
    -1px -3px 0 #21008d,
    1px -3px 0 #21008d,
    -1px 3px 0 #21008d,
    1px 3px 0 #21008d,
    3px 6px 0 #21008d;
  white-space: nowrap;
}

.b50-poster__label span,
.b50-poster__mode-label span {
  display: inline-block;
  transform: skewX(-10deg);
  transform-origin: left center;
}

.b50-poster__label--hot {
  left: 58px;
}

.b50-poster__label--other {
  left: 1443px;
}

.b50-poster__player-board {
  top: 23px;
  left: 61px;
}

.b50-poster__version-logo {
  top: 23px;
  left: 2196px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 561px;
  height: 201px;
}

.b50-poster__version-logo img {
  flex: none;
}

.b50-poster__mode-label {
  color: #f7f5f3;
  font-family: var(--font-b50-poster);
  font-size: 83px;
  font-style: normal;
  letter-spacing: -1px;
  line-height: 1;
  text-shadow:
    -3px 0 0 #21008d,
    3px 0 0 #21008d,
    0 -3px 0 #21008d,
    0 3px 0 #21008d,
    -2px -2px 0 #21008d,
    2px -2px 0 #21008d,
    -2px 2px 0 #21008d,
    2px 2px 0 #21008d,
    -3px -1px 0 #21008d,
    3px -1px 0 #21008d,
    -3px 1px 0 #21008d,
    3px 1px 0 #21008d,
    -1px -3px 0 #21008d,
    1px -3px 0 #21008d,
    -1px 3px 0 #21008d,
    1px 3px 0 #21008d,
    3px 6px 0 #21008d;
  white-space: nowrap;
}

.b50-poster__grid {
  display: grid;
  grid-template-columns: repeat(5, 208px);
  gap: 16px 52px;
}

.b50-poster__grid--hot {
  top: 333px;
  left: 61px;
}

.b50-poster__grid--other {
  top: 333px;
  left: 1443px;
}

.b50-poster__card-placeholder {
  width: 208px;
  height: 288px;
  border: 2px dashed rgba(82, 41, 192, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.12);
}
</style>
