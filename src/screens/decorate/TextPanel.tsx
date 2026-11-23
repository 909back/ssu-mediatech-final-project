import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useApp } from '@/store/useApp'
import { PanelSection } from './PanelSection'

const MAX_TEXT = 20

export default function TextPanel({ dateOn, text }: { dateOn: boolean; text: string }) {
  const updateDecor = useApp((s) => s.updateDecor)
  return (
    <div className="flex flex-col gap-6">
      <PanelSection title="날짜">
        <div className="flex items-center justify-between rounded-lg bg-gray-2 px-4 py-3">
          <Label htmlFor="date-on" className="font-normal text-gray-11">
            오늘 날짜 넣기
          </Label>
          <Switch
            id="date-on"
            checked={dateOn}
            onCheckedChange={(v) => updateDecor({ dateOn: v })}
            className="data-[state=checked]:bg-foreground"
          />
        </div>
      </PanelSection>

      <PanelSection
        title="문구"
        aside={
          <span className="text-xs tabular-nums text-gray-11">
            {text.length}/{MAX_TEXT}
          </span>
        }
      >
        <Input
          aria-label="문구"
          value={text}
          maxLength={MAX_TEXT}
          placeholder="예: 우리 첫 네컷"
          onChange={(e) => updateDecor({ text: e.target.value })}
        />
        <p className="text-xs text-gray-11">사진 아래에 들어가요. 배경에 맞춰 검정이나 흰색으로 보여요.</p>
      </PanelSection>
    </div>
  )
}
