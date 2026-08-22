'use client'

import { useRef, useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Film, Loader2, Plus, X, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { readVideoMeta, checkVideo, compressVideo } from '@/lib/upload/video'
import { createReelFromClipsAction } from '@/lib/actions/reel-from-clips'

// 갖고 있던 영상으로 홍보 영상 만들기 — 작업보고서가 없어도 된다.
//
// 예약 → 작업보고서 → 릴스로만 이어져 있어서, 예약을 안 쓰는 업체나 예전에 찍어둔 영상을
// 쓰려는 경우엔 만들 방법이 없었다. ⛔가짜 예약을 만들게 하지 말 것(통계가 틀어진다).
//
// 입력은 네 덩이를 넘기지 않는다: ①어떤 청소 ②작업 영상 ③작업 전·후 사진 ④한 줄 메모(선택).
// ⛔"설명을 직접 적어주세요" 같은 글쓰기 숙제를 넣지 말 것 — 안 적으면 영상이 안 나온다.

interface ClipSlot {
  url: string
  duration: number
  uploading: boolean
  shrinkPercent?: number
}

export function ReelFromClipsButton({
  businessId,
  serviceNames,
}: {
  businessId: string
  /** 등록된 서비스 이름 — 직접 타이핑 대신 고르게 한다 */
  serviceNames: string[]
}) {
  const [open, setOpen] = useState(false)
  const [cleaningType, setCleaningType] = useState('')
  const [note, setNote] = useState('')
  const [clips, setClips] = useState<ClipSlot[]>([])
  const [beforeUrl, setBeforeUrl] = useState('')
  const [afterUrl, setAfterUrl] = useState('')
  const [photoBusy, setPhotoBusy] = useState<'before' | 'after' | null>(null)

  const videoInputRef = useRef<HTMLInputElement>(null)
  const beforeInputRef = useRef<HTMLInputElement>(null)
  const afterInputRef = useRef<HTMLInputElement>(null)

  const { execute, isPending } = useAction(createReelFromClipsAction, {
    onSuccess: () => {
      toast.success('접수됐어요! 곧 만들어서 알려드릴게요')
      setOpen(false)
      setCleaningType(''); setNote(''); setClips([]); setBeforeUrl(''); setAfterUrl('')
      setTimeout(() => window.location.replace(window.location.pathname), 900)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '저장하지 못했어요. 다시 눌러주세요'),
  })

  const uploadingNow = clips.some((c) => c.uploading) || photoBusy !== null

  async function handleVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (clips.length >= 3) {
      toast.error('영상은 3개까지 올릴 수 있어요')
      return
    }

    const index = clips.length
    setClips((prev) => [...prev, { url: '', duration: 0, uploading: true }])

    try {
      const meta = await readVideoMeta(file)
      // 큰 영상은 브라우저에서 줄여 올린다 — 사장님에게 카메라 설정을 바꾸라고 하지 않는다
      const upload = await compressVideo(file, meta, (percent) => {
        setClips((prev) => {
          const next = [...prev]
          if (next[index]) next[index] = { ...next[index], shrinkPercent: percent }
          return next
        })
      })

      const verdict = checkVideo(upload, meta)
      if (!verdict.ok) {
        toast.error(verdict.error ?? '이 영상은 올릴 수 없어요')
        setClips((prev) => prev.filter((_, i) => i !== index))
        return
      }
      if (verdict.warning) toast.warning(verdict.warning)

      const ext = upload.name.split('.').pop() ?? 'mp4'
      const path = `${businessId}/reel-clips/${Date.now()}-${index}.${ext}`
      const supabase = createClient()
      const { error } = await supabase.storage.from('report-photos').upload(path, upload, { upsert: true })
      if (error) {
        console.error('[ReelFromClips] 영상 업로드 실패:', error)
        toast.error('영상을 올리지 못했어요. 더 짧게 찍어서 올려주세요')
        setClips((prev) => prev.filter((_, i) => i !== index))
        return
      }

      const url = supabase.storage.from('report-photos').getPublicUrl(path).data.publicUrl
      setClips((prev) => {
        const next = [...prev]
        next[index] = { url, duration: meta?.duration ?? 0, uploading: false }
        return next
      })
    } catch (err) {
      console.error('[ReelFromClips] 영상 처리 실패:', err)
      toast.error('영상을 읽지 못했어요. 다른 영상으로 해보세요')
      setClips((prev) => prev.filter((_, i) => i !== index))
    }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>, which: 'before' | 'after') {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setPhotoBusy(which)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload-image', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || !json.url) {
        toast.error(json.error ?? '사진을 올리지 못했어요. 다시 눌러주세요')
        return
      }
      if (which === 'before') setBeforeUrl(json.url)
      else setAfterUrl(json.url)
    } catch (err) {
      console.error('[ReelFromClips] 사진 업로드 실패:', err)
      toast.error('사진을 올리지 못했어요. 다시 눌러주세요')
    } finally {
      setPhotoBusy(null)
    }
  }

  const ready =
    cleaningType.trim() !== '' &&
    clips.filter((c) => c.url).length > 0 &&
    beforeUrl !== '' &&
    afterUrl !== '' &&
    !uploadingNow

  const submit = () => {
    const done = clips.filter((c) => c.url)
    execute({
      cleaningType: cleaningType.trim(),
      note: note.trim() || undefined,
      clipUrls: done.map((c) => c.url),
      clipDurations: done.map((c) => c.duration),
      beforeImageUrl: beforeUrl,
      afterImageUrl: afterUrl,
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-11 w-full gap-1.5">
          <Film className="h-4 w-4" />
          갖고 있는 영상으로 만들기
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>갖고 있는 영상으로 홍보 영상 만들기</DialogTitle>
          <DialogDescription>
            예전에 찍어둔 작업 영상으로도 만들 수 있어요. 예약이나 작업 보고서가 없어도 돼요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* ① 어떤 청소였는지 */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">어떤 청소였나요? (필수)</Label>
            {serviceNames.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {serviceNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setCleaningType(name)}
                    className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                      cleaningType === name
                        ? 'bg-primary text-white border-primary font-semibold'
                        : 'bg-white hover:bg-muted'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : (
              <Input
                value={cleaningType}
                onChange={(e) => setCleaningType(e.target.value)}
                placeholder="예: 입주청소"
                className="h-12"
              />
            )}
          </div>

          {/* ② 작업 영상 */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">작업 영상 (필수 · 최대 3개)</Label>
            <p className="text-xs text-muted-foreground">5~10초짜리가 가장 좋아요</p>
            <div className="flex flex-wrap gap-2">
              {clips.map((clip, i) => (
                <div key={i} className="relative w-20 h-28 rounded-lg border overflow-hidden bg-muted">
                  {clip.uploading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        {clip.shrinkPercent !== undefined ? `${clip.shrinkPercent}%` : '올리는 중'}
                      </span>
                    </div>
                  ) : (
                    <>
                      <video src={clip.url} className="w-full h-full object-cover" preload="metadata" muted playsInline />
                      <button
                        type="button"
                        onClick={() => setClips((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                        aria-label="빼기"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {clips.length < 3 && (
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="w-20 h-28 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus className="h-5 w-5" />
                  <span className="text-[11px]">영상 넣기</span>
                </button>
              )}
            </div>
            <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideo} />
          </div>

          {/* ③ 작업 전·후 사진 */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">작업 전·후 사진 (필수)</Label>
            <div className="grid grid-cols-2 gap-2">
              {([['before', '작업 전', beforeUrl, beforeInputRef], ['after', '작업 후', afterUrl, afterInputRef]] as const).map(
                ([key, label, url, ref]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => ref.current?.click()}
                    className="relative aspect-[4/3] rounded-lg border-2 border-dashed overflow-hidden flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={label} className="absolute inset-0 w-full h-full object-cover" />
                    ) : photoBusy === key ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <ImagePlus className="h-5 w-5" />
                        <span className="text-xs">{label}</span>
                      </>
                    )}
                  </button>
                ),
              )}
            </div>
            <input ref={beforeInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e, 'before')} />
            <input ref={afterInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e, 'after')} />
          </div>

          {/* ④ 한 줄 메모 — 선택. 있으면 대본이 훨씬 구체적으로 나온다 */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">한 줄 메모 (선택)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 20년 된 상가, 주방 기름때가 특히 심했어요"
              className="h-12"
            />
            <p className="text-xs text-muted-foreground">
              적어주시면 영상에서 하는 말이 훨씬 구체적으로 나와요
            </p>
          </div>

          <Button type="button" className="h-12 w-full" disabled={!ready || isPending} onClick={submit}>
            {isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />접수하는 중...</>
            ) : uploadingNow ? (
              '올리는 중이에요...'
            ) : (
              '홍보 영상 만들기'
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            만드는 데 1~2분 걸려요. 다 되면 폰으로 알려드릴게요.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
