import { Capacitor } from '@capacitor/core'
import {
  clearBjmaniaNativeSession,
  isNativeBjmaniaApi,
  nativeBjmaniaAuthMe,
  nativeBjmaniaGrpcUnary,
} from './native-api'

export const BJMANIA_BASE_URL = 'https://u.bjmania.com'

function createUrl(path: string) {
  return path.startsWith('http') ? path : `${BJMANIA_BASE_URL}${path}`
}

export function isNativeBjmaniaHttp() {
  return Capacitor.getPlatform() !== 'web'
}

export async function bjmaniaJsonRequest<TResponse>(options: {
  path: string
  method?: 'GET' | 'POST'
  body?: unknown
}): Promise<{ status: number; data: TResponse | null }> {
  const url = createUrl(options.path)
  const method = options.method ?? 'GET'

  if (isNativeBjmaniaApi()) {
    if (method === 'GET' && options.path === '/api/auth/me') {
      return await nativeBjmaniaAuthMe<TResponse>()
    }

    throw new Error(`Native BJMANIA JSON request is not implemented for ${method} ${options.path}`)
  }

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
  })

  if (response.status === 204) {
    return { status: response.status, data: null }
  }

  const text = await response.text()

  return {
    status: response.status,
    data: text ? (JSON.parse(text) as TResponse) : null,
  }
}

export async function bjmaniaGrpcRequest(path: string, body: Uint8Array) {
  if (isNativeBjmaniaApi()) {
    return await nativeBjmaniaGrpcUnary(path, body)
  }

  const url = createUrl(path)
  const webBody = new Uint8Array(body.length)
  webBody.set(body)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/grpc-web+proto',
      'X-Grpc-Web': '1',
      'X-User-Agent': 'grpc-web-javascript/0.1',
    },
    credentials: 'include',
    body: webBody.buffer,
  })

  return {
    status: response.status,
    body: new Uint8Array(await response.arrayBuffer()),
  }
}

export async function clearBjmaniaCookies() {
  if (isNativeBjmaniaApi()) {
    await clearBjmaniaNativeSession()
  }
}
