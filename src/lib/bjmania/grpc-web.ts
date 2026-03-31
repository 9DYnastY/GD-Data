import { concatUint8Arrays } from './protobuf'

export function encodeGrpcWebUnary(payload: Uint8Array) {
  const frame = new Uint8Array(5 + payload.length)
  const view = new DataView(frame.buffer)
  frame[0] = 0
  view.setUint32(1, payload.length, false)
  frame.set(payload, 5)
  return frame
}

export function decodeGrpcWebUnary(body: Uint8Array) {
  const messages: Uint8Array[] = []
  let offset = 0

  while (offset + 5 <= body.length) {
    const flags = body[offset]
    const length = new DataView(body.buffer, body.byteOffset + offset + 1, 4).getUint32(0, false)
    const nextOffset = offset + 5 + length

    if (nextOffset > body.length) {
      throw new Error('Malformed gRPC-Web frame')
    }

    const frameBody = body.slice(offset + 5, nextOffset)

    if ((flags & 0x80) === 0) {
      messages.push(frameBody)
    }

    offset = nextOffset
  }

  if (messages.length === 0) {
    return new Uint8Array()
  }

  return messages.length === 1 ? messages[0] : concatUint8Arrays(messages)
}

export function uint8ArrayToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

export function base64ToUint8Array(base64: string) {
  const binary = atob(base64)
  const output = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index)
  }

  return output
}
