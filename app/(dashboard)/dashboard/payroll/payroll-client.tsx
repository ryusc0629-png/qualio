'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Wallet, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  updateWorkerPayAction,
  postPayrollExpenseAction,
  addPayrollEntryAction,
  deletePayrollEntryAction,
} from '@/lib/actions/payroll'
import { PAY_TYPE_LABEL, PAY_TYPE_UNIT, PAY_TYPE_BASIS, type PayType, type PayrollExtra } from '@/lib/payroll/compute'

// 월급을 맨 앞에 둔다 — 정기 현장을 맡은 직원은 대부분 월급 고정이다
const PAY_TYPES: PayType[] = ['monthly', 'per_visit', 'daily', 'hourly']

// 직원별 급여 방식·단가 인라인 편집
export function WorkerPayEditor({
  workerId,
  payType,
  payRate,
}: {
  workerId: string
  payType: PayType | null
  payRate: number | null
}) {
  const [type, setType] = useState<PayType>(payType ?? 'monthly')
  const [rate, setRate] = useState(payRate ? String(payRate) : '')

  const { execute, isPending } = useAction(updateWorkerPayAction, {
    onSuccess: () => toast.success('저장했어요!'),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as PayType)}
          className="h-11 rounded-md border bg-background px-2 text-sm"
          aria-label="급여 방식"
        >
          {PAY_TYPES.map((t) => (
            <option key={t} value={t}>{PAY_TYPE_LABEL[t]}</option>
          ))}
        </select>
        <div className="relative">
          <Input
            type="text"
            inputMode="numeric"
            value={rate ? Number(rate).toLocaleString('ko-KR') : ''}
            onChange={(e) => setRate(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={type === 'monthly' ? '1,500,000' : '단가'}
            className="h-11 w-32 pr-11 text-right text-sm"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
            {PAY_TYPE_UNIT[type].replace('원', '')}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-11"
          disabled={isPending || !rate}
          onClick={() => execute({ workerId, payType: type, payRate: Number(rate) })}
        >
          {isPending ? '저장...' : '저장'}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{PAY_TYPE_BASIS[type]}</p>
    </div>
  )
}

// 기본급 위에 얹는 줄 — 현장에 따로 준 일당, 추가 업무 수당
export function PayrollExtras({
  workerId,
  month,
  extras,
  bookingOptions,
}: {
  workerId: string
  month: string
  extras: PayrollExtra[]
  bookingOptions: { id: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [bookingId, setBookingId] = useState('')

  const add = useAction(addPayrollEntryAction, {
    onSuccess: () => {
      toast.success('추가했어요!')
      setLabel('')
      setAmount('')
      setBookingId('')
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const remove = useAction(deletePayrollEntryAction, {
    onSuccess: () => toast.success('지웠어요'),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  return (
    <div className="space-y-2 border-t pt-3">
      {extras.length > 0 && (
        <ul className="space-y-1.5">
          {extras.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <span className="block truncate">{e.label}</span>
                {e.bookingLabel && (
                  <span className="block text-[11px] text-muted-foreground truncate">{e.bookingLabel}</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="tabular-nums font-medium">{e.amount.toLocaleString('ko-KR')}원</span>
                <button
                  type="button"
                  aria-label="지우기"
                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                  disabled={remove.isPending}
                  onClick={() => remove.execute({ entryId: e.id })}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="space-y-2 rounded-lg bg-muted/30 p-3">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="현장 일당, 추가 업무 수당"
            className="h-11 text-sm"
          />
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Input
                type="text"
                inputMode="numeric"
                value={amount ? Number(amount).toLocaleString('ko-KR') : ''}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="150,000"
                className="h-11 pr-6 text-right text-sm"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">원</span>
            </div>
          </div>
          {bookingOptions.length > 0 && (
            <select
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              className="h-11 w-full rounded-md border bg-background px-2 text-sm"
              aria-label="어느 현장"
            >
              <option value="">현장 안 고름 (이 달 전체)</option>
              {bookingOptions.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              className="h-11 flex-1"
              disabled={add.isPending || !label.trim() || !amount}
              onClick={() =>
                add.execute({
                  workerId,
                  month,
                  label: label.trim(),
                  amount: Number(amount),
                  bookingId: bookingId || null,
                })
              }
            >
              {add.isPending ? '넣는 중...' : '넣기'}
            </Button>
            <Button type="button" variant="ghost" className="h-11" onClick={() => setOpen(false)}>
              취소
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          이 달에 따로 준 돈 넣기
        </button>
      )}
    </div>
  )
}

// 이 달 급여를 인건비 지출로 장부에 반영
export function PostLedgerButton({
  workerId,
  month,
  disabled,
}: {
  workerId: string
  month: string
  disabled?: boolean
}) {
  const { execute, isPending } = useAction(postPayrollExpenseAction, {
    onSuccess: ({ data }) =>
      toast.success(`장부에 인건비로 반영했어요! (${(data?.amount ?? 0).toLocaleString()}원)`),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-9 gap-1.5"
      disabled={isPending || disabled}
      onClick={() => execute({ workerId, month })}
    >
      <Wallet className="h-3.5 w-3.5" />
      {isPending ? '반영 중...' : '장부에 반영'}
    </Button>
  )
}
