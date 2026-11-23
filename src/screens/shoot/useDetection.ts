/**
 * Runs ml5 faceMesh and handPose on the camera video, throttled.
 * Owned by the shoot stage.
 *
 * - Models load lazily the first time they are needed, then stay cached
 *   (loading takes seconds; reopening Shoot should be instant).
 * - One loop runs the models one after another, never both at once.
 * - The loop watches the preview fps: below 22 fps it detects less often,
 *   above 27 fps it speeds back up. Face runs faster than hands because the
 *   filter must follow the face; a gesture only needs ~6 checks per second.
 * - Unmount stops the loop. Model load errors call onError once per model,
 *   and shooting with Space/button keeps working.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { loadFaceMesh, type FacePrediction, type Ml5Detector } from '@/lib/face'
import { loadHandPose, type HandPrediction } from '@/lib/gesture'

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface DetectionOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  fpsRef: { current: number }
  faceNeeded: boolean
  handNeeded: boolean
  onFace: (face: FacePrediction | null) => void
  onHand: (hand: HandPrediction | null) => void
  onError: (model: 'face' | 'hand', err: unknown) => void
}

// Gap between detections in ms: [fastest, slowest].
const FACE_GAP = [66, 300] as const
const HAND_GAP = [150, 500] as const
const LOW_FPS = 22
const HIGH_FPS = 27

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v))

export function useDetection(opts: DetectionOptions) {
  const latest = useRef(opts)
  useLayoutEffect(() => {
    latest.current = opts
  })

  const faceModel = useRef<Ml5Detector<FacePrediction> | null>(null)
  const handModel = useRef<Ml5Detector<HandPrediction> | null>(null)
  // Only set from async callbacks; "loading" is derived below.
  const [faceState, setFaceState] = useState<'idle' | 'ready' | 'error'>('idle')
  const [handState, setHandState] = useState<'idle' | 'ready' | 'error'>('idle')
  const faceLoading = useRef(false)
  const handLoading = useRef(false)

  // Lazy model loading. After a failure, the next time the model is needed it tries again.
  useEffect(() => {
    if (!opts.faceNeeded || faceModel.current || faceLoading.current) return
    faceLoading.current = true
    loadFaceMesh()
      .then((m) => {
        faceModel.current = m
        setFaceState('ready')
      })
      .catch((err) => {
        setFaceState('error')
        latest.current.onError('face', err)
      })
      .finally(() => {
        faceLoading.current = false
      })
  }, [opts.faceNeeded])

  useEffect(() => {
    if (!opts.handNeeded || handModel.current || handLoading.current) return
    handLoading.current = true
    loadHandPose()
      .then((m) => {
        handModel.current = m
        setHandState('ready')
      })
      .catch((err) => {
        setHandState('error')
        latest.current.onError('hand', err)
      })
      .finally(() => {
        handLoading.current = false
      })
  }, [opts.handNeeded])

  const status = (state: 'idle' | 'ready' | 'error', needed: boolean): ModelStatus =>
    state === 'idle' && needed ? 'loading' : state
  const faceStatus = status(faceState, opts.faceNeeded)
  const handStatus = status(handState, opts.handNeeded)

  // The detection loop.
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let faceGap: number = FACE_GAP[0]
    let handGap: number = HAND_GAP[0]
    let lastFace = 0
    let lastHand = 0

    const tick = async () => {
      if (stopped) return
      const o = latest.current
      const video = o.videoRef.current
      const fps = o.fpsRef.current

      if (fps > 0 && fps < LOW_FPS) {
        faceGap = clamp(faceGap * 1.2, FACE_GAP)
        handGap = clamp(handGap * 1.2, HAND_GAP)
      } else if (fps > HIGH_FPS) {
        faceGap = clamp(faceGap * 0.95, FACE_GAP)
        handGap = clamp(handGap * 0.95, HAND_GAP)
      }

      if (video && video.readyState >= 2 && video.videoWidth) {
        try {
          if (o.faceNeeded && faceModel.current && performance.now() - lastFace >= faceGap) {
            lastFace = performance.now()
            const [face] = await faceModel.current.detect(video)
            if (!stopped) latest.current.onFace(face ?? null)
          }
          const h = latest.current
          if (h.handNeeded && handModel.current && performance.now() - lastHand >= handGap) {
            lastHand = performance.now()
            const [hand] = await handModel.current.detect(video)
            if (!stopped) latest.current.onHand(hand ?? null)
          }
        } catch (err) {
          console.warn('[shoot] detection failed', err)
        }
      }
      if (!stopped) timer = setTimeout(tick, 16)
    }
    tick()

    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [])

  return { faceStatus, handStatus }
}
