<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  src: string | null
  alt: string
  fallbackText: string
}>()

const host = ref<HTMLElement | null>(null)
const shouldLoad = ref(false)
const hasError = ref(false)
let observer: IntersectionObserver | null = null

function enableImage() {
  shouldLoad.value = true
  observer?.disconnect()
  observer = null
}

onMounted(() => {
  if (!props.src) {
    return
  }

  if (typeof IntersectionObserver === 'undefined') {
    enableImage()
    return
  }

  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        enableImage()
      }
    },
    {
      root: null,
      rootMargin: '0px',
      threshold: 0.01,
    },
  )

  if (host.value) {
    observer.observe(host.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <div ref="host" class="lazy-cover">
    <img
      v-if="src && shouldLoad && !hasError"
      :src="src"
      :alt="alt"
      decoding="async"
      fetchpriority="low"
      @error="hasError = true"
    />
    <span v-else>{{ fallbackText }}</span>
  </div>
</template>

<style scoped>
.lazy-cover {
  position: relative;
  overflow: hidden;
  width: 100%;
  min-height: 0;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  border: 0;
  background:
    linear-gradient(180deg, rgba(18, 14, 33, 0.94), rgba(37, 26, 69, 0.94)),
    linear-gradient(160deg, #161122, #31285d);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-family: var(--font-figma-title);
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.lazy-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (max-width: 720px) {
  .lazy-cover {
    aspect-ratio: 1 / 1;
  }
}
</style>
