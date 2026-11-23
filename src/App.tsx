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
import { SCREENS, useApp, type Screen } from '@/store/useApp'

const SCREEN_COMPONENTS: Record<Screen, ComponentType> = {
  start: StartScreen,
  frame: FrameScreen,
  guide: GuideScreen,
  shoot: ShootScreen,
  decorate: DecorateScreen,
  save: SaveScreen,
}

// Dev only: ?screen=decorate opens a later screen without a camera (for design renders).
// ?shots=full fills every cell with the brand sample photos (shoot review, decorate, save).
if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search)
  const screen = params.get('screen') as Screen | null
  if (screen && (screen === 'guide' || (SCREENS as readonly string[]).includes(screen))) {
    const samples = ['/brand/sample-wink.jpg', '/brand/sample-cheeks.jpg', '/brand/sample-vsign.jpg', '/brand/sample-hug.jpg']
    const store = useApp.getState()
    const layout = params.get('layout')
    if (layout === '1x4' || layout === '2x3' || layout === '2x4') store.setLayout(layout)
    if (params.get('eight') === '1') store.setEightShotMode(true)
    if (params.get('shots') === 'full' || screen === 'save') {
      useApp.getState().shots.forEach((_, i) => store.setShot(i, { image: samples[i % samples.length], clip: [] }))
    }
    store.goTo(screen)
  }
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
