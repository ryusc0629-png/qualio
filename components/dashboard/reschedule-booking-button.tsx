'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { rescheduleBookingAction } from '@/lib/actions/bookings'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CalendarClock } from 'lucide-react'

interface RescheduleBookingButtonProps {
  bookingId:   string
  scheduledAt: string  // 현재 일시 (ISO)
  customerPhone: string | null
}

// ISO 문자열을 datetime-local input에 맞는 형식으로 변환
function toDatetimeLocal(isoString: string): string {
  const date = new Date(isoString)
  // KST(+9) 기준으로 변환
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 16)  // "YYYY-MM-DDTHH:mm"
}

export function RescheduleBookingButton({
  bookingId,
  scheduledAt,
  customerPhone,
}: RescheduleBookingButtonProps) {
  const [open, setOpen]               = useState(false)
  const [newDatetime, setNewDatetime] = useState(() => toDatetimeLocal(scheduledAt))

  const { execute, isPending } = useAction(rescheduleBookingAction, {
    onSuccess: () => {
      toast.success(
        customerPhone
          ? '일정이 변경됐어요. 고객에게 알림톡을 발송했습니다.'
          : '일정이 변경됐어요.'
      )
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDatetime) return
    execute({ booking_id: bookingId, new_scheduled_at: newDatetime })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
          title="일정 변경"
        >
          <CalendarClock className="h-3.5 w-3.5" />
          일정 변경
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>예약 일정 변경</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">

          {/* 현재 일시 */}
          <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
            <p className="text-xs text-muted-foreground mb-1">현재 예약 일시</p>
            <p className="font-medium">
              {new Date(scheduledAt).toLocaleString('ko-KR', {
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
                timeZone: 'Asia/Seoul',
              })}
            </p>
          </div>

          {/* 새 일시 */}
          <div className="space-y-1.5">
            <Label htmlFor="newDatetime">변경할 날짜·시간 (필수)</Label>
            <Input
              id="newDatetime"
              type="datetime-local"
              value={newDatetime}
              onChange={(e) => setNewDatetime(e.target.value)}
              required
            />
          </div>

          {/* 알림톡 안내 */}
          {customerPhone && (
            <p className="text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
              저장하면 <span className="font-semibold text-primary">{customerPhone}</span>로
              일정 변경 알림톡이 자동 발송됩니다.
            </p>
          )}

          <Button type="submit" className="w-full h-12" disabled={isPending}>
            {isPending ? '변경 중...' : '일정 변경하기'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
