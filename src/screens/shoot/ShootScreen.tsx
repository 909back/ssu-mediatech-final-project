/**
 * Shoot screen (docs/user-flow.md, 3. Shoot and 3b. Review). Owned by the shoot stage.
 *
 * Left: live mirrored preview (p5) with face filters and gesture control.
 * Right: the chosen frame, filling cell by cell, plus the main button.
 *
 * Triggers: "촬영 시작" button, Space, or a V sign held 1 s.
 * One trigger shoots every empty cell in a row: 3-2-1, flash, capture, repeat.
 * When all cells are filled the screen is in review: click a cell to retake it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { animate } from 'motion'
import { motion, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Camera,
  Dog,
  Glasses,
  Heart,
  LoaderCircle,
  VideoOff,
} from 'lucide-react'
import P5Canvas from '@/components/P5Canvas'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCamera } from '@/hooks/useCamera'
import type { FaceFilterId } from '@/lib/face'
import { createHoldTracker, isOpenPalm, isVSign, type HandPrediction } from '@/lib/gesture'
import { cellAspect, cellRects } from '@/lib/layouts'
import { prefersReducedMotion } from '@/lib/motion'
import {
  selectAllShotsTaken,
  selectLayout,
  selectNextEmptyIndex,
  useApp,
  type CameraStatus,
} from '@/store/useApp'
import { ClipBuffer, captureStill } from './capture'
import FramePanel from './FramePanel'
import GestureControl from './GestureControl'
import { previewSketch, sketchCanvas, type FaceSample, type PreviewProps } from './previewSketch'
import { useDetection } from './useDetection'
import type p5 from 'p5'

const COUNTDOWN = [3, 2, 1]
const GESTURE_COOLDOWN_MS = 3000
const PAUSE_AFTER_SHOT_MS = 700

const FILTERS: { id: FaceFilterId; label: string; Icon: typeof Dog }[] = [
  { id: 'none', label: '없음', Icon: Ban },
  { id: 'dog', label: '강아지', Icon: Dog },
  { id: 'glasses', label: '안경', Icon: Glasses },
  { id: 'blush', label: '볼터치', Icon: Heart },
]

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Fit a box of `aspect` (w/h) inside `box`. */
function fit(box: { w: number; h: number }, aspect: number) {
  if (box.w <= 0 || box.h <= 0) return { w: 0, h: 0 }
  const w = Math.min(box.w, box.h * aspect)
  return { w: Math.floor(w), h: Math.floor(w / aspect) }
}

/**
 * After a mouse click on a toolbar control, drop focus so the next Space
 * press shoots instead of pressing that control again. Keyboard users keep focus.
 */
const blurAfterPointer = () => (document.activeElement as HTMLElement | null)?.blur()

/** Elements where Space already means "press me"; leave Space alone there. */
function isInteractive(el: EventTarget | null) {
  return (
    el instanceof HTMLElement &&
    !!el.closest('button, input, textarea, select, a[href], [role="switch"], [role="radio"], [contenteditable="true"]')
  )
}

export default function ShootScreen() {
  const layout = useApp(selectLayout)
  const eightShotMode = useApp((s) => s.eightShotMode)
  const shots = useApp((s) => s.shots)
  const faceFilter = useApp((s) => s.faceFilter)
  const gestureEnabled = useApp((s) => s.gestureEnabled)
  const setFaceFilter = useApp((s) => s.setFaceFilter)
  const setGestureEnabled = useApp((s) => s.setGestureEnabled)
  const goTo = useApp((s) => s.goTo)
  const allTaken = useApp(selectAllShotsTaken)
  const nextIndex = useApp(selectNextEmptyIndex)

  const { videoRef, videoEl, status: cameraStatus, retry } = useCamera()
  const cameraReady = cameraStatus === 'ready'

  // --- session state ---
  const [shooting, setShooting] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [selectedCell, setSelectedCell] = useState<number | null>(null)
  const [confirmBack, setConfirmBack] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const [cooling, setCooling] = useState(false)
  const session = useRef<{ cancelled: boolean } | null>(null)
  const cooldownUntil = useRef(0)
  const review = allTaken && !shooting

  // --- p5 + clip ---
  const p5Ref = useRef<p5 | null>(null)
  const clip = useMemo(() => new ClipBuffer(), [])
  const faceRef = useRef<FaceSample | null>(null)
  const fpsRef = useRef(0)
  const flashRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  // --- preview size: biggest cell-shaped box that fits the left column ---
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setStage({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const aspect = cellAspect(layout, eightShotMode)
  const preview = fit(stage, aspect)
  const cell = cellRects(layout, eightShotMode)[0]

  // --- gesture hold + cooldown ---
  const hold = useMemo(() => createHoldTracker(1000), [])
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const resetHold = useCallback(() => {
    hold.reset()
    setHoldProgress(0)
  }, [hold])
  /** Ignore gestures for GESTURE_COOLDOWN_MS (shows "잠시 쉬는 중"). */
  const startCooldown = useCallback(() => {
    cooldownUntil.current = performance.now() + GESTURE_COOLDOWN_MS
    setCooling(true)
    clearTimeout(cooldownTimer.current)
    cooldownTimer.current = setTimeout(() => setCooling(false), GESTURE_COOLDOWN_MS)
  }, [])
  useEffect(() => () => clearTimeout(cooldownTimer.current), [])

  // --- shooting ---
  const flash = useCallback(() => {
    const el = flashRef.current
    if (!el) return
    if (prefersReducedMotion()) animate(el, { opacity: [0.5, 0] }, { duration: 0.15 })
    else animate(el, { opacity: [1, 0] }, { duration: 0.45, ease: 'easeOut' })
  }, [])

  /** Shoot every empty cell in order. Safe to call twice; the second call is ignored. */
  const runSession = useCallback(async () => {
    if (session.current) return
    const token = { cancelled: false }
    session.current = token
    setShooting(true)
    setSelectedCell(null)
    resetHold()
    try {
      for (;;) {
        const index = selectNextEmptyIndex(useApp.getState())
        if (index < 0) break
        for (const n of COUNTDOWN) {
          setCount(n)
          await wait(1000)
          if (token.cancelled) return
        }
        setCount(null)
        const instance = p5Ref.current
        if (!instance) break
        const canvas = sketchCanvas(instance)
        const image = captureStill(canvas, cell.w, cell.h)
        const frames = clip.snapshot()
        useApp.getState().setShot(index, { image, clip: frames })
        flash()
        await wait(PAUSE_AFTER_SHOT_MS)
        if (token.cancelled) return
      }
    } catch (err) {
      console.error('[shoot] capture failed', err)
      toast.error('사진을 찍지 못했어요. 다시 눌러 주세요.')
    } finally {
      if (session.current === token) session.current = null
      setShooting(false)
      setCount(null)
      resetHold()
      startCooldown()
    }
  }, [cell.w, cell.h, clip, flash, resetHold, startCooldown])

  // Stop a running session when leaving the screen.
  useEffect(
    () => () => {
      if (session.current) session.current.cancelled = true
    },
    [],
  )

  const canShoot = cameraReady && !shooting && !allTaken

  const retakeCell = useCallback(
    (shotIndex: number) => {
      useApp.getState().retake(shotIndex)
      setSelectedCell(null)
      runSession()
    },
    [runSession],
  )

  // Space bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || confirmBack || isInteractive(e.target)) return
      e.preventDefault()
      if (canShoot) runSession()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canShoot, confirmBack, runSession])

  // --- gestures ---
  const onHand = useCallback(
    (hand: HandPrediction | null) => {
      const now = performance.now()
      if (session.current || now < cooldownUntil.current) {
        resetHold()
        return
      }
      const inReview = selectAllShotsTaken(useApp.getState())
      const active = !!hand && (inReview ? isOpenPalm(hand) : isVSign(hand))
      const { progress, fired } = hold.update(active, now)
      setHoldProgress(fired ? 0 : progress)
      if (!fired) return
      startCooldown()
      if (inReview) goTo('decorate')
      else runSession()
    },
    [hold, resetHold, startCooldown, goTo, runSession],
  )

  const onFace = useCallback((face: { keypoints: FaceSample['keypoints'] } | null) => {
    faceRef.current = face ? { keypoints: face.keypoints, at: performance.now() } : null
  }, [])

  const onModelError = useCallback(
    (model: 'face' | 'hand', err: unknown) => {
      console.warn(`[shoot] ${model} model failed`, err)
      if (model === 'face') {
        setFaceFilter('none')
        toast.warning('얼굴 필터를 불러오지 못했어요', {
          description: '필터 없이 계속 찍을 수 있어요.',
        })
      } else {
        toast.warning('손 제스처를 불러오지 못했어요', {
          description: '촬영 버튼이나 스페이스 바로 찍어 주세요.',
        })
      }
    },
    [setFaceFilter],
  )

  const handNeeded = cameraReady && gestureEnabled && !shooting && !cooling
  const { faceStatus, handStatus } = useDetection({
    videoRef: videoEl,
    fpsRef,
    faceNeeded: cameraReady && faceFilter !== 'none',
    handNeeded,
    onFace,
    onHand,
    onError: onModelError,
  })

  // --- back ---
  const anyTaken = shots.some(Boolean)
  const leave = () => {
    if (session.current) session.current.cancelled = true
    useApp.getState().clearShots()
    goTo('frame')
  }
  const onBack = () => (anyTaken || shooting ? setConfirmBack(true) : leave())

  const taken = shots.filter(Boolean).length
  const previewProps: PreviewProps = {
    videoRef: videoEl,
    width: preview.w,
    height: preview.h,
    filter: faceFilter,
    faceRef,
    clip,
    fpsRef,
  }

  return (
    <section className="flex h-full gap-6 p-6">
      {/* Hidden source video for p5 and ml5 (kept in layout so Chrome keeps decoding). */}
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 size-px opacity-0"
      />

      {/* Left: live preview */}
      <div ref={stageRef} className="relative grid min-w-0 flex-1 place-items-center">
        <div
          className="relative overflow-hidden rounded-xl bg-gray-12 shadow-md"
          style={{ width: preview.w, height: preview.h }}
        >
          {preview.w > 0 && (
            <P5Canvas<PreviewProps>
              sketch={previewSketch}
              className="absolute inset-0"
              onReady={(p) => {
                p5Ref.current = p
              }}
              {...previewProps}
            />
          )}

          {!cameraReady && <CameraState status={cameraStatus} onRetry={retry} />}

          {/* Gesture control, top right */}
          <div className="absolute top-4 right-4" onPointerUp={blurAfterPointer}>
            <GestureControl
              enabled={gestureEnabled}
              onEnabledChange={(on) => {
                resetHold()
                setGestureEnabled(on)
              }}
              progress={handNeeded ? holdProgress : 0}
              status={handStatus}
              hint={review ? '손바닥 펴고 1초' : 'V 포즈 1초'}
              paused={shooting || cooling}
            />
          </div>

          {/* Countdown */}
          {count !== null && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <motion.span
                key={count}
                className="text-[11rem] leading-none font-bold text-gray-1 tabular-nums drop-shadow-lg"
                initial={reduceMotion ? false : { scale: 1.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                aria-live="assertive"
              >
                {count}
              </motion.span>
            </div>
          )}

          {/* Shutter flash */}
          <div ref={flashRef} className="pointer-events-none absolute inset-0 bg-background opacity-0" />

          {/* Face filter toolbar, bottom center */}
          <div
            className="absolute inset-x-0 bottom-4 flex justify-center"
            onPointerUp={blurAfterPointer}
          >
            <ToggleGroup
              type="single"
              value={faceFilter}
              onValueChange={(v) => v && setFaceFilter(v as FaceFilterId)}
              aria-label="얼굴 필터"
              spacing={1}
              className="rounded-full bg-background/90 p-1 shadow-sm backdrop-blur"
            >
              {FILTERS.map(({ id, label, Icon }) => (
                <ToggleGroupItem
                  key={id}
                  value={id}
                  className="rounded-full px-3 data-[state=on]:bg-gray-12 data-[state=on]:text-gray-1"
                >
                  {faceFilter === id && id !== 'none' && faceStatus === 'loading' ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Icon />
                  )}
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </div>

      {/* Right: frame + actions */}
      <aside className="flex w-80 shrink-0 flex-col gap-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
            <ArrowLeft />
            뒤로
          </Button>
          <span className="text-sm text-gray-11 tabular-nums" aria-live="polite">
            {taken}/{shots.length}컷
          </span>
        </div>

        <div className="space-y-1">
          <h1 className="text-xl font-bold text-gray-12">
            {review ? '다 찍었어요' : shooting ? '찍는 중이에요' : '포즈를 준비해요'}
          </h1>
          <p className="text-sm text-gray-11">
            {review
              ? '다시 찍고 싶은 칸을 눌러 보세요.'
              : '버튼, 스페이스 바, V 포즈 중 편한 걸로 시작해요.'}
          </p>
        </div>

        <div className="grid min-h-0 flex-1 place-items-center">
          <FramePanel
            layout={layout}
            eightShotMode={eightShotMode}
            shots={shots}
            nextIndex={nextIndex}
            review={review}
            selectedCell={selectedCell}
            onSelectCell={setSelectedCell}
            onRetake={retakeCell}
            maxWidth={320}
            maxHeight={470}
          />
        </div>

        {review ? (
          <Button size="lg" className="h-12 text-base" onClick={() => goTo('decorate')}>
            꾸미러 가기
            <ArrowRight />
          </Button>
        ) : (
          <Button
            size="lg"
            className="h-12 text-base"
            disabled={!canShoot}
            onClick={() => runSession()}
          >
            {shooting ? <LoaderCircle className="animate-spin" /> : <Camera />}
            {shooting ? '찍는 중' : '촬영 시작'}
            {!shooting && (
              <kbd className="ml-1 rounded border border-current/30 px-1.5 text-xs font-normal opacity-80">
                Space
              </kbd>
            )}
          </Button>
        )}
      </aside>

      <Dialog open={confirmBack} onOpenChange={setConfirmBack}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>프레임 고르기로 돌아갈까요?</DialogTitle>
            <DialogDescription>지금까지 찍은 사진은 지워져요.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">계속 찍기</Button>
            </DialogClose>
            <Button variant="destructive" onClick={leave}>
              지우고 돌아가기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

const CAMERA_MESSAGES: Record<CameraStatus, string> = {
  idle: '카메라를 켜는 중이에요',
  requesting: '카메라를 켜는 중이에요',
  ready: '',
  denied: '카메라 권한이 막혀 있어요. 주소창 옆 카메라 아이콘에서 허용해 주세요.',
  notfound: '카메라를 찾지 못했어요. 연결을 확인해 주세요.',
  error: '카메라를 켜지 못했어요. 다른 앱이 쓰고 있는지 확인해 주세요.',
}

function CameraState({ status, onRetry }: { status: CameraStatus; onRetry: () => void }) {
  const waiting = status === 'idle' || status === 'requesting'
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-gray-12 p-8 text-center text-gray-1">
      {waiting ? <LoaderCircle className="size-8 animate-spin" /> : <VideoOff className="size-8" />}
      <p className="max-w-sm text-base">{CAMERA_MESSAGES[status]}</p>
      {!waiting && (
        <Button variant="secondary" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  )
}
