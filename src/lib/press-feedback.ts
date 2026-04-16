const PRESS_TARGET_SELECTOR = [
  'button',
  'a[href]',
  'label',
  'summary',
  '[role="button"]',
  '[data-press-feedback]',
].join(',')

const PRESS_BLOCK_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[data-press-feedback="off"]',
  '.no-press-feedback',
].join(',')

const PRESS_SCALE = 0.965
const RELEASE_SCALE = 1.018

type PressState = {
  baseTransform: string
  downAnimation?: Animation
  upAnimation?: Animation
}

const activePointers = new Map<number, HTMLElement>()
const activeKeys = new Set<HTMLElement>()
const states = new WeakMap<HTMLElement, PressState>()

function normalizeTransform(transform: string) {
  return transform && transform !== 'none' ? transform : 'none'
}

function appendScale(transform: string, scale: number) {
  const base = normalizeTransform(transform)
  return base === 'none' ? `scale(${scale})` : `${base} scale(${scale})`
}

function isReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function isDisabled(element: HTMLElement) {
  return (
    element.getAttribute('aria-disabled') === 'true' ||
    ('disabled' in element && Boolean((element as HTMLButtonElement).disabled))
  )
}

function findPressTarget(eventTarget: EventTarget | null) {
  if (!(eventTarget instanceof Element)) {
    return null
  }

  if (eventTarget.closest(PRESS_BLOCK_SELECTOR)) {
    return null
  }

  const target = eventTarget.closest(PRESS_TARGET_SELECTOR)

  if (!(target instanceof HTMLElement) || isDisabled(target)) {
    return null
  }

  return target
}

function animatePressDown(element: HTMLElement) {
  if (isReducedMotion() || typeof element.animate !== 'function') {
    return
  }

  const currentTransform = normalizeTransform(getComputedStyle(element).transform)
  const state = states.get(element)
  state?.downAnimation?.cancel()
  state?.upAnimation?.cancel()

  const downAnimation = element.animate(
    [
      { transform: currentTransform },
      { transform: appendScale(currentTransform, PRESS_SCALE) },
    ],
    {
      duration: 110,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
      fill: 'forwards',
    },
  )

  states.set(element, {
    baseTransform: state?.baseTransform ?? currentTransform,
    downAnimation,
  })
}

function animatePressRelease(element: HTMLElement) {
  if (isReducedMotion() || typeof element.animate !== 'function') {
    return
  }

  const state = states.get(element)
  const currentTransform = normalizeTransform(getComputedStyle(element).transform)
  const baseTransform = state?.baseTransform ?? normalizeTransform(element.style.transform)
  state?.downAnimation?.cancel()
  state?.upAnimation?.cancel()

  const upAnimation = element.animate(
    [
      { transform: currentTransform, offset: 0 },
      { transform: appendScale(baseTransform, RELEASE_SCALE), offset: 0.62 },
      { transform: baseTransform, offset: 1 },
    ],
    {
      duration: 260,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    },
  )

  states.set(element, {
    baseTransform,
    upAnimation,
  })

  upAnimation.addEventListener('finish', () => {
    states.delete(element)
  }, { once: true })
  upAnimation.addEventListener('cancel', () => {
    states.delete(element)
  }, { once: true })
}

function handlePointerDown(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0) {
    return
  }

  const target = findPressTarget(event.target)

  if (!target) {
    return
  }

  activePointers.set(event.pointerId, target)
  animatePressDown(target)
}

function handlePointerRelease(event: PointerEvent) {
  const target = activePointers.get(event.pointerId)

  if (!target) {
    return
  }

  activePointers.delete(event.pointerId)
  animatePressRelease(target)
}

function isPressKey(event: KeyboardEvent) {
  return event.key === 'Enter' || event.key === ' '
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.repeat || !isPressKey(event)) {
    return
  }

  const target = findPressTarget(event.target)

  if (!target) {
    return
  }

  activeKeys.add(target)
  animatePressDown(target)
}

function handleKeyUp(event: KeyboardEvent) {
  if (!isPressKey(event)) {
    return
  }

  const target = findPressTarget(event.target)

  if (!target || !activeKeys.has(target)) {
    return
  }

  activeKeys.delete(target)
  animatePressRelease(target)
}

export function installPressFeedback() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  document.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true })
  document.addEventListener('pointerup', handlePointerRelease, { capture: true, passive: true })
  document.addEventListener('pointercancel', handlePointerRelease, { capture: true, passive: true })
  document.addEventListener('keydown', handleKeyDown, { capture: true })
  document.addEventListener('keyup', handleKeyUp, { capture: true })
}
