<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import DifficultyGrid from '../components/DifficultyGrid.vue'
import LazyCoverImage from '../components/LazyCoverImage.vue'
import { loadSongByMusicId } from '../lib/song-catalog'
import type { SongViewModel } from '../types/song'

const route = useRoute()
const song = ref<SongViewModel>()
const loading = ref(true)
const errorMessage = ref('')

const facts = computed(() => {
  if (!song.value) {
    return []
  }

  return [
    { label: 'BPM', value: song.value.bpmDisplay },
    { label: 'Length', value: song.value.lengthLabel },
    { label: 'Debut', value: song.value.versionLabel },
    { label: 'Type', value: song.value.typeLabel },
    { label: 'Genre', value: song.value.genreLabel },
    { label: 'Max diff', value: song.value.maxDifficulty?.toFixed(2) ?? '--' },
  ]
})

async function loadCurrentSong() {
  loading.value = true
  errorMessage.value = ''

  const musicId = Number(route.params.musicId)

  if (!Number.isFinite(musicId)) {
    errorMessage.value = 'Invalid music ID'
    loading.value = false
    return
  }

  try {
    const result = await loadSongByMusicId(musicId)

    if (!result) {
      errorMessage.value = `Song ${musicId} was not found`
      return
    }

    song.value = result
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load detail page'
  } finally {
    loading.value = false
  }
}

watch(() => route.params.musicId, loadCurrentSong)
onMounted(loadCurrentSong)
</script>

<template>
  <section class="detail-view">
    <RouterLink class="back-link" to="/">
      Back to catalog
    </RouterLink>

    <section v-if="loading" class="detail-panel">
      Loading song detail...
    </section>

    <section v-else-if="errorMessage" class="detail-panel detail-panel--error">
      {{ errorMessage }}
    </section>

    <template v-else-if="song">
      <section class="detail-hero">
        <div class="detail-hero__cover">
          <LazyCoverImage
            v-if="song.heroImageUrl"
            class="detail-hero__cover-image"
            :src="song.heroImageUrl"
            :cache-key="song.heroImageCacheKey"
            :alt="`${song.displayTitle} cover`"
            :fallback-text="song.imageFallback"
            :eager="true"
          />
          <span v-else>{{ song.imageFallback }}</span>
        </div>

        <div class="detail-hero__content">
          <p class="detail-hero__id">Music ID {{ song.musicId }}</p>
          <h1>{{ song.displayTitle }}</h1>
          <p class="detail-hero__artist">{{ song.displayArtist }}</p>

          <div class="detail-hero__tags">
            <span class="meta-pill">{{ song.versionLabel }}</span>
            <span class="meta-pill">{{ song.typeLabel }}</span>
            <span class="meta-pill">{{ song.genreLabel }}</span>
            <span v-for="tag in song.tags" :key="tag" class="tag-chip">{{ tag }}</span>
          </div>

          <div class="detail-hero__actions">
            <a
              v-if="song.links.remyUrl"
              class="action-button"
              :href="song.links.remyUrl"
              rel="noreferrer"
              target="_blank"
            >
              Open RemyWiki
            </a>
            <RouterLink class="action-button action-button--ghost" to="/">
              Continue browsing
            </RouterLink>
          </div>
        </div>
      </section>

      <section class="detail-facts">
        <article v-for="fact in facts" :key="fact.label" class="fact-card">
          <p>{{ fact.label }}</p>
          <strong>{{ fact.value }}</strong>
        </article>
      </section>

      <section class="detail-panel">
        <div class="section-heading">
          <div>
            <p class="section-heading__eyebrow">Difficulty and note count</p>
            <h2>Playable charts</h2>
          </div>
          <p>Charts are grouped by Guitar, Drum, and Bass with note counts when available.</p>
        </div>
        <DifficultyGrid :instruments="song.instruments" :show-note-count="true" />
      </section>

      <section class="detail-panel detail-panel--two-column">
        <div>
          <div class="section-heading">
            <div>
              <p class="section-heading__eyebrow">Base information</p>
              <h2>Core facts</h2>
            </div>
          </div>
          <dl class="info-list">
            <div>
              <dt>BPM</dt>
              <dd>{{ song.bpmDisplay }}</dd>
            </div>
            <div>
              <dt>Length</dt>
              <dd>{{ song.lengthLabel }}</dd>
            </div>
            <div>
              <dt>Classic</dt>
              <dd>{{ song.tags.includes('Classic') ? 'Yes' : 'No' }}</dd>
            </div>
            <div>
              <dt>Remaster</dt>
              <dd>{{ song.tags.includes('Remaster') ? 'Yes' : 'No' }}</dd>
            </div>
            <div>
              <dt>Long</dt>
              <dd>{{ song.tags.includes('Long') ? 'Yes' : 'No' }}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{{ song.tags.includes('Session') ? 'Yes' : 'No' }}</dd>
            </div>
          </dl>
        </div>

        <div>
          <div class="section-heading">
            <div>
              <p class="section-heading__eyebrow">Classification and links</p>
              <h2>Metadata</h2>
            </div>
          </div>
          <dl class="info-list">
            <div>
              <dt>Debut version</dt>
              <dd>{{ song.versionLabel }}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{{ song.typeLabel }}</dd>
            </div>
            <div>
              <dt>Genre</dt>
              <dd>{{ song.genreLabel }}</dd>
            </div>
            <div>
              <dt>RemyWiki</dt>
              <dd>
                <a
                  v-if="song.links.remyUrl"
                  :href="song.links.remyUrl"
                  rel="noreferrer"
                  target="_blank"
                >
                  Open external page
                </a>
                <span v-else>No link</span>
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.detail-view {
  display: grid;
  gap: 18px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  color: var(--accent-strong);
  text-decoration: none;
  font-weight: 700;
}

.detail-hero,
.detail-panel,
.fact-card {
  background: var(--panel);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-soft);
}

.detail-hero {
  display: grid;
  grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
  gap: 20px;
  padding: 22px;
  border-radius: 32px;
}

.detail-hero__cover {
  min-height: 320px;
  overflow: hidden;
  border-radius: 28px;
  background:
    radial-gradient(circle at top, rgba(191, 87, 0, 0.3), transparent 56%),
    linear-gradient(180deg, #171d28, #2f364a);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.detail-hero__cover :deep(.lazy-cover.detail-hero__cover-image) {
  width: 100%;
  height: 100%;
  min-height: 320px;
  aspect-ratio: auto;
}

.detail-hero__cover :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-hero__content {
  display: grid;
  align-content: center;
  gap: 16px;
}

.detail-hero__id,
.detail-hero__artist {
  margin: 0;
}

.detail-hero__id {
  color: var(--muted);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.detail-hero__content h1 {
  margin: 0;
  color: var(--ink);
  font-size: clamp(2rem, 4vw, 3.4rem);
  line-height: 0.96;
  letter-spacing: -0.05em;
}

.detail-hero__artist {
  color: var(--muted);
  font-size: 1.04rem;
}

.detail-hero__tags,
.detail-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.detail-facts {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.fact-card {
  padding: 18px;
  border-radius: 24px;
}

.fact-card p,
.fact-card strong {
  margin: 0;
}

.fact-card p {
  color: var(--muted);
  font-size: 0.8rem;
}

.fact-card strong {
  display: block;
  margin-top: 8px;
  color: var(--ink);
  font-size: 1.2rem;
}

.detail-panel {
  padding: 22px;
  border-radius: 30px;
}

.detail-panel--two-column {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.detail-panel--error {
  color: var(--danger);
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.section-heading__eyebrow {
  margin: 0 0 4px;
  color: var(--accent-strong);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.section-heading h2,
.section-heading p {
  margin: 0;
}

.section-heading h2 {
  color: var(--ink);
  font-size: 1.46rem;
}

.section-heading > p {
  color: var(--muted);
  max-width: 36ch;
  line-height: 1.6;
}

.info-list {
  display: grid;
  gap: 12px;
  margin: 0;
}

.info-list div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(31, 41, 55, 0.08);
}

.info-list dt,
.info-list dd {
  margin: 0;
}

.info-list dt {
  color: var(--muted);
  font-weight: 600;
}

.info-list dd {
  color: var(--ink);
  font-weight: 700;
  text-align: right;
}

.info-list a {
  color: var(--accent-strong);
}

@media (max-width: 960px) {
  .detail-hero,
  .detail-panel--two-column {
    grid-template-columns: 1fr;
  }

  .detail-facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .section-heading {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 720px) {
  .detail-hero,
  .detail-panel,
  .fact-card {
    border-radius: 24px;
  }

  .detail-hero,
  .detail-panel {
    padding: 18px;
  }

  .detail-facts {
    grid-template-columns: 1fr;
  }

  .detail-hero__cover {
    min-height: 220px;
  }

  .detail-hero__cover :deep(.lazy-cover.detail-hero__cover-image) {
    min-height: 220px;
  }
}
</style>
