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

  const { register, handleSubmit, formState: { errors } } = useForm<FormInput>({
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

  const { execute, isPending } = useAction(updateCustomerAction, {
    onSuccess: () => {
      toast.success('고객 정보가 수정되었습니다')
      setOpen(false)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '수정에 실패했습니다')
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
          <div className="bg-background rounded-xl border shadow-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">고객 정보 수정</h2>
              <button onClick={() => setOpen(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleSubmit((data) => execute(data))} className="space-y-3">
              <input type="hidden" {...register('customerId')} />

              <div className="space-y-1">
                <Label htmlFor="edit-name">고객(업체)명 *</Label>
                <Input id="edit-name" {...register('name')} />
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
                  {...register('notes')}
                  className="w-full min-h-[60px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
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
