import { Capacitor, registerPlugin } from '@capacitor/core'

interface NativeWebViewPlugin {
  openUrl(options: {
    url: string
    title?: string
  }): Promise<void>
}

const NativeWebView = registerPlugin<NativeWebViewPlugin>('NativeWebView')

function normalizeHttpUrl(url: string | null | undefined) {
  const trimmedUrl = url?.trim()

  if (!trimmedUrl) {
    return null
  }

  try {
    const parsedUrl = new URL(trimmedUrl)
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
      ? parsedUrl.toString()
      : null
  } catch {
    return null
  }
}

export async function openNativeWebView(url: string | null | undefined, title?: string) {
  const normalizedUrl = normalizeHttpUrl(url)

  if (!normalizedUrl) {
    throw new Error('URL is empty or unsupported.')
  }

  if (Capacitor.getPlatform() === 'web') {
    window.open(normalizedUrl, '_blank', 'noopener,noreferrer')
    return
  }

  await NativeWebView.openUrl({
    url: normalizedUrl,
    title,
  })
}
