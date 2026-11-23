import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/store/useApp'

const ILLUSTRATION_SIZE = 360
const RETRY_MS = 2000

const STEPS = [
  { src: '/brand/guide/gesture-palm.png', alt: '손바닥을 편 다람쥐', text: '손바닥을 펴면 시작해요' },
]

/**
 * Shows a gray box while the file is missing and retries until it loads,
 * so the page picks up illustrations that are added after it mounted.
 */
function Illustration({ src, alt }: { src: string; alt: string }) {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!failed) return
    const t = window.setTimeout(() => {
      setFailed(false)
      setAttempt((n) => n + 1)
    }, RETRY_MS)
    return () => window.clearTimeout(t)
  }, [failed])

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-gray-3"
      style={{ width: ILLUSTRATION_SIZE, height: ILLUSTRATION_SIZE }}
    >
      {!failed && (
        <img
          key={attempt}
          src={attempt ? `${src}?r=${attempt}` : src}
          alt={alt}
          width={ILLUSTRATION_SIZE}
          height={ILLUSTRATION_SIZE}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false)
            setFailed(true)
          }}
          className="absolute inset-0 size-full object-contain transition-opacity duration-300 motion-reduce:transition-none"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      )}
    </div>
  )
}

export default function GuideScreen() {
  const goTo = useApp((s) => s.goTo)
  const setGuideSeen = useApp((s) => s.setGuideSeen)
  const reduce = useReducedMotion()
  const startRef = useRef<HTMLButtonElement>(null)

  const leave = useCallback(
    (to: 'frame' | 'shoot') => {
      setGuideSeen(true)
      goTo(to)
    },
    [goTo, setGuideSeen]
  )

  useEffect(() => {
    startRef.current?.focus({ preventScroll: true })
  }, [])

  // Space starts shooting, unless another control has focus (Space activates that control).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && t !== startRef.current && t.closest('button, a, input, textarea, select, [role="button"]')) return
      e.preventDefault()
      leave('shoot')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leave])

  const enter = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.4, delay, ease: 'easeOut' as const },
        }

  return (
    <section aria-labelledby="guide-title" className="flex h-full flex-col px-12 pt-8 pb-8">
      <motion.div className="text-center" {...enter(0)}>
        <h1 id="guide-title" className="text-3xl font-bold tracking-tight">
          손으로 찍어요
        </h1>
      </motion.div>

      <ol className="mx-auto flex w-full max-w-[1120px] flex-1 items-center justify-center gap-16">
        {STEPS.map((step, i) => (
          <motion.li key={step.src} className="flex flex-col items-center gap-5" {...enter(0.08 + i * 0.08)}>
            <Illustration src={step.src} alt={step.alt} />
            <p className="text-2xl font-semibold">{step.text}</p>
          </motion.li>
        ))}
      </ol>

      <motion.p className="text-center text-base text-muted-foreground" {...enter(0.24)}>
        손바닥 대신 버튼이나 스페이스 바로 찍어도 돼요.
      </motion.p>

      <div className="mx-auto mt-6 flex w-full max-w-[1120px] items-center justify-between">
        <Button variant="ghost" size="lg" className="h-12 px-5 text-base" onClick={() => leave('frame')}>
          <ArrowLeft />
          뒤로
        </Button>
        <Button ref={startRef} size="lg" className="h-12 px-8 text-base" onClick={() => leave('shoot')}>
          <Camera />
          촬영하러 가기
        </Button>
      </div>
    </section>
  )
}
