import { useEffect, useState } from 'react'
import { loadImage, type ComposeShot } from '@/lib/compose'
import { COLOR_FILTERS, filteredThumbnail, type ColorFilterId } from '@/lib/filters'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/useApp'
import { PanelSection } from './PanelSection'

export default function FilterPanel({ firstShot, value }: { firstShot: ComposeShot | null; value: string }) {
  const updateDecor = useApp((s) => s.updateDecor)
  const [thumbs, setThumbs] = useState<Partial<Record<ColorFilterId, string>>>({})

  useEffect(() => {
    let alive = true
    const src = firstShot?.image
    if (!src) return
    ;(typeof src === 'string' ? loadImage(src) : Promise.resolve(src))
      .then((img) => {
        if (!alive) return
        setThumbs(Object.fromEntries(COLOR_FILTERS.map((f) => [f.id, filteredThumbnail(img, f.id, 192)])))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [firstShot])

  return (
    <PanelSection title="사진 필터">
      <div className="grid grid-cols-2 gap-3">
        {COLOR_FILTERS.map((f) => {
          const active = value === f.id
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={active}
              onClick={() => updateDecor({ colorFilter: f.id })}
              className={cn(
                'flex flex-col gap-2 rounded-lg p-2 text-left text-sm text-gray-11 transition-colors hover:bg-gray-3',
                active && 'bg-gray-3 font-semibold text-foreground',
              )}
            >
              <span
                className={cn('block aspect-square w-full overflow-hidden rounded-md bg-gray-3', active && 'ring-2 ring-foreground')}
              >
                {thumbs[f.id] && <img src={thumbs[f.id]} alt="" className="size-full object-cover" />}
              </span>
              {f.label}
            </button>
          )
        })}
      </div>
    </PanelSection>
  )
}
