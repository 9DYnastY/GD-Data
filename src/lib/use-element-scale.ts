import { onBeforeUnmount, ref } from 'vue'

export function useElementScale(baseWidth: number) {
  const elementRef = ref<HTMLElement | null>(null)
  const scale = ref(1)
  let resizeObserver: ResizeObserver | null = null

  function updateScale() {
    const element = elementRef.value

    if (!element) {
      scale.value = 1
      return
    }

    const nextScale = Math.min(element.clientWidth / baseWidth, 1)
    scale.value = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1
  }

  function observeElement() {
    resizeObserver?.disconnect()
    resizeObserver = null

    if (typeof ResizeObserver === 'undefined' || !elementRef.value) {
      return
    }

    resizeObserver = new ResizeObserver(() => {
      updateScale()
    })
    resizeObserver.observe(elementRef.value)
  }

  function setElement(element: unknown) {
    const nextElement = element instanceof HTMLElement ? element : null

    if (elementRef.value === nextElement) {
      updateScale()
      return
    }

    elementRef.value = nextElement
    updateScale()
    observeElement()
  }

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
  })

  return {
    scale,
    setElement,
    updateScale,
  }
}
