import { Capacitor, registerPlugin } from '@capacitor/core'
import { base64ToUint8Array, uint8ArrayToBase64 } from './grpc-web'

interface BjmaniaApiPlugin {
  authMe(): Promise<{
    status: number
    data: unknown
  }>
  grpcUnary(options: {
    path: string
    requestBase64: string
  }): Promise<{
    status: number
    responseBase64: string
  }>
  clearSession(): Promise<void>
}

const BjmaniaApi = registerPlugin<BjmaniaApiPlugin>('BjmaniaApi')

export function isNativeBjmaniaApi() {
  return Capacitor.getPlatform() !== 'web'
}

export async function nativeBjmaniaAuthMe<TResponse>() {
  const response = await BjmaniaApi.authMe()

  return {
    status: response.status,
    data: (response.data ?? null) as TResponse | null,
  }
}

export async function nativeBjmaniaGrpcUnary(path: string, body: Uint8Array) {
  const response = await BjmaniaApi.grpcUnary({
    path,
    requestBase64: uint8ArrayToBase64(body),
  })

  return {
    status: response.status,
    body: base64ToUint8Array(response.responseBase64 ?? ''),
  }
}

export async function clearBjmaniaNativeSession() {
  await BjmaniaApi.clearSession()
}
