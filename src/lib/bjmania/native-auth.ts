import { Capacitor, registerPlugin } from '@capacitor/core'

interface BjmaniaAuthPlugin {
  openLogin(): Promise<{
    success: boolean
    cancelled: boolean
  }>
}

const BjmaniaAuth = registerPlugin<BjmaniaAuthPlugin>('BjmaniaAuth')

export async function openBjmaniaNativeLogin() {
  if (Capacitor.getPlatform() === 'web') {
    throw new Error('Native BJMANIA login is only available inside the Android app')
  }

  return await BjmaniaAuth.openLogin()
}
