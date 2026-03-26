<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import DifficultyGrid from './DifficultyGrid.vue'
import LazyCoverImage from './LazyCoverImage.vue'
import type { SongViewModel } from '../types/song'

const props = defineProps<{
  song: SongViewModel
}>()

const highlightTags = computed(() => {
  const tags = [...props.song.tags]

  if (tags.length === 0) {
    tags.push(props.song.versionLabel)
  }

  return tags.slice(0, 2)
})
</script>

<template>
  <RouterLink class="song-card" :to="`/song/${song.musicId}`">
    <div class="song-card__hero">
      <LazyCoverImage
        class="song-card__cover"
        :alt="`${song.displayTitle} cover`"
        :fallback-text="song.imageFallback"
        :src="song.heroImageUrl"
      />

      <div class="song-card__copy">
        <p class="song-card__artist">{{ song.displayArtist }}</p>
        <h2>{{ song.displayTitle }}</h2>
        <div class="song-card__badges">
          <span v-for="tag in highlightTags" :key="tag" class="tag-chip">{{ tag }}</span>
        </div>
        <div class="song-card__meta">
          <span>{{ song.genreLabel }}</span>
          <span>BPM {{ song.bpmDisplay }}</span>
          <span>ID {{ song.musicId }}</span>
        </div>
      </div>
    </div>

    <DifficultyGrid :compact="true" :instruments="song.instruments" />
  </RouterLink>
</template>

<style scoped>
.song-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  background: rgba(81, 67, 162, 0.84);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: var(--shadow-soft);
  text-decoration: none;
  position: relative;
  overflow: hidden;
}

.song-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 159, 74, 0.14);
  pointer-events: none;
}

.song-card__hero {
  display: grid;
  grid-template-columns: 118px minmax(0, 1fr);
  gap: 16px;
}

.song-card__copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.song-card__artist,
.song-card__meta {
  margin: 0;
}

.song-card__artist {
  color: var(--accent);
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.song-card h2 {
  margin: 8px 0 10px;
  color: var(--ink);
  font-size: clamp(1.45rem, 4vw, 1.9rem);
  line-height: 1;
  text-transform: uppercase;
}

.song-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.song-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
  color: rgba(244, 239, 255, 0.76);
  font-size: 0.74rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

@media (max-width: 720px) {
  .song-card {
    padding: 14px;
  }

  .song-card__hero {
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 14px;
  }

  .song-card h2 {
    font-size: 1.52rem;
  }

  .song-card__meta {
    gap: 8px;
    font-size: 0.68rem;
  }
}
</style>
