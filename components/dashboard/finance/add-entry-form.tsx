'use client'

import { useState, useEffect, useRef } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, X, TrendingUp, TrendingDown } from 'lucide-react'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
import { addFinanceEntryAction } from '@/lib/actions/finance'
import { REVENUE_CATEGORIES, EXPENSE_CATEGORIES } from '@/lib/finance/constants'

const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '')
const formatThousands = (v: string) => {
  const d = digitsOnly(v)
  return d ? Number(d).toLocaleString('ko-KR') : ''
}

// 오늘 날짜(YYYY-MM-DD) — 사용자 기기 로컬(=KST) 기준
function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type EntryType = 'revenue' | 'expense'

interface AddEntryFormProps {
  // 트리거 버튼을 꽉 찬 형태로 쓸지(빈 상태 카드 안 등)
  fullWidth?: boolean
  // 처음 열 때 매출/지출 중 무엇을 선택할지
  defaultType?: EntryType
  triggerLabel?: string
}

export function AddEntryForm({ fullWidth = false, defaultType = 'revenue', triggerLabel = '기록 추가' }: AddEntryFormProps) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<EntryType>(defaultType)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(todayStr())
  const [memo, setMemo] = useState('')

  const modalRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) modalRef.current?.focus()
  }, [open])

  const categories = type === 'revenue' ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES

  const { execute, isPending } = useAction(addFinanceEntryAction, {
    onSuccess: () => {
      toast.success(type === 'revenue' ? '매출을 기록했어요!' : '지출을 기록했어요!')
      reset()
      setOpen(false)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  function reset() {
    setType(defaultType)
    setAmount('')
    setCategory('')
    setDate(todayStr())
    setMemo('')
  }

  function handleClose() {
    reset()
    setOpen(false)
  }

  function handleOpen() {
    setType(defaultType)
    setOpen(true)
  }

  function selectType(t: EntryType) {
    setType(t)
    setCategory('') // 분류는 매출/지출마다 다르므로 초기화
  }

  function submit() {
    const amt = parseInt(digitsOnly(amount), 10) || 0
    if (amt < 1) {
      toast.error('금액을 입력해주세요')
      return
    }
    if (!category) {
      toast.error('분류를 골라주세요')
      return
    }
    execute({ type, amount: amt, category, entry_date: date, memo: memo.trim() || undefined })
  }

  if (!open) {
    return (
      <Button onClick={handleOpen} className={fullWidth ? 'w-full h-12' : 'h-11'}>
        <Plus className="h-4 w-4 mr-1.5" />
        {triggerLabel}
      </Button>
    )
  }

  const isRevenue = type === 'revenue'

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={handleClose}
    >
      <ScrollLock />
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-background w-full max-w-md rounded-t-2xl sm:rounded-2xl border shadow-lg p-5 space-y-4 max-h-[92vh] overflow-y-auto overscroll-contain outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">오늘 장부 기록</h2>
          <button onClick={handleClose} aria-label="닫기">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* 매출 / 지출 큰 토글 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => selectType('revenue')}
            className={`flex items-center justify-center gap-2 h-14 rounded-xl border-2 font-bold transition-all ${
              isRevenue
                ? 'bg-emerald-50 text-emerald-700 border-emerald-500 shadow-sm'
                : 'bg-background text-muted-foreground border-border hover:border-emerald-300'
            }`}
          >
            <TrendingUp className="h-5 w-5" />
            매출(번 돈)
          </button>
          <button
            type="button"
            onClick={() => selectType('expense')}
            className={`flex items-center justify-center gap-2 h-14 rounded-xl border-2 font-bold transition-all ${
              !isRevenue
                ? 'bg-rose-50 text-rose-600 border-rose-400 shadow-sm'
                : 'bg-background text-muted-foreground border-border hover:border-rose-300'
            }`}
          >
            <TrendingDown className="h-5 w-5" />
            지출(쓴 돈)
          </button>
        </div>

        {/* 금액 */}
        <div className="space-y-1.5">
          <Label htmlFor="entry-amount">금액 (필수)</Label>
          <div className="relative">
            <Input
              id="entry-amount"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={formatThousands(amount)}
              onChange={(e) => setAmount(digitsOnly(e.target.value))}
              className="h-14 text-2xl font-bold text-right pr-10 tabular-nums"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">원</span>
          </div>
        </div>

        {/* 분류 칩 */}
        <div className="space-y-1.5">
          <Label>분류 (필수)</Label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`px-3.5 h-10 rounded-full border text-sm font-medium transition-all ${
                  category === c
                    ? isRevenue
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-rose-500 text-white border-rose-500'
                    : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          {!isRevenue && (
            <p className="text-xs text-muted-foreground pt-0.5">
              💡 도급·일용직 인건비도 여기 &lsquo;인건비&rsquo;로 그 달 나간 만큼 기록하세요
            </p>
          )}
        </div>

        {/* 날짜 */}
        <div className="space-y-1.5">
          <Label htmlFor="entry-date">날짜</Label>
          <Input
            id="entry-date"
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="h-12"
          />
        </div>

        {/* 메모(선택) */}
        <div className="space-y-1.5">
          <Label htmlFor="entry-memo">메모 <span className="text-xs font-normal text-muted-foreground">(선택)</span></Label>
          <Input
            id="entry-memo"
            autoComplete="off"
            placeholder={isRevenue ? '예: 강남 카페 정기청소' : '예: 세제·장갑 구입'}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="h-12"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1 h-12" onClick={handleClose}>취소</Button>
          <Button type="button" className="flex-1 h-12" onClick={submit} disabled={isPending}>
            {isPending ? '저장 중...' : '저장하기'}
          </Button>
        </div>
      </div>
    </div>
  )
}
