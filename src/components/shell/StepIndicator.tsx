import { SCREENS, type FlowScreen, type Screen } from '@/store/useApp'
import { cn } from '@/lib/utils'

const LABELS: Record<FlowScreen, string> = {
  start: '시작',
  frame: '프레임',
  shoot: '촬영',
  decorate: '꾸미기',
  save: '저장',
}

/** Read-only progress of the main flow. Current step uses ink, never brand. */
export default function StepIndicator({ current }: { current: Screen }) {
  // The guide (사용법) is part of the 촬영 step, not a step of its own.
  const step: FlowScreen = current === 'guide' ? 'shoot' : current
  const currentIndex = SCREENS.indexOf(step)
  return (
    <>
    <p className="rounded-full bg-paper-2 px-3 py-1.5 text-sm font-semibold text-ink tabular-nums sm:hidden">
      {currentIndex}/{SCREENS.length - 1} {LABELS[step]}
    </p>
    <ol className="hidden items-center gap-1 rounded-full bg-paper-2 p-1 text-sm sm:flex" aria-label="진행 단계">
      {SCREENS.slice(1).map((id) => {
        const i = SCREENS.indexOf(id)
        return (
          <li
            key={id}
            aria-current={i === currentIndex ? 'step' : undefined}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full px-3.5',
              i === currentIndex && 'bg-ink font-semibold text-paper',
              i < currentIndex && 'text-ink',
              i > currentIndex && 'text-ink-2',
            )}
          >
            <span className="tabular-nums">{i}</span>
            {LABELS[id]}
          </li>
        )
      })}
    </ol>
    </>
  )
}
