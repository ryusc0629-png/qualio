'use client'

// 매출·지출 기록 입력 모달 — 추가(add)와 수정(edit)이 공유하는 공용 폼
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, TrendingUp, TrendingDown, Trash2 } from 'lucide-react'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
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

export type EntryType = 'revenue' | 'expense'
export interface EntryValues {
  type: EntryType
  amount: number
  category: string
  entry_date: string
  memo?: string
}

interface EntryFormModalProps {
  open: boolean
  mode: 'add' | 'edit'
  initial?: Partial<EntryValues>
  isPending: boolean
  onClose: () => void
  onSubmit: (values: EntryValues) => void
  // 수정 모드 전용 — 삭제
  onDelete?: () => void
  deletePending?: boolean
}

export function EntryFormModal({
  open,
  mode,
  initial,
  isPending,
  onClose,
  onSubmit,
  onDelete,
  deletePending,
}: EntryFormModalProps) {
  const [type, setType] = useState<EntryType>(initial?.type ?? 'revenue')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(todayStr())
  const [memo, setMemo] = useState('')

  const modalRef = useRef<HTMLDivElement>(null)

  // 열릴 때마다 초기값 세팅 + 포커스
  useEffect(() => {
    if (!open) return
    setType(initial?.type ?? 'revenue')
    setAmount(initial?.amount ? String(initial.amount) : '')
    setCategory(initial?.category ?? '')
    setDate(initial?.entry_date ?? todayStr())
    setMemo(initial?.memo ?? '')
    modalRef.current?.focus()
    // 초기값은 open 시점 기준으로만 반영 (입력 중 재설정 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const isRevenue = type === 'revenue'
  const categories = isRevenue ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES

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
    onSubmit({ type, amount: amt, category, entry_date: date, memo: memo.trim() || undefined })
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <ScrollLock />
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-background w-full max-w-md rounded-t-2xl sm:rounded-2xl border shadow-lg p-5 space-y-4 max-h-[92vh] overflow-y-auto overscroll-contain outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">{mode === 'add' ? '오늘 장부 기록' : '기록 수정'}</h2>
          <button onClick={onClose} aria-label="닫기">
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
          {mode === 'edit' && onDelete ? (
            <Button
              type="button"
              variant="outline"
              className="h-12 px-4 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={onDelete}
              disabled={deletePending}
              aria-label="기록 삭제"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" variant="outline" className="flex-1 h-12" onClick={onClose}>취소</Button>
          )}
          <Button type="button" className="flex-1 h-12" onClick={submit} disabled={isPending}>
            {isPending ? '저장 중...' : mode === 'add' ? '저장하기' : '수정 저장'}
          </Button>
        </div>
      </div>
    </div>
  )
}
