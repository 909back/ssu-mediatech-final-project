/**
 * One shared camera stream for the whole app. Owned by foundation.
 *
 * - startCamera() asks for permission once and reuses the stream afterwards.
 * - Status is written to the store (cameraStatus) so any screen can react.
 * - The stream is NOT mirrored; mirror in the preview (CSS -scale-x-100 or
 *   p5 translate/scale) and when capturing a still. See useCamera().
 */
import { useApp, type CameraStatus } from '@/store/useApp'

let stream: MediaStream | null = null
let pending: Promise<MediaStream | null> | null = null

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: 'user',
  },
}

/** Map a getUserMedia error to a cameraStatus value. */
export function errorToStatus(err: unknown): Exclude<CameraStatus, 'idle' | 'requesting' | 'ready'> {
  const name = err instanceof Error || err instanceof DOMException ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return 'notfound'
    default:
      return 'error' // NotReadableError (camera busy), AbortError, no mediaDevices, ...
  }
}

export function getStream(): MediaStream | null {
  return stream
}

/**
 * Request the camera (idempotent). Resolves with the stream, or null on failure.
 * Failure details live in store.cameraStatus.
 */
export function startCamera(): Promise<MediaStream | null> {
  const { setCameraStatus } = useApp.getState()
  if (stream?.active) {
    setCameraStatus('ready')
    return Promise.resolve(stream)
  }
  if (pending) return pending

  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraStatus('error')
    return Promise.resolve(null)
  }

  setCameraStatus('requesting')
  pending = navigator.mediaDevices
    .getUserMedia(CAMERA_CONSTRAINTS)
    .then((s) => {
      stream = s
      // Camera unplugged or permission revoked mid-session.
      s.getVideoTracks().forEach((t) =>
        t.addEventListener('ended', () => {
          stream = null
          useApp.getState().setCameraStatus('error')
        }),
      )
      setCameraStatus('ready')
      return s
    })
    .catch((err: unknown) => {
      console.warn('[camera]', err)
      setCameraStatus(errorToStatus(err))
      return null
    })
    .finally(() => {
      pending = null
    })
  return pending
}

/** Stop all tracks. Not needed in the normal flow. */
export function stopCamera(): void {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  useApp.getState().setCameraStatus('idle')
}
