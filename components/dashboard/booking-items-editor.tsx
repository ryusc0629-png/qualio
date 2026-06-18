'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import {
  getBookingItemsAction,
  addBookingItemAction,
  updateBookingItemAction,
  deleteBookingItemAction,
} from '@/lib/actions/booking-items'
import { Plus, Trash2, History, ChevronDown } from 'lucide-react'

interface Item {
  id: string
  name: string
  quantity: number
  unit_price: number
  amount: number
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

interface Props {
  bookingId: string
  fallbackTotal: number
}

const won = (n: number) => new Intl.NumberFormat('ko-KR').format(n) + '원'
const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '')
const formatThousands = (v: string) => {
  const d = digitsOnly(v)
  return d ? Number(d).toLocaleString('ko-KR') : ''
}

export function BookingItemsEditor({ bookingId, fallbackTotal }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [changes, setChanges] = useState<Change[]>([])
  const [services, setServices] = useState<{ name: string; base_price: number }[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // 새 항목 입력
  const [newName, setNewName] = useState('')
  const [newQty, setNewQty] = useState('1')
  const [newPrice, setNewPrice] = useState('')

  const { execute: fetchItems } = useAction(getBookingItemsAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      setItems(data.items as Item[])
      setChanges(data.changes as Change[])
      setServices(data.services ?? [])
      setLoaded(true)
    },
  })

  const reload = useCallback(() => fetchItems({ bookingId }), [fetchItems, bookingId])

  useEffect(() => { reload() }, [reload])

  const { execute: addItem, isPending: adding } = useAction(addBookingItemAction, {
    onSuccess: () => { toast.success('항목을 추가했어요'); setNewName(''); setNewQty('1'); setNewPrice(''); reload() },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })
  const { execute: updateItem } = useAction(updateBookingItemAction, {
    onSuccess: () => { toast.success('항목을 수정했어요'); reload() },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })
  const { execute: deleteItem } = useAction(deleteBookingItemAction, {
    onSuccess: () => { toast.success('항목을 뺐어요'); reload() },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const total = items.reduce((s, it) => s + it.amount, 0)

  function handleRowChange(id: string, field: 'name' | 'quantity' | 'unit_price', value: string) {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it
      const next = { ...it }
      if (field === 'name') next.name = value
      if (field === 'quantity') next.quantity = Math.max(1, parseInt(value, 10) || 1)
      if (field === 'unit_price') next.unit_price = Math.max(0, parseInt(value, 10) || 0)
      next.amount = next.quantity * next.unit_price
      return next
    }))
  }

  function saveRow(it: Item) {
    if (!it.name.trim()) { toast.error('항목 이름을 입력해주세요'); return }
    updateItem({ itemId: it.id, bookingId, name: it.name, quantity: it.quantity, unitPrice: it.unit_price })
  }

  function handleAdd() {
    if (!newName.trim()) { toast.error('항목 이름을 입력해주세요'); return }
    addItem({ bookingId, name: newName, quantity: newQty, unitPrice: newPrice || '0' })
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">항목별 견적</p>
        <span className="text-xs text-muted-foreground">통화·현장에서 항목별로 조정</span>
      </div>

      {/* 항목 목록 */}
      {!loaded ? (
        <p className="text-xs text-muted-foreground py-2">불러오는 중...</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg bg-white border border-dashed border-border px-3 py-3 text-center">
          <p className="text-xs text-muted-foreground">
            아직 항목이 없어요. 금액({won(fallbackTotal)})을 항목으로 나누면<br />할인·현장 조정이 쉬워져요.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="rounded-lg bg-white border border-border p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={it.name}
                  onChange={(e) => handleRowChange(it.id, 'name', e.target.value)}
                  placeholder="항목명 (예: 에어컨 청소)"
                  className="flex-1 h-9 rounded-lg border border-border px-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => { if (confirm(`'${it.name}' 항목을 뺄까요?`)) deleteItem({ itemId: it.id, bookingId }) }}
                  className="shrink-0 w-9 h-9 rounded-lg border border-border flex items-center justify-center text-destructive hover:bg-destructive/10"
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
                  className="w-12 h-9 rounded-lg border border-border px-2 text-sm text-center shrink-0"
                />
                <span className="text-xs text-muted-foreground shrink-0">개 ×</span>
                <input
                  inputMode="numeric"
                  value={formatThousands(String(it.unit_price))}
                  onChange={(e) => handleRowChange(it.id, 'unit_price', digitsOnly(e.target.value))}
                  placeholder="단가"
                  className="flex-1 min-w-0 h-9 rounded-lg border border-border px-2.5 text-sm text-right"
                />
                <span className="text-xs text-muted-foreground shrink-0">원</span>
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-border pt-1.5">
                <span className="text-xs text-muted-foreground">금액</span>
                <span className="text-sm font-semibold tabular-nums">{won(it.amount)}</span>
              </div>
              <button
                type="button"
                onClick={() => saveRow(it)}
                className="w-full h-8 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
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
      <div className="rounded-lg bg-white border border-border p-2.5 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">항목 추가</p>
        {services.length > 0 ? (
          <select
            value={newName}
            onChange={(e) => {
              const name = e.target.value
              setNewName(name)
              const price = services.find((s) => s.name === name)?.base_price ?? 0
              if (price > 0) setNewPrice(String(price))
            }}
            className="w-full h-9 rounded-lg border border-border bg-white px-2.5 text-sm"
          >
            <option value="">서비스 선택</option>
            {services.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        ) : (
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="항목명 (예: 에어컨 청소)"
            className="w-full h-9 rounded-lg border border-border px-2.5 text-sm"
          />
        )}
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            className="w-12 h-9 rounded-lg border border-border px-2 text-sm text-center shrink-0"
          />
          <span className="text-xs text-muted-foreground shrink-0">개 ×</span>
          <input
            inputMode="numeric"
            value={formatThousands(newPrice)}
            onChange={(e) => setNewPrice(digitsOnly(e.target.value))}
            placeholder="단가"
            className="flex-1 min-w-0 h-9 rounded-lg border border-border px-2.5 text-sm text-right"
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
                <div key={c.id} className="text-xs bg-white border border-border rounded-lg px-2.5 py-1.5">
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
                    {c.reason ? ` · ${c.reason}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
