'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateWorkerPayAction, postPayrollExpenseAction } from '@/lib/actions/payroll'
import { PAY_TYPE_LABEL, PAY_TYPE_UNIT, type PayType } from '@/lib/payroll/compute'

const PAY_TYPES: PayType[] = ['hourly', 'daily', 'per_visit']

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
  const [type, setType] = useState<PayType>(payType ?? 'hourly')
  const [rate, setRate] = useState(payRate ? String(payRate) : '')

  const { execute, isPending } = useAction(updateWorkerPayAction, {
    onSuccess: () => toast.success('단가를 저장했어요!'),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as PayType)}
        className="h-9 rounded-md border bg-background px-2 text-sm"
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
          placeholder="단가"
          className="h-9 w-28 pr-11 text-right text-sm"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
          {PAY_TYPE_UNIT[type].replace('원', '')}
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-9"
        disabled={isPending || !rate}
        onClick={() => execute({ workerId, payType: type, payRate: Number(rate) })}
      >
        {isPending ? '저장...' : '저장'}
      </Button>
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
