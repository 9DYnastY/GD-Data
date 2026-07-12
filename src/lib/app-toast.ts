import { ref } from 'vue'

export const appToastMessage = ref('')
export const appToastKind = ref<'default' | 'success' | 'error'>('default')

let appToastTimer: ReturnType<typeof setTimeout> | null = null

export function clearAppToast() {
  appToastMessage.value = ''
  appToastKind.value = 'default'

  if (appToastTimer) {
    clearTimeout(appToastTimer)
    appToastTimer = null
  }
}

export function showAppToast(
  message: string,
  options?: { duration?: number; kind?: 'default' | 'success' | 'error' },
) {
  clearAppToast()
  appToastMessage.value = message
  appToastKind.value = options?.kind ?? 'default'
  appToastTimer = setTimeout(() => {
    appToastMessage.value = ''
    appToastKind.value = 'default'
    appToastTimer = null
  }, options?.duration ?? 1800)
}
