'use client'

import { useState, useEffect, useRef } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings2, X, Plus, Trash2, Pencil, Check } from 'lucide-react'
import { ScrollLock } from '@/lib/hooks/use-scroll-lock'
import {
  addFixedCostAction,
  updateFixedCostAction,
  toggleFixedCostAction,
  deleteFixedCostAction,
} from '@/lib/actions/finance'
import { FIXED_COST_PRESETS, formatWon } from '@/lib/finance/constants'

const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '')
const formatThousands = (v: string) => {
  const d = digitsOnly(v)
  return d ? Number(d).toLocaleString('ko-KR') : ''
}

export interface FixedCost {
  id: string
  name: string
  monthly_amount: number
  active: boolean
}

interface FixedCostsManagerProps {
  costs: FixedCost[]
  // 트리거 스타일 — 'button'(설정 버튼) | 'cta'(빈 상태 큰 버튼)
  variant?: 'button' | 'cta'
}

export function FixedCostsManager({ costs, variant = 'button' }: FixedCostsManagerProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  // 인라인 수정 상태
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')

  const modalRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) modalRef.current?.focus()
  }, [open])

  const addAction = useAction(addFixedCostAction, {
    onSuccess: () => {
      toast.success('고정비를 추가했어요!')
      setName('')
      setAmount('')
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const updateAction = useAction(updateFixedCostAction, {
    onSuccess: () => {
      toast.success('고정비를 수정했어요')
      setEditingId(null)
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const toggleAction = useAction(toggleFixedCostAction, {
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  function startEdit(c: FixedCost) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditAmount(String(c.monthly_amount))
  }

  function saveEdit() {
    const amt = parseInt(digitsOnly(editAmount), 10) || 0
    if (!editName.trim()) {
      toast.error('항목 이름을 입력해주세요')
      return
    }
    if (amt < 1) {
      toast.error('월 금액을 입력해주세요')
      return
    }
    updateAction.execute({ id: editingId!, name: editName.trim(), monthly_amount: amt })
  }

  const deleteAction = useAction(deleteFixedCostAction, {
    onSuccess: () => toast.success('삭제했어요'),
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  function submitAdd() {
    const amt = parseInt(digitsOnly(amount), 10) || 0
    if (!name.trim()) {
      toast.error('항목 이름을 입력해주세요')
      return
    }
    if (amt < 1) {
      toast.error('월 금액을 입력해주세요')
      return
    }
    addAction.execute({ name: name.trim(), monthly_amount: amt })
  }

  const activeTotal = costs
    .filter((c) => c.active)
    .reduce((s, c) => s + c.monthly_amount, 0)

  if (!open) {
    if (variant === 'cta') {
      return (
        <Button onClick={() => setOpen(true)} variant="outline" className="w-full h-12">
          <Settings2 className="h-4 w-4 mr-1.5" />
          고정비 설정하기
        </Button>
      )
    }
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Settings2 className="h-4 w-4" />
        고정비 관리
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => setOpen(false)}
    >
      <ScrollLock />
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-background w-full max-w-md rounded-t-2xl sm:rounded-2xl border shadow-lg p-5 space-y-4 max-h-[92vh] overflow-y-auto overscroll-contain outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">월 고정비</h2>
            <p className="text-xs text-muted-foreground mt-0.5">매달 무조건 나가는 돈이에요. 손익분기점 계산의 기준이 돼요.</p>
          </div>
          <button onClick={() => setOpen(false)} aria-label="닫기">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* 현재 고정비 목록 */}
        {costs.length > 0 && (
          <div className="space-y-2">
            {costs.map((c) => (
              editingId === c.id ? (
                // 인라인 수정
                <div key={c.id} className="rounded-xl border border-primary/40 bg-white p-3 space-y-2">
                  <Input
                    autoComplete="off"
                    placeholder="항목 이름"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-10"
                  />
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="월 금액"
                        value={formatThousands(editAmount)}
                        onChange={(e) => setEditAmount(digitsOnly(e.target.value))}
                        className="h-10 text-right pr-8 font-semibold tabular-nums"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">원</span>
                    </div>
                    <Button type="button" variant="outline" className="h-10 px-3" onClick={() => setEditingId(null)}>취소</Button>
                    <Button type="button" className="h-10 px-3" onClick={saveEdit} disabled={updateAction.isPending}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 rounded-xl border p-3 ${c.active ? 'bg-white' : 'bg-muted/40 opacity-60'}`}
                >
                  <label className="flex items-center cursor-pointer shrink-0" title="손익분기점 계산에 포함">
                    <input
                      type="checkbox"
                      checked={c.active}
                      onChange={(e) => toggleAction.execute({ id: c.id, active: e.target.checked })}
                      className="accent-primary h-5 w-5"
                    />
                  </label>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{formatWon(c.monthly_amount)} / 월</p>
                  </div>
                  <button
                    onClick={() => startEdit(c)}
                    className="shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center text-muted-foreground hover:bg-muted"
                    aria-label="수정"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`'${c.name}' 고정비를 삭제할까요?`)) {
                        deleteAction.execute({ id: c.id })
                      }
                    }}
                    className="shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center text-destructive hover:bg-destructive/10"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            ))}
            <div className="flex items-center justify-between px-1 pt-1">
              <span className="text-sm font-semibold">월 고정비 합계</span>
              <span className="text-base font-bold tabular-nums text-primary">{formatWon(activeTotal)}</span>
            </div>
          </div>
        )}

        {/* 인건비 안내 — 도급/일용직은 고정비가 아님 */}
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 leading-relaxed">
          💡 <span className="font-semibold">도급·일용직 인건비는 여기 넣지 마세요.</span> 일감에 따라 달라지는 돈이라, &lsquo;지출 → 인건비&rsquo;로 그 달 나간 만큼 기록하는 게 정확해요. 여기엔 <span className="font-semibold">매달 똑같이 나가는 정직원 급여</span>만 넣으세요.
        </div>

        {/* 추가 폼 */}
        <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
          <p className="text-sm font-semibold">고정비 추가</p>

          {/* 추천 칩 */}
          <div className="flex flex-wrap gap-1.5">
            {FIXED_COST_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setName(p)}
                className={`px-2.5 h-8 rounded-full border text-xs font-medium transition-all ${
                  name === p
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fc-name">항목 이름</Label>
            <Input
              id="fc-name"
              autoComplete="off"
              placeholder="예: 사무실 임대료"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fc-amount">월 금액</Label>
            <div className="relative">
              <Input
                id="fc-amount"
                inputMode="numeric"
                autoComplete="off"
                placeholder="500,000"
                value={formatThousands(amount)}
                onChange={(e) => setAmount(digitsOnly(e.target.value))}
                className="h-11 text-right pr-8 font-semibold tabular-nums"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">원</span>
            </div>
          </div>

          <Button type="button" className="w-full h-11" onClick={submitAdd} disabled={addAction.isPending}>
            <Plus className="h-4 w-4 mr-1" />
            {addAction.isPending ? '추가 중...' : '고정비 추가'}
          </Button>
        </div>

        <Button type="button" variant="outline" className="w-full h-11" onClick={() => setOpen(false)}>
          닫기
        </Button>
      </div>
    </div>
  )
}
