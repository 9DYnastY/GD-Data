import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { ref } from 'vue'

const UPDATE_MANIFEST_URL = 'https://gitadora.selundine.top/releases/android/latest/update.json'
const FALLBACK_VERSION_NAME = '1.1.0'
const FALLBACK_VERSION_CODE = 2
const UPDATE_FETCH_TIMEOUT_MS = 10000
const AUTO_PROMPT_INTERVAL_MS = 24 * 60 * 60 * 1000
const LAST_PROMPT_STORAGE_KEY = 'gddata:update:last-prompt'
const IGNORED_UPDATE_STORAGE_KEY = 'gddata:update:ignored-version'
const DEFAULT_RELEASE_PAGE_URL = 'https://gddata.selundine.top/'

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

interface LastPromptRecord {
  versionId: string
  promptedAt: number
}

export const appUpdateDialogVisible = ref(false)
export const availableAppUpdate = ref<AvailableAppUpdate | null>(null)

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
  appUpdateDialogVisible.value = false
}

export function postponeAppUpdate() {
  if (availableAppUpdate.value) {
    writeLastPromptRecord(availableAppUpdate.value)
  }

  closeAppUpdateDialog()
}

export function ignoreCurrentAppUpdate() {
  if (availableAppUpdate.value) {
    setIgnoredVersionId(availableAppUpdate.value)
  }

  closeAppUpdateDialog()
}

export async function openAppUpdateReleasePage() {
  const url = availableAppUpdate.value?.manifest.releasePageUrl || DEFAULT_RELEASE_PAGE_URL

  if (Capacitor.getPlatform() === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }

  try {
    await Browser.open({
      url,
      toolbarColor: '#4f378a',
    })
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
