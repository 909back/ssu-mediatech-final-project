import type { Layout } from '@/lib/layouts'
import type { Sticker } from '@/store/useApp'

export const BUILTIN_STICKERS = [
  { src: '/brand/character.png', label: '도토리 캐릭터' },
  { src: '/brand/face.png', label: '도토리 얼굴' },
]

export const SAMPLE_SHOTS = [
  '/brand/sample-cheeks.jpg',
  '/brand/sample-hug.jpg',
  '/brand/sample-vsign.jpg',
  '/brand/sample-wink.jpg',
]

/** A new sticker about a third of the frame wide, near the middle of the photos. */
export function makeSticker(
  src: string,
  natural: { width: number; height: number },
  layout: Layout,
  existing: Sticker[],
): Sticker {
  const target = layout.width * 0.32
  const scale = target / Math.max(natural.width, natural.height)
  const n = existing.length % 5
  const z = existing.reduce((m, s) => Math.max(m, s.z), 0) + 1
  return {
    id: crypto.randomUUID(),
    src,
    x: layout.width / 2 + (n - 2) * layout.width * 0.06,
    y: (layout.height - layout.footer) / 2 + (n - 2) * layout.width * 0.06,
    scale,
    rotation: 0,
    z,
  }
}

/** Move one sticker a step up (+1) or down (-1) in drawing order. Returns new stickers. */
export function restack(stickers: Sticker[], id: string, dir: 1 | -1): Sticker[] {
  const order = [...stickers].sort((a, b) => a.z - b.z)
  const i = order.findIndex((s) => s.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= order.length) return stickers
  ;[order[i], order[j]] = [order[j], order[i]]
  const zOf = new Map(order.map((s, k) => [s.id, k + 1]))
  return stickers.map((s) => ({ ...s, z: zOf.get(s.id)! }))
}
