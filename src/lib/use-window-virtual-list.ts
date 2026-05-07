import {
  computed,
  onActivated,
  nextTick,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue'

type VirtualListSource<T> = Readonly<Ref<readonly T[]> | ComputedRef<readonly T[]>>

type WindowVirtualListOptions = {
  estimateSize: number
  gap?: number
  overscan?: number
  fastScrollVelocity?: number
  scrollIdleDelay?: number
}

export type WindowVirtualItem<T> = {
  item: T
  index: number
  start: number
  size: number
}

export function useWindowVirtualList<T>(
  items: VirtualListSource<T>,
  options: WindowVirtualListOptions,
) {
  const containerRef = ref<HTMLElement | null>(null)
  const scrollY = ref(0)
  const viewportHeight = ref(0)
  const containerTop = ref(0)
  const sizeVersion = ref(0)
  const isFastScrolling = ref(false)
  const measuredSizes = new Map<number, number>()
  const gap = options.gap ?? 0
  const overscan = options.overscan ?? 0
  const fastScrollVelocity = options.fastScrollVelocity ?? 0.65
  const scrollIdleDelay = options.scrollIdleDelay ?? 140
  let animationFrame = 0
  let scrollIdleTimer = 0
  let lastScrollSampleY = 0
  let lastScrollSampleTime = 0
  let listenersAttached = false

  function getMeasuredSize(index: number) {
    return measuredSizes.get(index) ?? options.estimateSize
  }

  function refreshViewport() {
    if (typeof window === 'undefined') {
      return
    }

    const nextScrollY = window.scrollY || window.pageYOffset || 0
    const now = typeof performance === 'undefined' ? Date.now() : performance.now()

    if (lastScrollSampleTime > 0) {
      const elapsed = Math.max(now - lastScrollSampleTime, 1)
      const velocity = Math.abs(nextScrollY - lastScrollSampleY) / elapsed
      const nextIsFastScrolling = velocity > fastScrollVelocity

      if (isFastScrolling.value !== nextIsFastScrolling) {
        isFastScrolling.value = nextIsFastScrolling
      }
    }

    lastScrollSampleY = nextScrollY
    lastScrollSampleTime = now

    if (scrollIdleTimer) {
      window.clearTimeout(scrollIdleTimer)
    }

    scrollIdleTimer = window.setTimeout(() => {
      scrollIdleTimer = 0
      isFastScrolling.value = false
    }, scrollIdleDelay)

    scrollY.value = nextScrollY
    viewportHeight.value = window.innerHeight || document.documentElement.clientHeight || 0

    if (containerRef.value) {
      containerTop.value = containerRef.value.getBoundingClientRect().top + scrollY.value
    }
  }

  function scheduleRefresh() {
    if (typeof window === 'undefined' || animationFrame) {
      return
    }

    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = 0
      refreshViewport()
    })
  }

  function clearMeasurements() {
    measuredSizes.clear()
    sizeVersion.value += 1
  }

  function handleResize() {
    clearMeasurements()
    scheduleRefresh()
  }

  async function resetMeasurements() {
    clearMeasurements()
    await nextTick()
    scheduleRefresh()
  }

  const layout = computed(() => {
    sizeVersion.value

    const offsets: number[] = []
    const count = items.value.length
    let totalSize = 0

    for (let index = 0; index < count; index += 1) {
      offsets[index] = totalSize
      totalSize += getMeasuredSize(index)

      if (index < count - 1) {
        totalSize += gap
      }
    }

    return { offsets, totalSize }
  })

  const visibleRange = computed(() => {
    const count = items.value.length

    if (count === 0) {
      return { start: 0, end: 0 }
    }

    const { offsets } = layout.value
    const viewportStart = Math.max(0, scrollY.value - containerTop.value - overscan)
    const viewportEnd = Math.max(
      viewportStart,
      scrollY.value + viewportHeight.value - containerTop.value + overscan,
    )
    let start = 0

    while (start < count && offsets[start] + getMeasuredSize(start) < viewportStart) {
      start += 1
    }

    let end = start

    while (end < count && offsets[end] <= viewportEnd) {
      end += 1
    }

    return {
      start,
      end: Math.min(count, Math.max(end, start + 1)),
    }
  })

  const virtualItems = computed<Array<WindowVirtualItem<T>>>(() => {
    const list = items.value
    const { offsets } = layout.value
    const { start, end } = visibleRange.value
    const nextItems: Array<WindowVirtualItem<T>> = []

    for (let index = start; index < end; index += 1) {
      const item = list[index]

      if (item === undefined) {
        continue
      }

      nextItems.push({
        item,
        index,
        start: offsets[index] ?? 0,
        size: getMeasuredSize(index),
      })
    }

    return nextItems
  })

  function measureElement(index: number, element: unknown) {
    if (!(element instanceof HTMLElement)) {
      return
    }

    const nextSize = element.getBoundingClientRect().height

    if (!Number.isFinite(nextSize) || nextSize <= 0) {
      return
    }

    const roundedSize = Math.ceil(nextSize)
    const previousSize = measuredSizes.get(index)

    if (previousSize !== undefined && Math.abs(previousSize - roundedSize) < 1) {
      return
    }

    measuredSizes.set(index, roundedSize)
    sizeVersion.value += 1
  }

  function setContainerElement(element: unknown) {
    containerRef.value = element instanceof HTMLElement ? element : null
    scheduleRefresh()
  }

  watch(
    () => items.value,
    async () => {
      await nextTick()
      scheduleRefresh()
    },
    { flush: 'post' },
  )

  function attachListeners() {
    if (typeof window === 'undefined' || listenersAttached) {
      return
    }

    listenersAttached = true
    refreshViewport()
    window.addEventListener('scroll', scheduleRefresh, { passive: true })
    window.addEventListener('resize', handleResize, { passive: true })
  }

  function detachListeners() {
    if (typeof window === 'undefined' || !listenersAttached) {
      return
    }

    listenersAttached = false
    window.removeEventListener('scroll', scheduleRefresh)
    window.removeEventListener('resize', handleResize)

    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = 0
    }

    if (scrollIdleTimer) {
      window.clearTimeout(scrollIdleTimer)
      scrollIdleTimer = 0
    }
  }

  onMounted(attachListeners)

  onActivated(() => {
    attachListeners()
    void nextTick().then(scheduleRefresh)
  })

  onDeactivated(detachListeners)

  onBeforeUnmount(() => {
    detachListeners()
  })

  return {
    containerRef,
    setContainerElement,
    totalSize: computed(() => layout.value.totalSize),
    virtualItems,
    isFastScrolling,
    measureElement,
    refreshViewport,
    resetMeasurements,
  }
}
