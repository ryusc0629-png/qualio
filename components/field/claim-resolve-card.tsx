'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAction } from 'next-safe-action/hooks'
import { Check, Loader2, Camera, X } from 'lucide-react'
import { fieldResolveClaimAction } from '@/lib/actions/field'
import { createClient } from '@/lib/supabase/client'
import { compressImage, mapWithConcurrency } from '@/lib/upload/image'

// 사장님이 접수한 고객 불만 한 건 — 읽고, 그 자리에서 '어떻게 했는지'까지 남긴다.
//
// 왜 그 자리인가: 화면을 옮기게 하면 안 적는다. 현장 직원은 장갑 낀 손으로 폰을 보고,
// 화면을 한 번 나갔다 오면 하던 일을 잊는다. 읽은 자리에서 한 칸만 채우고 끝나야 한다.
//
// 왜 새 특이사항으로 안 받나: 같은 문제가 두 건이 되어 사장님이 손으로 정리하게 된다.
// 원래 접수된 그 건에 처리 내용을 채운다.

export interface OpenClaim {
  id: string
  title: string
  content: string | null
  isUrgent: boolean
}

type Photo = { url: string; uploading: boolean }

export function ClaimResolveCard({
  claim,
  workerId,
  businessId,
  bookingId,
}: {
  claim: OpenClaim
  workerId: string
  businessId: string
  bookingId: string
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const [photos, setPhotos] = useState<Photo[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // 처리 후 사진 — 거래처는 '정말 됐나'를 글보다 사진으로 본다. 월간 보고서에 그대로 실린다.
  const uploadPhotos = async (files: FileList) => {
    const list = Array.from(files).slice(0, 3 - photos.filter((p) => p.url).length)
    if (list.length === 0) return
    setPhotos((prev) => [...prev, ...list.map(() => ({ url: '', uploading: true }))])

    const supabase = createClient()
    const done = await mapWithConcurrency(list, async (file) => {
      const small = await compressImage(file)
      const ext = small.name.split('.').pop() ?? 'jpg'
      const path = `${businessId}/${bookingId}/claim-fix/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('report-photos').upload(path, small, { upsert: true })
      if (error) return null
      return supabase.storage.from('report-photos').getPublicUrl(path).data.publicUrl
    })

    const urls = done.filter((u): u is string => !!u)
    setPhotos((prev) => [...prev.filter((p) => !p.uploading), ...urls.map((url) => ({ url, uploading: false }))])
    if (urls.length < list.length) toast.error(`사진 ${list.length - urls.length}장을 못 올렸어요`)
  }

  const { execute, isPending } = useAction(fieldResolveClaimAction, {
    onSuccess: () => {
      setDone(true)
      toast.success('처리한 내용을 사장님께 전달했어요')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '저장 못 했어요. 다시 눌러주세요'),
  })

  if (done) {
    return (
      <li className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
        <p className="text-sm font-semibold text-emerald-800 inline-flex items-center gap-1.5">
          <Check className="h-4 w-4 shrink-0" />
          {claim.title} — 처리 완료로 남겼어요
        </p>
      </li>
    )
  }

  return (
    <li className="rounded-lg border border-rose-200 bg-white px-3 py-2.5 space-y-2">
      <div>
        <p className="text-sm font-semibold text-rose-900">
          {claim.isUrgent && <span className="mr-1">🚨</span>}
          {claim.title}
        </p>
        {claim.content?.trim() && (
          <p className="text-xs text-rose-800/90 mt-0.5 whitespace-pre-wrap leading-relaxed">
            {claim.content.trim()}
          </p>
        )}
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full h-11 rounded-lg bg-rose-600 text-white text-sm font-semibold active:opacity-90"
        >
          확인했어요 · 처리 내용 적기
        </button>
      ) : (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="예: 배수구 뚫어서 냄새 없어졌어요 / 부품이 없어 다음에 처리할게요"
            className="w-full rounded-lg border p-3 text-sm outline-none focus:border-rose-400 resize-none"
          />
          {/* 처리 후 사진 (선택) — 없어도 저장된다. 입력을 늘리면 아무것도 안 적는다 */}
          <div className="flex flex-wrap items-center gap-2">
            {photos.map((p, i) => (
              <div key={p.url || `up-${i}`} className="relative w-16 h-16 rounded-lg overflow-hidden border bg-white">
                {p.uploading ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((x) => x.url !== p.url))}
                      className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
                      aria-label="사진 빼기"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </>
                )}
              </div>
            ))}
            {photos.filter((p) => p.url).length < 3 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-16 h-16 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-0.5 text-muted-foreground"
              >
                <Camera className="h-4 w-4" />
                <span className="text-[10px]">처리 후</span>
              </button>
            )}
            <span className="text-[11px] text-muted-foreground">사진은 선택이에요</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) uploadPhotos(e.target.files); e.target.value = '' }}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending || text.trim().length === 0 || photos.some((p) => p.uploading)}
              onClick={() => execute({
                workerId,
                bookingId,
                claimId: claim.id,
                resolution: text,
                resolutionPhotoUrls: photos.filter((p) => p.url).map((p) => p.url),
              })}
              className="flex-1 h-11 rounded-lg bg-rose-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {isPending ? '저장 중...' : '처리 완료로 남기기'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-11 px-4 rounded-lg border text-sm text-muted-foreground"
            >
              나중에
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            적으면 사장님 화면에서 &lsquo;처리됨&rsquo;으로 바뀌고, 월말 보고서에도 그대로 들어가요
          </p>
        </div>
      )}
    </li>
  )
}
