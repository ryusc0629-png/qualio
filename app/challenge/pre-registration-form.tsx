'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle2 } from 'lucide-react'
import { submitPreRegistrationAction } from '@/lib/actions/pre-registration'

type FormValues = { name: string; phone: string }
type OwnerStatus = 'operating' | 'preparing'

const OWNER_OPTIONS: { value: OwnerStatus; emoji: string; label: string }[] = [
  { value: 'operating', emoji: '🧹', label: '청소업체\n운영 중' },
  { value: 'preparing', emoji: '🚀', label: '청소 창업\n준비 중' },
]

export function PreRegistrationForm() {
  const [ownerStatus, setOwnerStatus] = useState<OwnerStatus | ''>('')
  const [done, setDone] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { name: '', phone: '' } })

  const { execute, isPending } = useAction(submitPreRegistrationAction, {
    onSuccess: () => setDone(true),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  // 접수 완료 화면
  if (done) {
    return (
      <div className="text-center py-8 space-y-3">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-primary" />
        </div>
        <p className="font-bold text-lg">사전신청이 접수됐어요!</p>
        <p className="text-sm text-muted-foreground break-keep">
          챌린지 결과가 좋으면 가장 먼저 알림 드릴게요.
          조금만 기다려 주세요.
        </p>
      </div>
    )
  }

  const onSubmit = (values: FormValues) => {
    if (!ownerStatus) {
      toast.error('해당하는 항목을 선택해주세요')
      return
    }
    execute({ ...values, owner_status: ownerStatus })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* 자격 구분 — 카드형 선택 */}
      <div className="space-y-2">
        <p className="text-sm font-medium">지금 어디에 해당하세요? (필수)</p>
        <div className="grid grid-cols-2 gap-3">
          {OWNER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setOwnerStatus(opt.value)}
              className={`h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition ${
                ownerStatus === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background'
              }`}
            >
              <span className="text-2xl">{opt.emoji}</span>
              <span className="text-sm font-medium whitespace-pre-line text-center leading-tight">
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 이름 또는 상호 */}
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          이름 또는 상호 (필수)
        </label>
        <Input
          id="name"
          placeholder="예: 김철수 / 다트클린"
          className="h-12"
          {...register('name', { required: '이름 또는 상호를 입력해주세요' })}
        />
        {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
      </div>

      {/* 전화번호 */}
      <div className="space-y-1.5">
        <label htmlFor="phone" className="text-sm font-medium">
          연락받을 전화번호 (필수)
        </label>
        <Input
          id="phone"
          inputMode="tel"
          placeholder="010-1234-5678"
          className="h-12"
          {...register('phone', { required: '전화번호를 입력해주세요' })}
        />
        {errors.phone && <p className="text-sm text-red-500">{errors.phone.message}</p>}
        <p className="text-xs text-muted-foreground break-keep">
          챌린지 중 좋은 성과가 나오면 알려드려요! 광고 문자는 보내지 않아요.
        </p>
      </div>

      <Button type="submit" disabled={isPending} className="w-full h-12 text-base font-bold">
        {isPending ? '신청 중...' : '사전 알림 신청하기'}
      </Button>
      <p className="text-xs text-center text-muted-foreground break-keep">
        지금 신청하면 <b className="text-foreground">첫 달 무료 · 가격 평생 고정</b> 혜택을 드려요.
      </p>
    </form>
  )
}
