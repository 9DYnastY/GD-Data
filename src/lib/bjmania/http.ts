import { Capacitor } from '@capacitor/core'
import {
  clearBjmaniaNativeSession,
  isNativeBjmaniaApi,
  nativeBjmaniaAuthMe,
  nativeBjmaniaFetchBinary,
  nativeBjmaniaGrpcUnary,
} from './native-api'

export const BJMANIA_BASE_URL = 'https://u.bjmania.com'

function createUrl(path: string) {
  return path.startsWith('http') ? path : `${BJMANIA_BASE_URL}${path}`
}

export function isNativeBjmaniaHttp() {
  return Capacitor.getPlatform() !== 'web'
}

export async function bjmaniaJsonRequest<TResponse>(
  path: string,
): Promise<{ status: number; data: TResponse | null }> {
  const url = createUrl(path)

  if (isNativeBjmaniaApi()) {
    if (path === '/api/auth/me') {
      return await nativeBjmaniaAuthMe<TResponse>()
    }

    throw new Error(`Native BJMANIA JSON request is not implemented for ${path}`)
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
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

export async function bjmaniaBinaryRequest(url: string, accept: string) {
  if (isNativeBjmaniaApi()) {
    return await nativeBjmaniaFetchBinary(url, accept)
  }

  const response = await fetch(url, {
    headers: {
      Accept: accept,
    },
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
