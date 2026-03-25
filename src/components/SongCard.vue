<script setup lang="ts">
import { RouterLink } from 'vue-router'
import DifficultyGrid from './DifficultyGrid.vue'
import LazyCoverImage from './LazyCoverImage.vue'
import type { SongViewModel } from '../types/song'

defineProps<{
  song: SongViewModel
}>()
</script>

<template>
  <article class="song-card">
    <div class="song-card__hero">
      <LazyCoverImage
        class="song-card__cover"
        :alt="`${song.displayTitle} cover`"
        :fallback-text="song.imageFallback"
        :src="song.heroImageUrl"
      />

      <div class="song-card__summary">
        <div class="song-card__heading">
          <div>
            <p class="song-card__id">ID {{ song.musicId }}</p>
            <h2>{{ song.displayTitle }}</h2>
            <p class="song-card__artist">{{ song.displayArtist }}</p>
          </div>
          <RouterLink class="action-button" :to="`/song/${song.musicId}`">
            Details
          </RouterLink>
        </div>

        <div class="song-card__meta-row">
          <span class="meta-pill">{{ song.versionLabel }}</span>
          <span class="meta-pill">{{ song.genreLabel }}</span>
          <span class="meta-pill">BPM {{ song.bpmDisplay }}</span>
          <span class="meta-pill">{{ song.lengthLabel }}</span>
        </div>

        <div v-if="song.tags.length" class="song-card__tag-row">
          <span v-for="tag in song.tags" :key="tag" class="tag-chip">{{ tag }}</span>
        </div>
      </div>
    </div>

    <DifficultyGrid :compact="true" :instruments="song.instruments" />
  </article>
</template>

<style scoped>
.song-card {
  display: grid;
  gap: 18px;
  padding: 20px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 32px;
  box-shadow: var(--shadow-soft);
}

.song-card__hero {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr);
  gap: 18px;
}

.song-card__cover {
  min-width: 0;
}

.song-card__summary {
  display: grid;
  gap: 14px;
}

.song-card__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.song-card__id,
.song-card__artist {
  margin: 0;
}

.song-card__id {
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.song-card__heading h2 {
  margin: 8px 0 6px;
  color: var(--ink);
  font-size: clamp(1.34rem, 2vw, 1.7rem);
  line-height: 1.06;
}

.song-card__artist {
  color: var(--muted);
  font-size: 0.98rem;
}

.song-card__meta-row,
.song-card__tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

@media (max-width: 720px) {
  .song-card {
    padding: 18px;
    border-radius: 24px;
  }

  .song-card__hero {
    grid-template-columns: 1fr;
  }

  .song-card__heading {
    flex-direction: column;
  }

  .song-card :deep(.action-button) {
    width: 100%;
  }
}
</style>
