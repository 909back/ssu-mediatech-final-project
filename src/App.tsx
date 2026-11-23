import type { ComponentType } from 'react'
import AppShell from '@/components/shell/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import DecorateScreen from '@/screens/decorate/DecorateScreen'
import FrameScreen from '@/screens/frame/FrameScreen'
import GuideScreen from '@/screens/guide/GuideScreen'
import SaveScreen from '@/screens/save/SaveScreen'
import ShootScreen from '@/screens/shoot/ShootScreen'
import StartScreen from '@/screens/start/StartScreen'
import { useApp, type Screen } from '@/store/useApp'

const SCREEN_COMPONENTS: Record<Screen, ComponentType> = {
  start: StartScreen,
  frame: FrameScreen,
  guide: GuideScreen,
  shoot: ShootScreen,
  decorate: DecorateScreen,
  save: SaveScreen,
}

export default function App() {
  const screen = useApp((s) => s.screen)
  const Screen = SCREEN_COMPONENTS[screen] ?? StartScreen
  return (
    <TooltipProvider>
      <AppShell screen={screen}>
        <Screen key={screen} />
      </AppShell>
      <Toaster position="top-center" />
    </TooltipProvider>
  )
}
