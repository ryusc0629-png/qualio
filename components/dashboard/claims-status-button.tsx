'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { ShieldAlert, ChevronRight, AlertTriangle, CheckCircle2, ClipboardList } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getClaimsByPhoneAction } from '@/lib/actions/claims'
import { ClaimActions } from './claim-actions'
import { ClaimAssignee } from './claim-assignee'
import { AddClaimForm } from './add-claim-form'

interface Claim {
  id: string
  title: string
  content: string | null
  is_urgent: boolean
  status: string
  resolution: string | null
  created_at: string
  resolved_at: string | null
  relatedBooking?: string | null
  assigned_worker_id?: string | null
}

interface WorkerOpt {
  id: string
  name: string
}

interface Props {
  customerId: string | null
  customerName: string
  customerPhone: string | null
  bookingId: string
  // 클레임을 불러올 때마다 미해결 건 존재 여부를 알려줌 (캘린더 배지 즉시 갱신용)
  onOpenClaimsChange?: (hasOpen: boolean) => void
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })

// 예약 상세에서 '클레임 처리 현황 확인하기' — 페이지 이동 없이 모달로 그 고객 클레임을 보고 처리
export function ClaimsStatusButton({ customerId, customerName, customerPhone, bookingId, onOpenClaimsChange }: Props) {
  const [open, setOpen] = useState(false)
  const [claims, setClaims] = useState<Claim[]>([])
  const [workers, setWorkers] = useState<WorkerOpt[]>([])

  const { execute, isPending } = useAction(getClaimsByPhoneAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      const loaded = data.claims as Claim[]
      setClaims(loaded)
      setWorkers(data.workers as WorkerOpt[])
      // 미해결 클레임이 하나도 없으면 캘린더 배지를 끄도록 부모에 알림
      onOpenClaimsChange?.(loaded.some((c) => c.status !== 'resolved'))
    },
  })

  function load() {
    if (customerPhone) execute({ customerPhone })
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (v) load()
  }

  const openClaims = claims.filter((c) => c.status !== 'resolved')
  const resolvedClaims = claims.filter((c) => c.status === 'resolved')

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 transition-colors mb-4"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
          <div className="text-left">
            <span className="text-sm font-semibold text-rose-700">클레임 처리 현황 확인하기</span>
            <p className="text-xs text-rose-600/80 mt-0.5">이 고객의 미해결 클레임이 있어요</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-rose-400 shrink-0" />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-500" />
              {customerName} · 클레임
            </DialogTitle>
          </DialogHeader>

          {isPending && claims.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">불러오는 중...</p>
          ) : claims.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">등록된 클레임이 없어요</p>
          ) : (
            <div className="space-y-3">
              {/* 미해결 */}
              {openClaims.map((claim) => (
                <article key={claim.id} className="rounded-xl border border-border bg-white p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {claim.is_urgent && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">
                          <AlertTriangle className="h-3 w-3" />
                          긴급
                        </span>
                      )}
                      <p className="font-semibold">{claim.title}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmt(claim.created_at)}</span>
                  </div>
                  {claim.relatedBooking && (
                    <p className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1">
                      <ClipboardList className="h-3 w-3 shrink-0" />
                      관련 작업: {claim.relatedBooking}
                    </p>
                  )}
                  {claim.content && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap border-t border-border pt-2">
                      {claim.content}
                    </p>
                  )}
                  <ClaimAssignee
                    claimId={claim.id}
                    currentWorkerId={claim.assigned_worker_id ?? null}
                    workers={workers}
                    onChanged={load}
                  />
                  <ClaimActions claimId={claim.id} status={claim.status} onChanged={load} />
                </article>
              ))}

              {/* 해결됨 */}
              {resolvedClaims.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-semibold text-muted-foreground">해결됨 ({resolvedClaims.length})</p>
                  {resolvedClaims.map((claim) => (
                    <article key={claim.id} className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-muted-foreground line-through decoration-muted-foreground/40">
                          {claim.title}
                        </p>
                        <span className="shrink-0 inline-flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {claim.resolved_at ? fmt(claim.resolved_at) : '해결'}
                        </span>
                      </div>
                      {claim.resolution && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap border-t border-border pt-2">
                          해결: {claim.resolution}
                        </p>
                      )}
                      <ClaimActions claimId={claim.id} status={claim.status} onChanged={load} />
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 다른 문제로 추가 등록 */}
          <AddClaimForm
            presetCustomer={{ id: customerId ?? '', name: customerName, phone: customerPhone }}
            presetBookingId={bookingId}
            triggerLabel="다른 문제 클레임 추가"
            triggerVariant="outline"
            triggerClassName="w-full h-11"
            onCreated={load}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
