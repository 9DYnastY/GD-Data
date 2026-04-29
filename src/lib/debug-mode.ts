import { readonly, ref } from 'vue'

const debugModeEnabled = ref(false)

export function useDebugMode() {
  return readonly(debugModeEnabled)
}

export function setDebugModeEnabled(enabled: boolean) {
  debugModeEnabled.value = enabled
}
