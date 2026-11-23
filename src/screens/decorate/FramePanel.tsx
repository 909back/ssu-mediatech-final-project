import { useEffect, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FRAME_COLORS, THEMES, composeLayout, type ComposeShot } from '@/lib/compose'
import { fileToDataURL, isSupportedImage } from '@/lib/cutout'
import type { Layout } from '@/lib/layouts'
import { cn } from '@/lib/utils'
import { useApp, type Decor, type ThemeId } from '@/store/useApp'
import { PanelSection, UNSUPPORTED_MESSAGE } from './PanelSection'

interface Props {
  shots: (ComposeShot | null)[]
  layout: Layout
  eightShotMode: boolean
  decor: Decor
}

const selectedRing = 'ring-2 ring-foreground ring-offset-2 ring-offset-background'

export default function FramePanel({ shots, layout, eightShotMode, decor }: Props) {
  const updateDecor = useApp((s) => s.updateDecor)
  const fileRef = useRef<HTMLInputElement>(null)
  const thumbs = useThemeThumbs(shots, layout, eightShotMode, decor.frameColor)
  const isPreset = FRAME_COLORS.some((c) => c.value === decor.frameColor.toLowerCase())
  const colorActive = decor.theme === 'basic' && !decor.bgImage

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (!isSupportedImage(file)) {
      toast.error(UNSUPPORTED_MESSAGE)
      return
    }
    try {
      updateDecor({ bgImage: await fileToDataURL(file, 1800), theme: 'basic' })
    } catch {
      toast.error('이미지를 열 수 없어요')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PanelSection title="색상">
        <div className="grid grid-cols-5 gap-3">
          {FRAME_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={c.label}
              aria-pressed={colorActive && decor.frameColor.toLowerCase() === c.value}
              onClick={() => updateDecor({ frameColor: c.value, theme: 'basic', bgImage: null })}
              className={cn(
                'size-10 rounded-full border border-gray-a6 transition-transform hover:scale-105',
                colorActive && decor.frameColor.toLowerCase() === c.value && selectedRing,
              )}
              style={{ backgroundColor: c.value }}
            />
          ))}
          <label
            className={cn(
              'relative size-10 cursor-pointer overflow-hidden rounded-full border border-gray-a6 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
              colorActive && !isPreset && selectedRing,
            )}
            title="직접 고르기"
            style={{
              background: colorActive && !isPreset ? decor.frameColor : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
            }}
          >
            <span className="sr-only">직접 고르기</span>
            <input
              type="color"
              value={decor.frameColor}
              onChange={(e) => updateDecor({ frameColor: e.target.value, theme: 'basic', bgImage: null })}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
        </div>
      </PanelSection>

      <PanelSection title="테마">
        <div className="grid grid-cols-4 gap-2">
          {THEMES.map((t) => {
            const active = decor.theme === t.id && !decor.bgImage
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => updateDecor({ theme: t.id as ThemeId, bgImage: null })}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg p-1.5 text-xs text-gray-11 transition-colors hover:bg-gray-3',
                  active && 'bg-gray-3 font-semibold text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-24 w-full items-center justify-center overflow-hidden rounded-md bg-gray-2',
                    active && 'ring-2 ring-foreground',
                  )}
                >
                  {thumbs[t.id] && <img src={thumbs[t.id]} alt="" className="h-full w-auto object-contain" />}
                </span>
                <span className="leading-tight">{t.label}</span>
              </button>
            )
          })}
        </div>
      </PanelSection>

      <PanelSection title="배경 사진">
        <div className="flex items-center gap-3">
          {decor.bgImage && (
            <img src={decor.bgImage} alt="배경 사진" className="size-12 rounded-md object-cover ring-1 ring-gray-a6" />
          )}
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <ImagePlus />
            {decor.bgImage ? '다른 사진' : '사진 올리기'}
          </Button>
          {decor.bgImage && (
            <Button variant="ghost" size="icon" aria-label="배경 사진 지우기" onClick={() => updateDecor({ bgImage: null })}>
              <X />
            </Button>
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
        </div>
      </PanelSection>
    </div>
  )
}

/** Small renders of each theme with the user's own photos. */
function useThemeThumbs(shots: (ComposeShot | null)[], layout: Layout, eightShotMode: boolean, frameColor: string) {
  const [thumbs, setThumbs] = useState<Partial<Record<ThemeId, string>>>({})
  useEffect(() => {
    let alive = true
    const scale = 192 / layout.height
    Promise.all(
      THEMES.map(async (t) => {
        const c = await composeLayout(
          shots,
          layout,
          { theme: t.id, frameColor, bgImage: null, colorFilter: 'none', dateOn: false, text: '', stickers: [] },
          { scale, eightShotMode, stickers: false },
        )
        return [t.id, c.toDataURL('image/jpeg', 0.8)] as const
      }),
    ).then((entries) => alive && setThumbs(Object.fromEntries(entries)))
    return () => {
      alive = false
    }
  }, [shots, layout, eightShotMode, frameColor])
  return thumbs
}
