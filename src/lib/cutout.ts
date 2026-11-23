/**
 * Sticker background removal. Owned by decorate.
 *
 *   isSupportedImage(file)              PNG / JPG / WEBP / GIF only
 *   prepareCutout(file)                 decode + downscale to max 800 px, once per upload
 *   cutout(prepared, tolerance)         transparent PNG dataURL (+ size), tolerance 0..120
 *   fileToDataURL(file, maxSize)        downscaled dataURL (used for frame background images)
 *
 * Method: collect the dominant colors along the image border, then flood fill
 * from every border pixel through pixels whose RGB distance to one of those
 * colors is <= tolerance. Filled pixels become transparent, pixels touching
 * the fill get half alpha for a softer edge, and the result is trimmed to the
 * remaining content. An 800x800 image takes well under 100 ms.
 */

export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const CUTOUT_MAX_SIZE = 800
export const DEFAULT_TOLERANCE = 40

export interface PreparedCutout {
  data: ImageData
  width: number
  height: number
}

export interface CutoutResult {
  src: string
  width: number
  height: number
}

export function isSupportedImage(file: File) {
  return SUPPORTED_IMAGE_TYPES.includes(file.type)
}

async function decodeFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function drawScaled(img: HTMLImageElement, maxSize: number) {
  const s = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(img.naturalWidth * s))
  c.height = Math.max(1, Math.round(img.naturalHeight * s))
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return { canvas: c, ctx }
}

export async function fileToDataURL(file: File, maxSize = 1800) {
  const img = await decodeFile(file)
  const { canvas } = drawScaled(img, maxSize)
  return file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9)
}

export async function prepareCutout(file: File, maxSize = CUTOUT_MAX_SIZE): Promise<PreparedCutout> {
  const img = await decodeFile(file)
  const { canvas, ctx } = drawScaled(img, maxSize)
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), width: canvas.width, height: canvas.height }
}

/** Up to 4 dominant border colors (quantized buckets, averaged). */
function borderColors(d: Uint8ClampedArray, w: number, h: number) {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>()
  let total = 0
  const add = (p: number) => {
    const i = p * 4
    if (d[i + 3] < 16) return
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)
    const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
    e.r += d[i]
    e.g += d[i + 1]
    e.b += d[i + 2]
    e.n++
    buckets.set(key, e)
    total++
  }
  for (let x = 0; x < w; x++) {
    add(x)
    add((h - 1) * w + x)
  }
  for (let y = 1; y < h - 1; y++) {
    add(y * w)
    add(y * w + w - 1)
  }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .filter((e, i) => i === 0 || e.n >= total * 0.05)
    .slice(0, 4)
    .map((e) => [e.r / e.n, e.g / e.n, e.b / e.n])
}

export function cutout(prepared: PreparedCutout, tolerance: number): CutoutResult {
  const { width: w, height: h } = prepared
  const src = prepared.data.data
  const out = new Uint8ClampedArray(src)
  const refs = borderColors(src, w, h)
  const tol2 = Math.max(0, Math.min(120, tolerance)) ** 2

  const isBg = (p: number) => {
    const i = p * 4
    if (src[i + 3] < 16) return true
    for (const [r, g, b] of refs) {
      const dr = src[i] - r
      const dg = src[i + 1] - g
      const db = src[i + 2] - b
      if (dr * dr + dg * dg + db * db <= tol2) return true
    }
    return false
  }

  const visited = new Uint8Array(w * h) // 1 = background
  const queue = new Int32Array(w * h)
  let head = 0
  let tail = 0
  const seed = (p: number) => {
    if (!visited[p] && isBg(p)) {
      visited[p] = 1
      queue[tail++] = p
    }
  }
  for (let x = 0; x < w; x++) {
    seed(x)
    seed((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    seed(y * w)
    seed(y * w + w - 1)
  }
  while (head < tail) {
    const p = queue[head++]
    const x = p % w
    if (x > 0) seed(p - 1)
    if (x < w - 1) seed(p + 1)
    if (p >= w) seed(p - w)
    if (p < w * (h - 1)) seed(p + w)
  }

  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (visited[p]) {
        out[p * 4 + 3] = 0
        continue
      }
      const edge =
        (x > 0 && visited[p - 1]) ||
        (x < w - 1 && visited[p + 1]) ||
        (y > 0 && visited[p - w]) ||
        (y < h - 1 && visited[p + w])
      if (edge) out[p * 4 + 3] = out[p * 4 + 3] >> 1
      if (out[p * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) {
    // everything removed: keep the full frame so the user can lower the tolerance
    minX = 0
    minY = 0
    maxX = w - 1
    maxY = h - 1
  }

  const full = document.createElement('canvas')
  full.width = w
  full.height = h
  full.getContext('2d')!.putImageData(new ImageData(out, w, h), 0, 0)
  const cw = maxX - minX + 1
  const ch = maxY - minY + 1
  const c = document.createElement('canvas')
  c.width = cw
  c.height = ch
  c.getContext('2d')!.drawImage(full, minX, minY, cw, ch, 0, 0, cw, ch)
  return { src: c.toDataURL('image/png'), width: cw, height: ch }
}
