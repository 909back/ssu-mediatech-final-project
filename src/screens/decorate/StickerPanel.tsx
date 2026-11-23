import { useEffect, useRef, useState } from 'react'
import { Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { loadImage } from '@/lib/compose'
import {
  DEFAULT_TOLERANCE,
  cutout,
  isSupportedImage,
  prepareCutout,
  type CutoutResult,
  type PreparedCutout,
} from '@/lib/cutout'
import { PanelSection, UNSUPPORTED_MESSAGE } from './PanelSection'
import { BUILTIN_STICKERS } from './stickers'

interface Props {
  onAdd: (src: string, natural: { width: number; height: number }) => void
}

/** Neutral checkerboard so transparent areas read as transparent. */
const checker =
  'bg-[conic-gradient(var(--gray-4)_25%,var(--gray-1)_0_50%,var(--gray-4)_0_75%,var(--gray-1)_0)] bg-size-[16px_16px]'

export default function StickerPanel({ onAdd }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [prepared, setPrepared] = useState<PreparedCutout | null>(null)
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE)
  const [result, setResult] = useState<CutoutResult | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!prepared) return
    const t = window.setTimeout(() => setResult(cutout(prepared, tolerance)), 60)
    return () => window.clearTimeout(t)
  }, [prepared, tolerance])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (!isSupportedImage(file)) {
      toast.error(UNSUPPORTED_MESSAGE)
      return
    }
    setBusy(true)
    try {
      setResult(null)
      setPrepared(await prepareCutout(file))
    } catch {
      toast.error('이미지를 열 수 없어요')
    } finally {
      setBusy(false)
    }
  }

  const addBuiltin = async (src: string) => {
    const img = await loadImage(src)
    onAdd(src, { width: img.naturalWidth, height: img.naturalHeight })
  }

  const clearUpload = () => {
    setPrepared(null)
    setResult(null)
    setTolerance(DEFAULT_TOLERANCE)
  }

  return (
    <div className="flex flex-col gap-6">
      <PanelSection title="도토리 스티커">
        <div className="grid grid-cols-3 gap-2">
          {BUILTIN_STICKERS.map((s) => (
            <button
              key={s.src}
              type="button"
              aria-label={`${s.label} 붙이기`}
              onClick={() => void addBuiltin(s.src)}
              className="flex aspect-square items-center justify-center rounded-lg bg-gray-2 p-2 ring-1 ring-gray-a3 transition-[transform,background-color] hover:scale-[1.03] hover:bg-gray-3"
            >
              <img src={s.src} alt="" className="max-h-full max-w-full object-contain" />
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="내 사진으로 만들기">
        {!prepared ? (
          <Button variant="outline" className="w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload />
            {busy ? '여는 중' : '이미지 올리기'}
          </Button>
        ) : (
          <div className="flex flex-col gap-4">
            <div className={`flex h-40 items-center justify-center rounded-lg p-3 ring-1 ring-gray-a6 ${checker}`}>
              {result && <img src={result.src} alt="배경을 지운 스티커" className="max-h-full max-w-full object-contain" />}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <label htmlFor="cutout-tolerance" className="text-gray-11">
                  배경 지우기 강도
                </label>
                <span className="tabular-nums text-foreground">{tolerance}</span>
              </div>
              <Slider
                id="cutout-tolerance"
                min={0}
                max={120}
                step={1}
                value={[tolerance]}
                onValueChange={([v]) => setTolerance(v)}
                className="[&_[data-slot=slider-range]]:bg-foreground [&_[data-slot=slider-thumb]]:border-foreground"
              />
              <p className="text-xs text-gray-11">가장자리 색과 비슷한 부분을 지워요. 사람이 지워지면 낮춰 보세요.</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                disabled={!result}
                onClick={() => {
                  if (!result) return
                  onAdd(result.src, result)
                  clearUpload()
                }}
              >
                <Plus />
                스티커 붙이기
              </Button>
              <Button variant="ghost" onClick={clearUpload}>
                취소
              </Button>
            </div>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </PanelSection>

      <p className="text-xs leading-relaxed text-gray-11">
        스티커를 끌어서 옮기고, 모서리로 크기를, 위쪽 손잡이로 각도를 바꿔요. Delete 키로 지우고 Esc로 선택을 풀어요.
      </p>
    </div>
  )
}
