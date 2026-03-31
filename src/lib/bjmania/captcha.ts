import type { BjmaniaCaptchaToken } from '../../types/bjmania'

const CAPTCHA_APP_ID = '2040820524'
const CAPTCHA_SCRIPT_ID = 'CaptchaScript'
const CAPTCHA_SCRIPT_URL = 'https://turing.captcha.qcloud.com/TCaptcha.js'

function ensureBrowserWindow() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Tencent captcha is only available in a browser context')
  }
}

export function ensureTencentCaptchaScript() {
  ensureBrowserWindow()

  if (window.TencentCaptcha) {
    return Promise.resolve()
  }

  const existing = document.getElementById(CAPTCHA_SCRIPT_ID) as HTMLScriptElement | null

  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Tencent captcha script failed to load')), {
        once: true,
      })
    })
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.id = CAPTCHA_SCRIPT_ID
    script.src = CAPTCHA_SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Tencent captcha script failed to load'))
    document.head.appendChild(script)
  })
}

export async function requestBjmaniaCaptchaToken() {
  await ensureTencentCaptchaScript()

  if (!window.TencentCaptcha) {
    throw new Error('Tencent captcha is not available')
  }

  return await new Promise<BjmaniaCaptchaToken>((resolve, reject) => {
    let captcha: { destroy?: () => void; show: () => void } | null = null

    captcha = new window.TencentCaptcha!(
      CAPTCHA_APP_ID,
      (result) => {
        if (result.ret === 0 && result.ticket && result.randstr) {
          resolve({
            ticket: result.ticket,
            randstr: result.randstr,
          })
          captcha?.destroy?.()
          return
        }

        captcha?.destroy?.()

        if (result.ret === 2) {
          reject(new Error('Captcha was cancelled'))
          return
        }

        reject(new Error(result.errorMessage || 'Captcha verification failed'))
      },
      {
        needFeedBack: false,
        showHeader: false,
      },
    )

    captcha.show()
  })
}
