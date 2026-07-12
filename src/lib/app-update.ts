import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { computed, ref } from 'vue'
import {
  getNativeAppUpdateState,
  isNativeAppUpdateSupported,
  startNativeAppUpdate,
  type NativeAppUpdateState,
} from './native-app-update'

const UPDATE_MANIFEST_URL = 'https://gitadora.selundine.top/releases/android/latest/update.json'
export const FALLBACK_VERSION_NAME = '1.2.4'
const FALLBACK_VERSION_CODE = 16
const UPDATE_FETCH_TIMEOUT_MS = 10000
const AUTO_PROMPT_INTERVAL_MS = 24 * 60 * 60 * 1000
const LAST_PROMPT_STORAGE_KEY = 'gddata:update:last-prompt'
const IGNORED_UPDATE_STORAGE_KEY = 'gddata:update:ignored-version'
const UPDATE_DOWNLOAD_DIRECTORY = 'updates'
const UPDATE_DOWNLOAD_TIMEOUT_MS = 120000
const UPDATE_DOWNLOAD_CONNECT_TIMEOUT_MS = 30000

const TEXT_DOWNLOADING = '正在下载...'
const TEXT_OPENING_INSTALLER = '正在打开安装界面...'
const TEXT_ENABLE_INSTALL_PERMISSION = '开启安装权限'
const TEXT_INSTALL_UPDATE = '安装更新'
const TEXT_RETRY_DOWNLOAD = '重新下载更新'
const TEXT_DOWNLOAD_AND_INSTALL = '下载并安装'
const TEXT_STATUS_PERMISSION = '需要允许 GD Data 安装未知来源应用'
const TEXT_STATUS_DOWNLOADING = '正在下载更新'
const TEXT_PROCESSED = '已处理'
const TEXT_INVALID_MANIFEST = '更新信息格式不正确。'
const TEXT_INVALID_PLATFORM = '更新信息平台不匹配。'
const TEXT_MISSING_FIELDS = '更新信息缺少必要字段。'
const TEXT_FETCH_TIMEOUT = '更新检查超时。'
const TEXT_INVALID_FILE_PATH = '更新包路径无效，请重新下载。'
const TEXT_INVALID_PACKAGE = '更新包校验失败，请重新下载。'
const TEXT_DOWNLOAD_FAILED = '下载更新失败，请稍后重试。'
const TEXT_GENERIC_ERROR = '更新包处理失败，请稍后重试。'

export interface AppUpdateManifest {
  platform: 'android'
  versionName: string
  versionCode: number
  publishedAt: string
  releasePageUrl: string
  apkUrl: string
  apkSize?: number | null
  apkSha256?: string
  notes: string[]
}

export interface InstalledAppVersion {
  versionName: string
  versionCode: number | null
}

export interface AvailableAppUpdate {
  manifest: AppUpdateManifest
  current: InstalledAppVersion
}

type UpdateCheckMode = 'auto' | 'manual'
type AppUpdateDownloadState = 'idle' | 'downloading' | 'downloaded' | 'permission' | 'opening'
type AppUpdateActionErrorKind =
  | 'none'
  | 'download_error'
  | 'installer_path_error'
  | 'apk_validation_error'
  | 'permission_required'
  | 'unknown_error'
type ResolvedAppUpdateActionErrorKind = Exclude<AppUpdateActionErrorKind, 'none'>

interface LastPromptRecord {
  versionId: string
  promptedAt: number
}

interface UpdateFilePaths {
  finalPath: string
  finalUri: string
}

interface AppUpdateActionErrorInfo {
  kind: ResolvedAppUpdateActionErrorKind
  message: string
}

interface AppUpdateError extends Error {
  appUpdateErrorKind: ResolvedAppUpdateActionErrorKind
}

export const appUpdateDialogVisible = ref(false)
export const availableAppUpdate = ref<AvailableAppUpdate | null>(null)
export const appUpdateDownloadState = ref<AppUpdateDownloadState>('idle')
export const appUpdateDownloadBytes = ref(0)
export const appUpdateDownloadTotalBytes = ref<number | null>(null)
export const appUpdateActionErrorKind = ref<AppUpdateActionErrorKind>('none')
export const appUpdateActionError = ref('')

export const appUpdateIsBusy = computed(() => (
  appUpdateDownloadState.value === 'downloading' || appUpdateDownloadState.value === 'opening'
))
export const appUpdateProgressPercent = computed(() => {
  const totalBytes = appUpdateDownloadTotalBytes.value

  if (!totalBytes || totalBytes <= 0) {
    return null
  }

  return Math.min(100, Math.max(0, Math.round((appUpdateDownloadBytes.value / totalBytes) * 100)))
})
export const appUpdateProgressRatio = computed(() => {
  const percent = appUpdateProgressPercent.value
  return percent === null ? null : percent / 100
})
export const appUpdatePrimaryActionLabel = computed(() => {
  if (appUpdateDownloadState.value === 'downloading') {
    const percent = appUpdateProgressPercent.value
    return percent === null ? TEXT_DOWNLOADING : `\u4e0b\u8f7d\u4e2d ${percent}%`
  }

  if (appUpdateDownloadState.value === 'opening') {
    return TEXT_OPENING_INSTALLER
  }

  if (appUpdateDownloadState.value === 'permission') {
    return TEXT_ENABLE_INSTALL_PERMISSION
  }

  if (appUpdateDownloadState.value === 'downloaded') {
    return TEXT_INSTALL_UPDATE
  }

  return appUpdateActionError.value ? TEXT_RETRY_DOWNLOAD : TEXT_DOWNLOAD_AND_INSTALL
})
export const appUpdateStatusMessage = computed(() => {

  if (appUpdateDownloadState.value === 'permission') {
    return TEXT_STATUS_PERMISSION
  }


  if (appUpdateDownloadState.value === 'downloading') {
    return TEXT_STATUS_DOWNLOADING
  }

  return ''
})
export const appUpdateProgressDetail = computed(() => {
  if (appUpdateDownloadState.value === 'idle' || appUpdateDownloadState.value === 'opening') {
    return ''
  }

  const bytes = appUpdateDownloadBytes.value
  const totalBytes = appUpdateDownloadTotalBytes.value

  if (totalBytes && totalBytes > 0) {
    return `${formatBytes(bytes)} / ${formatBytes(totalBytes)}`
  }

  if (bytes > 0) {
    return `${TEXT_PROCESSED} ${formatBytes(bytes)}`
  }

  return ''
})

let activeCheckPromise: Promise<AvailableAppUpdate | null> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

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

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const fractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`
}

function clearAppUpdateActionError(kind: AppUpdateActionErrorKind = 'none') {
  appUpdateActionErrorKind.value = kind
  appUpdateActionError.value = ''
}

function applyAppUpdateActionError(errorInfo: AppUpdateActionErrorInfo | null) {
  if (!errorInfo) {
    clearAppUpdateActionError()
    return
  }

  appUpdateActionErrorKind.value = errorInfo.kind
  appUpdateActionError.value = errorInfo.message
}

function createAppUpdateError(kind: ResolvedAppUpdateActionErrorKind, message: string): AppUpdateError {
  const error = new Error(message) as AppUpdateError
  error.name = 'AppUpdateError'
  error.appUpdateErrorKind = kind
  return error
}

function isAppUpdateError(error: unknown): error is AppUpdateError {
  return (
    error instanceof Error &&
    'appUpdateErrorKind' in error &&
    typeof (error as Record<string, unknown>).appUpdateErrorKind === 'string'
  )
}

function isDirectoryAlreadyExistsError(error: unknown) {
  return (
    error instanceof Error &&
    (
      error.message.includes('already exists') ||
      error.message.includes('cannot be overwritten') ||
      error.message.includes('OS-PLUG-FILE-0010')
    )
  )
}

function readLastPromptRecord(): LastPromptRecord | null {
  const storage = getStorage()
  if (!storage) {
    return null
  }

  try {
    const raw = storage.getItem(LAST_PROMPT_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || typeof value.versionId !== 'string' || typeof value.promptedAt !== 'number') {
      return null
    }

    return {
      versionId: value.versionId,
      promptedAt: value.promptedAt,
    }
  } catch {
    return null
  }
}

function writeLastPromptRecord(update: AvailableAppUpdate) {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(
      LAST_PROMPT_STORAGE_KEY,
      JSON.stringify({
        versionId: getUpdateVersionId(update),
        promptedAt: Date.now(),
      }),
    )
  } catch {
    // Prompt throttling is best-effort and should never block update UI.
  }
}

function getIgnoredVersionId() {
  return getStorage()?.getItem(IGNORED_UPDATE_STORAGE_KEY) ?? ''
}

function setIgnoredVersionId(update: AvailableAppUpdate) {
  try {
    getStorage()?.setItem(IGNORED_UPDATE_STORAGE_KEY, getUpdateVersionId(update))
  } catch {
    // Ignoring a version is best-effort.
  }
}

function getUpdateVersionId(update: AvailableAppUpdate) {
  return Number.isFinite(update.manifest.versionCode)
    ? String(update.manifest.versionCode)
    : update.manifest.versionName
}

function shouldSuppressAutoPrompt(update: AvailableAppUpdate) {
  const versionId = getUpdateVersionId(update)

  if (getIgnoredVersionId() === versionId) {
    return true
  }

  const lastPrompt = readLastPromptRecord()
  if (!lastPrompt || lastPrompt.versionId !== versionId) {
    return false
  }

  return Date.now() - lastPrompt.promptedAt < AUTO_PROMPT_INTERVAL_MS
}

function readString(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNotes(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function parseUpdateManifest(value: unknown): AppUpdateManifest {
  if (!isRecord(value)) {
    throw new Error(TEXT_INVALID_MANIFEST)
  }

  const platform = readString(value, 'platform')
  const versionName = readString(value, 'versionName')
  const versionCode = parseNumber(value.versionCode)
  const publishedAt = readString(value, 'publishedAt')
  const releasePageUrl = readString(value, 'releasePageUrl')
  const apkUrl = readString(value, 'apkUrl')
  const apkSize = parseNumber(value.apkSize)
  const apkSha256 = readString(value, 'apkSha256').toLowerCase()
  const notes = normalizeNotes(value.notes)

  if (platform !== 'android') {
    throw new Error(TEXT_INVALID_PLATFORM)
  }

  if (!versionName || versionCode === null || !releasePageUrl || !apkUrl) {
    throw new Error(TEXT_MISSING_FIELDS)
  }

  return {
    platform,
    versionName,
    versionCode,
    publishedAt,
    releasePageUrl,
    apkUrl,
    apkSize: apkSize !== null && apkSize > 0 ? apkSize : null,
    apkSha256: apkSha256 || undefined,
    notes,
  }
}

function compareVersionNames(left: string, right: string) {
  const leftParts = left.split(/[^\d]+/).filter(Boolean).map((part) => Number.parseInt(part, 10))
  const rightParts = right.split(/[^\d]+/).filter(Boolean).map((part) => Number.parseInt(part, 10))
  const partCount = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < partCount; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0

    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1
    }
  }

  return 0
}

function isUpdateNewer(manifest: AppUpdateManifest, current: InstalledAppVersion) {
  if (current.versionCode !== null) {
    return manifest.versionCode > current.versionCode
  }

  return compareVersionNames(manifest.versionName, current.versionName) > 0
}

function resetAppUpdateActionState() {
  appUpdateDownloadState.value = 'idle'
  appUpdateDownloadBytes.value = 0
  appUpdateDownloadTotalBytes.value = null
  clearAppUpdateActionError()
}

function buildDownloadedApkFilename(update: AvailableAppUpdate) {
  const safeVersion = update.manifest.versionName.replace(/[^0-9A-Za-z._-]+/g, '_') || 'latest'
  return `gddata-android-v${safeVersion}.apk`
}

async function getUpdateDownloadPaths(update: AvailableAppUpdate): Promise<UpdateFilePaths> {
  const { Directory, Filesystem } = await import('@capacitor/filesystem')
  const fileName = buildDownloadedApkFilename(update)
  const finalPath = `${UPDATE_DOWNLOAD_DIRECTORY}/${fileName}`

  try {
    await Filesystem.mkdir({
      path: UPDATE_DOWNLOAD_DIRECTORY,
      directory: Directory.External,
      recursive: true,
    })
  } catch (error) {
    if (!isDirectoryAlreadyExistsError(error)) {
      throw error
    }
  }

  const finalFileInfo = await Filesystem.getUri({
    path: finalPath,
    directory: Directory.External,
  })

  return {
    finalPath,
    finalUri: finalFileInfo.uri,
  }
}

async function getUpdateTempFilePath(update: AvailableAppUpdate) {
  const { Directory, Filesystem } = await import('@capacitor/filesystem')
  const fileName = buildDownloadedApkFilename(update)
  const tempPath = `${UPDATE_DOWNLOAD_DIRECTORY}/${fileName}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const tempFileInfo = await Filesystem.getUri({
    path: tempPath,
    directory: Directory.External,
  })

  return {
    tempPath,
    tempUri: tempFileInfo.uri,
  }
}

async function getUpdateFilesystem() {
  const { Directory, Filesystem } = await import('@capacitor/filesystem')
  return { Directory, Filesystem }
}

async function statDownloadedUpdate(path: string) {
  const { Directory, Filesystem } = await getUpdateFilesystem()

  try {
    return await Filesystem.stat({
      path,
      directory: Directory.External,
    })
  } catch {
    return null
  }
}

async function deleteDownloadedUpdate(path: string) {
  const { Directory, Filesystem } = await getUpdateFilesystem()

  try {
    await Filesystem.deleteFile({
      path,
      directory: Directory.External,
    })
  } catch {
    // Best-effort cleanup only.
  }
}

function matchesExpectedApkSize(update: AvailableAppUpdate, size: number) {
  const expectedSize = update.manifest.apkSize ?? null
  return !expectedSize || expectedSize <= 0 || size === expectedSize
}

async function handoffDownloadedUpdateToNativeInstaller(update: AvailableAppUpdate, fileUri: string) {
  const nativeState = await startNativeAppUpdate({
    fileUri,
    versionName: update.manifest.versionName,
    versionCode: update.manifest.versionCode,
    apkSize: update.manifest.apkSize ?? null,
    apkSha256: update.manifest.apkSha256 ?? null,
  })

  applyNativeAppUpdateState(nativeState)
  return nativeState
}

async function tryReuseDownloadedUpdate(update: AvailableAppUpdate) {
  const downloadPaths = await getUpdateDownloadPaths(update)
  const existingFile = await statDownloadedUpdate(downloadPaths.finalPath)

  if (!existingFile || existingFile.size <= 0) {
    return false
  }

  if (!matchesExpectedApkSize(update, existingFile.size)) {
    await deleteDownloadedUpdate(downloadPaths.finalPath)
    return false
  }

  appUpdateDownloadBytes.value = existingFile.size
  appUpdateDownloadTotalBytes.value = existingFile.size

  const nativeState = await handoffDownloadedUpdateToNativeInstaller(update, downloadPaths.finalUri)

  if (nativeState.status === 'failed') {
    await deleteDownloadedUpdate(downloadPaths.finalPath)
    appUpdateDownloadBytes.value = 0
    appUpdateDownloadTotalBytes.value = null
    return false
  }

  return true
}

async function downloadUpdatePackage(update: AvailableAppUpdate) {
  const { FileTransfer } = await import('@capacitor/file-transfer')
  const downloadPaths = await getUpdateDownloadPaths(update)
  const tempFile = await getUpdateTempFilePath(update)
  const { Directory, Filesystem } = await getUpdateFilesystem()
  let downloadedBytes = 0
  let contentLength: number | null = update.manifest.apkSize ?? null

  const progressHandle = await FileTransfer.addListener('progress', (progress) => {
    if (progress.type !== 'download' || progress.url !== update.manifest.apkUrl) {
      return
    }

    downloadedBytes = progress.bytes
    contentLength = progress.lengthComputable && progress.contentLength > 0
      ? progress.contentLength
      : contentLength

    appUpdateDownloadBytes.value = Math.max(0, downloadedBytes)
    appUpdateDownloadTotalBytes.value = contentLength && contentLength > 0 ? contentLength : null
  })

  try {
    await FileTransfer.downloadFile({
      url: update.manifest.apkUrl,
      path: tempFile.tempUri,
      progress: true,
      readTimeout: UPDATE_DOWNLOAD_TIMEOUT_MS,
      connectTimeout: UPDATE_DOWNLOAD_CONNECT_TIMEOUT_MS,
    })

    const downloadedTempFile = await statDownloadedUpdate(tempFile.tempPath)
    if (!downloadedTempFile || downloadedTempFile.size <= 0) {
      throw createAppUpdateError('apk_validation_error', TEXT_INVALID_PACKAGE)
    }

    if (!matchesExpectedApkSize(update, downloadedTempFile.size)) {
      throw createAppUpdateError('apk_validation_error', TEXT_INVALID_PACKAGE)
    }

    await deleteDownloadedUpdate(downloadPaths.finalPath)

    await Filesystem.rename({
      from: tempFile.tempPath,
      to: downloadPaths.finalPath,
      directory: Directory.External,
      toDirectory: Directory.External,
    })

    const finalFile = await statDownloadedUpdate(downloadPaths.finalPath)
    if (!finalFile || finalFile.size <= 0) {
      throw createAppUpdateError('apk_validation_error', TEXT_INVALID_PACKAGE)
    }

    appUpdateDownloadBytes.value = finalFile.size
    appUpdateDownloadTotalBytes.value = finalFile.size

    return {
      path: downloadPaths.finalPath,
      fileUri: downloadPaths.finalUri,
    }
  } catch (error) {
    await deleteDownloadedUpdate(tempFile.tempPath)
    throw error
  } finally {
    await progressHandle.remove()
  }
}

function matchesAvailableUpdate(nativeState: NativeAppUpdateState) {
  const update = availableAppUpdate.value
  if (!update) {
    return false
  }

  if (nativeState.versionCode !== null) {
    return nativeState.versionCode === update.manifest.versionCode
  }

  if (nativeState.versionName) {
    return nativeState.versionName === update.manifest.versionName
  }

  return nativeState.status === 'idle'
}

function applyNativeAppUpdateState(nativeState: NativeAppUpdateState) {
  if (!matchesAvailableUpdate(nativeState)) {
    return
  }

  switch (nativeState.status) {
    case 'downloaded':
      appUpdateDownloadState.value = 'downloaded'
      appUpdateDownloadBytes.value = nativeState.bytesDownloaded
      appUpdateDownloadTotalBytes.value = nativeState.totalBytes
      clearAppUpdateActionError()
      return
    case 'permission_required':
      appUpdateDownloadState.value = 'permission'
      appUpdateDownloadBytes.value = nativeState.bytesDownloaded
      appUpdateDownloadTotalBytes.value = nativeState.totalBytes
      clearAppUpdateActionError('permission_required')
      return
    case 'installing':
      appUpdateDownloadState.value = 'opening'
      clearAppUpdateActionError()
      return
    case 'failed':
      appUpdateDownloadState.value = 'idle'
      appUpdateDownloadBytes.value = 0
      appUpdateDownloadTotalBytes.value = null
      applyAppUpdateActionError(extractUpdateActionError(nativeState.errorMessage || TEXT_GENERIC_ERROR))
      return
    case 'idle':
    default:
      if (!appUpdateIsBusy.value) {
        appUpdateDownloadState.value = 'idle'
      }
  }
}

function classifyAppUpdateActionErrorMessage(message: string): AppUpdateActionErrorInfo {
  const normalized = message.trim()

  if (!normalized) {
    return {
      kind: 'unknown_error',
      message: TEXT_GENERIC_ERROR,
    }
  }

  if (normalized === TEXT_INVALID_PACKAGE || normalized.includes('\u6821\u9a8c\u5931\u8d25')) {
    return {
      kind: 'apk_validation_error',
      message: normalized,
    }
  }

  if (normalized === TEXT_INVALID_FILE_PATH || normalized.includes('\u8def\u5f84\u65e0\u6548')) {
    return {
      kind: 'installer_path_error',
      message: normalized,
    }
  }

  if (
    normalized.includes('\u5141\u8bb8') &&
    normalized.includes('\u5b89\u88c5')
  ) {
    return {
      kind: 'permission_required',
      message: normalized,
    }
  }

  if (
    normalized.includes('\u4e0b\u8f7d') ||
    normalized.includes('HTTP') ||
    normalized.includes('\u8fde\u63a5')
  ) {
    return {
      kind: 'download_error',
      message: normalized,
    }
  }

  return {
    kind: 'unknown_error',
    message: normalized,
  }
}

function buildFileTransferErrorMessage(error: Record<string, unknown>, fallbackMessage: string) {
  const code = typeof error.code === 'string' ? error.code.trim() : ''
  const errorData = isRecord(error.data) ? error.data : null
  const httpStatus = errorData ? parseNumber(errorData.httpStatus) : null
  const nativeException = errorData ? readString(errorData, 'exception') : ''

  if (code === 'OS-PLUG-FLTR-0010' && httpStatus !== null) {
    return `\u4e0b\u8f7d\u66f4\u65b0\u5931\u8d25 (HTTP ${httpStatus})`
  }

  if (code === 'OS-PLUG-FLTR-0008') {
    return '\u4e0b\u8f7d\u66f4\u65b0\u5931\u8d25\uff1a\u65e0\u6cd5\u8fde\u63a5\u5230\u670d\u52a1\u5668\u3002'
  }

  if (code === 'OS-PLUG-FLTR-0006') {
    return '\u4e0b\u8f7d\u66f4\u65b0\u5931\u8d25\uff1a\u5b58\u50a8\u6743\u9650\u88ab\u62d2\u7edd\u3002'
  }

  if (nativeException) {
    return `\u4e0b\u8f7d\u66f4\u65b0\u5931\u8d25\uff1a${nativeException}`
  }

  if (fallbackMessage) {
    return fallbackMessage
  }

  return TEXT_DOWNLOAD_FAILED
}

function extractUpdateActionError(error: unknown): AppUpdateActionErrorInfo {
  if (isAppUpdateError(error)) {
    return {
      kind: error.appUpdateErrorKind,
      message: error.message.trim() || TEXT_GENERIC_ERROR,
    }
  }

  if (typeof error === 'string') {
    return classifyAppUpdateActionErrorMessage(error)
  }

  if (isRecord(error)) {
    const code = typeof error.code === 'string' ? error.code.trim() : ''
    const message = typeof error.message === 'string' ? error.message.trim() : ''

    if (code.startsWith('OS-PLUG-FLTR-')) {
      return {
        kind: 'download_error',
        message: buildFileTransferErrorMessage(error, message),
      }
    }

    if (message) {
      return classifyAppUpdateActionErrorMessage(message)
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return classifyAppUpdateActionErrorMessage(error.message)
  }

  return {
    kind: 'unknown_error',
    message: TEXT_GENERIC_ERROR,
  }
}

async function fetchUpdateManifest() {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), UPDATE_FETCH_TIMEOUT_MS)

  try {
    const url = new URL(UPDATE_MANIFEST_URL)
    url.searchParams.set('t', String(Date.now()))

    const response = await fetch(url.toString(), {
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`\u66f4\u65b0\u4fe1\u606f\u8bf7\u6c42\u5931\u8d25 (${response.status})`)
    }

    const payload: unknown = await response.json()
    return parseUpdateManifest(payload)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(TEXT_FETCH_TIMEOUT)
    }

    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function getInstalledAppVersion(): Promise<InstalledAppVersion> {
  if (Capacitor.getPlatform() !== 'web') {
    try {
      const info = await App.getInfo()
      const versionCode = parseNumber(info.build)

      return {
        versionName: info.version || FALLBACK_VERSION_NAME,
        versionCode,
      }
    } catch {
      // Fall back to build-time constants when native app info is unavailable.
    }
  }

  return {
    versionName: FALLBACK_VERSION_NAME,
    versionCode: FALLBACK_VERSION_CODE,
  }
}

export async function getInstalledAppVersionLabel() {
  const current = await getInstalledAppVersion()
  return current.versionName
}

async function findAvailableUpdate() {
  const [manifest, current] = await Promise.all([
    fetchUpdateManifest(),
    getInstalledAppVersion(),
  ])

  if (!isUpdateNewer(manifest, current)) {
    return null
  }

  return {
    manifest,
    current,
  } satisfies AvailableAppUpdate
}

export async function syncNativeAppUpdateState() {
  if (!isNativeAppUpdateSupported() || !availableAppUpdate.value) {
    return null
  }

  try {
    const nativeState = await getNativeAppUpdateState()
    applyNativeAppUpdateState(nativeState)
    return nativeState
  } catch (error) {
    if (appUpdateDownloadState.value === 'downloading' || appUpdateDownloadState.value === 'opening') {
      appUpdateDownloadState.value = 'idle'
      applyAppUpdateActionError(extractUpdateActionError(error))
    }

    return null
  }
}

export function showAppUpdateDialog(update: AvailableAppUpdate, mode: UpdateCheckMode) {
  availableAppUpdate.value = update
  appUpdateDialogVisible.value = true
  resetAppUpdateActionState()

  if (mode === 'auto') {
    writeLastPromptRecord(update)
  }

  void syncNativeAppUpdateState()
}

export async function checkForAppUpdate(mode: UpdateCheckMode) {
  if (mode === 'auto' && Capacitor.getPlatform() !== 'android') {
    return null
  }

  if (!activeCheckPromise) {
    activeCheckPromise = findAvailableUpdate().finally(() => {
      activeCheckPromise = null
    })
  }

  const update = await activeCheckPromise

  if (!update) {
    return null
  }

  if (mode === 'auto' && shouldSuppressAutoPrompt(update)) {
    return update
  }

  showAppUpdateDialog(update, mode)
  return update
}

export function closeAppUpdateDialog() {
  if (appUpdateIsBusy.value) {
    return
  }

  appUpdateDialogVisible.value = false
  resetAppUpdateActionState()
}

export function postponeAppUpdate() {
  if (appUpdateIsBusy.value) {
    return
  }

  if (availableAppUpdate.value) {
    writeLastPromptRecord(availableAppUpdate.value)
  }

  closeAppUpdateDialog()
}

export function ignoreCurrentAppUpdate() {
  if (appUpdateIsBusy.value) {
    return
  }

  if (availableAppUpdate.value) {
    setIgnoredVersionId(availableAppUpdate.value)
  }

  closeAppUpdateDialog()
}

export async function startAppUpdateDownload() {
  const update = availableAppUpdate.value

  if (!update || appUpdateIsBusy.value) {
    return
  }

  clearAppUpdateActionError()

  if (!isNativeAppUpdateSupported()) {
    window.open(update.manifest.apkUrl || update.manifest.releasePageUrl, '_blank', 'noopener,noreferrer')
    closeAppUpdateDialog()
    return
  }

  try {
    if (await tryReuseDownloadedUpdate(update)) {
      return
    }

    clearAppUpdateActionError()
    appUpdateDownloadState.value = 'downloading'
    appUpdateDownloadBytes.value = 0
    appUpdateDownloadTotalBytes.value = update.manifest.apkSize ?? null

    const downloadedPackage = await downloadUpdatePackage(update)
    const nativeState = await handoffDownloadedUpdateToNativeInstaller(update, downloadedPackage.fileUri)

    if (nativeState.status === 'failed') {
      await deleteDownloadedUpdate(downloadedPackage.path)
    }
  } catch (error) {
    appUpdateDownloadState.value = 'idle'
    appUpdateDownloadBytes.value = 0
    appUpdateDownloadTotalBytes.value = null
    applyAppUpdateActionError(extractUpdateActionError(error))
  }
}
