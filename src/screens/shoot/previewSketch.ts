/**
 * p5 sketch for the live, mirrored camera preview. Owned by the shoot stage.
 *
 * Every frame it:
 *   1. draws the camera, mirrored and center-cropped to the cell's aspect ratio
 *   2. draws the face filter on top (so it ends up in the photo)
 *   3. hands the finished frame to the ClipBuffer (motion clip for GIF/WebM)
 *
 * Detection itself runs outside the sketch (useDetection), which writes the
 * latest landmarks to `faceRef`. The sketch only smooths and draws them.
 */
import type p5 from 'p5'
import type { RefObject } from 'react'
import {
  drawFaceFilter,
  faceAnchors,
  lerpAnchors,
  readFilterPalette,
  type FaceAnchors,
  type FaceFilterId,
  type Keypoint,
} from '@/lib/face'
import type { Sketch } from '@/components/P5Canvas'
import type { ClipBuffer } from './capture'

/** Latest faceMesh result, written by the detection loop. */
export interface FaceSample {
  keypoints: Keypoint[]
  at: number // performance.now() of the detection
}

export type PreviewProps = {
  videoRef: RefObject<HTMLVideoElement | null>
  width: number
  height: number
  filter: FaceFilterId
  faceRef: RefObject<FaceSample | null>
  clip: ClipBuffer
  /** The sketch writes its measured frame rate here (used to throttle detection). */
  fpsRef: { current: number }
}

/** A face older than this is treated as gone (filter hides). */
const FACE_TIMEOUT_MS = 600

/** The <canvas> p5 draws into. */
export function sketchCanvas(p: p5): HTMLCanvasElement {
  return (p as unknown as { canvas: HTMLCanvasElement }).canvas
}

export const previewSketch: Sketch<PreviewProps> = (p, propsRef) => {
  const props = () => propsRef.current
  let palette = readFilterPalette()
  let smooth: FaceAnchors | null = null

  p.setup = () => {
    const { width, height } = props()
    p.pixelDensity(1) // the preview is already big; 2x would halve the fps
    p.createCanvas(Math.max(1, width), Math.max(1, height))
    p.frameRate(30)
    palette = readFilterPalette()
  }

  p.draw = () => {
    const { videoRef, width, height, filter, faceRef, clip, fpsRef } = props()
    if (width > 0 && height > 0 && (p.width !== width || p.height !== height)) {
      p.resizeCanvas(width, height)
      clip.clear()
    }
    fpsRef.current = p.frameRate()

    const W = p.width
    const H = p.height
    const video = videoRef.current
    if (!video || video.readyState < 2 || !video.videoWidth) {
      p.background(palette.frame)
      return
    }

    // Cover-fit the video into the canvas and mirror it.
    const vw = video.videoWidth
    const vh = video.videoHeight
    const s = Math.max(W / vw, H / vh)
    const dw = vw * s
    const dh = vh * s
    const ox = (W - dw) / 2
    const oy = (H - dh) / 2
    const ctx = p.drawingContext as CanvasRenderingContext2D
    ctx.save()
    ctx.translate(W, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, ox, oy, dw, dh)
    ctx.restore()

    // Face filter. Landmarks are in video pixels; map them the same way.
    const sample = faceRef.current
    const fresh = sample && performance.now() - sample.at < FACE_TIMEOUT_MS
    if (filter !== 'none' && fresh) {
      const target = faceAnchors(sample.keypoints, (k) => ({
        x: W - (ox + k.x * s),
        y: oy + k.y * s,
      }))
      if (target) {
        smooth = lerpAnchors(smooth, target, 0.4)
        drawFaceFilter(p, filter, smooth, palette)
      }
    } else {
      smooth = null
    }

    clip.push(sketchCanvas(p), performance.now())
  }
}
