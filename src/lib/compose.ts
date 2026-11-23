/**
 * Final frame composition. Owned by decorate.
 * Consumers: decorate (live preview), save (PNG export, per-frame GIF/WebM).
 *
 * CONTRACT (stable; save depends on it)
 *
 *   composeLayout(shots, layout, decor, opts?): Promise<HTMLCanvasElement>
 *     shots   store.shots, (Shot | null)[]. null cells draw a gray placeholder.
 *             shot.image may be a dataURL/URL string or any drawable
 *             (HTMLImageElement, HTMLCanvasElement, ImageBitmap).
 *     layout  getLayout(store.layoutId)
 *     decor   store.decor
 *     opts.scale          default 1. Output is layout.width*scale x layout.height*scale.
 *     opts.eightShotMode  default false (only 2x4 reads it).
 *     opts.frameIndex     when set, draw shots[i].clip[frameIndex] (clamped to the
 *                         clip length) instead of shots[i].image. Shots without a
 *                         clip fall back to their still image.
 *     opts.stickers       default true. The decorate preview passes false and draws
 *                         stickers as DOM overlays; exports always keep the default.
 *     opts.date           Date used for the date stamp, default now.
 *
 *   composeFrame(frameImages, layout, decor, opts?): Promise<HTMLCanvasElement>
 *     One frame of a clip. frameImages[i] is the drawable (or URL) for shot i,
 *     indexed like store.shots (NOT per cell: in 2x4 without eightShotMode each
 *     shot fills two cells and is passed once). null = placeholder.
 *     Same opts as composeLayout except frameIndex.
 *
 * Every call returns a NEW canvas. Inputs are never mutated and nothing is
 * attached to the DOM. Images are loaded through a shared cache, and the frame
 * background is cached per (layout, scale, theme, color, bgImage), so composing
 * many GIF frames in a row is cheap.
 *
 * Draw order: background (bgImage > theme > frameColor), photos (cover-fit),
 * color filter per photo, footer (custom text, date, wordmark), stickers by z.
 * Footer text and the wordmark pick black or white per element for contrast
 * with whatever is under them.
 */
import { cellRects, type Layout } from '@/lib/layouts'
import { applyColorFilter } from '@/lib/filters'
import type { Decor, Shot, Sticker, ThemeId } from '@/store/useApp'

/* ------------------------------------------------------------------ types -- */

export type Drawable = HTMLImageElement | HTMLCanvasElement | ImageBitmap
export type ImageSource = Drawable | string

/** store Shot, or a looser shape where the still may already be a drawable. */
export type ComposeShot = Shot | { image: ImageSource; clip?: ImageSource[] }

export interface ComposeOptions {
  /** default 1; output = layout size * scale */
  scale?: number
  /** default false; only 2x4 reads it */
  eightShotMode?: boolean
  /** draw shots[i].clip[frameIndex] (clamped) instead of shots[i].image */
  frameIndex?: number
  /** default true; decorate preview passes false and draws stickers as DOM */
  stickers?: boolean
  /** date stamp date, default now */
  date?: Date
}

/* ------------------------------------------------------------- presets -- */

/** Frame color presets (data for the 프레임 tab). */
export const FRAME_COLORS: { value: string; label: string }[] = [
  { value: '#ffffff', label: '하양' },
  { value: '#f6efe4', label: '크림' },
  { value: '#1d1d1f', label: '검정' },
  { value: '#7b481e', label: '도토리' },
  { value: '#f7c6d3', label: '분홍' },
  { value: '#bfe0f5', label: '하늘' },
  { value: '#cdebd5', label: '민트' },
  { value: '#d9cff2', label: '라벤더' },
]

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'basic', label: '기본' },
  { id: 'forest', label: '도토리 숲' },
  { id: 'campus', label: '숭실대 캠퍼스' },
  { id: 'retro', label: '레트로 픽셀' },
]

const CHARACTER = '/brand/character.png'
const FACE = '/brand/face.png'
const WORDMARK = '/brand/wordmark.svg'
const WORDMARK_RATIO = 687 / 195
const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif'

/* -------------------------------------------------------------- images -- */

const imageCache = new Map<string, Promise<HTMLImageElement>>()

/** Load (and cache) an image from a dataURL or URL. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => {
        imageCache.delete(src)
        reject(new Error(`image failed to load: ${src.slice(0, 64)}`))
      }
      img.src = src
    })
    imageCache.set(src, p)
  }
  return p
}

async function toDrawable(source: ImageSource | null | undefined): Promise<Drawable | null> {
  if (!source) return null
  if (typeof source === 'string') {
    try {
      return await loadImage(source)
    } catch {
      return null
    }
  }
  return source
}

function sizeOf(img: Drawable) {
  if (img instanceof HTMLImageElement) return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height }
  return { w: img.width, h: img.height }
}

/** Draw `img` into rect so it covers it fully (center crop). */
export function drawCover(ctx: CanvasRenderingContext2D, img: Drawable, x: number, y: number, w: number, h: number) {
  const { w: iw, h: ih } = sizeOf(img)
  if (!iw || !ih) return
  const s = Math.max(w / iw, h / ih)
  const sw = w / s
  const sh = h / s
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h)
}

/* --------------------------------------------------------------- utils -- */

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function newCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/** Relative luminance (0..1) of a device-pixel rect, sampled sparsely. */
function luminanceAt(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const rx = Math.max(0, Math.floor(x))
  const ry = Math.max(0, Math.floor(y))
  const rw = Math.max(1, Math.min(ctx.canvas.width - rx, Math.ceil(w)))
  const rh = Math.max(1, Math.min(ctx.canvas.height - ry, Math.ceil(h)))
  const d = ctx.getImageData(rx, ry, rw, rh).data
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  let sum = 0
  let n = 0
  const step = 4 * Math.max(1, Math.floor((rw * rh) / 4000))
  for (let i = 0; i < d.length; i += step) {
    sum += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2])
    n++
  }
  return n ? sum / n : 1
}

/** Black or white, whichever has more contrast on a background of luminance L. */
function inkFor(L: number) {
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#111111' : '#ffffff'
}

/** Contrast color for a hex frame color (used by the decorate UI too). */
export function contrastInk(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#111111'
  const n = parseInt(m[1], 16)
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return inkFor(0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255))
}

const tintCache = new Map<string, HTMLCanvasElement>()
function tinted(img: HTMLImageElement, color: string, w: number, h: number) {
  const key = `${img.src}|${color}|${Math.round(w)}x${Math.round(h)}`
  let c = tintCache.get(key)
  if (!c) {
    c = newCanvas(w, h)
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0, c.width, c.height)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = color
    ctx.fillRect(0, 0, c.width, c.height)
    if (tintCache.size > 12) tintCache.clear()
    tintCache.set(key, c)
  }
  return c
}

/* --------------------------------------------------------- backgrounds -- */

function drawAcorn(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, angle: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  // nut
  ctx.fillStyle = '#b9773a'
  ctx.beginPath()
  ctx.ellipse(0, s * 0.18, s * 0.42, s * 0.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.beginPath()
  ctx.ellipse(-s * 0.15, s * 0.1, s * 0.08, s * 0.2, 0.3, 0, Math.PI * 2)
  ctx.fill()
  // cap
  ctx.fillStyle = '#6e3b23'
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.18, s * 0.52, s * 0.3, 0, Math.PI, Math.PI * 2)
  ctx.lineTo(s * 0.52, -s * 0.12)
  ctx.quadraticCurveTo(0, -s * 0.02, -s * 0.52, -s * 0.12)
  ctx.closePath()
  ctx.fill()
  // stem
  ctx.fillRect(-s * 0.05, -s * 0.62, s * 0.1, s * 0.18)
  ctx.restore()
}

function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, angle: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, -s)
  ctx.quadraticCurveTo(s * 0.6, 0, 0, s)
  ctx.quadraticCurveTo(-s * 0.6, 0, 0, -s)
  ctx.fill()
  ctx.restore()
}

function drawForest(ctx: CanvasRenderingContext2D, L: Layout) {
  const g = ctx.createLinearGradient(0, 0, 0, L.height)
  g.addColorStop(0, '#3d5e33')
  g.addColorStop(1, '#22381f')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, L.width, L.height)
  const rnd = mulberry32(7)
  const unit = L.width / 600
  const count = Math.round((L.width * L.height) / 9000)
  for (let i = 0; i < count; i++) {
    const x = rnd() * L.width
    const y = rnd() * L.height
    if (rnd() < 0.55) {
      drawLeaf(ctx, x, y, (10 + rnd() * 10) * unit, rnd() * Math.PI, rnd() < 0.5 ? '#5f8a4c' : '#4b7540')
    } else {
      drawAcorn(ctx, x, y, (18 + rnd() * 10) * unit, (rnd() - 0.5) * 0.9)
    }
  }
}

function drawCampus(ctx: CanvasRenderingContext2D, L: Layout) {
  const g = ctx.createLinearGradient(0, 0, 0, L.height)
  g.addColorStop(0, '#bfe0f7')
  g.addColorStop(1, '#eef7fe')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, L.width, L.height)
  const unit = L.width / 600
  const rnd = mulberry32(21)
  // clouds
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  const clouds = Math.round(L.height / 260) * (L.width > 600 ? 2 : 1)
  for (let i = 0; i < clouds; i++) {
    const cx = rnd() * L.width
    const cy = rnd() * (L.height - L.footer)
    const s = (22 + rnd() * 16) * unit
    ctx.beginPath()
    ctx.arc(cx, cy, s, 0, Math.PI * 2)
    ctx.arc(cx + s * 1.1, cy + s * 0.2, s * 0.8, 0, Math.PI * 2)
    ctx.arc(cx - s * 1.1, cy + s * 0.25, s * 0.7, 0, Math.PI * 2)
    ctx.fill()
  }
  // campus skyline along the bottom of the footer
  const base = L.height
  const blue = '#1f5a96'
  ctx.fillStyle = blue
  let x = 0
  while (x < L.width) {
    const bw = (50 + rnd() * 70) * unit
    const bh = L.footer * (0.18 + rnd() * 0.24)
    ctx.fillRect(x, base - bh, bw + 1, bh)
    // windows
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    const ws = 6 * unit
    for (let wy = base - bh + ws * 1.5; wy < base - ws * 2; wy += ws * 2.4) {
      for (let wx = x + ws * 1.2; wx < x + bw - ws * 1.2; wx += ws * 2.2) ctx.fillRect(wx, wy, ws, ws)
    }
    ctx.fillStyle = blue
    x += bw + 4 * unit
  }
  // clock tower in the middle
  const tw = 46 * unit
  const th = L.footer * 0.62
  const tx = L.width / 2 - tw / 2
  ctx.fillRect(tx, base - th, tw, th)
  ctx.beginPath()
  ctx.moveTo(tx - 6 * unit, base - th)
  ctx.lineTo(L.width / 2, base - th - 34 * unit)
  ctx.lineTo(tx + tw + 6 * unit, base - th)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(L.width / 2, base - th + 22 * unit, 12 * unit, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = blue
  ctx.lineWidth = 2.5 * unit
  ctx.beginPath()
  ctx.moveTo(L.width / 2, base - th + 22 * unit)
  ctx.lineTo(L.width / 2, base - th + 14 * unit)
  ctx.moveTo(L.width / 2, base - th + 22 * unit)
  ctx.lineTo(L.width / 2 + 6 * unit, base - th + 24 * unit)
  ctx.stroke()
}

const PIXEL_HEART = ['01100110', '11111111', '11111111', '01111110', '00111100', '00011000']
const PIXEL_STAR = ['00010000', '00111000', '11111110', '01111100', '01101100', '11000110']

function drawPixelArt(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, px: number, color: string) {
  ctx.fillStyle = color
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === '1') ctx.fillRect(x + c * px, y + r * px, px, px)
  })
}

function drawRetro(ctx: CanvasRenderingContext2D, L: Layout) {
  const unit = L.width / 600
  const cell = Math.round(20 * unit)
  for (let y = 0; y < L.height; y += cell) {
    for (let x = 0; x < L.width; x += cell) {
      ctx.fillStyle = ((x + y) / cell) % 2 === 0 ? '#fbe1ea' : '#f6cfdd'
      ctx.fillRect(x, y, cell, cell)
    }
  }
  // stepped pixel border
  const b = Math.round(8 * unit)
  ctx.fillStyle = '#5b3a8c'
  ctx.fillRect(0, 0, L.width, b)
  ctx.fillRect(0, L.height - b, L.width, b)
  ctx.fillRect(0, 0, b, L.height)
  ctx.fillRect(L.width - b, 0, b, L.height)
  const rnd = mulberry32(3)
  const count = Math.round((L.width * L.height) / 30000)
  const colors = ['#ff6f91', '#ffc75f', '#5b3a8c', '#4fb7a8']
  for (let i = 0; i < count; i++) {
    const art = rnd() < 0.5 ? PIXEL_HEART : PIXEL_STAR
    const px = Math.round((3 + rnd() * 2) * unit)
    drawPixelArt(ctx, art, Math.round(rnd() * L.width), Math.round(rnd() * L.height), px, colors[i % colors.length])
  }
}

/** Optional brand images at the left/right of the footer, per theme. */
async function footerSideArt(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  theme: string,
): Promise<number> {
  if (theme !== 'forest' && theme !== 'retro') return 0
  const size = L.footer * 0.62
  const margin = L.pad * 0.6
  const y = L.height - L.footer + (L.footer - size) / 2
  if (theme === 'forest') {
    const img = await toDrawable(CHARACTER)
    if (img) {
      ctx.drawImage(img, margin, y, size, size)
      ctx.save()
      ctx.translate(L.width - margin, y)
      ctx.scale(-1, 1)
      ctx.drawImage(img, 0, 0, size, size)
      ctx.restore()
    }
  } else {
    const img = await toDrawable(FACE)
    if (img) {
      // pixelate: draw tiny, then scale up without smoothing
      const tiny = newCanvas(28, 22)
      tiny.getContext('2d')!.drawImage(img, 0, 0, 28, 22)
      ctx.save()
      ctx.imageSmoothingEnabled = false
      const h = size * (22 / 28)
      ctx.drawImage(tiny, margin, y + (size - h) / 2, size, h)
      ctx.drawImage(tiny, L.width - margin - size, y + (size - h) / 2, size, h)
      ctx.restore()
    }
  }
  return size + margin
}

interface BgEntry {
  key: string
  canvas: HTMLCanvasElement
  sideInset: number
}
const bgCache: BgEntry[] = []

async function background(L: Layout, decor: Decor, scale: number): Promise<BgEntry> {
  const key = [L.id, L.width, L.height, scale, decor.theme, decor.frameColor, decor.bgImage ?? ''].join('|')
  const hit = bgCache.find((e) => e.key === key)
  if (hit) return hit
  const canvas = newCanvas(L.width * scale, L.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  let sideInset = 0
  const bg = decor.bgImage ? await toDrawable(decor.bgImage) : null
  if (bg) {
    drawCover(ctx, bg, 0, 0, L.width, L.height)
  } else if (decor.theme === 'forest') {
    drawForest(ctx, L)
  } else if (decor.theme === 'campus') {
    drawCampus(ctx, L)
  } else if (decor.theme === 'retro') {
    drawRetro(ctx, L)
  } else {
    ctx.fillStyle = decor.frameColor || '#ffffff'
    ctx.fillRect(0, 0, L.width, L.height)
  }
  if (!bg) sideInset = await footerSideArt(ctx, L, decor.theme)
  const entry = { key, canvas, sideInset }
  bgCache.unshift(entry)
  if (bgCache.length > 6) bgCache.pop()
  return entry
}

/* --------------------------------------------------------------- footer -- */

function formatDate(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}.${mm}.${dd}`
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

async function drawFooter(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  decor: Decor,
  scale: number,
  sideInset: number,
  date: Date,
) {
  const f = L.footer / 200
  const maxW = L.width - 2 * Math.max(L.pad, sideInset + L.pad * 0.4)
  const items: { h: number; draw: (y: number) => void | Promise<void> }[] = []

  const sample = (x: number, y: number, w: number, h: number) =>
    luminanceAt(ctx, x * scale, y * scale, w * scale, h * scale)

  const text = decor.text?.trim()
  if (text) {
    const size = 38 * f
    items.push({
      h: size * 1.2,
      draw: (y) => {
        ctx.font = `700 ${size}px ${FONT}`
        const t = fitText(ctx, text, maxW)
        const w = ctx.measureText(t).width
        ctx.fillStyle = inkFor(sample(L.width / 2 - w / 2, y, w, size * 1.2))
        ctx.fillText(t, L.width / 2, y + size * 0.6)
      },
    })
  }
  if (decor.dateOn) {
    const size = 24 * f
    items.push({
      h: size * 1.2,
      draw: (y) => {
        ctx.font = `500 ${size}px ${FONT}`
        const t = formatDate(date)
        const w = ctx.measureText(t).width
        ctx.fillStyle = inkFor(sample(L.width / 2 - w / 2, y, w, size * 1.2))
        ctx.fillText(t, L.width / 2, y + size * 0.6)
      },
    })
  }
  const wmH = 38 * f
  const wmW = wmH * WORDMARK_RATIO
  items.push({
    h: wmH,
    draw: async (y) => {
      const img = await toDrawable(WORDMARK)
      if (!(img instanceof HTMLImageElement)) return
      const x = L.width / 2 - wmW / 2
      const ink = inkFor(sample(x, y, wmW, wmH))
      // keep the brand brown on light backgrounds, white on dark ones
      if (ink === '#ffffff') ctx.drawImage(tinted(img, '#ffffff', wmW * scale, wmH * scale), x, y, wmW, wmH)
      else ctx.drawImage(img, x, y, wmW, wmH)
    },
  })

  const gap = 12 * f
  const total = items.reduce((s, it) => s + it.h, 0) + gap * (items.length - 1)
  let y = L.height - L.footer + (L.footer - total) / 2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const it of items) {
    await it.draw(y)
    y += it.h + gap
  }
}

/* ------------------------------------------------------------- stickers -- */

async function drawStickers(ctx: CanvasRenderingContext2D, stickers: Sticker[]) {
  const sorted = [...stickers].sort((a, b) => a.z - b.z)
  const imgs = await Promise.all(sorted.map((s) => toDrawable(s.src)))
  sorted.forEach((s, i) => {
    const img = imgs[i]
    if (!img) return
    const { w, h } = sizeOf(img)
    ctx.save()
    ctx.translate(s.x, s.y)
    ctx.rotate((s.rotation * Math.PI) / 180)
    ctx.drawImage(img, (-w * s.scale) / 2, (-h * s.scale) / 2, w * s.scale, h * s.scale)
    ctx.restore()
  })
}

/* ----------------------------------------------------------------- main -- */

export async function composeLayout(
  shots: ReadonlyArray<ComposeShot | null | undefined>,
  layout: Layout,
  decor: Decor,
  opts: ComposeOptions = {},
): Promise<HTMLCanvasElement> {
  const { scale = 1, eightShotMode = false, frameIndex, stickers = true, date = new Date() } = opts
  await document.fonts?.ready

  const bg = await background(layout, decor, scale)
  const canvas = newCanvas(layout.width * scale, layout.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bg.canvas, 0, 0)
  ctx.scale(scale, scale)
  ctx.imageSmoothingQuality = 'high'

  const rects = cellRects(layout, eightShotMode)
  const drawables = await Promise.all(
    rects.map((rect) => {
      const shot = shots[rect.shotIndex]
      let source: ImageSource | undefined = shot?.image
      if (shot && frameIndex !== undefined && shot.clip?.length) {
        source = shot.clip[Math.max(0, Math.min(frameIndex, shot.clip.length - 1))]
      }
      return toDrawable(source)
    }),
  )
  rects.forEach((rect, i) => {
    const img = drawables[i]
    if (img) {
      drawCover(ctx, img, rect.x, rect.y, rect.w, rect.h)
      applyColorFilter(ctx, rect.x * scale, rect.y * scale, rect.w * scale, rect.h * scale, decor.colorFilter)
    } else {
      ctx.fillStyle = '#e8e8ec'
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
    }
  })

  await drawFooter(ctx, layout, decor, scale, bg.sideInset, date)
  if (stickers && decor.stickers?.length) await drawStickers(ctx, decor.stickers)
  return canvas
}

export function composeFrame(
  frameImages: ReadonlyArray<ImageSource | null | undefined>,
  layout: Layout,
  decor: Decor,
  opts: Omit<ComposeOptions, 'frameIndex'> = {},
): Promise<HTMLCanvasElement> {
  const shots = frameImages.map((image) => (image ? { image } : null))
  return composeLayout(shots, layout, decor, opts)
}
