<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invalidateCoverImageCache, resolveCoverImageSource, shouldUseNativeCoverCache } from '../lib/cover-cache'

const props = defineProps<{
  src: string | null
  cacheKey?: string | null
  alt: string
  fallbackText: string
  eager?: boolean
  animateLoading?: boolean
}>()

const host = ref<HTMLElement | null>(null)
const shouldLoad = ref(false)
const hasError = ref(false)
const imageLoaded = ref(false)
const resolvedSrc = ref<string | null>(null)
let observer: IntersectionObserver | null = null
let resolveSequence = 0
let retryCount = 0

function disconnectObserver() {
  observer?.disconnect()
  observer = null
}

async function resolveImageSource() {
  const currentSequence = ++resolveSequence

  if (!shouldLoad.value || !props.src) {
    resolvedSrc.value = null
    imageLoaded.value = false
    return
  }

  hasError.value = false
  imageLoaded.value = false

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

async function handleImageError() {
  if (!props.src || !shouldUseNativeCoverCache(props.src, props.cacheKey)) {
    hasError.value = true
    return
  }

  const failedSource = resolvedSrc.value
  await invalidateCoverImageCache(props.cacheKey)

  if (retryCount < 1 && failedSource && failedSource !== props.src) {
    retryCount += 1
    hasError.value = false
    resolvedSrc.value = null
    void resolveImageSource()
    return
  }

  hasError.value = true
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
    imageLoaded.value = false
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
  imageLoaded.value = false
  retryCount = 0
  syncImageLifecycle()
})

onBeforeUnmount(() => {
  disconnectObserver()
})
</script>

<template>
  <div
    ref="host"
    class="lazy-cover"
    :class="{
      'lazy-cover--loading': Boolean(src) && !hasError && (!shouldLoad || !imageLoaded),
      'lazy-cover--loading-animated': Boolean(src) && !hasError && (!shouldLoad || !imageLoaded) && animateLoading !== false,
      'lazy-cover--fallback': !src || hasError,
    }"
  >
    <img
      v-if="resolvedSrc && shouldLoad && !hasError"
      :src="resolvedSrc"
      :alt="alt"
      decoding="async"
      :fetchpriority="eager ? 'high' : 'low'"
      :loading="eager ? 'eager' : 'lazy'"
      :class="{ 'lazy-cover__image--loaded': imageLoaded }"
      @load="imageLoaded = true"
      @error="handleImageError"
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
  background: #d9d6de;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-family: var(--font-figma-title);
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.lazy-cover--loading-animated::before {
  content: '';
  position: absolute;
  inset: -35% -70%;
  z-index: 1;
  background: linear-gradient(
    115deg,
    transparent 38%,
    rgba(255, 255, 255, 0.6) 50%,
    transparent 62%
  );
  background-repeat: no-repeat;
  animation: coverSkeletonSweep 1.25s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.lazy-cover--loading::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    linear-gradient(135deg, #d7d3dc 0%, #eeeaf2 45%, #cbc6d1 100%),
    radial-gradient(circle at 24% 20%, rgba(255, 255, 255, 0.28), transparent 24%),
    radial-gradient(circle at 76% 78%, rgba(124, 113, 145, 0.13), transparent 28%);
}

.lazy-cover--fallback {
  background:
    linear-gradient(180deg, rgba(18, 14, 33, 0.94), rgba(37, 26, 69, 0.94)),
    linear-gradient(160deg, #161122, #31285d);
}

.lazy-cover img {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.18s ease-out;
}

.lazy-cover img.lazy-cover__image--loaded {
  opacity: 1;
}

.lazy-cover span {
  position: relative;
  z-index: 2;
}

@keyframes coverSkeletonSweep {
  from {
    transform: translate3d(-34%, -18%, 0);
  }

  to {
    transform: translate3d(34%, 18%, 0);
  }
}

@media (max-width: 720px) {
  .lazy-cover {
    aspect-ratio: 1 / 1;
  }
}
</style>
