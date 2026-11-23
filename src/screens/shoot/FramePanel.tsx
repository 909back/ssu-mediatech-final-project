import { motion, useReducedMotion } from 'motion/react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cellRects, type Layout } from '@/lib/layouts'
import type { Shot } from '@/store/useApp'
import { cn } from '@/lib/utils'

interface FramePanelProps {
  layout: Layout
  eightShotMode: boolean
  shots: (Shot | null)[]
  /** Shot index that the next photo goes into (-1 = all filled). */
  nextIndex: number
  /** Review mode: cells are clickable for retakes. */
  review: boolean
  /** Index into cellRects of the selected cell (review only). */
  selectedCell: number | null
  onSelectCell: (cell: number | null) => void
  onRetake: (shotIndex: number) => void
  /** Box the frame must fit in, in CSS pixels. */
  maxWidth: number
  maxHeight: number
}

/**
 * The chosen frame drawn at small scale. Cells fill as shots land; the next
 * empty cell has a dashed outline. In review, a click selects a cell and shows
 * "다시 찍기" for it.
 */
export default function FramePanel({
  layout,
  eightShotMode,
  shots,
  nextIndex,
  review,
  selectedCell,
  onSelectCell,
  onRetake,
  maxWidth,
  maxHeight,
}: FramePanelProps) {
  const reduceMotion = useReducedMotion()
  const scale = Math.min(maxWidth / layout.width, maxHeight / layout.height)
  const rects = cellRects(layout, eightShotMode)

  return (
    <div
      className="relative shrink-0 rounded-[4px] bg-card shadow-(--shadow-card)"
      style={{ width: layout.width * scale, height: layout.height * scale }}
    >
      {rects.map((r, cell) => {
        const shot = shots[r.shotIndex]
        const isNext = !review && r.shotIndex === nextIndex
        const selected = review && selectedCell === cell
        return (
          <div
            key={cell}
            className={cn(
              'absolute overflow-hidden rounded-[2px] bg-paper-3',
              isNext && 'outline-2 outline-offset-2 outline-ink outline-dashed',
              selected && 'outline-2 outline-offset-2 outline-ink',
            )}
            style={{ left: r.x * scale, top: r.y * scale, width: r.w * scale, height: r.h * scale }}
          >
            {shot && (
              <motion.img
                key={shot.image.length + ':' + shot.image.slice(-24)}
                src={shot.image}
                alt={`${r.shotIndex + 1}번째 사진`}
                className="size-full object-cover"
                initial={reduceMotion ? false : { opacity: 0, y: -16, scale: 1.06 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                draggable={false}
              />
            )}
            {!shot && (
              <span className="absolute inset-0 grid place-items-center text-sm font-semibold text-ink-3 tabular-nums">
                {r.shotIndex + 1}
              </span>
            )}
            {review && (
              <button
                type="button"
                aria-label={`${r.shotIndex + 1}번째 사진 선택`}
                aria-pressed={selected}
                className="absolute inset-0 cursor-pointer transition-colors hover:bg-ink/10 focus-visible:-outline-offset-2"
                onClick={() => onSelectCell(selected ? null : cell)}
              />
            )}
            {selected && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-ink/30">
                <Button
                  size="sm"
                  variant="secondary"
                  className="pointer-events-auto shadow-sm"
                  onClick={() => onRetake(r.shotIndex)}
                >
                  <RotateCcw />
                  다시 찍기
                </Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
