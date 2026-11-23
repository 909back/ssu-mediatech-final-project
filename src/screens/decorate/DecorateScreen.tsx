import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpToLine, ChevronLeft, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ComposeShot } from '@/lib/compose'
import { selectLayout, useApp, type Sticker } from '@/store/useApp'
import DecoratePreview from './DecoratePreview'
import FilterPanel from './FilterPanel'
import FramePanel from './FramePanel'
import StickerPanel from './StickerPanel'
import TextPanel from './TextPanel'
import { SAMPLE_SHOTS, makeSticker, restack } from './stickers'

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.getAttribute('role') === 'slider'
  )
}

export default function DecorateScreen() {
  const layout = useApp(selectLayout)
  const eightShotMode = useApp((s) => s.eightShotMode)
  const storeShots = useApp((s) => s.shots)
  const decor = useApp((s) => s.decor)
  const goTo = useApp((s) => s.goTo)
  const updateDecor = useApp((s) => s.updateDecor)
  const updateSticker = useApp((s) => s.updateSticker)
  const removeSticker = useApp((s) => s.removeSticker)
  const addSticker = useApp((s) => s.addSticker)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Dev fallback: opened without photos, show the brand samples (store untouched).
  const shots = useMemo<(ComposeShot | null)[]>(
    () =>
      storeShots.every((s) => s === null)
        ? storeShots.map((_, i) => ({ image: SAMPLE_SHOTS[i % SAMPLE_SHOTS.length], clip: [] }))
        : storeShots,
    [storeShots],
  )

  const selected = decor.stickers.find((s) => s.id === selectedId) ?? null

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    removeSticker(selectedId)
    setSelectedId(null)
  }, [selectedId, removeSticker])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      if (e.key === 'Escape') {
        setSelectedId(null)
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        return
      }
      if (!selectedId) return
      const st = useApp.getState().decor.stickers.find((s) => s.id === selectedId)
      if (!st) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelected()
        return
      }
      const step = e.shiftKey ? 10 : 2
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const m = moves[e.key]
      if (m) {
        e.preventDefault()
        updateSticker(st.id, { x: st.x + m[0], y: st.y + m[1] })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, deleteSelected, updateSticker])

  const onAddSticker = (src: string, natural: { width: number; height: number }) => {
    const sticker = makeSticker(src, natural, layout, decor.stickers)
    addSticker(sticker)
    setSelectedId(sticker.id)
  }

  const reorder = (dir: 1 | -1) => {
    if (selectedId) updateDecor({ stickers: restack(decor.stickers, selectedId, dir) })
  }

  const order = [...decor.stickers].sort((a, b) => a.z - b.z)
  const rank = selected ? order.findIndex((s) => s.id === selected.id) : -1

  return (
    <section className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col bg-gray-2">
        <div className="flex min-h-0 flex-1 px-8 pt-12 pb-4">
          <DecoratePreview
            shots={shots}
            layout={layout}
            eightShotMode={eightShotMode}
            decor={decor}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChangeSticker={updateSticker as (id: string, patch: Partial<Sticker>) => void}
          />
        </div>
        <div className="flex h-16 shrink-0 items-center justify-between gap-4 px-6">
          <Button variant="ghost" onClick={() => goTo('shoot')}>
            <ChevronLeft />
            뒤로
          </Button>
          {selected ? (
            <div className="flex items-center gap-1 rounded-lg bg-background p-1 shadow-sm ring-1 ring-gray-a3">
              <Button variant="ghost" size="sm" disabled={rank >= order.length - 1} onClick={() => reorder(1)}>
                <ArrowUpToLine />
                앞으로
              </Button>
              <Button variant="ghost" size="sm" disabled={rank <= 0} onClick={() => reorder(-1)}>
                <ArrowDownToLine />
                뒤로 보내기
              </Button>
              <Button variant="ghost" size="sm" onClick={deleteSelected}>
                <Trash2 />
                삭제
              </Button>
            </div>
          ) : (
            <p className="text-sm text-gray-11">
              {decor.stickers.length ? '스티커를 누르면 옮기거나 크기를 바꿀 수 있어요' : '오른쪽에서 프레임과 스티커를 골라 보세요'}
            </p>
          )}
          <span aria-hidden className="w-18" />
        </div>
      </div>

      <aside className="flex w-[380px] shrink-0 flex-col border-l bg-background">
        <Tabs defaultValue="frame" className="min-h-0 flex-1 gap-0">
          <div className="px-5 pt-5 pb-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="frame">프레임</TabsTrigger>
              <TabsTrigger value="filter">필터</TabsTrigger>
              <TabsTrigger value="sticker">스티커</TabsTrigger>
              <TabsTrigger value="text">글자</TabsTrigger>
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <TabsContent value="frame">
              <FramePanel shots={shots} layout={layout} eightShotMode={eightShotMode} decor={decor} />
            </TabsContent>
            <TabsContent value="filter">
              <FilterPanel firstShot={shots[0] ?? null} value={decor.colorFilter} />
            </TabsContent>
            <TabsContent value="sticker">
              <StickerPanel onAdd={onAddSticker} />
            </TabsContent>
            <TabsContent value="text">
              <TextPanel dateOn={decor.dateOn} text={decor.text} />
            </TabsContent>
          </div>
        </Tabs>
        <div className="border-t p-5">
          <Button size="lg" className="h-12 w-full text-base" onClick={() => goTo('save')}>
            저장하기
          </Button>
        </div>
      </aside>
    </section>
  )
}
