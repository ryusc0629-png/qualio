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
import { createCustomerAction } from '@/lib/actions/customers'
import { Plus, X } from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, '고객명을 입력해주세요'),
  phone: z.string().min(1, '연락처를 입력해주세요'),
  address: z.string().optional(),
  category: z.string().optional(),
  type: z.string(),
  lead_id: z.string().optional(),
  notes: z.string().optional(),
})

type FormInput = z.infer<typeof schema>

const CATEGORIES = ['카페', '병원', '학원', '오피스', '상가', '식당', '헬스장', '기타']

interface AddCustomerFormProps {
  // 리드에서 전환할 때 초기값 전달 (옵션)
  defaultValues?: {
    name?: string
    phone?: string
    address?: string
    category?: string
    lead_id?: string
  }
}

export function AddCustomerForm({ defaultValues }: AddCustomerFormProps) {
  const [open, setOpen] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'one_time',
      ...defaultValues,
    },
  })

  const { execute, isPending } = useAction(createCustomerAction, {
    onSuccess: () => {
      toast.success('고객이 등록되었습니다')
      reset()
      setOpen(false)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '등록에 실패했습니다')
    },
  })

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" />
        고객 추가
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl border shadow-lg w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">고객 추가</h2>
          <button onClick={() => setOpen(false)}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => execute(data))} className="space-y-3">
          {/* 고객명 */}
          <div className="space-y-1">
            <Label htmlFor="name">고객(업체)명 *</Label>
            <Input id="name" placeholder="강남 웰니스 카페" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          {/* 고객 유형 */}
          <div className="space-y-1">
            <Label>고객 유형</Label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" value="one_time" {...register('type')} className="accent-primary" />
                <div>
                  <p className="text-sm font-medium">일회성</p>
                  <p className="text-xs text-muted-foreground">단발 방문 고객</p>
                </div>
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" value="recurring" {...register('type')} className="accent-primary" />
                <div>
                  <p className="text-sm font-medium">정기 고객</p>
                  <p className="text-xs text-muted-foreground">계약 후 정기 방문</p>
                </div>
              </label>
            </div>
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
          <div className="space-y-1">
            <Label htmlFor="phone">연락처 *</Label>
            <Input id="phone" placeholder="010-0000-0000" {...register('phone')} />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>

          {/* 주소 */}
          <div className="space-y-1">
            <Label htmlFor="address">주소</Label>
            <Input id="address" placeholder="서울시 강남구..." {...register('address')} />
          </div>

          {/* 숨김 필드: lead_id */}
          <input type="hidden" {...register('lead_id')} />

          {/* 메모 */}
          <div className="space-y-1">
            <Label htmlFor="notes">메모</Label>
            <textarea
              id="notes"
              {...register('notes')}
              placeholder="특이사항, 선호사항..."
              className="w-full min-h-[60px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" className="flex-1" disabled={isPending}>
              {isPending ? '등록 중...' : '등록'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
