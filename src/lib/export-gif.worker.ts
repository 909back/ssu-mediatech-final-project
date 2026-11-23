/**
 * GIF encoding worker for src/lib/export.ts (save stage).
 *
 * In:  { type: 'frame', width, height, buffer: ArrayBuffer (RGBA), delay } per frame, then { type: 'finish' }
 * Out: { type: 'progress', done } per frame, { type: 'done', buffer }, or { type: 'error', message }
 */
import { createEncoder, encodeFrame } from './gif-encode'

type InMessage =
  | { type: 'frame'; width: number; height: number; buffer: ArrayBuffer; delay: number }
  | { type: 'finish' }

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<InMessage>) => void) | null
  postMessage(msg: unknown, transfer?: Transferable[]): void
}

const encoder = createEncoder()
let done = 0

ctx.onmessage = (e) => {
  const msg = e.data
  try {
    if (msg.type === 'frame') {
      encodeFrame(encoder, new Uint8ClampedArray(msg.buffer), msg.width, msg.height, msg.delay)
      done += 1
      ctx.postMessage({ type: 'progress', done })
    } else if (msg.type === 'finish') {
      encoder.finish()
      const bytes = encoder.bytes()
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      ctx.postMessage({ type: 'done', buffer }, [buffer])
    }
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
