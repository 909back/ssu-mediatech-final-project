import { useRef, useState, type KeyboardEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { LAYOUTS, LAYOUT_IDS, cellRects, shotCount, type Layout, type LayoutId } from '@/lib/layouts'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/useApp'

const SAMPLES = [
  '/brand/sample-wink.jpg',
  '/brand/sample-cheeks.jpg',
  '/brand/sample-vsign.jpg',
  '/brand/sample-hug.jpg',
]

const PREVIEW_HEIGHT = 340

/** True-proportion mini frame. Cells are placed in percent so it scales with the box. */
type PreviewProps = {
  layout: Layout
  eightShotMode: boolean
}

function FramePreview({ layout, eightShotMode }: PreviewProps) {
  const rects = cellRects(layout, eightShotMode)
  return (
    <div
      aria-hidden
      className="relative overflow-hidden rounded-[3px] bg-white shadow-md ring-1 ring-gray-a6"
      style={{ height: PREVIEW_HEIGHT, aspectRatio: `${layout.width} / ${layout.height}` }}
    >
      {rects.map((r, i) => (
        <img
          key={i}
          src={SAMPLES[r.shotIndex % SAMPLES.length]}
          alt=""
          draggable={false}
          className="absolute object-cover"
          style={{
            left: `${(r.x / layout.width) * 100}%`,
            top: `${(r.y / layout.height) * 100}%`,
            width: `${(r.w / layout.width) * 100}%`,
            height: `${(r.h / layout.height) * 100}%`,
          }}
        />
      ))}
    </div>
  )
}

export default function FrameScreen() {
  const goTo = useApp((s) => s.goTo)
  const storedLayoutId = useApp((s) => s.layoutId)
  const storedEight = useApp((s) => s.eightShotMode)
  const setLayout = useApp((s) => s.setLayout)
  const setEightShotMode = useApp((s) => s.setEightShotMode)

  const [selected, setSelected] = useState<LayoutId>(storedLayoutId as LayoutId)
  const [eight, setEight] = useState(storedEight)
  const radios = useRef<Partial<Record<LayoutId, HTMLButtonElement | null>>>({})
  const reduce = useReducedMotion()

  const confirm = () => {
    const nextEight = selected === '2x4' && eight
    // Setters clear the shots, so only call them when something changed.
    if (selected !== storedLayoutId) setLayout(selected)
    if (nextEight !== storedEight) setEightShotMode(nextEight)
    goTo('shoot')
  }

  const move = (id: LayoutId) => {
    setSelected(id)
    radios.current[id]?.focus()
  }

  const onRadioKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = LAYOUT_IDS.length - 1
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
      move(LAYOUT_IDS[target])
    }
  }

  const enter = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.35, delay, ease: 'easeOut' as const },
        }

  return (
    <section className="flex h-full flex-col px-12 pt-8 pb-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">프레임을 골라 주세요</h1>
        <p id="frame-help" className="mt-2 text-base text-muted-foreground">
          방향키로 옮기고 Enter로 정해요.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="프레임 종류"
        aria-describedby="frame-help"
        className="mx-auto mt-6 grid w-full max-w-[1080px] flex-1 grid-cols-3 gap-6 place-content-center"
      >
        {LAYOUT_IDS.map((id, index) => {
          const layout = LAYOUTS[id]
          const isSelected = selected === id
          const is24 = id === '2x4'
          const count = shotCount(layout, is24 && eight)
          return (
            <motion.div key={id} className="flex flex-col gap-3" {...enter(index * 0.06)}>
              <motion.button
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                ref={(el) => {
                  radios.current[id] = el
                }}
                onClick={() => setSelected(id)}
                onKeyDown={(e) => onRadioKeyDown(e, index)}
                whileHover={reduce ? undefined : { y: -4 }}
                animate={reduce ? undefined : { scale: isSelected ? 1 : 0.97 }}
                transition={{ duration: 0.2, ease: 'easeOut' as const }}
                className={cn(
                  'flex w-full cursor-pointer flex-col items-center gap-5 rounded-2xl bg-gray-2 px-6 pt-7 pb-6 outline-none',
                  'ring-1 ring-gray-6 transition-shadow hover:ring-gray-8',
                  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring',
                  isSelected && 'bg-card ring-2 ring-foreground hover:ring-foreground'
                )}
              >
                <FramePreview layout={layout} eightShotMode={is24 && eight} />
                <span className="flex flex-col items-center gap-1">
                  <span className="text-lg font-semibold">{layout.name}</span>
                  <span className="text-base text-muted-foreground">
                    {count}컷
                  </span>
                </span>
              </motion.button>

              <div className="flex h-8 items-center justify-center">
                {is24 && (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="eight-shot"
                      checked={eight}
                      onCheckedChange={(v: boolean) => {
                        setEight(v)
                        setSelected('2x4')
                      }}
                      className="data-[state=checked]:bg-foreground"
                    />
                    <Label htmlFor="eight-shot" className="cursor-pointer text-base">
                      8컷으로 찍기
                    </Label>
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between">
        <Button variant="ghost" size="lg" className="h-12 px-5 text-base" onClick={() => goTo('start')}>
          <ArrowLeft />
          뒤로
        </Button>
        <Button size="lg" className="h-12 px-8 text-base" onClick={confirm}>
          다음
          <ArrowRight />
        </Button>
      </div>
    </section>
  )
}
