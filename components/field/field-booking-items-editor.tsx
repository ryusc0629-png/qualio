'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import {
  fieldGetBookingItemsAction,
  fieldAddBookingItemAction,
  fieldUpdateBookingItemAction,
  fieldDeleteBookingItemAction,
} from '@/lib/actions/field'
import { Plus, Trash2, History, ChevronDown, PlusCircle } from 'lucide-react'

interface Item {
  id: string
  name: string
  quantity: number
  unit_price: number
  amount: number
  unit: string
}

interface Change {
  id: string
  change_type: string
  item_name: string | null
  old_amount: number | null
  new_amount: number | null
  reason: string | null
  changed_by: string
  changed_by_name: string | null
  created_at: string
}

// 단위별 라벨
const qtyUnitOf = (unit: string) => (unit === '평당' ? '평' : unit === '정액' ? '회' : '개')
const perLabelOf = (unit: string) => (unit === '평당' ? '평당' : unit === '정액' ? '정액' : '대당')

const won = (n: number) => new Intl.NumberFormat('ko-KR').format(n) + '원'
const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '')
const formatThousands = (v: string) => {
  const d = digitsOnly(v)
  return d ? Number(d).toLocaleString('ko-KR') : ''
}

interface Props {
  workerId: string
  bookingId: string
  fallbackTotal: number
  // 항목 합계가 바뀌면 상위(결제 금액 표시)에 알림
  onTotalChange?: (total: number) => void
}

export function FieldBookingItemsEditor({ workerId, bookingId, fallbackTotal, onTotalChange }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [changes, setChanges] = useState<Change[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  // 접힌 채로 시작한다 — 현장에서 늘 하는 일이 아니라 '추가 작업이 생겼을 때만' 여는 칸이라,
  // 열려 있으면 필수인 작업 보고서보다 메인처럼 보인다. 이미 추가한 항목이 있으면 펼쳐준다.
  const [open, setOpen] = useState(false)

  // 새 항목 입력
  const [newName, setNewName] = useState('')
  const [newQty, setNewQty] = useState('1')
  const [newPrice, setNewPrice] = useState('')

  const { execute: fetchItems } = useAction(fieldGetBookingItemsAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      const loadedItems = data.items as Item[]
      setItems(loadedItems)
      setChanges(data.changes as Change[])
      setLoaded(true)
      // 이미 현장에서 추가한 항목이 있으면 접어두지 않는다 (금액을 확인해야 하므로)
      if (loadedItems.length > 0) setOpen(true)
      // 항목이 있으면 합계, 없으면 기존 단일 금액(fallback)을 상위에 반영
      onTotalChange?.(loadedItems.length > 0 ? loadedItems.reduce((s, it) => s + it.amount, 0) : fallbackTotal)
    },
  })

  const reload = useCallback(() => fetchItems({ workerId, bookingId }), [fetchItems, workerId, bookingId])

  useEffect(() => { reload() }, [reload])

  const { execute: addItem, isPending: adding } = useAction(fieldAddBookingItemAction, {
    onSuccess: () => { toast.success('항목을 추가했어요'); setNewName(''); setNewQty('1'); setNewPrice(''); reload() },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })
  const { execute: updateItem } = useAction(fieldUpdateBookingItemAction, {
    onSuccess: () => { toast.success('항목을 수정했어요'); reload() },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })
  const { execute: deleteItem } = useAction(fieldDeleteBookingItemAction, {
    onSuccess: () => { toast.success('항목을 뺐어요'); reload() },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const total = items.reduce((s, it) => s + it.amount, 0)

  function handleRowChange(id: string, field: 'name' | 'quantity' | 'unit_price' | 'amount', value: string) {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it
      const next = { ...it }
      if (field === 'name') next.name = value
      if (field === 'quantity') {
        next.quantity = Math.max(1, parseInt(value, 10) || 1)
        next.amount = next.quantity * next.unit_price
      }
      if (field === 'unit_price') {
        next.unit_price = Math.max(0, parseInt(value, 10) || 0)
        next.amount = next.quantity * next.unit_price
      }
      // 합산 금액 직접 수정 → 단가는 합산÷수량으로 역산
      if (field === 'amount') {
        next.amount = Math.max(0, parseInt(value, 10) || 0)
        next.unit_price = next.quantity > 0 ? Math.round(next.amount / next.quantity) : next.amount
      }
      return next
    }))
  }

  function saveRow(it: Item) {
    if (!it.name.trim()) { toast.error('항목 이름을 입력해주세요'); return }
    updateItem({ workerId, bookingId, itemId: it.id, name: it.name, quantity: it.quantity, unitPrice: it.unit_price, amount: it.amount, unit: it.unit })
  }

  function handleAdd() {
    if (!newName.trim()) { toast.error('항목 이름을 입력해주세요'); return }
    addItem({ workerId, bookingId, name: newName, quantity: newQty, unitPrice: newPrice || '0', unit: '개' })
  }

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      {/* 접힘/펼침 헤더 — 평소엔 접혀 있고, 추가 작업이 생겼을 때만 연다 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3.5 flex items-center gap-2.5 text-left"
      >
        <PlusCircle className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">추가 서비스</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {items.length > 0
              ? `${items.length}개 추가됨 · 합계 ${won(total)}`
              : '현장에서 청소 범위가 늘었을 때만 눌러주세요'}
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
      <div className="px-4 pb-4 space-y-3 border-t pt-3">
      {/* 항목 목록 */}
      {!loaded ? (
        <p className="text-xs text-muted-foreground py-2">불러오는 중...</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg bg-muted/30 border border-dashed px-3 py-3 text-center">
          <p className="text-xs text-muted-foreground">
            아래에 추가한 만큼 금액이 자동으로 더해져요.
            <br />
            지금 받을 돈은 {won(fallbackTotal)}이에요.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="rounded-lg bg-muted/20 border p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={it.name}
                  onChange={(e) => handleRowChange(it.id, 'name', e.target.value)}
                  placeholder="항목명 (예: 에어컨 청소)"
                  className="flex-1 h-9 rounded-lg border px-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => { if (confirm(`'${it.name}' 항목을 뺄까요?`)) deleteItem({ workerId, bookingId, itemId: it.id }) }}
                  className="shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center text-destructive hover:bg-destructive/10"
                  aria-label="항목 빼기"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  inputMode="numeric"
                  value={String(it.quantity)}
                  onChange={(e) => handleRowChange(it.id, 'quantity', e.target.value)}
                  className="w-12 h-9 rounded-lg border px-2 text-sm text-center shrink-0"
                />
                <span className="text-xs text-muted-foreground shrink-0">{qtyUnitOf(it.unit)} × {perLabelOf(it.unit)}</span>
                <input
                  inputMode="numeric"
                  value={formatThousands(String(it.unit_price))}
                  onChange={(e) => handleRowChange(it.id, 'unit_price', digitsOnly(e.target.value))}
                  placeholder={`${perLabelOf(it.unit)} 단가`}
                  className="flex-1 min-w-0 h-9 rounded-lg border px-2.5 text-sm text-right"
                />
                <span className="text-xs text-muted-foreground shrink-0">원</span>
              </div>
              <div className="flex items-center gap-2 border-t border-dashed pt-1.5">
                <span className="text-xs text-muted-foreground shrink-0">금액</span>
                <input
                  inputMode="numeric"
                  value={formatThousands(String(it.amount))}
                  onChange={(e) => handleRowChange(it.id, 'amount', digitsOnly(e.target.value))}
                  className="flex-1 min-w-0 h-9 rounded-lg border px-2.5 text-sm text-right font-semibold"
                />
                <span className="text-xs text-muted-foreground shrink-0">원</span>
              </div>
              <button
                type="button"
                onClick={() => saveRow(it)}
                className="w-full h-9 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
              >
                이 항목 저장
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-sm font-semibold">합계</span>
            <span className="text-base font-bold tabular-nums text-primary">{won(total)}</span>
          </div>
        </div>
      )}

      {/* 새 항목 추가 */}
      <div className="rounded-lg bg-muted/20 border p-2.5 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">추가로 한 작업 적기</p>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="무슨 작업이에요? (예: 에어컨 청소)"
          className="w-full h-9 rounded-lg border px-2.5 text-sm"
        />
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            className="w-12 h-9 rounded-lg border px-2 text-sm text-center shrink-0"
          />
          <span className="text-xs text-muted-foreground shrink-0">개 × 대당</span>
          <input
            inputMode="numeric"
            value={formatThousands(newPrice)}
            onChange={(e) => setNewPrice(digitsOnly(e.target.value))}
            placeholder="단가"
            className="flex-1 min-w-0 h-9 rounded-lg border px-2.5 text-sm text-right"
          />
          <button
            type="button"
            disabled={adding}
            onClick={handleAdd}
            className="shrink-0 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <Plus className="h-4 w-4" /> 추가
          </button>
        </div>
      </div>

      {/* 변경 이력 */}
      {changes.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <History className="h-3.5 w-3.5" />
            변경 이력 {changes.length}건
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {changes.map((c) => (
                <div key={c.id} className="text-xs bg-muted/20 border rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {c.change_type === 'add' && `➕ ${c.item_name} 추가`}
                      {c.change_type === 'update' && `✏️ ${c.item_name} 수정`}
                      {c.change_type === 'remove' && `➖ ${c.item_name} 빼기`}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {c.old_amount != null && `${won(c.old_amount)} → `}
                      {c.new_amount != null ? won(c.new_amount) : '삭제'}
                    </span>
                  </div>
                  <p className="text-muted-foreground/70 mt-0.5">
                    {c.changed_by === 'worker' ? (c.changed_by_name ?? '현장') : '사장님'} ·{' '}
                    {new Date(c.created_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
      )}
    </div>
  )
}
