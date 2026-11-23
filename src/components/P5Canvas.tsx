import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react'
import p5 from 'p5'

/** Latest props of a <P5Canvas>, readable from inside the sketch. */
export type SketchProps = Record<string, unknown>

/**
 * A p5 sketch in instance mode. Read `propsRef.current` inside draw() to get
 * the latest props; props updates do NOT recreate the sketch.
 */
export type Sketch<P extends SketchProps = SketchProps> = (
  p: p5,
  propsRef: MutableRefObject<P>,
) => void

export type P5CanvasProps<P extends SketchProps = SketchProps> = {
  /** Define at module level (or useCallback): a new identity recreates the p5 instance. */
  sketch: Sketch<P>
  className?: string
  /** Called once with the p5 instance after creation. */
  onReady?: (instance: p5) => void
} & P

/**
 * Mount a p5 sketch (instance mode) inside React.
 *
 *   type Props = { video: HTMLVideoElement | null; filter: FaceFilter }
 *   const sketch: Sketch<Props> = (p, propsRef) => {
 *     p.setup = () => { p.createCanvas(640, 480) }
 *     p.draw = () => {
 *       const { video, filter } = propsRef.current
 *     }
 *   }
 *   <P5Canvas<Props> sketch={sketch} video={videoEl.current} filter={faceFilter} />
 *
 * StrictMode safe: the instance is removed in cleanup, so the dev double
 * mount leaves exactly one canvas.
 */
export default function P5Canvas<P extends SketchProps = SketchProps>({
  sketch,
  className,
  onReady,
  ...rest
}: P5CanvasProps<P>) {
  const props = rest as unknown as P
  const hostRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef<P>(props)
  const onReadyRef = useRef(onReady)

  // Keep refs current after every render without recreating the sketch.
  useLayoutEffect(() => {
    propsRef.current = props
    onReadyRef.current = onReady
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const instance = new p5((p: p5) => sketch(p, propsRef), host)
    onReadyRef.current?.(instance)
    return () => {
      instance.remove()
      host.replaceChildren() // guard against leftovers from a remove() mid-setup
    }
  }, [sketch])

  return <div ref={hostRef} className={className} />
}
