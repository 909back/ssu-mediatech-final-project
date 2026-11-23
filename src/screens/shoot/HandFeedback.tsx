/**
 * What the hand detection sees, drawn on top of the live preview (DOM, so it
 * never ends up in the photo). Owned by the shoot stage.
 *
 *   - status, top left: "손 인식 준비 중" while loading, "잠시만요" in cooldown
 *   - hand seen, gesture not made: light outline + hint next to the hand
 *   - gesture held: a ring around the hand fills over the hold time
 */
import { motion, useReducedMotion } from 'motion/react'

/** A detected hand in preview (canvas) pixels. */
export interface HandView {
  x: number
  y: number
  /** Radius of a circle around the whole hand. */
  r: number
  /** The wanted gesture is being made right now. */
  active: boolean
  /** 0..1 hold progress. */
  progress: number
}

interface HandFeedbackProps {
  /** Short live status; null hides it. */
  status: string | null
  hand: HandView | null
  /** Shown next to a hand that is not making the gesture yet. */
  hint: string
}

// The ring is drawn in a 100x100 box and scaled, so only transforms change.
const R = 46
const CIRCUMFERENCE = 2 * Math.PI * R

export default function HandFeedback({ status, hand, hint }: HandFeedbackProps) {
  const reduceMotion = useReducedMotion()
  const move = reduceMotion ? '' : 'transition-transform duration-150 ease-out'

  return (
    <div className="pointer-events-none absolute inset-0">
      <div aria-live="polite" className="absolute top-4 left-4">
        {status && (
          <motion.p
            key={status}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="rounded-full bg-gray-12/75 px-3 py-1.5 text-sm text-gray-1"
          >
            {status}
          </motion.p>
        )}
      </div>

      {hand && (
        <>
          <svg
            viewBox="0 0 100 100"
            className={`absolute top-0 left-0 size-[100px] origin-top-left overflow-visible ${move}`}
            style={{
              transform: `translate(${hand.x - hand.r}px, ${hand.y - hand.r}px) scale(${hand.r / 50})`,
            }}
            aria-hidden
          >
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              strokeWidth={hand.active ? 6 : 2}
              vectorEffect="non-scaling-stroke"
              strokeDasharray={hand.active ? undefined : '6 6'}
              className={hand.active ? 'stroke-gray-1/35' : 'stroke-gray-1/70'}
            />
            {hand.active && (
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                strokeWidth={6}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                className="-rotate-90 stroke-gray-1"
                style={{ transformOrigin: '50px 50px' }}
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - hand.progress)}
              />
            )}
          </svg>
          {!hand.active && (
            <div
              className={`absolute top-0 left-0 ${move}`}
              style={{ transform: `translate(${hand.x}px, ${hand.y - hand.r - 8}px)` }}
            >
              <span className="block -translate-x-1/2 -translate-y-full rounded-full bg-gray-12/75 px-3 py-1 text-sm whitespace-nowrap text-gray-1">
                {hint}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
