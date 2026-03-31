import type { BjmaniaCaptchaToken } from './bjmania'

interface TencentCaptchaResult extends Partial<BjmaniaCaptchaToken> {
  ret?: number
  errorCode?: number
  errorMessage?: string
}

interface TencentCaptchaInstance {
  show(): void
  destroy?(): void
  refresh?(): void
}

interface TencentCaptchaConstructor {
  new (
    appId: string,
    callback: (result: TencentCaptchaResult) => void,
    options?: Record<string, unknown>,
  ): TencentCaptchaInstance
}

declare global {
  interface Window {
    TencentCaptcha?: TencentCaptchaConstructor
  }
}

export {}
