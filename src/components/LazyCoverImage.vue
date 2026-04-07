<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { resolveCoverImageSource, shouldUseNativeCoverCache } from '../lib/cover-cache'

const props = defineProps<{
  src: string | null
  cacheKey?: string | null
  alt: string
  fallbackText: string
  eager?: boolean
}>()

const host = ref<HTMLElement | null>(null)
const shouldLoad = ref(false)
const hasError = ref(false)
const resolvedSrc = ref<string | null>(null)
let observer: IntersectionObserver | null = null
let resolveSequence = 0

function disconnectObserver() {
  observer?.disconnect()
  observer = null
}

async function resolveImageSource() {
  const currentSequence = ++resolveSequence

  if (!shouldLoad.value || !props.src) {
    resolvedSrc.value = null
    return
  }

  hasError.value = false

  if (!shouldUseNativeCoverCache(props.src, props.cacheKey)) {
    resolvedSrc.value = props.src
    return
  }

  resolvedSrc.value = null
  const nextSource = await resolveCoverImageSource(props.src, props.cacheKey)

  if (currentSequence !== resolveSequence) {
    return
  }

  resolvedSrc.value = nextSource
}

function enableImage() {
  if (shouldLoad.value) {
    void resolveImageSource()
    return
  }

  shouldLoad.value = true
  disconnectObserver()
  void resolveImageSource()
}

function observeImage() {
  if (!host.value || shouldLoad.value || !props.src) {
    return
  }

  disconnectObserver()

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

  observer.observe(host.value)
}

function syncImageLifecycle() {
  if (!props.src) {
    resolveSequence += 1
    resolvedSrc.value = null
    hasError.value = false
    disconnectObserver()
    return
  }

  if (props.eager || typeof IntersectionObserver === 'undefined') {
    enableImage()
    return
  }

  if (shouldLoad.value) {
    void resolveImageSource()
    return
  }

  observeImage()
}

onMounted(syncImageLifecycle)

watch([() => props.src, () => props.cacheKey, () => props.eager], () => {
  hasError.value = false
  syncImageLifecycle()
})

onBeforeUnmount(() => {
  disconnectObserver()
})
</script>

<template>
  <div ref="host" class="lazy-cover">
    <img
      v-if="resolvedSrc && shouldLoad && !hasError"
      :src="resolvedSrc"
      :alt="alt"
      decoding="async"
      :fetchpriority="eager ? 'high' : 'low'"
      :loading="eager ? 'eager' : 'lazy'"
      @error="hasError = true"
    />
    <span v-else-if="!src || hasError">{{ fallbackText }}</span>
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
