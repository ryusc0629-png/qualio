'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Send, Star, CheckCircle2, ClipboardList, Phone, FileText } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { sendReviewRequestAction } from '@/lib/actions/reports'

interface UnreportedBooking {
  bookingId: string
  customer_name: string
  customer_phone: string | null
  scheduled_at: string
  final_price?: number
  cleaning_type?: string | null
}

interface UnreviewedItem {
  reportId: string
  customer_name: string
  customer_phone: string | null
  scheduled_at: string
}

interface Props {
  unreportedBookings: UnreportedBooking[]
  unreviewedItems:    UnreviewedItem[]
}

// ── 작업완료 알림톡 행 ───────────────────────────────────

function UnreportedRow({ booking }: { booking: UnreportedBooking }) {
  const dateLabel = booking.scheduled_at
    ? format(new Date(booking.scheduled_at), 'M월 d일 (EEE)', { locale: ko })
    : '—'

  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{booking.customer_name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{dateLabel}</p>
      </div>
      <Link href={`/dashboard/bookings/${booking.bookingId}/report`}>
        <Button size="sm" className="h-10 gap-1.5 shrink-0 px-4">
          <FileText className="h-3.5 w-3.5" />
          보고서 작성
        </Button>
      </Link>
    </div>
  )
}

// ── 리뷰 요청 행 ────────────────────────────────────────

function UnreviewedRow({
  item,
  onSent,
}: {
  item: UnreviewedItem
  onSent: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  const { execute, isPending } = useAction(sendReviewRequestAction, {
    onSuccess: () => {
      toast.success(`${item.customer_name}님께 리뷰 요청 알림톡을 발송했어요!`)
      setOpen(false)
      onSent(item.reportId)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const dateLabel = item.scheduled_at
    ? format(new Date(item.scheduled_at), 'M월 d일 (EEE)', { locale: ko })
    : '—'

  return (
    <>
      <div className="flex items-center gap-3 py-3.5 border-b border-border last:border-0">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{item.customer_name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{dateLabel}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-10 gap-1.5 shrink-0 px-4"
          onClick={() => setOpen(true)}
        >
          <Star className="h-3.5 w-3.5" />
          리뷰 요청
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>리뷰 요청 알림톡 발송</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              아래 고객에게 리뷰 요청 알림톡을 발송할까요?
            </p>
            <div className="rounded-xl bg-muted/50 p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0">받는 분</span>
                <span className="text-sm font-semibold">{item.customer_name}</span>
              </div>
              {item.customer_phone && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">연락처</span>
                  <span className="text-sm flex items-center gap-1">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    {item.customer_phone}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0">작업일</span>
                <span className="text-sm">{dateLabel}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0 pt-0.5">내용</span>
                <span className="text-sm text-muted-foreground leading-relaxed">
                  네이버 플레이스 리뷰 작성 링크가 전달돼요
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button
              className="flex-1 gap-1.5"
              disabled={isPending}
              onClick={() => execute({ reportId: item.reportId })}
            >
              <Star className="h-3.5 w-3.5" />
              {isPending ? '발송 중...' : '리뷰 요청 발송'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────

export function AlimtalkTodoList({ unreportedBookings, unreviewedItems }: Props) {
  const [sentReportIds, setSentReportIds] = useState(new Set<string>())

  const visibleUnreported = unreportedBookings
  const visibleUnreviewed = unreviewedItems.filter((i) => !sentReportIds.has(i.reportId))

  if (visibleUnreported.length === 0 && visibleUnreviewed.length === 0) {
    return (
      <div className="text-center py-20 space-y-3">
        <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
        <p className="font-semibold text-lg">모두 완료됐어요!</p>
        <p className="text-sm text-muted-foreground">발송할 알림톡이 없어요</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {visibleUnreported.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border bg-orange-50">
            <ClipboardList className="h-4 w-4 text-orange-600 shrink-0" />
            <p className="text-sm font-semibold text-orange-800">
              작업 보고서 미발송 — {visibleUnreported.length}명
            </p>
          </div>
          <div className="px-4">
            {visibleUnreported.map((b) => (
              <UnreportedRow
                key={b.bookingId}
                booking={b}
              />
            ))}
          </div>
        </div>
      )}

      {visibleUnreviewed.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border bg-yellow-50">
            <Star className="h-4 w-4 text-yellow-600 shrink-0" />
            <p className="text-sm font-semibold text-yellow-800">
              리뷰 요청 미발송 — {visibleUnreviewed.length}명
            </p>
          </div>
          <div className="px-4">
            {visibleUnreviewed.map((i) => (
              <UnreviewedRow
                key={i.reportId}
                item={i}
                onSent={(id) => setSentReportIds((prev) => new Set([...prev, id]))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
