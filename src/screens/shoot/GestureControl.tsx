import { Hand, LoaderCircle } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import type { ModelStatus } from './useDetection'

interface GestureControlProps {
  enabled: boolean
  onEnabledChange: (on: boolean) => void
  /** 0..1 while a gesture is being held. */
  progress: number
  status: ModelStatus
  /** Short hint, e.g. "V 포즈 1초". */
  hint: string
  /** True while detection is paused (countdown or cooldown). */
  paused: boolean
}

const R = 15
const CIRCUMFERENCE = 2 * Math.PI * R

/** Hand icon with a progress ring, a hint and the gesture on/off switch. */
export default function GestureControl({
  enabled,
  onEnabledChange,
  progress,
  status,
  hint,
  paused,
}: GestureControlProps) {
  let label = hint
  if (!enabled) label = '제스처 꺼짐'
  else if (status === 'loading') label = '손 인식 준비 중'
  else if (status === 'error') label = '손 인식 사용 불가'
  else if (paused) label = '잠시만요'

  return (
    <div className="flex items-center gap-3 rounded-full bg-card py-1.5 pr-4 pl-1.5 shadow-(--shadow-card)">
      <span className="relative grid size-10 place-items-center" aria-hidden>
        <svg viewBox="0 0 40 40" className="absolute inset-0 size-10 -rotate-90">
          <circle cx="20" cy="20" r={R} fill="none" strokeWidth="3" className="stroke-paper-3" />
          <circle
            cx="20"
            cy="20"
            r={R}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className="stroke-ink"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            opacity={progress > 0 ? 1 : 0}
          />
        </svg>
        {enabled && status === 'loading' ? (
          <LoaderCircle className="size-4 animate-spin text-ink-2" />
        ) : (
          <Hand className={enabled ? 'size-4 text-ink' : 'size-4 text-ink-3'} />
        )}
      </span>
      <span className="text-sm font-semibold text-ink empty:hidden" aria-live="polite">
        {label}
      </span>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
        제스처
        <Switch
          checked={enabled}
          onCheckedChange={onEnabledChange}
          aria-label="손 제스처로 촬영"
          className="data-[state=checked]:bg-ink"
        />
      </label>
    </div>
  )
}
