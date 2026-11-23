/**
 * Motion helpers. Owned by foundation.
 * Rules: animate transform and opacity only; always respect reduced motion.
 *
 *   import { animate } from 'motion'
 *   import { prefersReducedMotion } from '@/lib/motion'
 *   useEffect(() => {
 *     if (prefersReducedMotion() || !el) return
 *     const a = animate(el, { y: [40, 0], opacity: [0, 1] }, { duration: 0.4 })
 *     return () => a.stop()
 *   }, [])
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
