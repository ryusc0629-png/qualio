'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateCustomerAction } from '@/lib/actions/customers'
import { Pencil, X } from 'lucide-react'

const schema = z.object({
  customerId: z.string().uuid(),
  name: z.string().min(1, '고객명을 입력해주세요'),
  phone: z.string().min(1, '연락처를 입력해주세요'),
  address: z.string().optional(),
  category: z.string().optional(),
  type: z.string(),
  notes: z.string().optional(),
})

type FormInput = z.infer<typeof schema>

const CATEGORIES = ['카페', '병원', '학원', '오피스', '상가', '식당', '헬스장', '기타']

interface EditCustomerButtonProps {
  customer: {
    id: string
    name: string
    phone: string
    address: string | null
    category: string | null
    type: string
    notes: string | null
  }
}

export function EditCustomerButton({ customer }: EditCustomerButtonProps) {
  const [open, setOpen] = useState(false)

  const { register, handleSubmit, control, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address ?? '',
      category: customer.category ?? '',
      type: customer.type,
      notes: customer.notes ?? '',
    },
  })

  const selectedType = useWatch({ control, name: 'type' })
  const isCompany = selectedType === 'recurring'

  const notesRef = useRef<HTMLTextAreaElement | null>(null)

  // 메모 높이 자동 조절
  const autoResize = useCallback(() => {
    const el = notesRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(120, el.scrollHeight) + 'px'
  }, [])

  // 다이얼로그 열림 시 배경 스크롤 잠금 + 메모 높이 초기화
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    // 다음 프레임에서 메모 높이 조절
    requestAnimationFrame(autoResize)
    return () => { document.body.style.overflow = '' }
  }, [open, autoResize])

  const { execute, isPending } = useAction(updateCustomerAction, {
    onSuccess: () => {
      toast.success('수정했어요!')
      setOpen(false)
      window.location.replace(isCompany ? '/dashboard/clients?type=company' : '/dashboard/clients?type=individual')
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '다시 시도해주세요')
    },
  })

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="수정"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div ref={(el) => el?.focus()} tabIndex={-1} className="bg-background rounded-xl border shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-4 outline-none">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">
                {isCompany ? '법인 고객 수정' : '개인 고객 수정'}
              </h2>
              <button onClick={() => setOpen(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleSubmit((data) => execute(data))} className="space-y-3">
              <input type="hidden" {...register('customerId')} />

              <div className="space-y-1">
                <Label htmlFor="edit-name">{isCompany ? '업체명 *' : '고객명 *'}</Label>
                <Input id="edit-name" placeholder={isCompany ? '예: (주)클린빌딩' : '예: 김영희'} {...register('name')} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-phone">연락처 *</Label>
                  <Input id="edit-phone" {...register('phone')} />
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-category">업종</Label>
                  <select
                    id="edit-category"
                    {...register('category')}
                    className="w-full h-8 rounded-lg border border-border bg-background px-2.5 text-sm"
                  >
                    <option value="">선택 안함</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-address">주소</Label>
                <Input id="edit-address" {...register('address')} />
              </div>

              <div className="space-y-1">
                <Label>고객 구분</Label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input type="radio" value="one_time" {...register('type')} className="accent-primary" />
                    <div>
                      <p className="text-sm font-medium">개인 고객</p>
                      <p className="text-xs text-muted-foreground">개인·일회성</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input type="radio" value="recurring" {...register('type')} className="accent-primary" />
                    <div>
                      <p className="text-sm font-medium">법인 고객</p>
                      <p className="text-xs text-muted-foreground">법인·정기계약</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-notes">메모</Label>
                <textarea
                  id="edit-notes"
                  {...register('notes', {
                    onChange: autoResize,
                  })}
                  ref={(el) => {
                    register('notes').ref(el)
                    notesRef.current = el
                  }}
                  className="w-full min-h-[120px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y"
                  placeholder="비밀번호, 주의사항 등 메모를 입력해주세요"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                  취소
                </Button>
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? '저장 중...' : '저장'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
