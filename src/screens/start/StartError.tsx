import { useEffect, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CameraOff, Loader2, RefreshCw, TriangleAlert, VideoOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type StartErrorKind = 'denied' | 'notfound' | 'camera' | 'model'

type Copy = { Icon: LucideIcon; title: string; steps: string[] }

const COPY: Record<StartErrorKind, Copy> = {
  denied: {
    Icon: CameraOff,
    title: '카메라 사용이 막혀 있어요',
    steps: [
      '주소창 왼쪽 아이콘을 눌러 주세요.',
      "카메라를 '허용'으로 바꿔 주세요.",
      '아래 버튼을 눌러 다시 시도해 주세요.',
    ],
  },
  notfound: {
    Icon: VideoOff,
    title: '카메라를 찾지 못했어요',
    steps: [
      '웹캠이 연결되어 있는지 확인해 주세요.',
      '연결한 뒤 아래 버튼을 눌러 주세요.',
    ],
  },
  camera: {
    Icon: TriangleAlert,
    title: '카메라를 켤 수 없어요',
    steps: [
      '화상 회의 앱이나 다른 탭이 카메라를 쓰고 있을 수 있어요.',
      '닫은 뒤 아래 버튼을 눌러 주세요.',
    ],
  },
  model: {
    Icon: TriangleAlert,
    title: '손과 얼굴 인식을 불러오지 못했어요',
    steps: [
      '인터넷 연결을 확인해 주세요.',
      '연결한 뒤 아래 버튼을 눌러 주세요.',
    ],
  },
}

type Props = {
  kind: StartErrorKind
  busy?: boolean
  onRetry: () => void
}

export default function StartError({ kind, busy = false, onRetry }: Props) {
  const { Icon, title, steps } = COPY[kind]
  const retryRef = useRef<HTMLButtonElement>(null)

  // Put focus on the retry button so Enter works right after an error appears.
  useEffect(() => {
    retryRef.current?.focus({ preventScroll: true })
  }, [kind])

  return (
    <div className="flex w-full max-w-md flex-col items-start gap-5">
      <div role="alert" className="flex gap-3">
        <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-2" />
        <div className="flex flex-col gap-1.5">
          <p className="text-lg font-semibold text-ink">{title}</p>
          <ol className="flex flex-col gap-0.5 text-[15px] leading-relaxed text-ink-2">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      </div>
      <Button
        ref={retryRef}
        size="hero"
        aria-disabled={busy}
        aria-busy={busy}
        onClick={() => {
          if (!busy) onRetry()
        }}
      >
        {busy ? (
          <Loader2 aria-hidden className="size-6 animate-spin" />
        ) : (
          <RefreshCw aria-hidden className="size-6" />
        )}
        {busy ? '다시 연결하는 중' : '다시 시도'}
      </Button>
    </div>
  )
}
