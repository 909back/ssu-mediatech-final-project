import type { ReactNode } from 'react'
import StepIndicator from '@/components/shell/StepIndicator'
import type { Screen } from '@/store/useApp'

/**
 * Fixed app frame for a 1280x800 laptop: slim header + full-height stage.
 * Screens render inside <main> and get the full remaining height (h-full).
 * Under 1024px the frame lets the page grow and scroll vertically instead.
 */
export default function AppShell({ screen, children }: { screen: Screen; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper lg:h-dvh lg:overflow-hidden">
      <header className="mx-auto flex h-(--header-h) w-full max-w-[1440px] shrink-0 items-center justify-between gap-4 px-4 lg:px-8">
        <img src="/brand/logo-horizontal.svg" alt="도토리 네컷" width={1039} height={293} className="h-9 w-auto" />
        {screen !== 'start' && <StepIndicator current={screen} />}
      </header>
      <main className="mx-auto min-h-0 w-full max-w-[1440px] flex-1">{children}</main>
    </div>
  )
}
