import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { getStream, startCamera } from '@/lib/camera'
import { useApp, type CameraStatus } from '@/store/useApp'

function attach(video: HTMLVideoElement | null) {
  const stream = getStream()
  if (!video || !stream || video.srcObject === stream) return
  video.srcObject = stream
  video.play().catch(() => {})
}

export interface UseCameraResult {
  /** Callback ref for the <video>; it may mount at any time. */
  videoRef: (el: HTMLVideoElement | null) => void
  /** The mounted <video> element (for p5 / ml5). */
  videoEl: RefObject<HTMLVideoElement | null>
  status: CameraStatus
  /** Request the camera (again). */
  retry: () => Promise<MediaStream | null>
}

/**
 * Attach the shared camera stream to a <video>.
 *
 *   const { videoRef, videoEl, status, retry } = useCamera()
 *   <video ref={videoRef} className="-scale-x-100" muted playsInline autoPlay />
 *
 * `-scale-x-100` gives the mirror preview. In p5, draw videoEl.current flipped
 * (translate(width, 0); scale(-1, 1)).
 *
 * autoStart (default true) requests the camera on mount. Start passes false
 * and calls retry() on click.
 */
export function useCamera({ autoStart = true }: { autoStart?: boolean } = {}): UseCameraResult {
  const videoEl = useRef<HTMLVideoElement | null>(null)
  const status = useApp((s) => s.cameraStatus)

  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    videoEl.current = el
    if (el) attach(el)
  }, [])

  useEffect(() => {
    if (autoStart) startCamera()
  }, [autoStart])

  useEffect(() => {
    if (status === 'ready') attach(videoEl.current)
  }, [status])

  return { videoRef, videoEl, status, retry: startCamera }
}
