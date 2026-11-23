import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, stagger } from 'motion'
import { Camera, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { startCamera } from '@/lib/camera'
import { loadMl5 } from '@/lib/ml5'
import { prefersReducedMotion } from '@/lib/motion'
import { useApp } from '@/store/useApp'
import StartError, { type StartErrorKind } from './StartError'

const CAMERA_ERRORS: Record<string, StartErrorKind> = { denied: 'denied', notfound: 'notfound', error: 'camera' }

export default function StartScreen() {
  const goTo = useApp((s) => s.goTo)
  const cameraStatus = useApp((s) => s.cameraStatus)

  const [loading, setLoading] = useState(false)
  const [modelFailed, setModelFailed] = useState(false)
  const [retrying, setRetrying] = useState(false)

  // Kept so the error view stays on screen (with a spinner) while a retry runs.
  const [lastKind, setLastKind] = useState<StartErrorKind>('camera')

  const mounted = useRef(true)
  const startRef = useRef<HTMLButtonElement>(null)
  const heroRef = useRef<HTMLImageElement>(null)
  const stripRef = useRef<HTMLImageElement>(null)
  const itemsRef = useRef<HTMLDivElement>(null)

  const busy = loading || cameraStatus === 'requesting'
  const errorKind: StartErrorKind | null =
    CAMERA_ERRORS[cameraStatus] ?? (modelFailed ? 'model' : null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Entrance: transform + opacity only, skipped for reduced motion.
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return
    if (!heroRef.current || !itemsRef.current || !stripRef.current) return
    const items = itemsRef.current.querySelectorAll('[data-enter]')
    const anims = [
      animate(heroRef.current, { opacity: [0, 1], y: [48, 0] }, { duration: 0.7, ease: [0.22, 1, 0.36, 1] }),
      animate(stripRef.current, { opacity: [0, 1], y: [-64, 0] }, { duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }),
      animate(items, { opacity: [0, 1], y: [16, 0] }, { duration: 0.5, delay: stagger(0.08, { startDelay: 0.15 }), ease: 'easeOut' }),
    ]
    return () => anims.forEach((a) => a.stop())
  }, [])

  // Enter works immediately for keyboard users.
  useEffect(() => {
    startRef.current?.focus({ preventScroll: true })
  }, [])

  const handleStart = useCallback(async () => {
    if (busy) return
    if (errorKind) setLastKind(errorKind)
    setRetrying(Boolean(errorKind))
    setModelFailed(false)
    setLoading(true)
    // Camera permission and the ml5 script load in parallel; the button shows progress meanwhile.
    const [stream, ml5] = await Promise.all([
      startCamera(),
      loadMl5().catch((err) => {
        console.warn('[start] ml5', err)
        return null
      }),
    ])
    if (!mounted.current) return
    setLoading(false)
    setRetrying(false)
    if (!stream) return // cameraStatus in the store drives the error view
    if (!ml5) {
      setLastKind('model')
      setModelFailed(true)
      return
    }
    goTo('frame')
  }, [busy, errorKind, goTo])

  const showError = errorKind && !busy
  const showRetrying = busy && retrying

  return (
    <section aria-label="시작" className="relative w-full overflow-hidden bg-background lg:h-full lg:min-h-[640px]">
      {/* The character with the strip it took, on the left. */}
      <div className="relative h-[440px] lg:absolute lg:inset-y-0 lg:left-0 lg:h-auto lg:w-[52%]">
        <img
          ref={heroRef}
          src="/brand/character.png"
          alt="도토리를 안고 웃는 다람쥐"
          width={1013}
          height={1024}
          className="pointer-events-none absolute bottom-0 left-[2%] h-[80%] max-h-[640px] w-auto max-w-none select-none"
          draggable={false}
        />
        <img
          ref={stripRef}
          src="/brand/sample-strip.png"
          alt="도토리 네컷 예시 사진"
          width={260}
          height={1024}
          className="absolute top-[8%] left-[66%] h-[74%] max-h-[560px] w-auto rotate-[4deg] rounded-[3px] shadow-(--shadow-card) select-none"
          draggable={false}
        />
      </div>

      <div
        ref={itemsRef}
        className="flex flex-col px-4 py-8 lg:absolute lg:inset-y-0 lg:right-[7%] lg:w-[44%] lg:max-w-[520px] lg:justify-center lg:p-0"
      >
        <h1 data-enter className="m-0 max-w-none">
          <img src="/brand/wordmark.svg" alt="도토리네컷" width={687} height={195} className="h-auto w-full max-w-[440px]" />
        </h1>
        <p data-enter className="mt-6 text-xl text-ink-2">
          웹캠으로 찍고, 꾸미고, 저장해요.
        </p>

        <div data-enter className="mt-10 flex flex-col justify-start lg:min-h-[210px]">
          {showError || showRetrying ? (
            <StartError kind={errorKind ?? lastKind} busy={showRetrying} onRetry={handleStart} />
          ) : (
            <>
              <Button
                ref={startRef}
                size="lg"
                aria-disabled={busy}
                aria-busy={busy}
                onClick={handleStart}
                className="h-16 w-fit rounded-full px-12 text-xl font-semibold"
              >
                {busy ? (
                  <Loader2 aria-hidden className="size-6 animate-spin" />
                ) : (
                  <Camera aria-hidden className="size-6" />
                )}
                {busy ? '카메라 준비 중' : '촬영 시작'}
              </Button>
              <p className="mt-5 flex items-center gap-2 text-[15px] text-ink-2">
                <Lock aria-hidden className="size-4 shrink-0" />
                사진은 이 브라우저에만 남고 어디에도 업로드되지 않아요.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
