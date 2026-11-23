/**
 * Color filters for the decorate stage. Owned by decorate.
 *
 * Filters are plain pixel operations on canvas ImageData, so the live preview,
 * the PNG export and every GIF/WebM frame look exactly the same (ctx.filter is
 * not used because its output differs between browsers).
 *
 *   COLOR_FILTERS                     list for the UI (id + Korean label)
 *   applyColorFilter(ctx, x, y, w, h, id)   filter a device-pixel rect in place
 *   filteredThumbnail(src, id, size)  dataURL thumbnail for the 필터 tab
 */

export type ColorFilterId = 'none' | 'mono' | 'warm' | 'film'

export const COLOR_FILTERS: { id: ColorFilterId; label: string }[] = [
  { id: 'none', label: '원본' },
  { id: 'mono', label: '흑백' },
  { id: 'warm', label: '웜톤' },
  { id: 'film', label: '필름' },
]

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Stable per-pixel noise in [-1, 1], so film grain does not flicker between renders. */
function grain(i: number) {
  let h = (i * 2654435761) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 2246822519) >>> 0
  h ^= h >>> 13
  return ((h & 0xffff) / 0xffff) * 2 - 1
}

function filterPixels(d: Uint8ClampedArray, id: ColorFilterId) {
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    if (id === 'mono') {
      // slight contrast boost so faces do not look flat
      const v = clamp((lum - 128) * 1.08 + 128)
      d[i] = v
      d[i + 1] = v
      d[i + 2] = v
    } else if (id === 'warm') {
      d[i] = clamp(r * 1.06 + 12)
      d[i + 1] = clamp(g * 1.01 + 4)
      d[i + 2] = clamp(b * 0.86)
    } else if (id === 'film') {
      // desaturate, lift blacks, soften highlights, cool shadows, add grain
      const s = 0.72
      let nr = lum + (r - lum) * s
      let ng = lum + (g - lum) * s
      let nb = lum + (b - lum) * s
      nr = 22 + nr * 0.86
      ng = 20 + ng * 0.88
      nb = 26 + nb * 0.8
      const shadow = 1 - lum / 255
      ng += shadow * 6
      nb += shadow * 10
      const n = grain(i >> 2) * 9
      d[i] = clamp(nr + n)
      d[i + 1] = clamp(ng + n)
      d[i + 2] = clamp(nb + n)
    }
  }
}

/** Apply a filter to a rect given in device pixels of ctx.canvas. */
export function applyColorFilter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  id: string | undefined,
) {
  if (!id || id === 'none' || !COLOR_FILTERS.some((f) => f.id === id)) return
  const rx = Math.max(0, Math.round(x))
  const ry = Math.max(0, Math.round(y))
  const rw = Math.min(ctx.canvas.width - rx, Math.round(w))
  const rh = Math.min(ctx.canvas.height - ry, Math.round(h))
  if (rw <= 0 || rh <= 0) return
  const img = ctx.getImageData(rx, ry, rw, rh)
  filterPixels(img.data, id as ColorFilterId)
  ctx.putImageData(img, rx, ry)
}

/** Square cover-cropped thumbnail of `img` with the filter applied. */
export function filteredThumbnail(img: CanvasImageSource & { width: number; height: number }, id: ColorFilterId, size = 96) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const s = Math.max(size / img.width, size / img.height)
  const sw = size / s
  const sh = size / s
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, size, size)
  applyColorFilter(ctx, 0, 0, size, size, id)
  return c.toDataURL('image/jpeg', 0.85)
}
