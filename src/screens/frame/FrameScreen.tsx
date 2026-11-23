import { useRef, useState, type KeyboardEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LAYOUTS, cellRects, type Layout, type LayoutId } from '@/lib/layouts'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/useApp'

const SAMPLES = [
  '/brand/sample-wink.jpg',
  '/brand/sample-cheeks.jpg',
  '/brand/sample-vsign.jpg',
  '/brand/sample-hug.jpg',
]

const PREVIEW_HEIGHT = 320

/** One selectable card. The 2x4 layout appears twice: shots repeated, or eight different shots. */
type Option = {
  key: string
  layoutId: LayoutId
  eight: boolean
  name: string
  hint: string
}

const OPTIONS: Option[] = [
  { key: '1x4', layoutId: '1x4', eight: false, name: '4컷', hint: '세로로 긴 한 장' },
  { key: '2x3', layoutId: '2x3', eight: false, name: '6컷', hint: '두 줄에 여섯 장' },
  { key: '2x4-4', layoutId: '2x4', eight: false, name: '4컷 두 장', hint: '똑같이 두 장, 나눠 갖기 좋아요' },
  { key: '2x4-8', layoutId: '2x4', eight: true, name: '8컷', hint: '두 줄에 여덟 장' },
]

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
  const guideSeen = useApp((s) => s.guideSeen)

  const initialKey = OPTIONS.find(
    (o) => o.layoutId === storedLayoutId && (o.layoutId !== '2x4' || o.eight === storedEight)
  )?.key
  const [selected, setSelected] = useState<string>(initialKey ?? OPTIONS[0].key)
  const radios = useRef<Record<string, HTMLButtonElement | null>>({})
  const reduce = useReducedMotion()

  const confirm = () => {
    const opt = OPTIONS.find((o) => o.key === selected) ?? OPTIONS[0]
    const nextEight = opt.layoutId === '2x4' && opt.eight
    // Setters clear the shots, so only call them when something changed.
    if (opt.layoutId !== storedLayoutId) setLayout(opt.layoutId)
    if (nextEight !== storedEight) setEightShotMode(nextEight)
    // New visitors see the guide once per session.
    goTo(guideSeen ? 'shoot' : 'guide')
  }

  const move = (key: string) => {
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
        <h1 className="text-3xl font-bold tracking-tight">몇 컷 찍을까요?</h1>
        <p id="frame-help" className="mt-2 text-base text-muted-foreground">
          고른 칸 수만큼 찍어요.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="프레임 종류"
        aria-describedby="frame-help"
        className="mx-auto mt-6 grid w-full max-w-[1120px] flex-1 grid-cols-4 gap-4 place-content-center"
      >
        {OPTIONS.map((opt, index) => {
          const layout = LAYOUTS[opt.layoutId]
          const isSelected = selected === opt.key
          return (
            <motion.div key={opt.key} {...enter(index * 0.06)}>
              <motion.button
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                ref={(el) => {
                  radios.current[opt.key] = el
                }}
                onClick={() => setSelected(opt.key)}
                onKeyDown={(e) => onRadioKeyDown(e, index)}
                whileHover={reduce ? undefined : { y: -4 }}
                animate={reduce ? undefined : { scale: isSelected ? 1 : 0.97 }}
                transition={{ duration: 0.2, ease: 'easeOut' as const }}
                className={cn(
                  'flex w-full cursor-pointer flex-col items-center gap-5 rounded-2xl bg-gray-2 px-4 pt-7 pb-6 outline-none',
                  'ring-1 ring-gray-6 transition-shadow hover:ring-gray-8',
                  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring',
                  isSelected && 'bg-card ring-2 ring-foreground hover:ring-foreground'
                )}
              >
                <FramePreview layout={layout} eightShotMode={opt.eight} />
                <span className="flex flex-col items-center gap-1">
                  <span className="text-lg font-semibold">{opt.name}</span>
                  <span className="text-sm text-muted-foreground">{opt.hint}</span>
                </span>
              </motion.button>
            </motion.div>
          )
        })}
      </div>

      <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between">
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
