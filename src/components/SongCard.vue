<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import DifficultyGrid from './DifficultyGrid.vue'
import LazyCoverImage from './LazyCoverImage.vue'
import songCardChromeSrc from '../assets/song-page/Card_Song/song-card-chrome.png'
import type { InstrumentKey, SongViewModel } from '../types/song'

const CARD_WIDTH = 375
const CARD_HEIGHT = 199
const TITLE_MAX_WIDTH = 192
const TITLE_SUFFIX = '.....'
const GF_LOGO_MAP: Record<number, string> = {
  0: '/version-logos/GF1.png',
  1: '/version-logos/GF2.png',
  2: '/version-logos/GF3.png',
  3: '/version-logos/GF4.png',
  4: '/version-logos/GF5.png',
  5: '/version-logos/GF6.png',
  6: '/version-logos/GF7.png',
  7: '/version-logos/GF8.png',
  8: '/version-logos/GF9.png',
  9: '/version-logos/GF10.png',
  10: '/version-logos/GF11.png',
  11: '/version-logos/GF_V.png',
  12: '/version-logos/GF_V2.png',
  13: '/version-logos/GF_V3.png',
  14: '/version-logos/GF_V4.png',
  15: '/version-logos/GF_V5.png',
  16: '/version-logos/GF_V6.png',
  17: '/version-logos/GF_XG.png',
  18: '/version-logos/GF_XG2.png',
  19: '/version-logos/GF_XG3.png',
}
const DM_LOGO_MAP: Record<number, string> = {
  0: '/version-logos/DM1.png',
  1: '/version-logos/DM2.png',
  2: '/version-logos/DM3.png',
  3: '/version-logos/DM4.png',
  4: '/version-logos/DM5.png',
  5: '/version-logos/DM6.png',
  6: '/version-logos/DM7.png',
  7: '/version-logos/DM8.png',
  8: '/version-logos/DM9.png',
  9: '/version-logos/DM10.png',
  10: '/version-logos/DM_V.png',
  11: '/version-logos/DM_V2.png',
  12: '/version-logos/DM_V3.png',
  13: '/version-logos/DM_V4.png',
  14: '/version-logos/DM_V5.png',
  15: '/version-logos/DM_V6.png',
  16: '/version-logos/DM_XG.png',
  17: '/version-logos/DM_XG2.png',
  18: '/version-logos/DM_XG3.png',
}
const GD_LOGO_MAP: Record<number, string> = {
  20: '/version-logos/GD.png',
  21: '/version-logos/GD_OverDrive.png',
  22: '/version-logos/GD_Tri-Boost.png',
  23: '/version-logos/GD_Tri-Boost_ReEVOLVE.png',
  24: '/version-logos/GD_Matixx.png',
  25: '/version-logos/GD_EXCHAIN.png',
  26: '/version-logos/GD_NEXTAGE.png',
  27: '/version-logos/GD_HIGH-VOLTAGE.png',
  28: '/version-logos/GD_FUZZ-UP.png',
  29: '/version-logos/GD_GALAXY_WAVE.png',
  30: '/version-logos/GD_GALAXY_WAVE_DELTA.png',
}

const props = defineProps<{
  song: SongViewModel
  selectedInstrument: InstrumentKey
  cardScale?: number
  animateCoverLoading?: boolean
  eagerCover?: boolean
}>()

const titleCanvas =
  typeof document === 'undefined' ? null : document.createElement('canvas')
const titleMeasureTick = ref(0)

function parseVersionKey(versionKey: string) {
  const [gfRaw, dmRaw] = versionKey.split('-')
  const gfIndex = Number(gfRaw)
  const dmIndex = Number(dmRaw)

  return {
    gfIndex: Number.isFinite(gfIndex) ? gfIndex : null,
    dmIndex: Number.isFinite(dmIndex) ? dmIndex : null,
  }
}

function resolveVersionLogo(versionKey: string, instrument: InstrumentKey) {
  const { gfIndex, dmIndex } = parseVersionKey(versionKey)

  if (gfIndex !== null && gfIndex >= 20) {
    return GD_LOGO_MAP[gfIndex] ?? '/version-logos/GD_GALAXY_WAVE.png'
  }

  if (instrument === 'drum') {
    return dmIndex !== null ? (DM_LOGO_MAP[dmIndex] ?? '/version-logos/GD_GALAXY_WAVE.png') : '/version-logos/GD_GALAXY_WAVE.png'
  }

  return gfIndex !== null ? (GF_LOGO_MAP[gfIndex] ?? '/version-logos/GD_GALAXY_WAVE.png') : '/version-logos/GD_GALAXY_WAVE.png'
}

function truncateCardTitle(title: string) {
  const context = titleCanvas?.getContext('2d')

  if (!context) {
    return title
  }

  context.font = '800 14px Inter, "Noto Sans JP", sans-serif'

  if (context.measureText(title).width <= TITLE_MAX_WIDTH) {
    return title
  }

  let truncated = title

  while (truncated.length > 0 && context.measureText(`${truncated}${TITLE_SUFFIX}`).width > TITLE_MAX_WIDTH) {
    truncated = truncated.slice(0, -1)
  }

  return `${truncated.trimEnd()}${TITLE_SUFFIX}`
}

onMounted(() => {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    document.fonts.ready
      .then(() => {
        titleMeasureTick.value += 1
      })
      .catch(() => {})
  }
})

const cardTitle = computed(() => {
  titleMeasureTick.value
  return truncateCardTitle(props.song.displayTitle)
})
const versionLogoSrc = computed(() => resolveVersionLogo(props.song.versionKey, props.selectedInstrument))
</script>

<template>
  <div class="song-card-shell">
    <div class="song-card">
      <div
        class="song-card__stage"
        :style="{
          width: `${CARD_WIDTH}px`,
          height: `${CARD_HEIGHT}px`,
          transform: `scale(${cardScale ?? 1})`,
        }"
      >
        <img
          class="song-card__chrome"
          :src="songCardChromeSrc"
          alt=""
          aria-hidden="true"
        />

        <div class="song-card__main">
          <div class="song-card__media">
            <div class="song-card__cover-shell">
              <LazyCoverImage
                class="song-card__cover"
                :alt="`${song.displayTitle} cover`"
                :animate-loading="animateCoverLoading"
                :cache-key="song.heroImageCacheKey"
                :eager="eagerCover"
                :fallback-text="song.imageFallback"
                :src="song.heroImageUrl"
              />
            </div>

            <div class="song-card__logo-wrap">
              <img
                class="song-card__logo"
                :src="versionLogoSrc"
                :alt="`${song.versionLabel} logo`"
              />
            </div>
          </div>

          <div class="song-card__content">
            <header class="song-card__title-area">
              <h2>{{ cardTitle }}</h2>
              <p class="song-card__artist">{{ song.displayArtist }}</p>
            </header>

            <div class="song-card__difficulty-area">
              <DifficultyGrid
                :compact="true"
                :instruments="song.instruments"
                :selected-instrument="selectedInstrument"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.song-card-shell {
  position: relative;
  width: 100%;
  aspect-ratio: 375 / 199;
  min-height: 0;
}

.song-card {
  display: block;
  position: absolute;
  inset: 0;
  background: transparent;
  border: 0;
  text-decoration: none;
  overflow: visible;
}

.song-card__stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
  will-change: transform;
}

.song-card__chrome {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.song-card__main {
  display: grid;
  grid-template-columns: 132px 219px;
  gap: 0;
  align-items: start;
  position: relative;
  z-index: 2;
  height: 100%;
  padding: 9px 11px 9px 9px;
  box-sizing: border-box;
}

.song-card__media {
  display: grid;
  gap: 2px;
  width: 132px;
}

.song-card__content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 219px;
  min-width: 0;
}

.song-card__title-area {
  position: relative;
  width: 219px;
  height: 52px;
}

.song-card__cover-shell {
  width: 132px;
  height: 132px;
  border: 0;
  border-radius: 10px;
  overflow: hidden;
}

.song-card__cover {
  width: 100%;
  min-height: 100%;
}

.song-card h2 {
  margin: 0;
  position: absolute;
  top: 0;
  left: 9px;
  right: 18px;
  color: #14004c;
  font-family: var(--font-figma-title);
  font-size: 14px;
  font-weight: 800;
  line-height: 20px;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
}

.song-card__artist {
  margin: 0;
  position: absolute;
  left: 9px;
  right: 0;
  top: 21px;
  color: #000000;
  font-family: var(--font-figma-ui);
  font-size: 11px;
  line-height: 20px;
  letter-spacing: -0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-feature-settings: 'dlig' 1, 'lnum' 1, 'pnum' 1;
}

.song-card__difficulty-area {
  width: 219px;
  height: 120px;
  padding-left: 18px;
}

.song-card__logo-wrap {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 47px;
}

.song-card__logo {
  width: 132px;
  height: 47px;
  object-fit: contain;
  transform: rotate(-0.15deg);
}

</style>
