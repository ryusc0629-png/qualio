'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Plus, Trash2, ImagePlus, Sparkles, Loader2, ExternalLink, Send, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  newOnboardingItem,
  RESOLUTION_LABEL,
  RESULT_LABEL,
  type OnboardingItem,
  type ResolutionKind,
  type ResultKind,
} from '@/lib/onboarding/types'
import { saveOnboardingReportAction, generateOnboardingNotesAction, sendOnboardingReportAction } from '@/lib/actions/onboarding-reports'

interface Props {
  contractId: string
  businessId: string
  customerName: string
  serviceType: string | null
  initial: {
    reportId: string | null
    publicToken: string | null
    beforeNote: string
    specNote: string
    managementNote: string
    items: OnboardingItem[]
    status: string
    alimtalkSentAt: string | null
    /** 현장 직원이 쓴 첫 방문 보고서에서 초안을 끌어왔는지 — 안내 문구용 */
    prefilled: boolean
  }
}

// 현장에서 파일을 골라 Storage(post-images)에 올리고 public URL을 돌려받는다
async function uploadImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/upload-image', { method: 'POST', body: fd })
  const json = (await res.json()) as { url?: string; error?: string }
  if (!res.ok || !json.url) throw new Error(json.error ?? '업로드에 실패했어요')
  return json.url
}

export function OnboardingReportEditor({ contractId, businessId, customerName, serviceType, initial }: Props) {
  const [items, setItems] = useState<OnboardingItem[]>(
    initial.items.length > 0 ? initial.items : [newOnboardingItem()],
  )
  const [beforeNote, setBeforeNote] = useState(initial.beforeNote)
  const [specNote, setSpecNote] = useState(initial.specNote)
  const [managementNote, setManagementNote] = useState(initial.managementNote)
  const [publicToken, setPublicToken] = useState(initial.publicToken)
  // 이미 보냈는지 — 보낸 뒤엔 버튼을 '보냈어요'로 바꿔 두 번 눌러 두 번 가지 않게 한다
  const [alimtalkSentAt, setAlimtalkSentAt] = useState(initial.alimtalkSentAt)
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  const patchItem = (id: string, patch: Partial<OnboardingItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))

  const addItem = () => setItems((prev) => [...prev, newOnboardingItem()])
  const removeItem = (id: string) =>
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((it) => it.id !== id)))

  const handlePhoto = async (id: string, slot: 'beforeUrl' | 'afterUrl', file: File) => {
    setUploadingId(id + slot)
    try {
      const url = await uploadImage(file)
      patchItem(id, { [slot]: url })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '사진을 올리지 못했어요')
    } finally {
      setUploadingId(null)
    }
  }

  const { execute: generate, isPending: isGenerating } = useAction(generateOnboardingNotesAction, {
    onSuccess: ({ data }) => {
      if (data?.notes) {
        setSpecNote(data.notes.specNote)
        setManagementNote(data.notes.managementNote)
        toast.success('초안을 넣었어요 — 확인하고 손봐주세요')
      }
    },
    onError: () => toast.error('초안을 만들지 못했어요. 잠시 후 다시 시도해주세요'),
  })

  const { execute: save, isPending: isSaving } = useAction(saveOnboardingReportAction, {
    onSuccess: ({ data }) => {
      if (data?.publicToken) setPublicToken(data.publicToken)
      toast.success('저장했어요')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '저장하지 못했어요. 다시 눌러주세요'),
  })

  const doSave = (status: 'draft' | 'shared') =>
    save({ contractId, beforeNote, specNote, managementNote, items, status })

  const { execute: sendReport, isPending: isSending } = useAction(sendOnboardingReportAction, {
    onSuccess: ({ data }) => {
      if (data?.sent) {
        setAlimtalkSentAt(new Date().toISOString())
        toast.success('거래처에 카톡으로 보냈어요!')
      } else {
        // 템플릿 심사 중 — 거짓으로 '보냈다'고 하지 않는다
        toast.error('아직 카톡으로는 못 보내요. 아래 미리보기 링크를 복사해 직접 보내주세요')
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? '보내지 못했어요. 다시 눌러주세요'),
  })

  // 저장하지 않은 내용이 그대로 나가지 않게, 보내기 전에 항상 한 번 저장한다
  const doSend = () => {
    if (!confirm('리포트를 검토하셨나요?\n\n거래처에 카카오톡으로 리포트가 발송됩니다.')) return
    save({ contractId, beforeNote, specNote, managementNote, items, status: 'shared' })
    sendReport({ contractId })
  }

  const previewUrl = publicToken ? `/q/${businessId}/onboarding-report/${publicToken}` : null

  return (
    <div className="space-y-6">
      {/* 현장에서 끌어온 초안이면 먼저 알려준다 — 내가 안 쓴 내용이 왜 있는지 */}
      {initial.prefilled && (
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-900">
          <p className="font-semibold">현장 직원이 쓴 첫 방문 기록을 미리 넣어뒀어요</p>
          <p className="text-xs text-blue-800/80 mt-1">
            사진과 메모는 그대로 가져왔어요. 어디를 작업했는지(공간 이름)만 채우고,
            문장은 자유롭게 고치신 다음 저장하세요.
          </p>
        </div>
      )}

      {/* 안내 */}
      <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-emerald-800">
        <p className="font-semibold">{customerName} 초도(첫) 작업 리포트</p>
        <p className="text-xs text-emerald-700 mt-1">
          문제 부분을 사진과 함께 기록하고, 어떻게 작업했는지·앞으로 어떻게 관리할지 정리하세요.
          완성한 리포트는 방문이나 통화로 직접 전해드리면 신뢰가 훨씬 올라가요.
        </p>
      </div>

      {/* 현황 요약(도입 문구) — 선택 */}
      <section className="space-y-2">
        <label className="text-sm font-semibold">현황 한 줄 요약 <span className="text-xs font-normal text-muted-foreground">(선택)</span></label>
        <Textarea
          value={beforeNote}
          onChange={(e) => setBeforeNote(e.target.value)}
          placeholder="예: 오래 관리가 안 된 곳이 몇 군데 있어 이번에 집중해서 잡았습니다."
          rows={2}
        />
      </section>

      {/* 문제 항목 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">문제 · 작업 항목</h2>
          <span className="text-xs text-muted-foreground">{items.length}개</span>
        </div>

        {items.map((it, idx) => {
          const beforeBusy = uploadingId === it.id + 'beforeUrl'
          const afterBusy = uploadingId === it.id + 'afterUrl'
          return (
            <div key={it.id} className="rounded-xl border border-border bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">{idx + 1}번</span>
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  className="text-muted-foreground hover:text-rose-500 disabled:opacity-30"
                  disabled={items.length <= 1}
                  aria-label="항목 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <Input
                value={it.space}
                onChange={(e) => patchItem(it.id, { space: e.target.value })}
                placeholder="구역 (예: 주방 바닥, 남자화장실, 로비)"
              />
              <Textarea
                value={it.problem}
                onChange={(e) => patchItem(it.id, { problem: e.target.value })}
                placeholder="현재 상태·문제 (예: 바닥에 찌든 때가 굳어 있어요)"
                rows={2}
              />

              {/* 해결 구분 */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">이 문제는</label>
                <select
                  value={it.resolution}
                  onChange={(e) => patchItem(it.id, { resolution: e.target.value as ResolutionKind })}
                  className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {(Object.keys(RESOLUTION_LABEL) as ResolutionKind[]).map((k) => (
                    <option key={k} value={k}>{RESOLUTION_LABEL[k]}</option>
                  ))}
                </select>
              </div>

              {/* 사진 before/after */}
              <div className="grid grid-cols-2 gap-3">
                <PhotoSlot
                  label="작업 전"
                  url={it.beforeUrl}
                  busy={beforeBusy}
                  onPick={(f) => handlePhoto(it.id, 'beforeUrl', f)}
                  onClear={() => patchItem(it.id, { beforeUrl: null })}
                />
                <PhotoSlot
                  label="작업 후"
                  url={it.afterUrl}
                  busy={afterBusy}
                  onPick={(f) => handlePhoto(it.id, 'afterUrl', f)}
                  onClear={() => patchItem(it.id, { afterUrl: null })}
                />
              </div>

              {/* 결과 + 다음 액션 */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">작업 결과</label>
                <select
                  value={it.result}
                  onChange={(e) => patchItem(it.id, { result: e.target.value as ResultKind })}
                  className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">아직 미정</option>
                  {(Object.keys(RESULT_LABEL) as Exclude<ResultKind, ''>[]).map((k) => (
                    <option key={k} value={k}>{RESULT_LABEL[k]}</option>
                  ))}
                </select>
              </div>
              <Input
                value={it.nextAction}
                onChange={(e) => patchItem(it.id, { nextAction: e.target.value })}
                placeholder="다음 제안 (예: 다음 방문 때 한 번 더 관리하면 좋아요) — 선택"
              />
            </div>
          )
        })}

        <Button type="button" variant="outline" onClick={addItem} className="w-full h-11">
          <Plus className="h-4 w-4 mr-1" /> 항목 추가
        </Button>
      </section>

      {/* 작업 시방 + 관리 멘트 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">작업 시방 · 관리 멘트</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => generate({ contractId, items })} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            전문가 초안 작성
          </Button>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">이렇게 작업하겠습니다 (작업 시방)</label>
          <Textarea value={specNote} onChange={(e) => setSpecNote(e.target.value)} rows={4}
            placeholder="문제를 어떻게 작업할지 정중히 설명하세요. '전문가 초안 작성'을 누르면 초안이 채워져요." />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">앞으로 이렇게 관리하겠습니다 (관리 멘트)</label>
          <Textarea value={managementNote} onChange={(e) => setManagementNote(e.target.value)} rows={4}
            placeholder="앞으로 관리하겠다는 다짐과, 같은 문제가 다시 생길 수 있음을 정직하게 전하세요." />
        </div>
      </section>

      {/* 저장 · 공유 */}
      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-white/90 backdrop-blur border-t border-border flex items-center gap-2">
        <Button type="button" variant="outline" className="flex-1 h-12" onClick={() => doSave('draft')} disabled={isSaving}>
          {isSaving ? '저장 중...' : '임시 저장'}
        </Button>
        {alimtalkSentAt ? (
          <div className="flex-1 h-12 flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> 거래처에 보냈어요
          </div>
        ) : (
          <Button type="button" className="flex-1 h-12 gap-1.5" onClick={doSend} disabled={isSaving || isSending}>
            <Send className="h-4 w-4" />
            {isSending ? '보내는 중...' : '검토 후 거래처에 보내기'}
          </Button>
        )}
      </div>

      {previewUrl && (
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline py-2"
        >
          <ExternalLink className="h-4 w-4" /> 리포트 미리보기 · PDF로 저장하기
        </a>
      )}
    </div>
  )
}

// 사진 한 칸 — 없으면 올리기 버튼, 있으면 썸네일 + 지우기
function PhotoSlot({
  label, url, busy, onPick, onClear,
}: {
  label: string
  url: string | null
  busy: boolean
  onPick: (f: File) => void
  onClear: () => void
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {url ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="w-full h-28 object-cover rounded-lg border border-border" />
          <button
            type="button"
            onClick={onClear}
            className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"
            aria-label="사진 지우기"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center h-28 rounded-lg border border-dashed border-border bg-muted/30 cursor-pointer text-muted-foreground hover:bg-muted/50">
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <ImagePlus className="h-5 w-5" />
              <span className="text-xs mt-1">사진 올리기</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPick(f)
              e.target.value = ''
            }}
          />
        </label>
      )}
    </div>
  )
}
