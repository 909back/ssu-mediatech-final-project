/**
 * Face filters for the Shoot screen. Owned by the shoot stage.
 *
 * How it works, in three steps:
 *   1. loadFaceMesh()  loads the ml5 faceMesh model once (lazy, cached).
 *   2. faceAnchors()   turns 468 raw landmarks into a few easy points
 *                      (eyes, nose, forehead, cheeks) in canvas pixels.
 *   3. drawFaceFilter() draws dog ears, glasses or blush with p5 shapes at
 *                      those points. Because it draws on the preview canvas,
 *                      the filter is baked into the captured photo and clip.
 *
 * lerpAnchors() smooths the points between detections so filters do not jitter.
 */
import type p5 from 'p5'
import { loadMl5 } from '@/lib/ml5'
import type { FaceFilter } from '@/store/useApp'

/** 'none' | 'dog' | 'glasses' | 'blush' (same as the store's FaceFilter). */
export type FaceFilterId = FaceFilter

/** One landmark from ml5 (pixels of the video it was detected on). */
export interface Keypoint {
  x: number
  y: number
  z?: number
  name?: string
}

/** Minimal shape of an ml5 1.x detector (faceMesh / handPose). */
export interface Ml5Detector<T> {
  detect(input: HTMLVideoElement): Promise<T[]>
}

export interface FacePrediction {
  keypoints: Keypoint[]
}

export interface Point {
  x: number
  y: number
}

/** Simple face points in canvas pixels. "left"/"right" = as seen on screen. */
export interface FaceAnchors {
  leftEye: Point
  rightEye: Point
  nose: Point
  forehead: Point
  leftCheek: Point
  rightCheek: Point
  /** Face width in canvas pixels (cheek edge to cheek edge). */
  size: number
  /** Head tilt in radians (0 = level). */
  angle: number
}

/** Maps a point in video pixels to canvas pixels (crop + mirror). */
export type MapPoint = (p: Keypoint) => Point

// faceMesh landmark indices (MediaPipe 468-point mesh).
const IDX = {
  eyeOuterA: 33,
  eyeInnerA: 133,
  eyeOuterB: 263,
  eyeInnerB: 362,
  noseTip: 1,
  forehead: 10,
  cheekA: 50,
  cheekB: 280,
  edgeA: 234,
  edgeB: 454,
}

/* ------------------------------------------------------------- loading -- */

let faceMeshPromise: Promise<Ml5Detector<FacePrediction>> | null = null

/**
 * Load the faceMesh model once and reuse it on every visit to Shoot.
 * Rejects if ml5 or the model fails to load (caller shows a toast).
 */
export function loadFaceMesh(): Promise<Ml5Detector<FacePrediction>> {
  if (!faceMeshPromise) {
    faceMeshPromise = loadMl5()
      .then(
        (ml5: any) =>
          new Promise<Ml5Detector<FacePrediction>>((resolve, reject) => {
            const holder: { model?: Ml5Detector<FacePrediction> } = {}
            try {
              holder.model = ml5.faceMesh(
                { maxFaces: 1, refineLandmarks: false, flipped: false },
                () => resolve(holder.model!),
              )
            } catch (err) {
              reject(err)
            }
          }),
      )
      .catch((err: unknown) => {
        faceMeshPromise = null // let a later visit retry
        throw err
      })
  }
  return faceMeshPromise
}

/* ------------------------------------------------------------- anchors -- */

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Turn raw landmarks into FaceAnchors in canvas pixels.
 * Returns null when the face data is incomplete.
 */
export function faceAnchors(keypoints: Keypoint[], map: MapPoint): FaceAnchors | null {
  if (!keypoints || keypoints.length < 455) return null
  const k = (i: number) => map(keypoints[i])

  const eyeA = mid(k(IDX.eyeOuterA), k(IDX.eyeInnerA))
  const eyeB = mid(k(IDX.eyeOuterB), k(IDX.eyeInnerB))
  const cheekA = k(IDX.cheekA)
  const cheekB = k(IDX.cheekB)
  // After mirroring, sort by x so "left" always means left on screen.
  const aIsLeft = eyeA.x < eyeB.x
  const leftEye = aIsLeft ? eyeA : eyeB
  const rightEye = aIsLeft ? eyeB : eyeA

  return {
    leftEye,
    rightEye,
    nose: k(IDX.noseTip),
    forehead: k(IDX.forehead),
    leftCheek: aIsLeft ? cheekA : cheekB,
    rightCheek: aIsLeft ? cheekB : cheekA,
    size: dist(k(IDX.edgeA), k(IDX.edgeB)),
    angle: Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x),
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpPoint = (a: Point, b: Point, t: number): Point => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
})

/**
 * Move `current` a fraction `t` (0..1) toward `target`. Call once per frame.
 * Small t = smoother but laggier. 0.35 feels right at 30 fps.
 */
export function lerpAnchors(
  current: FaceAnchors | null,
  target: FaceAnchors,
  t = 0.35,
): FaceAnchors {
  if (!current) return target
  // Jumped far (new face, or came back into view): snap instead of sliding.
  if (dist(current.nose, target.nose) > target.size) return target
  return {
    leftEye: lerpPoint(current.leftEye, target.leftEye, t),
    rightEye: lerpPoint(current.rightEye, target.rightEye, t),
    nose: lerpPoint(current.nose, target.nose, t),
    forehead: lerpPoint(current.forehead, target.forehead, t),
    leftCheek: lerpPoint(current.leftCheek, target.leftCheek, t),
    rightCheek: lerpPoint(current.rightCheek, target.rightCheek, t),
    size: lerp(current.size, target.size, t),
    angle: lerp(current.angle, target.angle, t),
  }
}

/* ------------------------------------------------------------- drawing -- */

/** Colors for the filters, read from the app's CSS tokens (see index.css). */
export interface FilterPalette {
  earOuter: string
  earInner: string
  nose: string
  frame: string
  blush: string
  white: string
}

/** Read colors from CSS variables once (call in p5 setup). */
export function readFilterPalette(el: Element = document.documentElement): FilterPalette {
  const css = getComputedStyle(el)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    earOuter: v('--brand-9', 'rgb(123,72,30)'),
    earInner: v('--brand-6', 'rgb(241,201,172)'),
    nose: v('--brand-12', 'rgb(65,50,40)'),
    frame: v('--gray-12', 'rgb(30,31,36)'),
    blush: v('--brand-8', 'rgb(225,155,101)'),
    white: v('--gray-1', 'rgb(252,252,253)'),
  }
}

/** Draw one filter at the given anchors. Does nothing for 'none'. */
export function drawFaceFilter(
  p: p5,
  filter: FaceFilterId,
  a: FaceAnchors,
  colors: FilterPalette,
) {
  if (filter === 'none') return
  p.push()
  if (filter === 'dog') drawDog(p, a, colors)
  else if (filter === 'glasses') drawGlasses(p, a, colors)
  else if (filter === 'blush') drawBlush(p, a, colors)
  p.pop()
}

/** Dog: two floppy ears on top of the head and a shiny round nose. */
function drawDog(p: p5, a: FaceAnchors, c: FilterPalette) {
  const s = a.size
  p.noStroke()

  // Ears, drawn in a frame rotated with the head.
  p.push()
  p.translate(a.forehead.x, a.forehead.y)
  p.rotate(a.angle)
  for (const side of [-1, 1]) {
    p.push()
    p.translate(side * s * 0.36, -s * 0.12)
    p.rotate(side * 0.45)
    p.fill(c.earOuter)
    p.ellipse(0, 0, s * 0.3, s * 0.52)
    p.fill(c.earInner)
    p.ellipse(0, s * 0.04, s * 0.16, s * 0.32)
    p.pop()
  }
  p.pop()

  // Nose.
  p.push()
  p.translate(a.nose.x, a.nose.y)
  p.rotate(a.angle)
  p.fill(c.nose)
  p.ellipse(0, 0, s * 0.2, s * 0.14)
  p.fill(c.white)
  p.ellipse(-s * 0.04, -s * 0.03, s * 0.05, s * 0.03)
  p.pop()
}

/** Glasses: two round lenses with a bridge, slightly tinted. */
function drawGlasses(p: p5, a: FaceAnchors, c: FilterPalette) {
  const s = a.size
  const eyeGap = Math.hypot(a.rightEye.x - a.leftEye.x, a.rightEye.y - a.leftEye.y)
  const r = Math.max(eyeGap * 0.42, s * 0.12)
  const center = mid(a.leftEye, a.rightEye)

  p.push()
  p.translate(center.x, center.y)
  p.rotate(a.angle)
  const half = eyeGap / 2

  // Lens tint (white, 25% opacity).
  const tint = p.color(c.white)
  tint.setAlpha(64)
  p.noStroke()
  p.fill(tint)
  p.circle(-half, 0, r * 2)
  p.circle(half, 0, r * 2)

  // Frame.
  p.noFill()
  p.stroke(c.frame)
  p.strokeWeight(Math.max(2, s * 0.03))
  p.circle(-half, 0, r * 2)
  p.circle(half, 0, r * 2)
  p.arc(0, 0, (half - r) * 2, (half - r) * 1.4, Math.PI, Math.PI * 2) // bridge
  p.line(-half - r, 0, -s * 0.5, -s * 0.04) // temples
  p.line(half + r, 0, s * 0.5, -s * 0.04)

  // Small shine on each lens.
  p.stroke(c.white)
  p.strokeWeight(Math.max(1.5, s * 0.018))
  for (const x of [-half, half]) p.arc(x, 0, r * 1.3, r * 1.3, Math.PI * 1.1, Math.PI * 1.45)
  p.pop()
}

/** Blush: soft round cheeks with three tiny strokes, manga style. */
function drawBlush(p: p5, a: FaceAnchors, c: FilterPalette) {
  const s = a.size
  for (const cheek of [a.leftCheek, a.rightCheek]) {
    p.push()
    p.translate(cheek.x, cheek.y + s * 0.02)
    p.rotate(a.angle)
    p.noStroke()
    // Stack a few transparent ellipses for a soft edge.
    for (let i = 0; i < 4; i++) {
      const col = p.color(c.blush)
      col.setAlpha(40 + i * 18)
      p.fill(col)
      const k = 1 - i * 0.18
      p.ellipse(0, 0, s * 0.26 * k, s * 0.15 * k)
    }
    const line = p.color(c.white)
    line.setAlpha(200)
    p.stroke(line)
    p.strokeWeight(Math.max(1.5, s * 0.014))
    for (const dx of [-0.06, 0, 0.06]) {
      p.line(dx * s + s * 0.02, -s * 0.025, dx * s - s * 0.02, s * 0.025)
    }
    p.pop()
  }
}
