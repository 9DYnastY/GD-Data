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
  padding: 8px;
  background: rgba(232, 229, 241, 0.9);
  border: 2px solid rgba(47, 0, 178, 0.94);
  border-radius: 18px;
  box-shadow: 0 12px 30px rgba(27, 14, 84, 0.18);
  text-decoration: none;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(6px);
}

.song-card::after {
  content: '';
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 32px;
  height: 8px;
  border-bottom: 3px solid rgba(114, 89, 190, 0.56);
  border-right: 3px solid rgba(114, 89, 190, 0.56);
  border-radius: 0 0 10px 0;
  pointer-events: none;
  transform: skewX(-26deg);
}

.song-card__main {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.song-card__media {
  display: grid;
  gap: 6px;
}

.song-card__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.song-card__title-area {
  display: grid;
  gap: 4px;
}

.song-card__cover {
  width: 100%;
  min-height: 132px;
  border: 3px solid rgba(31, 58, 255, 0.94);
  border-radius: 10px;
  box-shadow: 0 8px 14px rgba(32, 20, 99, 0.2);
}

.song-card h2 {
  margin: 0;
  color: #1c1466;
  font-family: 'Inter', 'Noto Sans JP', sans-serif;
  font-size: 1.06rem;
  font-weight: 800;
  line-height: 1.18;
  word-break: break-word;
}

.song-card__artist {
  margin: 0;
  color: #201d24;
  font-size: 0.9rem;
  line-height: 1.25;
  word-break: break-word;
}

.song-card__divider {
  position: relative;
  height: 10px;
}

.song-card__divider::before {
  content: '';
  position: absolute;
  left: 0;
  right: 24px;
  top: 50%;
  border-top: 2px solid rgba(89, 40, 243, 0.72);
  transform: translateY(-50%);
}

.song-card__divider::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  width: 18px;
  height: 8px;
  transform: translateY(-50%);
  background:
    radial-gradient(circle at 2px 50%, rgba(89, 40, 243, 0.92) 0 1.3px, transparent 1.5px),
    linear-gradient(90deg, transparent 0 15%, rgba(89, 40, 243, 0.9) 15% 21%, transparent 21% 29%, rgba(89, 40, 243, 0.9) 29% 35%, transparent 35% 43%, rgba(89, 40, 243, 0.9) 43% 49%, transparent 49% 100%);
}

.song-card__difficulty-area {
  padding-left: 12px;
}

.song-card__logo-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
}

.song-card__logo {
  max-width: 100%;
  max-height: 48px;
  object-fit: contain;
  filter: drop-shadow(0 4px 6px rgba(39, 13, 111, 0.22));
}

@media (max-width: 720px) {
  .song-card__main {
    grid-template-columns: 122px minmax(0, 1fr);
    gap: 12px;
  }

  .song-card__cover {
    min-height: 122px;
  }

  .song-card h2 {
    font-size: 0.98rem;
  }

  .song-card__artist {
    font-size: 0.8rem;
  }

  .song-card__difficulty-area {
    padding-left: 4px;
  }
}
</style>
