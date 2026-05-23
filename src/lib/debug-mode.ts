import { readonly, ref } from 'vue'

const debugModeEnabled = ref(false)

export function useDebugMode() {
  return readonly(debugModeEnabled)
}

export function setDebugModeEnabled(enabled: boolean) {
  debugModeEnabled.value = enabled
}

export function formatDebugValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return '--'
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

export function formatDebugJson(value: unknown) {
  if (value === null || value === undefined) {
    return '{}'
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '{}'
  }
}
