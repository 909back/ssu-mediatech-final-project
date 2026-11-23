import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { composeLayout, type ComposeShot } from '@/lib/compose'
import type { Layout } from '@/lib/layouts'
import type { Decor, Sticker } from '@/store/useApp'
import StickerItem from './StickerItem'

interface Props {
  shots: (ComposeShot | null)[]
  layout: Layout
  eightShotMode: boolean
  decor: Decor
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChangeSticker: (id: string, patch: Partial<Sticker>) => void
}

/**
 * The composed frame (without stickers) on a canvas, with stickers as DOM
 * overlays on top so dragging never waits for a recompose.
 */
export default function DecoratePreview({
  shots,
  layout,
  eightShotMode,
  decor,
  selectedId,
  onSelect,
  onChangeSticker,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [ready, setReady] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const k = box.h && box.w ? Math.min(box.h / layout.height, box.w / layout.width) : 0
  const displayW = Math.round(layout.width * k)
  const displayH = Math.round(layout.height * k)

  // Everything except stickers drives a recompose.
  const { theme, frameColor, bgImage, colorFilter, dateOn, text } = decor
  useEffect(() => {
    if (!k) return
    let cancelled = false
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const timer = window.setTimeout(async () => {
      const out = await composeLayout(
        shots,
        layout,
        { theme, frameColor, bgImage, colorFilter, dateOn, text, stickers: [] },
        { scale: k * dpr, eightShotMode, stickers: false },
      )
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      canvas.width = out.width
      canvas.height = out.height
      canvas.getContext('2d')!.drawImage(out, 0, 0)
      setReady(true)
    }, 40)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [shots, layout, eightShotMode, theme, frameColor, bgImage, colorFilter, dateOn, text, k])

  const itemProps = (s: Sticker, i: number) => ({
    sticker: s,
    index: i,
    layout,
    k,
    selected: s.id === selectedId,
    dragging: s.id === draggingId,
    onDragChange: (on: boolean) => setDraggingId(on ? s.id : null),
    onSelect,
    onChange: onChangeSticker,
    getOrigin: () => overlayRef.current?.getBoundingClientRect(),
  })

  return (
    <div ref={boxRef} className="relative flex min-h-0 flex-1 items-center justify-center">
      <div
        className="relative shadow-[0_12px_40px_-12px_var(--gray-a6)] ring-1 ring-gray-a3"
        style={{ width: displayW, height: displayH }}
        onPointerDown={() => onSelect(null)}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full transition-opacity duration-200"
          style={{ opacity: ready ? 1 : 0 }}
          aria-label="꾸민 사진 미리보기"
          role="img"
        />
        <div className="absolute inset-0 overflow-hidden">
          {decor.stickers.map((s, i) => (
            <StickerItem key={s.id} part="image" {...itemProps(s, i)} />
          ))}
        </div>
        <div ref={overlayRef} className="absolute inset-0">
          {decor.stickers.map((s, i) => (
            <StickerItem key={s.id} part="control" {...itemProps(s, i)} />
          ))}
        </div>
      </div>
    </div>
  )
}
