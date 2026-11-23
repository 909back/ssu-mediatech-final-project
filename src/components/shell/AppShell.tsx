import { useState, type ReactNode } from 'react'
import StepIndicator from '@/components/shell/StepIndicator'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useApp, type Screen } from '@/store/useApp'
import { CircleHelp } from 'lucide-react'

/**
 * Fixed app frame for a 1280x800 laptop: slim header + full-height stage.
 * Screens render inside <main> and get the full remaining height (h-full).
 * Under 1024px the frame lets the page grow and scroll vertically instead.
 * The logo goes home; if any shot exists it asks first, since going home clears everything.
 */
export default function AppShell({ screen, children }: { screen: Screen; children: ReactNode }) {
  const hasShots = useApp((s) => s.shots.some(Boolean))
  const reset = useApp((s) => s.reset)
  const goTo = useApp((s) => s.goTo)
  const [confirmHome, setConfirmHome] = useState(false)

  const goHome = () => {
    setConfirmHome(false)
    reset()
  }

  const onLogo = () => {
    if (screen === 'start') return
    if (hasShots) setConfirmHome(true)
    else goHome()
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper lg:h-dvh lg:overflow-hidden">
      <header className="mx-auto flex h-(--header-h) w-full max-w-[1440px] shrink-0 items-center justify-between gap-4 px-4 lg:px-8">
        <button
          type="button"
          onClick={onLogo}
          aria-label="처음 화면으로"
          className="-mx-2 rounded-md px-2 py-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <img src="/brand/logo-horizontal.svg" alt="" width={1039} height={293} className="h-9 w-auto" />
        </button>
        {screen !== 'start' && (
          <div className="flex items-center gap-3">
            {screen === 'shoot' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="사용법 보기" onClick={() => goTo('guide')}>
                    <CircleHelp className="size-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">사용법 보기</TooltipContent>
              </Tooltip>
            )}
            <StepIndicator current={screen} />
          </div>
        )}
      </header>
      <main className="mx-auto min-h-0 w-full max-w-[1440px] flex-1">{children}</main>

      <Dialog open={confirmHome} onOpenChange={setConfirmHome}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>처음 화면으로 갈까요?</DialogTitle>
            <DialogDescription>찍은 사진과 꾸민 내용이 모두 지워져요.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">계속하기</Button>
            </DialogClose>
            <Button variant="destructive" onClick={goHome}>
              지우고 처음으로
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
