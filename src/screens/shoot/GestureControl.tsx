import { Hand } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

interface GestureControlProps {
  enabled: boolean
  onEnabledChange: (on: boolean) => void
}

/** The gesture on/off switch. Hand feedback itself lives on the preview (HandFeedback). */
export default function GestureControl({ enabled, onEnabledChange }: GestureControlProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-full bg-background/90 py-1.5 pr-2 pl-3 text-sm text-gray-12 shadow-sm backdrop-blur">
      <Hand className={enabled ? 'size-4 text-gray-12' : 'size-4 text-gray-9'} aria-hidden />
      제스처
      <Switch
        checked={enabled}
        onCheckedChange={onEnabledChange}
        aria-label="손 제스처로 촬영"
        className="data-[state=checked]:bg-gray-12"
      />
    </label>
  )
}
