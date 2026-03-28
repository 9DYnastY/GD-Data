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
    <div class="song-card__main">
      <div class="song-card__media">
        <LazyCoverImage
          class="song-card__cover"
          :alt="`${song.displayTitle} cover`"
          :fallback-text="song.imageFallback"
          :src="song.heroImageUrl"
        />

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
          <div class="song-card__divider" aria-hidden="true"></div>
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
  background: rgba(217, 217, 217, 0.9);
  border: 2px solid #2f00b2;
  border-radius: 17px;
  box-shadow: 0 0 0 1px rgba(47, 0, 178, 0.04);
  text-decoration: none;
  position: relative;
  overflow: hidden;
}

.song-card::after {
  content: '';
  position: absolute;
  right: 10px;
  bottom: 8px;
  width: 28px;
  height: 10px;
  background: url('/figma-card/card-corner.png') center / contain no-repeat;
  pointer-events: none;
}

.song-card__main {
  display: grid;
  grid-template-columns: 132px 219px;
  gap: 0;
  align-items: start;
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

.song-card__cover {
  width: 132px;
  min-height: 132px;
  border: 0;
  border-radius: 10px;
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

.song-card__divider {
  position: absolute;
  left: 0;
  right: 0;
  top: 39px;
  height: 2px;
  background: url('/figma-card/title-line.png') center / 100% 100% no-repeat;
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
