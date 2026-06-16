'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Send, Star, CheckCircle2, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveReportAction, sendReviewRequestAction } from '@/lib/actions/reports'

interface UnreportedBooking {
  bookingId: string
  customer_name: string
  scheduled_at: string
}

interface UnreviewedItem {
  reportId: string
  customer_name: string
  scheduled_at: string
}

interface Props {
  unreportedBookings: UnreportedBooking[]
  unreviewedItems: UnreviewedItem[]
}

function UnreportedRow({
  booking,
  onSent,
}: {
  booking: UnreportedBooking
  onSent: (id: string) => void
}) {
  const { execute, isPending } = useAction(saveReportAction, {
    onSuccess: () => {
      toast.success(`${booking.customer_name}님께 작업완료 알림톡을 발송했어요!`)
      onSent(booking.bookingId)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const dateLabel = booking.scheduled_at
    ? format(new Date(booking.scheduled_at), 'M월 d일 (EEE)', { locale: ko })
    : '—'

  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{booking.customer_name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{dateLabel}</p>
      </div>
      <Button
        size="sm"
        className="h-10 gap-1.5 shrink-0 px-4"
        disabled={isPending}
        onClick={() =>
          execute({
            bookingId:       booking.bookingId,
            beforePhotoUrls: [],
            afterPhotoUrls:  [],
            sendAlimtalk:    true,
          })
        }
      >
        <Send className="h-3.5 w-3.5" />
        {isPending ? '발송 중...' : '발송하기'}
      </Button>
    </div>
  )
}

function UnreviewedRow({
  item,
  onSent,
}: {
  item: UnreviewedItem
  onSent: (id: string) => void
}) {
  const { execute, isPending } = useAction(sendReviewRequestAction, {
    onSuccess: () => {
      toast.success(`${item.customer_name}님께 리뷰 요청 알림톡을 발송했어요!`)
      onSent(item.reportId)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const dateLabel = item.scheduled_at
    ? format(new Date(item.scheduled_at), 'M월 d일 (EEE)', { locale: ko })
    : '—'

  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{item.customer_name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{dateLabel}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-10 gap-1.5 shrink-0 px-4"
        disabled={isPending}
        onClick={() => execute({ reportId: item.reportId })}
      >
        <Star className="h-3.5 w-3.5" />
        {isPending ? '발송 중...' : '리뷰 요청'}
      </Button>
    </div>
  )
}

export function AlimtalkTodoList({ unreportedBookings, unreviewedItems }: Props) {
  const [sentBookingIds, setSentBookingIds] = useState(new Set<string>())
  const [sentReportIds, setSentReportIds]   = useState(new Set<string>())

  const visibleUnreported = unreportedBookings.filter((b) => !sentBookingIds.has(b.bookingId))
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
      {/* 작업완료 알림톡 미발송 */}
      {visibleUnreported.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border bg-orange-50">
            <ClipboardList className="h-4 w-4 text-orange-600 shrink-0" />
            <p className="text-sm font-semibold text-orange-800">
              작업완료 알림톡 미발송 — {visibleUnreported.length}명
            </p>
          </div>
          <div className="px-4">
            {visibleUnreported.map((b) => (
              <UnreportedRow
                key={b.bookingId}
                booking={b}
                onSent={(id) => setSentBookingIds((prev) => new Set([...prev, id]))}
              />
            ))}
          </div>
        </div>
      )}

      {/* 리뷰 요청 미발송 */}
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
