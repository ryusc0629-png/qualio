'use client'

import { useState, useRef, useEffect } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { compressImage, mapWithConcurrency } from '@/lib/upload/image'
import { fieldAddSiteIssueAction, fieldListSiteIssuesAction } from '@/lib/actions/field'
import { Camera, X, Plus, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'

// 정기 거래처 현장의 '금일 특이사항'.
//
// 왜 이렇게 생겼나:
// 정기 현장은 매일 하는 일이 똑같아서 '오늘 한 작업'을 매일 쓰게 하면 아무도 안 쓴다.
// 거래처가 월간 보고서에서 보는 건 "무슨 문제였고, 어떻게 했고, 해결됐나" 한 덩어리다.
// 그래서 항목 단위로 그 세 가지만 받는다. 특이사항이 없는 날은 아무것도 안 써도 된다.
//
// 저장은 claims — 월간 보고서 '요청·처리 내역', 홈 '미해결 클레임' 타일,
// 대표 푸시가 전부 claims를 보고 이미 동작한다.

type Photo = { url: string; uploading: boolean }

// ⚠️컴포넌트 '밖'에 둔다. 부모 안에서 만들면 렌더할 때마다 새 컴포넌트 타입이 되어
// React가 이 영역을 통째로 다시 그린다(파일 입력·포커스가 초기화됨).
// upload는 부모의 함수라 props로 받는다.
function PhotoRow({
  label, hint, photos, setter, inputRef, kind, upload,
}: {
  label: string; hint: string; photos: Photo[]
  setter: React.Dispatch<React.SetStateAction<Photo[]>>
  inputRef: React.RefObject<HTMLInputElement | null>; kind: string
  upload: (files: FileList, setter: React.Dispatch<React.SetStateAction<Photo[]>>, kind: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{label} <span className="font-normal text-muted-foreground">{hint}</span></p>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <div key={p.url || `up-${i}`} className="relative w-16 h-16 rounded-lg overflow-hidden border bg-muted">
            {p.uploading ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={label} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setter((prev) => prev.filter((x) => x.url !== p.url))}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              </>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-16 h-16 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-0.5"
        >
          <Camera className="h-4 w-4 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">추가</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) upload(e.target.files, setter, kind)
          e.target.value = ''
        }}
      />
    </div>
    )
}


interface Issue {
  id: string
  title: string
  content: string | null
  resolution: string | null
  photo_urls: string[] | null
  resolution_photo_urls: string[] | null
  is_urgent: boolean
  status: string
}

interface Props {
  workerId: string
  businessId: string
  bookingId: string
}

export function SiteIssueSection({ workerId, businessId, bookingId }: Props) {
  const [issues, setIssues] = useState<Issue[]>([])
  const [open, setOpen] = useState(false)

  const { execute: loadIssues } = useAction(fieldListSiteIssuesAction, {
    onSuccess: ({ data }) => setIssues((data?.issues ?? []) as Issue[]),
  })

  useEffect(() => {
    loadIssues({ workerId, bookingId })
    // 최초 1회만 — 이후는 등록 성공 시 직접 갱신한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="rounded-xl bg-white border p-4 space-y-3">
      <div>
        <p className="text-sm font-medium">금일 특이사항</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          오늘 특이사항이 있으면 적어주세요. 사진을 함께 남기면 월말에 거래처로 가는 보고서에 그대로 실려요.
          <br />
          <span className="text-muted-foreground/80">특별한 일이 없었으면 안 적으셔도 돼요.</span>
        </p>
      </div>

      {issues.length > 0 && (
        <ul className="space-y-2">
          {issues.map((it) => (
            <li key={it.id} className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-start gap-2">
                {it.is_urgent ? (
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{it.title}</p>
                  {it.content && <p className="text-xs text-muted-foreground mt-0.5">{it.content}</p>}
                  {it.resolution && (
                    <p className="text-xs text-emerald-700 mt-1">→ {it.resolution}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {it.is_urgent && <span className="text-rose-600 font-medium">급한 건 · 사장님께 알림 감 · </span>}
                    사진 {(it.photo_urls?.length ?? 0) + (it.resolution_photo_urls?.length ?? 0)}장
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <IssueForm
          workerId={workerId}
          businessId={businessId}
          bookingId={bookingId}
          onDone={() => {
            setOpen(false)
            loadIssues({ workerId, bookingId })
          }}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full h-12 rounded-lg border-2 border-dashed flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:border-primary/40"
        >
          <Plus className="h-4 w-4" />
          특이사항 추가
        </button>
      )}
    </div>
  )
}

function IssueForm({ workerId, businessId, bookingId, onDone, onCancel }: Props & { onDone: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [resolution, setResolution] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const [problemPhotos, setProblemPhotos] = useState<Photo[]>([])
  const [resultPhotos, setResultPhotos] = useState<Photo[]>([])
  const problemRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLInputElement>(null)

  const { execute, isPending } = useAction(fieldAddSiteIssueAction, {
    onSuccess: () => {
      toast.success('특이사항이 등록됐어요!')
      onDone()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '등록하지 못했어요. 다시 눌러주세요'),
  })

  const upload = async (files: FileList, setter: React.Dispatch<React.SetStateAction<Photo[]>>, kind: string) => {
    const list = Array.from(files).slice(0, 5)
    setter((prev) => [...prev, ...list.map(() => ({ url: '', uploading: true }))])
    const supabase = createClient()
    const done = await mapWithConcurrency(list, async (file) => {
      const small = await compressImage(file)
      const ext = small.name.split('.').pop() ?? 'jpg'
      const path = `${businessId}/${bookingId}/issue-${kind}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('report-photos').upload(path, small, { upsert: true })
      if (error) return null
      return supabase.storage.from('report-photos').getPublicUrl(path).data.publicUrl
    })
    const urls = done.filter((u): u is string => !!u)
    setter((prev) => [...prev.filter((p) => !p.uploading), ...urls.map((url) => ({ url, uploading: false }))])
    if (urls.length < list.length) toast.error(`사진 ${list.length - urls.length}장을 못 올렸어요`)
  }

  const submit = () => {
    if (!title.trim()) {
      toast.error('무슨 일인지 한 줄로 적어주세요')
      return
    }
    execute({
      workerId, bookingId,
      title: title.trim(),
      content: content.trim() || undefined,
      resolution: resolution.trim() || undefined,
      photoUrls: problemPhotos.filter((p) => p.url).map((p) => p.url),
      resolutionPhotoUrls: resultPhotos.filter((p) => p.url).map((p) => p.url),
      isUrgent,
    })
  }

  return (
    <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium">무슨 일인가요? (필수)</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 3층 탕비실 배수구 물 빠짐이 느림 / 회의실이 유난히 어질러져 있었어요"
          className="w-full h-12 rounded-lg border px-3 text-sm outline-none focus:border-primary bg-white"
        />
      </div>

      <PhotoRow label="특이사항 사진" hint="(선택)" photos={problemPhotos} setter={setProblemPhotos} inputRef={problemRef} kind="before" upload={upload} />

      <div className="space-y-1.5">
        <p className="text-xs font-medium">자세한 내용 <span className="font-normal text-muted-foreground">(선택)</span></p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="예: 머리카락과 물때가 뭉쳐 있었어요"
          className="w-full rounded-lg border p-3 text-sm outline-none focus:border-primary resize-none bg-white"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">어떻게 했나요? <span className="font-normal text-muted-foreground">(적으면 해결로 기록돼요)</span></p>
        <textarea
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          rows={2}
          placeholder="예: 뚫어서 물 빠짐 정상으로 돌아왔어요. / 부품이 없어 이번엔 못 고쳤어요"
          className="w-full rounded-lg border p-3 text-sm outline-none focus:border-primary resize-none bg-white"
        />
      </div>

      <PhotoRow label="결과 사진" hint="(선택)" photos={resultPhotos} setter={setResultPhotos} inputRef={resultRef} kind="after" upload={upload} />

      {/* 급한 건만 알림이 간다 — 전부 알리면 알림이 흔해져 정작 급한 걸 놓친다 */}
      <label className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
        <input
          type="checkbox"
          checked={isUrgent}
          onChange={(e) => setIsUrgent(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-xs text-rose-900 leading-relaxed">
          <b>급한 건이에요 — 사장님께 바로 알려주세요</b>
          <br />
          월말 보고서까지 기다리면 안 되는 일이면 체크해주세요. 사장님 폰으로 바로 알림이 가요.
        </span>
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="flex-1 h-12 rounded-lg border text-sm bg-white"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="flex-1 h-12 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-60"
        >
          {isPending ? '등록 중...' : '등록하기'}
        </button>
      </div>
    </div>
  )
}
