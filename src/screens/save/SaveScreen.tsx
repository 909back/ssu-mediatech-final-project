import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'
import { Download, Film, Images, Paintbrush, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { composeLayout } from '@/lib/compose'
import { ExportError, exportGIF, exportPNG, exportWebM, type ExportShot } from '@/lib/export'
import { getLayout } from '@/lib/layouts'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/useApp'

type Kind = 'png' | 'gif' | 'webm'
type JobState = { running: boolean; progress: number }

const IDLE: JobState = { running: false, progress: 0 }
const STRIP_MAX_H = 600
const ROLL_SECONDS = 1.8

function toastError(err: unknown) {
  if (err instanceof ExportError && err.code === 'recording-unsupported') {
    toast.error('이 브라우저는 영상 녹화를 지원하지 않아요', {
      description: 'GIF로 저장해 주세요.',
    })
    return
  }
  toast.error('저장하지 못했어요', { description: '잠시 뒤에 다시 시도해 주세요.' })
}

export default function SaveScreen() {
  const layoutId = useApp((s) => s.layoutId)
  const eightShotMode = useApp((s) => s.eightShotMode)
  const shots = useApp((s) => s.shots) as ExportShot[]
  const decor = useApp((s) => s.decor)
  const goTo = useApp((s) => s.goTo)
  const reset = useApp((s) => s.reset)
  const layout = getLayout(layoutId)
  const reduceMotion = useReducedMotion()

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [stripUrl, setStripUrl] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Record<Kind, JobState>>({ png: IDLE, gif: IDLE, webm: IDLE })
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Compose the final strip once; the same canvas feeds the PNG export.
  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    composeLayout(shots as never, layout as never, decor as never, { eightShotMode })
      .then((canvas: HTMLCanvasElement) => {
        if (cancelled) return
        canvasRef.current = canvas
        canvas.toBlob((blob) => {
          if (cancelled || !blob) return
          url = URL.createObjectURL(blob)
          setStripUrl(url)
        }, 'image/png')
      })
      .catch(() => {
        if (!cancelled) toast.error('사진을 불러오지 못했어요')
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [shots, layout, decor, eightShotMode])

  const setJob = (kind: Kind, patch: Partial<JobState>) =>
    setJobs((j) => ({ ...j, [kind]: { ...j[kind], ...patch } }))

  async function run(kind: Kind) {
    if (jobs[kind].running) return
    setJob(kind, { running: true, progress: 0 })
    const onProgress = (p: number) => setJob(kind, { progress: p })
    try {
      if (kind === 'png') {
        const canvas =
          canvasRef.current ??
          (await composeLayout(shots as never, layout as never, decor as never, { eightShotMode }))
        await exportPNG(canvas)
      } else if (kind === 'gif') {
        await exportGIF(shots, layout, decor, { width: 400, fps: 10, seconds: 3, eightShotMode, onProgress })
      } else {
        await exportWebM(shots, layout, decor, { seconds: 6, fps: 30, eightShotMode, onProgress })
      }
      toast.success('저장했어요', { description: '다운로드 폴더를 확인해 주세요.' })
    } catch (err) {
      toastError(err)
    } finally {
      setJob(kind, { running: false, progress: 0 })
    }
  }

  function startOver() {
    setConfirmOpen(false)
    reset()
    goTo('start')
  }

  const aspect = layout.width / layout.height
  const stripW = Math.round(STRIP_MAX_H * aspect)

  return (
    <section className="flex flex-col items-center gap-10 px-4 pb-6 lg:h-full lg:flex-row lg:items-stretch lg:justify-center lg:gap-24 lg:px-8 lg:pb-8">
      {/* Hero: the print slides out of the booth slot. */}
      <div className="flex w-(--strip-w) max-w-full flex-col items-center lg:w-auto lg:pt-6" style={{ '--strip-w': `${stripW + 40}px` } as CSSProperties}>
        <div aria-hidden className="h-4 w-full rounded-full bg-stage" />
        <div className="-mt-2 w-full min-h-0 overflow-hidden px-5 pb-8 lg:flex-1">
          {stripUrl ? (
            <motion.img
              src={stripUrl}
              alt="완성된 네컷 사진"
              draggable={false}
              className="block h-auto w-full rounded-[3px] shadow-(--shadow-card) lg:h-full lg:max-h-[600px] lg:w-auto"
              style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
              initial={reduceMotion ? false : { y: '-100%', opacity: 0.4 }}
              animate={{ y: '0%', opacity: 1 }}
              transition={{ duration: ROLL_SECONDS, ease: [0.25, 0.1, 0.25, 1] }}
            />
          ) : (
            <div
              role="status"
              aria-label="사진을 준비하고 있어요"
              className="w-full rounded-[3px] bg-paper-3 lg:h-full lg:max-h-[600px] lg:w-auto"
              style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
            />
          )}
        </div>
      </div>

      <div className="flex w-full max-w-[340px] flex-col gap-6 lg:pt-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">다 됐어요</h1>

        <div className="flex flex-col gap-4 lg:mt-auto">
          <ExportRow job={jobs.png}>
            <Button
              size="action"
              className="w-full"
              disabled={jobs.png.running || !stripUrl}
              onClick={() => run('png')}
            >
              <Download />
              사진으로 저장 (PNG)
            </Button>
          </ExportRow>

          <ExportRow job={jobs.gif}>
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={jobs.gif.running}
              onClick={() => run('gif')}
            >
              <Images />
              {jobs.gif.running ? 'GIF 만드는 중' : '움직이는 사진 (GIF)'}
            </Button>
          </ExportRow>

          <ExportRow
            job={jobs.webm}
            note="일부 앱에서는 WebM이 재생되지 않아요. 공유할 때는 GIF가 좋아요."
          >
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={jobs.webm.running}
              onClick={() => run('webm')}
            >
              <Film />
              {jobs.webm.running ? '영상 녹화 중' : '영상 (WebM)'}
            </Button>
          </ExportRow>
        </div>

        <Separator />

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => goTo('decorate')}>
            <Paintbrush />
            다시 꾸미기
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => setConfirmOpen(true)}>
            <RotateCcw />
            처음부터
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>처음부터 다시 할까요?</DialogTitle>
            <DialogDescription>
              찍은 사진과 꾸민 내용이 모두 지워져요. 필요하면 먼저 저장해 두세요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">계속하기</Button>
            </DialogClose>
            <Button variant="destructive" onClick={startOver}>
              처음부터
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function ExportRow({ job, note, children }: { job: JobState; note?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {children}
      {/* Space is always reserved so the column never jumps; only opacity changes. */}
      <Progress
        value={Math.round(job.progress * 100)}
        aria-label="저장 진행률"
        aria-hidden={!job.running}
        className={cn(
          'h-1.5 bg-paper-3 transition-opacity [&>[data-slot=progress-indicator]]:bg-ink',
          job.running ? 'opacity-100' : 'opacity-0',
        )}
      />
      {note && <p className="text-sm leading-relaxed text-ink-2">{note}</p>}
    </div>
  )
}
