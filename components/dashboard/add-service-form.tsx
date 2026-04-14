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
import { createServiceItemAction } from '@/lib/actions/services'
import { Plus, X } from 'lucide-react'

// 단위 옵션 (한스클린 등 업계 표준 기준)
const UNITS = [
  { value: '정액', label: '정액 (1회 고정가)' },
  { value: '평당', label: '평당 가격' },
  { value: '개', label: '개당 가격' },
  { value: '시간', label: '시간당 가격' },
] as const

type UnitValue = typeof UNITS[number]['value']

// 업계 표준 프리셋 서비스 목록
const PRESETS = [
  { name: '이사 청소',           category: '주거 공간', unit: '평당',  base_price: 15000 },
  { name: '입주 청소',           category: '주거 공간', unit: '평당',  base_price: 18000 },
  { name: '거주 청소',           category: '주거 공간', unit: '정액',  base_price: 80000 },
  { name: '에어컨 청소 (벽걸이)', category: '가전 케어', unit: '개',    base_price: 80000 },
  { name: '에어컨 청소 (스탠드)', category: '가전 케어', unit: '개',    base_price: 120000 },
  { name: '줄눈 시공',           category: '특수/시공', unit: '평당',  base_price: 30000 },
] as const

const schema = z.object({
  name: z.string().min(1, '서비스명을 입력해주세요'),
  category: z.string().optional(),
  base_price: z.coerce.number().min(0, '0 이상의 금액을 입력해주세요'),
  unit: z.enum(['정액', '평당', '개', '시간']),
})

type FormInput = z.infer<typeof schema>

export function AddServiceForm() {
  const [open, setOpen] = useState(false)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { unit: '정액', base_price: 0 },
  })

  const { execute, isPending } = useAction(createServiceItemAction, {
    onSuccess: () => {
      toast.success('서비스가 추가되었습니다')
      reset({ unit: '정액', base_price: 0 })
      setOpen(false)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '서비스 추가에 실패했습니다')
    },
  })

  // 프리셋 클릭 시 모든 필드 자동 채우기
  const applyPreset = (preset: typeof PRESETS[number]) => {
    setValue('name', preset.name)
    setValue('category', preset.category)
    setValue('unit', preset.unit as UnitValue)
    setValue('base_price', preset.base_price)
  }

  const currentUnit = watch('unit')

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="h-4 w-4 mr-1" />
        서비스 추가
      </Button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit((data) => execute(data))}
      className="rounded-lg border bg-card p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">새 서비스 추가</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 프리셋 버튼 */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">자주 쓰는 서비스 바로 추가</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-full border px-3 py-1 text-xs hover:bg-accent transition-colors"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t pt-3 space-y-3">
        {/* 서비스명 */}
        <div className="space-y-1">
          <Label htmlFor="name">서비스명 *</Label>
          <Input id="name" placeholder="예) 가정집 청소" {...register('name')} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* 카테고리 */}
          <div className="space-y-1">
            <Label htmlFor="category">카테고리</Label>
            <Input id="category" placeholder="예) 주거 공간" {...register('category')} />
          </div>

          {/* 단위 */}
          <div className="space-y-1">
            <Label htmlFor="unit">단위 *</Label>
            <select
              id="unit"
              {...register('unit')}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm"
            >
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 기본가 */}
        <div className="space-y-1">
          <Label htmlFor="base_price">
            기본 가격 (원) *
            <span className="ml-1 text-xs text-muted-foreground font-normal">
              {currentUnit === '평당' && '— 평당 금액'}
              {currentUnit === '개' && '— 개당 금액'}
              {currentUnit === '시간' && '— 시간당 금액'}
              {currentUnit === '정액' && '— 1회 고정 금액'}
            </span>
          </Label>
          <Input
            id="base_price"
            type="number"
            placeholder={
              currentUnit === '평당' ? '예) 15000' :
              currentUnit === '개' ? '예) 80000' :
              currentUnit === '시간' ? '예) 30000' :
              '예) 80000'
            }
            {...register('base_price')}
          />
          {errors.base_price && (
            <p className="text-xs text-destructive">{errors.base_price.message}</p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? '추가 중...' : '추가'}
        </Button>
      </div>
    </form>
  )
}
