import { SCREENS, type FlowScreen, type Screen } from '@/store/useApp'
import { cn } from '@/lib/utils'

const LABELS: Record<FlowScreen, string> = {
  start: '시작',
  frame: '프레임',
  shoot: '촬영',
  decorate: '꾸미기',
  save: '저장',
}

/** Read-only progress of the main flow. Current step uses foreground, never brand. */
export default function StepIndicator({ current }: { current: Screen }) {
  // The guide (사용법) is part of the 촬영 step, not a step of its own.
  const currentIndex = SCREENS.indexOf(current === 'guide' ? 'shoot' : current)
  return (
    <ol className="flex items-center gap-1 text-sm" aria-label="진행 단계">
      {SCREENS.map((id, i) => (
        <li key={id} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden className="h-px w-5 bg-gray-6" />}
          <span
            aria-current={i === currentIndex ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1',
              i === currentIndex && 'bg-gray-3 font-semibold text-foreground',
              i < currentIndex && 'text-gray-11',
              i > currentIndex && 'text-gray-9',
            )}
          >
            <span className="tabular-nums">{i + 1}</span>
            {LABELS[id]}
          </span>
        </li>
      ))}
    </ol>
  )
}
