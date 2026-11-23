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
import HandFeedback, { type HandView } from './HandFeedback'
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

/** Circle around the hand in preview pixels (same cover-crop + mirror as previewSketch). */
function handInPreview(
  hand: HandPrediction,
  video: HTMLVideoElement | null,
  box: { w: number; h: number },
): Pick<HandView, 'x' | 'y' | 'r'> | null {
  if (!video?.videoWidth || box.w <= 0) return null
  const s = Math.max(box.w / video.videoWidth, box.h / video.videoHeight)
  const ox = (box.w - video.videoWidth * s) / 2
  const oy = (box.h - video.videoHeight * s) / 2
  const xs = hand.keypoints.map((k) => box.w - (ox + k.x * s))
  const ys = hand.keypoints.map((k) => oy + k.y * s)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: Math.max(x1 - x0, y1 - y0) / 2 + 12 }
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
  const [handView, setHandView] = useState<HandView | null>(null)
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
  // --- frame sheet size: fits inside its panel with 16px padding on every side ---
  const panelRef = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setPanel({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const aspect = cellAspect(layout, eightShotMode)
  const preview = fit(stage, aspect)
  const previewRef = useRef(preview)
  useEffect(() => {
    previewRef.current = preview
  })
  const cell = cellRects(layout, eightShotMode)[0]

  // --- gesture hold + cooldown ---
  const hold = useMemo(() => createHoldTracker(1000), [])
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const resetHold = useCallback(() => {
    hold.reset()
    setHandView(null)
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
      const at = hand && !fired ? handInPreview(hand, videoEl.current, previewRef.current) : null
      setHandView(at && { ...at, active, progress })
      if (!fired) return
      startCooldown()
      if (inReview) goTo('decorate')
      else runSession()
    },
    [hold, resetHold, startCooldown, goTo, runSession, videoEl],
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

  // --- live gesture status on the preview (how-to lives on the guide page) ---
  let gestureStatus: string | null = null
  if (cameraReady && !shooting && gestureEnabled && handStatus !== 'error') {
    if (cooling) gestureStatus = '잠시만요'
    else if (handStatus === 'loading') gestureStatus = '손 인식 준비 중'
  }

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
    <section className="flex flex-col gap-6 px-4 pb-6 lg:h-full lg:px-8 lg:pb-8">
      <div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-8">
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
      <div ref={stageRef} className="relative grid aspect-[4/3] w-full min-w-0 shrink-0 place-items-center lg:aspect-auto lg:w-auto lg:flex-1">
        <div
          className="relative overflow-hidden rounded-(--radius-card) bg-stage shadow-(--shadow-card)"
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

          <HandFeedback
            status={gestureStatus}
            hand={handNeeded ? handView : null}
            hint={review ? '손바닥을 펴 보세요' : '브이를 만들어 보세요'}
          />

          {!cameraReady && <CameraState status={cameraStatus} onRetry={retry} />}

          {/* Gesture control, top right */}
          <div className="absolute top-2 right-2 z-20 lg:top-4 lg:right-4" onPointerUp={blurAfterPointer}>
            <GestureControl
              enabled={gestureEnabled}
              onEnabledChange={(on) => {
                resetHold()
                setGestureEnabled(on)
              }}
            />
          </div>

          {/* Countdown */}
          {count !== null && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <motion.span
                key={count}
                className="grid size-52 place-items-center rounded-full bg-paper text-[8.5rem] leading-none font-extrabold text-ink tabular-nums shadow-(--shadow-card)"
                initial={reduceMotion ? false : { scale: 1.35, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                aria-live="assertive"
              >
                {count}
              </motion.span>
            </div>
          )}

          {/* Shutter flash */}
          <div ref={flashRef} className="pointer-events-none absolute inset-0 bg-flash opacity-0" />

          {/* Face filter toolbar, bottom center */}
          <div
            className="absolute inset-x-0 bottom-4 z-20 flex justify-center px-2"
            onPointerUp={blurAfterPointer}
          >
            <ToggleGroup
              type="single"
              value={faceFilter}
              onValueChange={(v) => v && setFaceFilter(v as FaceFilterId)}
              aria-label="얼굴 필터"
              spacing={1}
              className="max-w-full overflow-x-auto rounded-full bg-card p-1 shadow-(--shadow-card)"
            >
              {FILTERS.map(({ id, label, Icon }) => (
                <ToggleGroupItem
                  key={id}
                  value={id}
                  className="h-10 rounded-full px-4 text-ink-2 hover:bg-paper-2 hover:text-ink data-[state=on]:bg-ink data-[state=on]:text-paper"
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
      <aside className="flex shrink-0 flex-col gap-4 lg:w-[340px]">
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => goTo('guide')}
            className="rounded-sm text-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline"
          >
            사용법
          </button>
          <span className="rounded-full bg-paper-2 px-3 py-1 text-sm font-semibold text-ink tabular-nums" aria-live="polite">
            {taken}/{shots.length}컷
          </span>
        </div>

        <div className="space-y-1">
          <h1 className="text-3xl leading-tight font-extrabold tracking-tight text-ink">
            {review ? '다 찍었어요' : shooting ? '찍는 중이에요' : '포즈를 준비해요'}
          </h1>
          {review && <p className="text-base text-ink-2">다시 찍고 싶은 칸을 눌러 보세요.</p>}
        </div>

        <div ref={panelRef} className="relative min-h-[480px] flex-1 overflow-hidden rounded-(--radius-card) bg-paper-2 lg:min-h-0">
          <div className="absolute inset-0 grid place-items-center">
          <FramePanel
            layout={layout}
            eightShotMode={eightShotMode}
            shots={shots}
            nextIndex={nextIndex}
            review={review}
            selectedCell={selectedCell}
            onSelectCell={setSelectedCell}
            onRetake={retakeCell}
            maxWidth={Math.max(0, Math.min(300, panel.w - 32))}
            maxHeight={Math.max(0, Math.min(430, panel.h - 32))}
          />
          </div>
        </div>

      </aside>
      </div>

      {/* Bottom action bar: same place on every screen. */}
      <div className="flex shrink-0 items-center justify-between gap-3">
        <Button variant="ghost" size="lg" className="h-12 px-5 text-base" onClick={onBack}>
          <ArrowLeft />
          뒤로
        </Button>
        {review ? (
            <Button size="lg" className="h-12 px-8 text-base" onClick={() => goTo('decorate')}>
              꾸미러 가기
              <ArrowRight />
            </Button>
          ) : (
            <Button
              size="lg"
              className="h-12 px-8 text-base"
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
      </div>

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
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-stage p-8 text-center text-stage-ink">
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
