/**
 * Export the composed frame as PNG, GIF or WebM. Owned by the save stage.
 *
 *   exportPNG(canvas, filename?)                              => Promise<void>
 *   exportGIF(shots, layout, decor, { width, fps, seconds, eightShotMode, onProgress })
 *                                                              => Promise<void>
 *   exportWebM(shots, layout, decor, { seconds, fps, height, eightShotMode, onProgress })
 *                                                              => Promise<void>
 *
 * `shots` is store.shots. Each frame is drawn with composeLayout() from
 * src/lib/compose, so decoration matches the PNG exactly. A shot without a
 * clip (or an empty clip) shows its still image in every frame.
 *
 * Clips are played as a boomerang (forward then back) so the loop has no jump.
 * CLIP_SECONDS is the assumed real length of one clip (user-flow: ~1.5 s).
 *
 * Failures throw ExportError with a `code` the UI maps to a toast:
 *   'recording-unsupported'  MediaRecorder / WebM / captureStream missing
 *   'export-failed'          anything else
 */
import { composeLayout } from '@/lib/compose'
import { createEncoder, encodeFrame } from '@/lib/gif-encode'

/* Structural types so this file does not depend on store/layout typings. */
type FrameSource = ImageBitmap | HTMLCanvasElement | HTMLImageElement | string
export type ExportShot = { image: string; clip?: FrameSource[] | null } | null
type ExportLayout = { width: number; height: number }
type ComposeArgs = Parameters<typeof composeLayout>
type AnyShots = ComposeArgs[0]
type AnyLayout = ComposeArgs[1]
type AnyDecor = ComposeArgs[2]

export type ExportErrorCode = 'recording-unsupported' | 'export-failed'
type Progress = (value: number) => void

export const CLIP_SECONDS = 1.5

export class ExportError extends Error {
  code: ExportErrorCode
  constructor(code: ExportErrorCode, message?: string, cause?: unknown) {
    super(message ?? code, { cause })
    this.name = 'ExportError'
    this.code = code
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** dotori-4cut-YYYYMMDD-HHmm.<ext> */
export function exportFilename(ext: string, date = new Date()): string {
  const d = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
  const t = `${pad2(date.getHours())}${pad2(date.getMinutes())}`
  return `dotori-4cut-${d}-${t}.${ext}`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const wrap = (err: unknown) =>
  err instanceof ExportError
    ? err
    : new ExportError('export-failed', err instanceof Error ? err.message : String(err), err)

/* ------------------------------------------------------------------ PNG -- */

export async function exportPNG(
  canvas: HTMLCanvasElement,
  filename = exportFilename('png'),
): Promise<void> {
  try {
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
    )
    downloadBlob(blob, filename)
  } catch (err) {
    throw wrap(err)
  }
}

/* ------------------------------------------------------- frame sequence -- */

const hasClip = (shot: ExportShot): shot is { image: string; clip: FrameSource[] } =>
  Boolean(shot?.clip?.length)

/** Boomerang phase 0..1..0 over one clip length, quantised to `steps` positions. */
function phaseAt(t: number, steps: number): number {
  if (steps <= 1) return 0
  const period = 2 * (steps - 1)
  const pos = Math.floor((t / CLIP_SECONDS) * (steps - 1)) % period
  return (pos <= steps - 1 ? pos : period - pos) / (steps - 1)
}

/**
 * Plan of output frames: for each output frame, the clip index per shot.
 * Frames that resolve to the same indices share one composed canvas.
 */
function planFrames(shots: ExportShot[], fps: number, seconds: number): string[] {
  const steps = Math.max(1, ...shots.map((s) => (hasClip(s) ? s.clip.length : 1)))
  const total = Math.max(1, Math.round(fps * seconds))
  const frames: string[] = []
  for (let f = 0; f < total; f++) {
    const p = phaseAt(f / fps, steps)
    const indices = shots.map((s) => (hasClip(s) ? Math.round(p * (s.clip.length - 1)) : -1))
    frames.push(indices.join(','))
  }
  return frames
}

type ComposeOpts = { scale: number; eightShotMode: boolean }

function composeAt(
  key: string,
  shots: ExportShot[],
  layout: ExportLayout,
  decor: unknown,
  { scale, eightShotMode }: ComposeOpts,
): Promise<HTMLCanvasElement> {
  const indices = key.split(',').map(Number)
  const anyClip = indices.some((i) => i >= 0)
  const frameShots = shots.map((s, n) =>
    hasClip(s) && indices[n] >= 0 ? { ...s, clip: [s.clip[indices[n]]] } : s,
  )
  return composeLayout(frameShots as unknown as AnyShots, layout as unknown as AnyLayout, decor as AnyDecor, {
    scale,
    eightShotMode,
    frameIndex: anyClip ? 0 : undefined,
  })
}

/** Compose every distinct frame once. Returns Map<key, canvas>. */
async function composeUnique(
  frames: string[],
  shots: ExportShot[],
  layout: ExportLayout,
  decor: unknown,
  opts: ComposeOpts,
  onProgress: Progress,
): Promise<Map<string, HTMLCanvasElement>> {
  const unique = [...new Set(frames)]
  const map = new Map<string, HTMLCanvasElement>()
  for (let i = 0; i < unique.length; i++) {
    map.set(unique[i], await composeAt(unique[i], shots, layout, decor, opts))
    onProgress((i + 1) / unique.length)
  }
  return map
}

/* ------------------------------------------------------------------ GIF -- */

function encodeInWorker(frameData: ImageData[], delay: number, onProgress: Progress): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./export-gif.worker.ts', import.meta.url), { type: 'module' })
    } catch (err) {
      reject(err)
      return
    }
    worker.onmessage = (
      e: MessageEvent<
        | { type: 'progress'; done: number }
        | { type: 'done'; buffer: ArrayBuffer }
        | { type: 'error'; message: string }
      >,
    ) => {
      const msg = e.data
      if (msg.type === 'progress') onProgress(msg.done / frameData.length)
      else if (msg.type === 'done') {
        worker.terminate()
        resolve(new Uint8Array(msg.buffer))
      } else if (msg.type === 'error') {
        worker.terminate()
        reject(new Error(msg.message))
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'GIF worker failed'))
    }
    for (const { width, height, data } of frameData) {
      const buffer = data.buffer.slice(0) as ArrayBuffer
      worker.postMessage({ type: 'frame', width, height, buffer, delay }, [buffer])
    }
    worker.postMessage({ type: 'finish' })
  })
}

async function encodeOnMainThread(
  frameData: ImageData[],
  delay: number,
  onProgress: Progress,
): Promise<Uint8Array> {
  const encoder = createEncoder()
  for (let i = 0; i < frameData.length; i++) {
    const { width, height, data } = frameData[i]
    encodeFrame(encoder, data, width, height, delay)
    onProgress((i + 1) / frameData.length)
    await new Promise((r) => setTimeout(r, 0)) // let the progress bar paint
  }
  encoder.finish()
  return encoder.bytes()
}

export type GifOptions = {
  width?: number
  fps?: number
  seconds?: number
  eightShotMode?: boolean
  onProgress?: Progress
}

export async function exportGIF(
  shots: ExportShot[],
  layout: ExportLayout,
  decor: unknown,
  opts: GifOptions = {},
): Promise<void> {
  const { width = 400, fps = 10, seconds = 3, eightShotMode = false, onProgress } = opts
  const report = (v: number) => onProgress?.(Math.min(1, Math.max(0, v)))
  try {
    report(0)
    const scale = width / layout.width
    const frames = planFrames(shots, fps, seconds)
    // 0..0.4 compose, 0.4..1 encode
    const canvases = await composeUnique(frames, shots, layout, decor, { scale, eightShotMode }, (p) =>
      report(p * 0.4),
    )
    const pixels = new Map<string, ImageData>()
    for (const [key, c] of canvases) {
      pixels.set(key, c.getContext('2d')!.getImageData(0, 0, c.width, c.height))
    }
    const frameData = frames.map((k) => pixels.get(k)!)
    const delay = Math.round(1000 / fps)
    const encodeProgress = (p: number) => report(0.4 + p * 0.6)

    let bytes: Uint8Array
    try {
      bytes = await encodeInWorker(frameData, delay, encodeProgress)
    } catch {
      bytes = await encodeOnMainThread(frameData, delay, encodeProgress)
    }
    downloadBlob(new Blob([bytes as BlobPart], { type: 'image/gif' }), exportFilename('gif'))
    report(1)
  } catch (err) {
    throw wrap(err)
  }
}

/* ----------------------------------------------------------------- WebM -- */

function pickWebmType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? null
}

export function isWebMSupported(): boolean {
  return (
    Boolean(pickWebmType()) &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  )
}

export type WebMOptions = {
  seconds?: number
  fps?: number
  /** output height in px; width follows the layout aspect */
  height?: number
  eightShotMode?: boolean
  onProgress?: Progress
}

export async function exportWebM(
  shots: ExportShot[],
  layout: ExportLayout,
  decor: unknown,
  opts: WebMOptions = {},
): Promise<void> {
  const { seconds = 6, fps = 30, height = 960, eightShotMode = false, onProgress } = opts
  const report = (v: number) => onProgress?.(Math.min(1, Math.max(0, v)))

  const mimeType = pickWebmType()
  if (!mimeType || !isWebMSupported()) {
    throw new ExportError('recording-unsupported', 'WebM recording is not supported')
  }

  try {
    report(0)
    const scale = height / layout.height
    const frames = planFrames(shots, fps, seconds)
    // 0..0.4 compose, 0.4..1 real-time recording
    const canvases = await composeUnique(frames, shots, layout, decor, { scale, eightShotMode }, (p) =>
      report(p * 0.4),
    )

    const first = canvases.get(frames[0])!
    const out = document.createElement('canvas')
    out.width = first.width
    out.height = first.height
    const ctx = out.getContext('2d')!
    ctx.drawImage(first, 0, 0)

    const stream = out.captureStream(fps)
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve()
      recorder.onerror = () => reject(new Error('MediaRecorder error'))
    })

    recorder.start(250)
    const start = performance.now()
    let last = 0
    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = (performance.now() - start) / 1000
        const f = Math.min(frames.length - 1, Math.floor(t * fps))
        if (f !== last) {
          ctx.drawImage(canvases.get(frames[f])!, 0, 0)
          last = f
        }
        report(0.4 + Math.min(1, t / seconds) * 0.6)
        if (t >= seconds) resolve()
        else setTimeout(tick, 1000 / fps / 2)
      }
      tick()
    })
    recorder.stop()
    await stopped
    stream.getTracks().forEach((tr) => tr.stop())

    if (!chunks.length) throw new Error('Recording produced no data')
    downloadBlob(new Blob(chunks, { type: 'video/webm' }), exportFilename('webm'))
    report(1)
  } catch (err) {
    throw wrap(err)
  }
}
