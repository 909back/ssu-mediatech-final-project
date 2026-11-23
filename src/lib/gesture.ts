/**
 * Hand gestures for the Shoot screen. Owned by the shoot stage.
 *
 *   const hands = await loadHandPose()            // ml5 handPose, cached
 *   const [hand] = await hands.detect(video)
 *   if (hand && isOpenPalm(hand)) ...             // open palm = next (start / decorate)
 *
 *   const hold = createHoldTracker(1000)          // must hold 1 s
 *   const { progress, fired } = hold.update(isOpenPalm(hand), performance.now())
 *
 * Finger checks compare distances from the wrist, so they work whatever way
 * the hand is turned: a straight finger's tip is farther from the wrist than
 * its middle joint (pip); a bent finger's tip is closer.
 */
import { loadMl5 } from '@/lib/ml5'
import type { Keypoint, Ml5Detector } from '@/lib/face'

/** One hand from ml5 handPose (21 named keypoints). */
export interface HandPrediction {
  keypoints: Keypoint[]
  confidence?: number
  handedness?: string
}

/* ------------------------------------------------------------- loading -- */

let handPosePromise: Promise<Ml5Detector<HandPrediction>> | null = null

/** Load the handPose model once and reuse it. Rejects on failure. */
export function loadHandPose(): Promise<Ml5Detector<HandPrediction>> {
  if (!handPosePromise) {
    handPosePromise = loadMl5()
      .then(
        (ml5: any) =>
          new Promise<Ml5Detector<HandPrediction>>((resolve, reject) => {
            const holder: { model?: Ml5Detector<HandPrediction> } = {}
            try {
              holder.model = ml5.handPose({ maxHands: 1, modelType: 'lite', flipped: false }, () =>
                resolve(holder.model!),
              )
            } catch (err) {
              reject(err)
            }
          }),
      )
      .catch((err: unknown) => {
        handPosePromise = null
        throw err
      })
  }
  return handPosePromise
}

/* -------------------------------------------------------- finger tests -- */

// Keypoint order of the MediaPipe hand model used by ml5.
const WRIST = 0
const FINGERS = {
  index: { pip: 6, tip: 8 },
  middle: { pip: 10, tip: 12 },
  ring: { pip: 14, tip: 16 },
  pinky: { pip: 18, tip: 20 },
}
type Finger = keyof typeof FINGERS

const dist = (a: Keypoint, b: Keypoint) => Math.hypot(a.x - b.x, a.y - b.y)

/** True when the finger is straight (tip clearly farther from the wrist than its middle joint). */
export function isFingerExtended(hand: HandPrediction, finger: Finger): boolean {
  const k = hand.keypoints
  const { pip, tip } = FINGERS[finger]
  return dist(k[tip], k[WRIST]) > dist(k[pip], k[WRIST]) * 1.15
}

/** True when the finger is bent toward the palm. */
export function isFingerCurled(hand: HandPrediction, finger: Finger): boolean {
  const k = hand.keypoints
  const { pip, tip } = FINGERS[finger]
  return dist(k[tip], k[WRIST]) < dist(k[pip], k[WRIST]) * 1.05
}

/** Hand size in pixels (wrist to middle-finger knuckle), used to scale thresholds. */
function palmSize(hand: HandPrediction): number {
  return dist(hand.keypoints[WRIST], hand.keypoints[9])
}

/**
 * V sign: index and middle straight and spread apart, ring and pinky bent.
 * The thumb is ignored (people hold it in many ways). Not a trigger any more
 * (people pose with V freely); kept for reference.
 */
export function isVSign(hand: HandPrediction): boolean {
  if (!hand?.keypoints || hand.keypoints.length < 21) return false
  const k = hand.keypoints
  const spread = dist(k[FINGERS.index.tip], k[FINGERS.middle.tip]) > palmSize(hand) * 0.35
  return (
    isFingerExtended(hand, 'index') &&
    isFingerExtended(hand, 'middle') &&
    isFingerCurled(hand, 'ring') &&
    isFingerCurled(hand, 'pinky') &&
    spread
  )
}

/** Open palm: all four fingers straight. */
export function isOpenPalm(hand: HandPrediction): boolean {
  if (!hand?.keypoints || hand.keypoints.length < 21) return false
  return (Object.keys(FINGERS) as Finger[]).every((f) => isFingerExtended(hand, f))
}

/* --------------------------------------------------------- hold timer -- */

export interface HoldTracker {
  /**
   * Call after every detection. `active` = gesture seen right now.
   * Returns progress 0..1 and `fired: true` once when the hold completes.
   */
  update(active: boolean, now: number): { progress: number; fired: boolean }
  /** Forget any hold in progress. */
  reset(): void
}

/**
 * Counts how long a gesture has been held.
 * @param holdMs   how long it must be held (1000 = 1 s)
 * @param graceMs  a missed detection shorter than this does not break the hold
 */
export function createHoldTracker(holdMs = 1000, graceMs = 300): HoldTracker {
  let start: number | null = null
  let lastSeen = 0

  return {
    update(active, now) {
      if (active) {
        if (start === null) start = now
        lastSeen = now
      } else if (start !== null && now - lastSeen > graceMs) {
        start = null
      }
      if (start === null) return { progress: 0, fired: false }
      const progress = Math.min(1, (now - start) / holdMs)
      if (progress >= 1) {
        start = null
        return { progress: 1, fired: true }
      }
      return { progress, fired: false }
    },
    reset() {
      start = null
    },
  }
}
