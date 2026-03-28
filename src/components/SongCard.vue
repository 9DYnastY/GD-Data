<script setup lang="ts">
import { RouterLink } from 'vue-router'
import DifficultyGrid from './DifficultyGrid.vue'
import LazyCoverImage from './LazyCoverImage.vue'
import type { InstrumentKey, SongViewModel } from '../types/song'

const props = defineProps<{
  song: SongViewModel
  selectedInstrument: InstrumentKey
}>()
</script>

<template>
  <RouterLink class="song-card" :to="`/song/${song.musicId}`">
    <svg class="song-card__frame" viewBox="0 0 375 199" preserveAspectRatio="none" aria-hidden="true">
      <rect opacity="0.9" x="1" y="1" width="372.42" height="197" rx="16" fill="#D9D9D9" stroke="#2F00B2" stroke-width="2" />
      <g opacity="0.8">
        <path d="M320.504 190.14C319.673 189.378 319.639 188.108 320.428 187.302L326.153 181.458C326.942 180.653 328.255 180.618 329.085 181.38C329.916 182.141 329.95 183.412 329.161 184.217L323.436 190.061C322.648 190.867 321.335 190.902 320.504 190.14Z" fill="#8473B1" />
        <path d="M329.085 190.14C328.255 189.378 328.221 188.108 329.01 187.302L334.735 181.458C335.523 180.653 336.836 180.618 337.667 181.38C338.498 182.141 338.532 183.412 337.743 184.217L332.018 190.061C331.229 190.867 329.916 190.902 329.085 190.14Z" fill="#8473B1" />
        <path d="M337.601 190.14C336.771 189.378 336.737 188.108 337.526 187.302L343.251 181.458C344.039 180.653 345.352 180.618 346.183 181.38C347.013 182.141 347.047 183.412 346.259 184.217L340.534 190.061C339.745 190.867 338.432 190.902 337.601 190.14Z" fill="#8473B1" />
        <path d="M346.117 190.14C345.287 189.378 345.253 188.108 346.041 187.302L351.767 181.458C352.555 180.653 353.868 180.618 354.699 181.38C355.529 182.141 355.563 183.412 354.775 184.217L349.05 190.061C348.261 190.867 346.948 190.902 346.117 190.14Z" fill="#8473B1" />
        <path d="M354.633 190.14C353.803 189.378 353.769 188.108 354.557 187.302L360.282 181.458C361.071 180.653 362.384 180.618 363.215 181.38C364.045 182.141 364.079 183.412 363.291 184.217L357.566 190.061C356.777 190.867 355.464 190.902 354.633 190.14Z" fill="#8473B1" />
      </g>
      <path d="M141.095 57.1494L327.926 56.5776" stroke="#5229C0" />
      <path d="M359.477 56.5776C359.477 56.5776 346.341 56.5776 344.629 56.5776C342.917 56.5776 343.663 58.2521 342.685 58.2521C341.707 58.2521 342.438 51.7591 341.215 51.7591C339.992 51.7591 340.707 60.986 339.158 60.986C337.609 60.986 338.861 48 337.394 48C335.926 48 336.806 58.9356 335.522 58.9356C334.238 58.9356 335.033 52.4426 333.81 52.4426C332.587 52.4426 333.187 56.5776 331.638 56.5776H327.926" stroke="#5229C0" />
      <path d="M360.095 56.5776C360.095 57.525 359.264 58.2931 358.239 58.2931C357.214 58.2931 356.383 57.525 356.383 56.5776C356.383 55.6301 357.214 54.8621 358.239 54.8621C359.264 54.8621 360.095 55.6301 360.095 56.5776Z" fill="#5229C0" />
      <path d="M350.197 56.5776C350.197 57.525 349.366 58.2931 348.341 58.2931C347.316 58.2931 346.485 57.525 346.485 56.5776C346.485 55.6301 347.316 54.8621 348.341 54.8621C349.366 54.8621 350.197 55.6301 350.197 56.5776Z" fill="#5229C0" />
      <path d="M355.146 56.5776C355.146 57.525 354.315 58.2931 353.29 58.2931C352.265 58.2931 351.434 57.525 351.434 56.5776C351.434 55.6301 352.265 54.8621 353.29 54.8621C354.315 54.8621 355.146 55.6301 355.146 56.5776Z" fill="#5229C0" />
    </svg>

    <div class="song-card__main">
      <div class="song-card__media">
        <div class="song-card__cover-shell">
          <LazyCoverImage
            class="song-card__cover"
            :alt="`${song.displayTitle} cover`"
            :fallback-text="song.imageFallback"
            :src="song.heroImageUrl"
          />
        </div>

        <div class="song-card__logo-wrap">
          <img
            class="song-card__logo"
            src="/version-logos/galaxy-wave.png"
            alt="GALAXY WAVE logo"
          />
        </div>
      </div>

      <div class="song-card__content">
        <header class="song-card__title-area">
          <h2>{{ song.displayTitle }}</h2>
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
  </RouterLink>
</template>

<style scoped>
.song-card {
  display: block;
  width: 100%;
  min-height: 199px;
  padding: 9px 11px 9px 9px;
  background: transparent;
  border: 0;
  border-radius: 17px;
  text-decoration: none;
  position: relative;
  overflow: hidden;
}

.song-card__frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.song-card__main {
  display: grid;
  grid-template-columns: 132px 219px;
  gap: 0;
  align-items: start;
  position: relative;
  z-index: 1;
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
  border: 1px solid #ff7700;
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
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
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

@media (max-width: 720px) {
  .song-card {
    min-height: 199px;
  }
}
</style>
