import { Capacitor, registerPlugin } from '@capacitor/core'

export type NativeAppUpdateStatus =
  | 'idle'
  | 'downloaded'
  | 'permission_required'
  | 'installing'
  | 'failed'

export interface NativeAppUpdateState {
  status: NativeAppUpdateStatus
  versionName: string
  versionCode: number | null
  bytesDownloaded: number
  totalBytes: number | null
  errorMessage: string
}

export interface StartNativeAppUpdateOptions {
  fileUri: string
  versionName: string
  versionCode: number
  apkSize?: number | null
  apkSha256?: string | null
}

interface NativeAppUpdatePlugin {
  getStatus(): Promise<Record<string, unknown>>
  startUpdate(options: StartNativeAppUpdateOptions): Promise<Record<string, unknown>>
}

const NativeAppUpdate = registerPlugin<NativeAppUpdatePlugin>('AppUpdate')

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeStatus(value: unknown): NativeAppUpdateStatus {
  switch (value) {
    case 'downloaded':
    case 'permission_required':
    case 'installing':
    case 'failed':
      return value
    default:
      return 'idle'
  }
}

function normalizeNativeState(payload: Record<string, unknown> | null | undefined): NativeAppUpdateState {
  const versionCode = parseNumber(payload?.versionCode)
  const bytesDownloaded = parseNumber(payload?.bytesDownloaded) ?? 0
  const totalBytes = parseNumber(payload?.totalBytes)

  return {
    status: normalizeStatus(payload?.status),
    versionName: typeof payload?.versionName === 'string' ? payload.versionName.trim() : '',
    versionCode,
    bytesDownloaded: Math.max(0, bytesDownloaded),
    totalBytes: totalBytes !== null && totalBytes > 0 ? totalBytes : null,
    errorMessage: typeof payload?.errorMessage === 'string' ? payload.errorMessage.trim() : '',
  }
}

export function isNativeAppUpdateSupported() {
  return Capacitor.getPlatform() === 'android'
}

export async function getNativeAppUpdateState() {
  const payload = await NativeAppUpdate.getStatus()
  return normalizeNativeState(payload)
}

export async function startNativeAppUpdate(options: StartNativeAppUpdateOptions) {
  const payload = await NativeAppUpdate.startUpdate({
    ...options,
    fileUri: options.fileUri,
    apkSize: options.apkSize ?? undefined,
    apkSha256: options.apkSha256 ?? undefined,
  })
  return normalizeNativeState(payload)
}
