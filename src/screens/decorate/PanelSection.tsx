import type { ReactNode } from 'react'

export const UNSUPPORTED_MESSAGE = 'PNG, JPG, WEBP, GIF 이미지만 올릴 수 있어요'

export function PanelSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}
