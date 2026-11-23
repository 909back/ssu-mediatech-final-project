/**
 * Still capture and the rolling motion clip. Owned by the shoot stage.
 *
 * Shape stored in the store for each shot (see report / Save stage):
 *   shots[i] = { image: string, clip: Clip }
 *   image  JPEG dataURL, exactly cell size (rect.w x rect.h), mirrored, filter baked in
 *   clip   (type Clip = HTMLCanvasElement[]) CLIP_FPS frames per second, oldest first, last frame = the shutter moment.
 *          Each frame is an HTMLCanvasElement CLIP_WIDTH px wide with the same
 *          aspect ratio as the cell. Up to CLIP_FRAMES frames (fewer if the shot
 *          happened right after the preview started).
 */

/**
 * A shot's motion clip as Shoot produces it. Always canvases, so it fits the
 * store's wider `ClipFrame[]` type (string | ImageBitmap | HTMLCanvasElement).
 */
export type Clip = HTMLCanvasElement[]

export const CLIP_WIDTH = 400
export const CLIP_FPS = 10
export const CLIP_SECONDS = 1.5
export const CLIP_FRAMES = Math.round(CLIP_FPS * CLIP_SECONDS) // 15

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/**
 * Ring buffer that keeps the last CLIP_SECONDS of the preview, downscaled.
 * The p5 sketch calls push() every frame; it only stores one frame per
 * 1/CLIP_FPS s and reuses its canvases, so it costs almost nothing.
 */
export class ClipBuffer {
  private frames: HTMLCanvasElement[] = []
  private next = 0
  private count = 0
  private lastAt = -Infinity

  /** Store `source` if enough time has passed since the last stored frame. */
  push(source: HTMLCanvasElement, now: number) {
    if (now - this.lastAt < 1000 / CLIP_FPS - 4) return
    this.lastAt = now
    const h = (CLIP_WIDTH * source.height) / source.width
    let frame = this.frames[this.next]
    if (!frame) {
      frame = makeCanvas(CLIP_WIDTH, h)
      this.frames[this.next] = frame
    } else if (frame.height !== Math.round(h)) {
      frame.width = CLIP_WIDTH
      frame.height = Math.round(h)
    }
    frame.getContext('2d')!.drawImage(source, 0, 0, frame.width, frame.height)
    this.next = (this.next + 1) % CLIP_FRAMES
    this.count = Math.min(this.count + 1, CLIP_FRAMES)
  }

  /** Copy out the buffered frames, oldest first, as new canvases. */
  snapshot(): Clip {
    const out: Clip = []
    const start = (this.next - this.count + CLIP_FRAMES) % CLIP_FRAMES
    for (let i = 0; i < this.count; i++) {
      const src = this.frames[(start + i) % CLIP_FRAMES]
      const copy = makeCanvas(src.width, src.height)
      copy.getContext('2d')!.drawImage(src, 0, 0)
      out.push(copy)
    }
    return out
  }

  /** Drop everything (e.g. after the preview size changes). */
  clear() {
    this.count = 0
    this.next = 0
    this.lastAt = -Infinity
  }
}

/**
 * Copy the preview canvas into a new canvas of exactly cell size and return
 * it as a JPEG dataURL. The preview already has the cell's aspect ratio.
 */
export function captureStill(source: HTMLCanvasElement, cellW: number, cellH: number): string {
  const out = makeCanvas(cellW, cellH)
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, out.width, out.height)
  return out.toDataURL('image/jpeg', 0.92)
}
