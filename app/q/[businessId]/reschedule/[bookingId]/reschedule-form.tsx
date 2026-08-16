'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { requestRescheduleAction } from '@/lib/actions/quotes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check } from 'lucide-react'

// 오늘(한국 시간) — 지난 날짜를 못 고르게 막는다
const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

// 30분 단위 (오전 7시 ~ 오후 7시) — 분 단위 입력은 부담이 크다
const TIME_OPTIONS = Array.from({ length: 25 }, (_, i) => {
  const h = 7 + Math.floor(i / 2)
  const m = i % 2 === 0 ? '00' : '30'
  const ampm = h < 12 ? '오전' : '오후'
  const h12 = h > 12 ? h - 12 : h
  return { value: `${String(h).padStart(2, '0')}:${m}`, label: `${ampm} ${h12}:${m}` }
})

interface Props {
  bookingId: string
  businessId: string
  businessName: string
  businessPhone: string | null
}

export function RescheduleForm({ bookingId, businessId, businessName, businessPhone }: Props) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [note, setNote] = useState('')
  const [done, setDone] = useState(false)

  const { execute, isPending } = useAction(requestRescheduleAction, {
    onSuccess: () => setDone(true),
    onError: ({ error }) => toast.error(error.serverError ?? '요청을 못 보냈어요. 다시 눌러주세요'),
  })

  if (done) {
    return (
      <div className="space-y-3 text-center py-4">
        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <Check className="h-6 w-6 text-emerald-600" />
        </div>
        <p className="text-sm font-semibold text-emerald-700">요청을 보냈어요!</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {businessName}에서 확인하고 연락드릴 거예요.
          <br />
          바로 확정되는 건 아니니 조금만 기다려 주세요.
        </p>
        {businessPhone && (
          <a
            href={`tel:${businessPhone}`}
            className="inline-flex h-11 items-center justify-center rounded-xl border px-4 text-sm font-medium"
          >
            급하시면 전화하기
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">언제로 바꿀까요? (필수)</Label>
        <Input
          type="date"
          min={todayKst}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-12 rounded-xl"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">희망 시간</Label>
        <select
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
        >
          {TIME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">남기실 말씀 (선택)</Label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="예: 그날 오전에 일이 생겨서요"
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base resize-none"
        />
      </div>

      <Button
        type="button"
        className="w-full h-12 text-base font-semibold"
        disabled={isPending || !date}
        onClick={() => execute({
          booking_id:     bookingId,
          business_id:    businessId,
          scheduled_date: date,
          scheduled_time: time,
          note:           note.trim() || undefined,
        })}
      >
        {isPending ? '보내는 중...' : '변경 요청 보내기'}
      </Button>

      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        바로 변경되지는 않아요. 업체가 확인하고 연락드립니다.
      </p>
    </div>
  )
}
