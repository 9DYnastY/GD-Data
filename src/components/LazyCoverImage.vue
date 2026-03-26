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
  min-height: 118px;
  border-radius: 2px;
  border: 3px solid var(--accent);
  background:
    radial-gradient(circle at top, rgba(255, 159, 74, 0.34), transparent 55%),
    linear-gradient(160deg, #161122, #31285d);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  box-shadow: 0 0 14px rgba(255, 159, 74, 0.24);
}

.lazy-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (max-width: 720px) {
  .lazy-cover {
    min-height: 112px;
  }
}
</style>
