'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClaimAction } from '@/lib/actions/claims'
import { Plus, X } from 'lucide-react'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
import { useAutoFocusRef } from '@/lib/hooks/use-auto-focus'
import { formatPhone } from '@/lib/format/phone'

const schema = z.object({
  customer_name:  z.string().min(1, '고객 이름을 입력해주세요'),
  customer_phone: z.string().optional(),
  title:          z.string().min(1, '어떤 문제인지 한 줄로 적어주세요'),
  content:        z.string().optional(),
  is_urgent:      z.boolean().optional(),
})

type FormInput = z.infer<typeof schema>

export function AddClaimForm() {
  const [open, setOpen] = useState(false)
  const focusRef = useAutoFocusRef<HTMLDivElement>()
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
  })

  const { execute, isPending } = useAction(createClaimAction, {
    onSuccess: () => {
      toast.success('클레임을 등록했어요')
      reset()
      setOpen(false)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '다시 시도해주세요')
    },
  })

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="h-12">
        <Plus className="h-4 w-4 mr-1.5" />
        클레임 등록하기
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <ScrollLock />
      <div
        ref={focusRef}
        tabIndex={-1}
        className="bg-background rounded-xl border shadow-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto overscroll-contain outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">클레임 등록</h2>
          <button onClick={() => setOpen(false)} aria-label="닫기">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => execute({ ...data }))} className="space-y-3">
          {/* 고객 이름 */}
          <div className="space-y-1">
            <Label htmlFor="customer_name">고객 이름 (필수)</Label>
            <Input id="customer_name" placeholder="해오름홀딩스 / 김영희" {...register('customer_name')} />
            {errors.customer_name && <p className="text-xs text-destructive">{errors.customer_name.message}</p>}
          </div>

          {/* 연락처 */}
          <div className="space-y-1">
            <Label htmlFor="customer_phone">연락처</Label>
            <Input
              id="customer_phone"
              placeholder="010-1234-5678"
              inputMode="tel"
              autoComplete="off"
              value={watch('customer_phone') ?? ''}
              onChange={(e) => setValue('customer_phone', formatPhone(e.target.value))}
            />
          </div>

          {/* 문제 요약 */}
          <div className="space-y-1">
            <Label htmlFor="title">어떤 문제인가요? (필수)</Label>
            <Input id="title" placeholder="욕실 곰팡이가 다시 생겼어요" {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          {/* 상세 내용 */}
          <div className="space-y-1">
            <Label htmlFor="content">자세한 내용</Label>
            <textarea
              id="content"
              {...register('content')}
              placeholder="고객이 말한 내용, 현장 상황, 약속한 것 등을 적어두세요"
              className="w-full min-h-20 rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
            />
          </div>

          {/* 긴급 여부 */}
          <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 cursor-pointer">
            <input type="checkbox" {...register('is_urgent')} className="h-4 w-4" />
            <span className="text-sm font-medium">긴급 — 먼저 처리해야 해요</span>
          </label>

          <Button type="submit" disabled={isPending} className="w-full h-12">
            {isPending ? '등록 중...' : '클레임 등록하기'}
          </Button>
        </form>
      </div>
    </div>
  )
}
