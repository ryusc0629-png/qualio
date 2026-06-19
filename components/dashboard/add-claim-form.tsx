'use client'

import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClaimAction } from '@/lib/actions/claims'
import { Plus, X, Search, Check, UserPlus } from 'lucide-react'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
import { useAutoFocusRef } from '@/lib/hooks/use-auto-focus'
import { formatPhone } from '@/lib/format/phone'

const schema = z.object({
  customer_name:  z.string().min(1, '고객을 선택하거나 이름을 입력해주세요'),
  customer_phone: z.string().optional(),
  title:          z.string().min(1, '어떤 문제인지 한 줄로 적어주세요'),
  content:        z.string().optional(),
  is_urgent:      z.boolean().optional(),
})

type FormInput = z.infer<typeof schema>

interface Customer {
  id: string
  name: string
  phone: string | null
}

interface Props {
  customers: Customer[]
}

export function AddClaimForm({ customers }: Props) {
  const [open, setOpen] = useState(false)
  const focusRef = useAutoFocusRef<HTMLDivElement>()

  // 고객 선택 상태 — 기존 고객을 고르면 이름/연락처가 자동으로 채워짐
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  // 목록에 없는 새 고객이면 직접 입력 (고객이 한 명도 없으면 기본 직접 입력)
  const [manual, setManual] = useState(customers.length === 0)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = q
      ? customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
      : customers
    return base.slice(0, 8)
  }, [search, customers])

  const { execute, isPending } = useAction(createClaimAction, {
    onSuccess: () => {
      toast.success('클레임을 등록했어요')
      resetAll()
      setOpen(false)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? '다시 시도해주세요')
    },
  })

  function resetAll() {
    reset()
    setSelected(null)
    setSearch('')
    setManual(customers.length === 0)
  }

  function pickCustomer(c: Customer) {
    setSelected(c)
    setValue('customer_name', c.name, { shouldValidate: true })
    setValue('customer_phone', c.phone ?? '')
  }

  function clearSelection() {
    setSelected(null)
    setValue('customer_name', '')
    setValue('customer_phone', '')
  }

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
          <button onClick={() => { setOpen(false); resetAll() }} aria-label="닫기">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit((data) => execute({ ...data }))} className="space-y-3">
          {/* 고객 선택 — 기존 고객에서 고르기 */}
          <div className="space-y-1">
            <Label>어느 고객인가요? (필수)</Label>

            {selected ? (
              // 선택됨 — 자동으로 채워진 고객
              <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold flex items-center gap-1">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    {selected.name}
                  </p>
                  {selected.phone && <p className="text-xs text-muted-foreground mt-0.5">{selected.phone}</p>}
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground underline"
                >
                  변경
                </button>
              </div>
            ) : manual ? (
              // 직접 입력 — 목록에 없는 고객
              <div className="space-y-2">
                <Input
                  placeholder="고객 이름 (예: 해오름홀딩스)"
                  {...register('customer_name')}
                />
                <Input
                  placeholder="연락처 010-1234-5678"
                  inputMode="tel"
                  autoComplete="off"
                  value={watch('customer_phone') ?? ''}
                  onChange={(e) => setValue('customer_phone', formatPhone(e.target.value))}
                />
                {customers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setManual(false); setValue('customer_name', '') }}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Search className="h-3 w-3" />
                    기존 고객에서 찾기
                  </button>
                )}
              </div>
            ) : (
              // 고객 검색 → 선택
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="고객 이름 또는 전화번호로 검색"
                    className="w-full h-10 rounded-lg border border-border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto overscroll-contain rounded-lg border border-border divide-y">
                  {filtered.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      검색 결과가 없어요
                    </p>
                  ) : (
                    filtered.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickCustomer(c)}
                        className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors"
                      >
                        <p className="text-sm font-medium">{c.name}</p>
                        {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setManual(true); setSearch('') }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <UserPlus className="h-3 w-3" />
                  목록에 없는 새 고객이에요 — 직접 입력
                </button>
              </div>
            )}
            {errors.customer_name && <p className="text-xs text-destructive">{errors.customer_name.message}</p>}
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
