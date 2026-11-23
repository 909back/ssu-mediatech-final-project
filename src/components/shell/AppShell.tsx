import type { ReactNode } from 'react'
import StepIndicator from '@/components/shell/StepIndicator'
import type { Screen } from '@/store/useApp'

/**
 * Fixed app frame for a 1280x800 laptop: slim header + full-height stage.
 * Screens render inside <main> and get the full remaining height (h-full).
 */
export default function AppShell({ screen, children }: { screen: Screen; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-(--header-h) shrink-0 items-center justify-between border-b px-6">
        <img src="/brand/logo-horizontal.svg" alt="도토리 네컷" className="h-8 w-auto" />
        {screen !== 'start' && <StepIndicator current={screen} />}
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  )
}
