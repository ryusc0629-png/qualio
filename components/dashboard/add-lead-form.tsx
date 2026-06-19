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
import { createLeadAction } from '@/lib/actions/crm'
import { Plus, X } from 'lucide-react'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
import { useAutoFocusRef } from '@/lib/hooks/use-auto-focus'
import { formatPhone } from '@/lib/format/phone'

const schema = z.object({
  company_name: z.string().min(1, '업체명을 입력해주세요'),
  contact_name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  category: z.string().optional(),
  next_follow_up_date: z.string().optional(),
  notes: z.string().optional(),
})

type FormInput = z.infer<typeof schema>

const CATEGORIES = ['카페', '병원', '학원', '오피스', '상가', '식당', '헬스장', '기타']

export function AddLeadForm() {
  const [open, setOpen] = useState(false)
  const focusRef = useAutoFocusRef<HTMLDivElement>()
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
  })

  const { execute, isPending } = useAction(createLeadAction, {
    onSuccess: () => {
      toast.success('잠재고객이 추가되었습니다')
      reset()
      setOpen(false)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '추가에 실패했습니다')
    },
  })

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" />
        잠재고객 추가
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <ScrollLock />
      <div ref={focusRef} tabIndex={-1} className="bg-background rounded-xl border shadow-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto overscroll-contain outline-none">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">잠재고객 추가</h2>
          <button onClick={() => setOpen(false)}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => execute({ ...data }))} className="space-y-3">
          {/* 업체명 */}
          <div className="space-y-1">
            <Label htmlFor="company_name">업체명 *</Label>
            <Input id="company_name" placeholder="강남 웰니스 카페" {...register('company_name')} />
            {errors.company_name && <p className="text-xs text-destructive">{errors.company_name.message}</p>}
          </div>

          {/* 업종 */}
          <div className="space-y-1">
            <Label htmlFor="category">업종</Label>
            <select
              id="category"
              {...register('category')}
              className="w-full h-8 rounded-lg border border-border bg-background px-2.5 text-sm"
            >
              <option value="">선택 안함</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 담당자 + 연락처 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="contact_name">담당자명</Label>
              <Input id="contact_name" placeholder="홍길동" {...register('contact_name')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">연락처</Label>
              <Input
                id="phone"
                placeholder="010-1234-5678"
                inputMode="numeric"
                autoComplete="off"
                value={watch('phone') ?? ''}
                onChange={(e) => setValue('phone', formatPhone(e.target.value))}
              />
            </div>
          </div>

          {/* 주소 */}
          <div className="space-y-1">
            <Label htmlFor="address">주소</Label>
            <Input id="address" placeholder="서울시 강남구..." {...register('address')} />
          </div>

          {/* 다음 팔로업 날짜 */}
          <div className="space-y-1">
            <Label htmlFor="next_follow_up_date">다음 방문/연락 예정일</Label>
            <Input id="next_follow_up_date" type="date" {...register('next_follow_up_date')} />
          </div>

          {/* 메모 */}
          <div className="space-y-1">
            <Label htmlFor="notes">메모</Label>
            <textarea
              id="notes"
              {...register('notes')}
              placeholder="관심 포인트, 거절 이유, 특이사항..."
              className="w-full min-h-[72px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" className="flex-1" disabled={isPending}>
              {isPending ? '추가 중...' : '추가'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
