import { useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LAYOUTS, cellRects, shotCount, type Layout, type LayoutId } from '@/lib/layouts'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/useApp'

const SAMPLES = [
  '/brand/sample-wink.jpg',
  '/brand/sample-cheeks.jpg',
  '/brand/sample-vsign.jpg',
  '/brand/sample-hug.jpg',
]

/** Four choices: 2x4 appears twice, once with 4 shots (two identical strips) and once with 8. */
type OptionKey = '1x4' | '2x3' | '2x4' | '2x4-8'
type Option = { key: OptionKey; layoutId: LayoutId; eight: boolean; label: string }

const OPTIONS: Option[] = [
  { key: '1x4', layoutId: '1x4', eight: false, label: '4컷' },
  { key: '2x3', layoutId: '2x3', eight: false, label: '6컷' },
  { key: '2x4', layoutId: '2x4', eight: false, label: '4컷 두 장' },
  { key: '2x4-8', layoutId: '2x4', eight: true, label: '8컷' },
]

const keyOf = (layoutId: LayoutId, eight: boolean): OptionKey =>
  layoutId === '2x4' && eight ? '2x4-8' : layoutId

type PreviewProps = {
  layout: Layout
  eightShotMode: boolean
  height: number | string
  /** schematic = small blocks instead of photos */
  schematic?: boolean
}

/** True-proportion frame. Cells are placed in percent so it scales with the box. */
function FramePreview({ layout, eightShotMode, height, schematic = false }: PreviewProps) {
  const rects = cellRects(layout, eightShotMode)
  return (
    <div
      aria-hidden
      className={cn(
        'relative shrink-0 overflow-hidden',
        schematic ? 'rounded-[2px] bg-card ring-1 ring-rule-2' : 'rounded-[4px] bg-card shadow-(--shadow-card)',
      )}
      style={{ height, aspectRatio: `${layout.width} / ${layout.height}` }}
    >
      {rects.map((r, i) => {
        const style = {
          left: `${(r.x / layout.width) * 100}%`,
          top: `${(r.y / layout.height) * 100}%`,
          width: `${(r.w / layout.width) * 100}%`,
          height: `${(r.h / layout.height) * 100}%`,
        }
        return schematic ? (
          <span key={i} className="absolute border border-card bg-rule-2" style={style} />
        ) : (
          <img
            key={i}
            src={SAMPLES[r.shotIndex % SAMPLES.length]}
            alt=""
            draggable={false}
            className="absolute object-cover"
            style={style}
          />
        )
      })}
      {!schematic && (
        <img
          src="/brand/wordmark.svg"
          alt=""
          width={687}
          height={195}
          className="absolute left-1/2 h-auto w-[30%] -translate-x-1/2"
          style={{ bottom: `${((layout.footer * 0.3) / layout.height) * 100}%` }}
        />
      )}
    </div>
  )
}

export default function FrameScreen() {
  const goTo = useApp((s) => s.goTo)
  const storedLayoutId = useApp((s) => s.layoutId)
  const storedEight = useApp((s) => s.eightShotMode)
  const setLayout = useApp((s) => s.setLayout)
  const setEightShotMode = useApp((s) => s.setEightShotMode)

  const [selected, setSelected] = useState<OptionKey>(keyOf(storedLayoutId as LayoutId, storedEight))
  const radios = useRef<Partial<Record<OptionKey, HTMLButtonElement | null>>>({})
  const reduce = useReducedMotion()

  const current = OPTIONS.find((o) => o.key === selected) ?? OPTIONS[0]
  const currentLayout = LAYOUTS[current.layoutId]

  const confirm = () => {
    const nextEight = current.layoutId === '2x4' && current.eight
    // Setters clear the shots, so only call them when something changed.
    if (current.layoutId !== storedLayoutId) setLayout(current.layoutId)
    if (nextEight !== storedEight) setEightShotMode(nextEight)
    goTo('shoot')
  }

  const move = (key: OptionKey) => {
    setSelected(key)
    radios.current[key]?.focus()
  }

  const onRadioKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = OPTIONS.length - 1
    let target: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = index === last ? 0 : index + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = index === 0 ? last : index - 1
    else if (e.key === 'Home') target = 0
    else if (e.key === 'End') target = last
    else if (e.key === 'Enter') {
      e.preventDefault()
      confirm()
      return
    }
    if (target !== null) {
      e.preventDefault()
      move(OPTIONS[target].key)
    }
  }

  return (
    <section className="grid gap-6 px-4 pb-6 lg:h-full lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-10 lg:px-8 lg:pb-8">
      {/* Hero: the chosen frame, big, filled with sample photos. */}
      <div className="relative grid h-[480px] min-w-0 place-items-center overflow-hidden rounded-(--radius-card) bg-paper-2 lg:h-full">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={current.key}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16 }}
            transition={{ duration: reduce ? 0.12 : 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="flex h-[86%] items-center"
          >
            <FramePreview layout={currentLayout} eightShotMode={current.eight} height="100%" />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex min-w-0 flex-col py-2 lg:min-h-0 lg:pt-6 lg:pb-0">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">몇 컷 찍을까요?</h1>

        <div
          role="radiogroup"
          aria-label="프레임 종류"
          className="mt-6 flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:p-1"
        >
          {OPTIONS.map((o, index) => {
            const layout = LAYOUTS[o.layoutId]
            const isSelected = selected === o.key
            const count = shotCount(layout, o.eight)
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                ref={(el) => {
                  radios.current[o.key] = el
                }}
                onClick={() => setSelected(o.key)}
                onKeyDown={(e) => onRadioKeyDown(e, index)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-4 rounded-(--radius-inner) px-4 py-3 text-left',
                  'transition-[background-color,box-shadow] duration-(--dur-short) ease-(--ease-out)',
                  'hover:bg-paper-2 active:bg-paper-3',
                  isSelected && 'bg-card shadow-[0_0_0_2px_var(--color-ink)] hover:bg-card',
                )}
              >
                <span className="grid h-14 w-12 shrink-0 place-items-center">
                  <FramePreview layout={layout} eightShotMode={o.eight} height={52} schematic />
                </span>
                <span className="min-w-0 flex-1 text-2xl font-extrabold tracking-tight text-ink tabular-nums">
                  {o.label}
                </span>
                <span className="sr-only">{count}장 촬영</span>
              </button>
            )
          })}
        </div>

        <div className="mt-8 flex shrink-0 items-center justify-between gap-3 lg:mt-6">
          <Button variant="ghost" size="lg" className="h-12 px-5 text-base" onClick={() => goTo('start')}>
            <ArrowLeft />
            뒤로
          </Button>
          <Button size="lg" className="h-12 px-8 text-base" onClick={confirm}>
            다음
            <ArrowRight />
          </Button>
        </div>
      </div>
    </section>
  )
}
