import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { RotateCw } from 'lucide-react'
import { loadImage } from '@/lib/compose'
import { cn } from '@/lib/utils'
import type { Layout } from '@/lib/layouts'
import type { Sticker } from '@/store/useApp'

interface Props {
  sticker: Sticker
  index: number
  layout: Layout
  /** display pixels per layout pixel */
  k: number
  selected: boolean
  /** 'image' = the visible picture (clipped to the frame); 'control' = hit area and handles */
  part: 'image' | 'control'
  dragging: boolean
  onDragChange: (dragging: boolean) => void
  onSelect: (id: string) => void
  onChange: (id: string, patch: Partial<Sticker>) => void
  /** page rect of the preview overlay, for handle math */
  getOrigin: () => DOMRect | undefined
}

type Gesture =
  | { kind: 'move'; px: number; py: number; x: number; y: number }
  | { kind: 'scale'; cx: number; cy: number; dist: number; scale: number }
  | { kind: 'rotate'; cx: number; cy: number; angle: number; rotation: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export default function StickerItem({
  sticker,
  index,
  layout,
  k,
  selected,
  part,
  dragging,
  onDragChange,
  onSelect,
  onChange,
  getOrigin,
}: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    let alive = true
    loadImage(sticker.src)
      .then((img) => alive && setSize({ w: img.naturalWidth, h: img.naturalHeight }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [sticker.src])

  if (!size) return null
  const w = size.w * sticker.scale * k
  const h = size.h * sticker.scale * k

  const center = () => {
    const o = getOrigin()
    return { cx: (o?.left ?? 0) + sticker.x * k, cy: (o?.top ?? 0) + sticker.y * k }
  }

  const begin = (e: ReactPointerEvent, g: Gesture) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    gesture.current = g
    onSelect(sticker.id)
    onDragChange(true)
  }

  const onMove = (e: ReactPointerEvent) => {
    const g = gesture.current
    if (!g) return
    if (g.kind === 'move') {
      onChange(sticker.id, {
        x: clamp(g.x + (e.clientX - g.px) / k, 0, layout.width),
        y: clamp(g.y + (e.clientY - g.py) / k, 0, layout.height),
      })
    } else if (g.kind === 'scale') {
      const dist = Math.hypot(e.clientX - g.cx, e.clientY - g.cy)
      const minScale = 32 / Math.max(size.w, size.h)
      const maxScale = (layout.width * 1.5) / Math.max(size.w, size.h)
      onChange(sticker.id, { scale: clamp((g.scale * dist) / Math.max(1, g.dist), minScale, maxScale) })
    } else {
      const angle = Math.atan2(e.clientY - g.cy, e.clientX - g.cx)
      let rotation = g.rotation + ((angle - g.angle) * 180) / Math.PI
      if (e.shiftKey) rotation = Math.round(rotation / 15) * 15
      onChange(sticker.id, { rotation: ((rotation % 360) + 360) % 360 })
    }
  }

  const end = () => {
    if (!gesture.current) return
    gesture.current = null
    onDragChange(false)
  }

  const startScale = (e: ReactPointerEvent) => {
    const { cx, cy } = center()
    begin(e, { kind: 'scale', cx, cy, dist: Math.hypot(e.clientX - cx, e.clientY - cy), scale: sticker.scale })
  }
  const startRotate = (e: ReactPointerEvent) => {
    const { cx, cy } = center()
    begin(e, { kind: 'rotate', cx, cy, angle: Math.atan2(e.clientY - cy, e.clientX - cx), rotation: sticker.rotation })
  }

  const frameStyle = {
    width: w,
    height: h,
    zIndex: sticker.z,
    transform: `translate(${sticker.x * k - w / 2}px, ${sticker.y * k - h / 2}px) rotate(${sticker.rotation}deg)`,
  }

  if (part === 'image') {
    return (
      <div className="pointer-events-none absolute top-0 left-0" style={frameStyle}>
        <motion.img
          src={sticker.src}
          alt=""
          draggable={false}
          className="size-full select-none"
          animate={{ scale: dragging && !reduceMotion ? 1.06 : 1, opacity: dragging ? 0.88 : 1 }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 32 }}
        />
      </div>
    )
  }

  return (
    <div className="absolute top-0 left-0" style={frameStyle}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`스티커 ${index + 1}`}
        aria-pressed={selected}
        onFocus={() => onSelect(sticker.id)}
        onPointerDown={(e) => begin(e, { kind: 'move', px: e.clientX, py: e.clientY, x: sticker.x, y: sticker.y })}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
        className={cn(
          'size-full cursor-grab touch-none rounded-sm select-none active:cursor-grabbing',
          selected && 'outline-2 outline-offset-2 outline-foreground outline-dashed',
        )}
      />
      {selected && (
        <>
          <span aria-hidden className="absolute -top-7 left-1/2 h-5 w-px -translate-x-1/2 bg-foreground" />
          <button
            type="button"
            aria-label="돌리기"
            title="돌리기 (Shift로 15도씩)"
            onPointerDown={startRotate}
            onPointerMove={onMove}
            onPointerUp={end}
            onPointerCancel={end}
            className="absolute -top-11 left-1/2 flex size-7 -translate-x-1/2 cursor-grab touch-none items-center justify-center rounded-full border border-foreground bg-background text-foreground shadow-sm"
          >
            <RotateCw className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="크기 조절"
            title="크기 조절"
            onPointerDown={startScale}
            onPointerMove={onMove}
            onPointerUp={end}
            onPointerCancel={end}
            className="absolute -right-3 -bottom-3 size-6 cursor-nwse-resize touch-none rounded-full border-2 border-foreground bg-background shadow-sm"
          />
        </>
      )}
    </div>
  )
}
