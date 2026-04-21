import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { computed, ref } from 'vue'

const UPDATE_MANIFEST_URL = 'https://gitadora.selundine.top/releases/android/latest/update.json'
const FALLBACK_VERSION_NAME = '1.1.0'
const FALLBACK_VERSION_CODE = 2
const UPDATE_FETCH_TIMEOUT_MS = 10000
const UPDATE_CONNECT_TIMEOUT_MS = 15000
const UPDATE_READ_TIMEOUT_MS = 10 * 60 * 1000
const UPDATE_DOWNLOAD_DIRECTORY = 'updates'
const AUTO_PROMPT_INTERVAL_MS = 24 * 60 * 60 * 1000
const LAST_PROMPT_STORAGE_KEY = 'gddata:update:last-prompt'
const IGNORED_UPDATE_STORAGE_KEY = 'gddata:update:ignored-version'

export interface AppUpdateManifest {
  platform: 'android'
  versionName: string
  versionCode: number
  publishedAt: string
  releasePageUrl: string
  apkUrl: string
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
type AppUpdateDownloadState = 'idle' | 'downloading' | 'opening'

interface LastPromptRecord {
  versionId: string
  promptedAt: number
}

export const appUpdateDialogVisible = ref(false)
export const availableAppUpdate = ref<AvailableAppUpdate | null>(null)
export const appUpdateDownloadState = ref<AppUpdateDownloadState>('idle')
export const appUpdateDownloadBytes = ref(0)
export const appUpdateDownloadTotalBytes = ref<number | null>(null)
export const appUpdateActionError = ref('')

export const appUpdateIsBusy = computed(() => appUpdateDownloadState.value !== 'idle')
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
    return percent === null ? '正在下载...' : `下载中 ${percent}%`
  }

  if (appUpdateDownloadState.value === 'opening') {
    return '正在打开安装包...'
  }

  return '下载并安装'
})
export const appUpdateStatusMessage = computed(() => {
  if (appUpdateDownloadState.value === 'opening') {
    return '下载完成，正在打开安装包...'
  }

  if (appUpdateDownloadState.value === 'downloading') {
    return '正在下载更新'
  }

  return ''
})
export const appUpdateProgressDetail = computed(() => {
  if (appUpdateDownloadState.value === 'idle') {
    return ''
  }

  const bytes = appUpdateDownloadBytes.value
  const totalBytes = appUpdateDownloadTotalBytes.value

  if (totalBytes && totalBytes > 0) {
    return `${formatBytes(bytes)} / ${formatBytes(totalBytes)}`
  }

  if (bytes > 0) {
    return `已下载 ${formatBytes(bytes)}`
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
    throw new Error('更新信息格式不正确')
  }

  const platform = readString(value, 'platform')
  const versionName = readString(value, 'versionName')
  const versionCode = parseNumber(value.versionCode)
  const publishedAt = readString(value, 'publishedAt')
  const releasePageUrl = readString(value, 'releasePageUrl')
  const apkUrl = readString(value, 'apkUrl')
  const notes = normalizeNotes(value.notes)

  if (platform !== 'android') {
    throw new Error('更新信息平台不匹配')
  }

  if (!versionName || versionCode === null || !releasePageUrl || !apkUrl) {
    throw new Error('更新信息缺少必要字段')
  }

  return {
    platform,
    versionName,
    versionCode,
    publishedAt,
    releasePageUrl,
    apkUrl,
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
  appUpdateActionError.value = ''
}

function buildDownloadedApkFilename(update: AvailableAppUpdate) {
  const safeVersion = update.manifest.versionName.replace(/[^0-9A-Za-z._-]+/g, '_') || 'latest'
  return `gddata-android-v${safeVersion}.apk`
}

function normalizeLocalFilePath(path: string) {
  return path.startsWith('file://') ? path.replace(/^file:\/\//, '') : path
}

function isDirectoryAlreadyExistsError(error: unknown) {
  return (
    error instanceof Error &&
    (
      error.message.includes('already exists') ||
      error.message.includes('OS-PLUG-FILE-0010')
    )
  )
}

async function ensureUpdateDownloadDirectory() {
  const { Directory, Filesystem } = await import('@capacitor/filesystem')

  try {
    await Filesystem.mkdir({
      path: UPDATE_DOWNLOAD_DIRECTORY,
      directory: Directory.Cache,
      recursive: true,
    })
  } catch (error) {
    if (!isDirectoryAlreadyExistsError(error)) {
      throw error
    }
  }
}

async function deleteDownloadedFile(path: string) {
  const { Directory, Filesystem } = await import('@capacitor/filesystem')

  try {
    await Filesystem.deleteFile({
      path,
      directory: Directory.Cache,
    })
  } catch {
    // Ignore missing files and cleanup failures before a new download attempt.
  }
}

function extractDownloadErrorMessage(error: unknown) {
  if (isRecord(error)) {
    const code = typeof error.code === 'string' ? error.code : ''
    const message = typeof error.message === 'string' ? error.message : ''
    const data = isRecord(error.data) ? error.data : null
    const httpStatus = typeof data?.httpStatus === 'number' ? data.httpStatus : null

    if (code === 'OS-PLUG-FLTR-0010' && httpStatus !== null) {
      return `安装包下载失败 (${httpStatus})`
    }

    if (code === 'OS-PLUG-FLVW-0010') {
      return '系统未找到可打开 APK 的安装程序'
    }

    if (code === 'OS-PLUG-FLVW-0008') {
      return '安装包已下载，但系统未能打开它'
    }

    if (message) {
      return message
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return '更新安装包处理失败，请稍后重试'
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
      throw new Error(`更新信息请求失败 (${response.status})`)
    }

    const payload: unknown = await response.json()
    return parseUpdateManifest(payload)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('更新检查超时')
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

export function showAppUpdateDialog(update: AvailableAppUpdate, mode: UpdateCheckMode) {
  availableAppUpdate.value = update
  appUpdateDialogVisible.value = true
  resetAppUpdateActionState()

  if (mode === 'auto') {
    writeLastPromptRecord(update)
  }
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

  appUpdateActionError.value = ''

  if (Capacitor.getPlatform() !== 'android') {
    window.open(update.manifest.apkUrl || update.manifest.releasePageUrl, '_blank', 'noopener,noreferrer')
    closeAppUpdateDialog()
    return
  }

  let didFinishDownload = false
  let targetPath = ''
  let progressHandle: { remove: () => Promise<void> } | null = null

  try {
    const { FileTransfer } = await import('@capacitor/file-transfer')
    const { FileViewer } = await import('@capacitor/file-viewer')
    const { Directory, Filesystem } = await import('@capacitor/filesystem')

    targetPath = `${UPDATE_DOWNLOAD_DIRECTORY}/${buildDownloadedApkFilename(update)}`
    appUpdateDownloadState.value = 'downloading'
    appUpdateDownloadBytes.value = 0
    appUpdateDownloadTotalBytes.value = null

    await ensureUpdateDownloadDirectory()
    await deleteDownloadedFile(targetPath)

    const targetUri = await Filesystem.getUri({
      path: targetPath,
      directory: Directory.Cache,
    })

    progressHandle = await FileTransfer.addListener('progress', (progress) => {
      if (progress.type !== 'download' || progress.url !== update.manifest.apkUrl) {
        return
      }

      appUpdateDownloadState.value = 'downloading'
      appUpdateDownloadBytes.value = progress.bytes
      appUpdateDownloadTotalBytes.value = progress.lengthComputable && progress.contentLength > 0
        ? progress.contentLength
        : null
    })

    await FileTransfer.downloadFile({
      url: update.manifest.apkUrl,
      path: targetUri.uri,
      progress: true,
      connectTimeout: UPDATE_CONNECT_TIMEOUT_MS,
      readTimeout: UPDATE_READ_TIMEOUT_MS,
    })

    const downloadedFile = await Filesystem.stat({
      path: targetPath,
      directory: Directory.Cache,
    })

    if (downloadedFile.size <= 0) {
      throw new Error('安装包下载失败，请重试')
    }

    if (
      appUpdateDownloadTotalBytes.value &&
      appUpdateDownloadTotalBytes.value > 0 &&
      downloadedFile.size < appUpdateDownloadTotalBytes.value
    ) {
      throw new Error('安装包下载不完整，请重试')
    }

    didFinishDownload = true
    appUpdateDownloadBytes.value = downloadedFile.size
    appUpdateDownloadTotalBytes.value = appUpdateDownloadTotalBytes.value ?? downloadedFile.size
    appUpdateDownloadState.value = 'opening'

    const localFile = await Filesystem.getUri({
      path: targetPath,
      directory: Directory.Cache,
    })

    await FileViewer.openDocumentFromLocalPath({
      path: normalizeLocalFilePath(localFile.uri),
    })

    appUpdateDialogVisible.value = false
    resetAppUpdateActionState()
  } catch (error) {
    if (!didFinishDownload && targetPath) {
      await deleteDownloadedFile(targetPath)
    }

    appUpdateDownloadState.value = 'idle'
    appUpdateActionError.value = extractDownloadErrorMessage(error)
  } finally {
    await progressHandle?.remove().catch(() => {})
  }
}
