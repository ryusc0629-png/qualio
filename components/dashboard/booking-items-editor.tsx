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

// 확정 견적으로 만든 예약은 금액이 단일(final_price)로만 저장됨.
// 항목이 하나도 없을 때, 그 금액을 '기본 청소 서비스' 편집 행으로 처음부터 보여주기 위한 가짜 id.
// (실제 저장/수정 전까지는 DB에 없는 로컬 전용 행 — 버튼·추가 로딩 없이 바로 편집 가능)
const SEED_ID = '__base__'

interface Item {
  id: string
  name: string
  quantity: number
  unit_price: number
  amount: number
  unit: string
}

// 단위별 라벨
const qtyUnitOf = (unit: string) => (unit === '평당' ? '평' : unit === '정액' ? '회' : '개')
const perLabelOf = (unit: string) => (unit === '평당' ? '평당' : unit === '정액' ? '정액' : '대당')

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
  // 항목 합계가 바뀌면 상위(결제 금액 표시)에 알림 — 항목 0개면 fallbackTotal 유지
  onTotalChange?: (total: number) => void
}

const won = (n: number) => new Intl.NumberFormat('ko-KR').format(n) + '원'
const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '')
const formatThousands = (v: string) => {
  const d = digitsOnly(v)
  return d ? Number(d).toLocaleString('ko-KR') : ''
}

export function BookingItemsEditor({ bookingId, fallbackTotal, onTotalChange }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [changes, setChanges] = useState<Change[]>([])
  const [services, setServices] = useState<{ name: string; base_price: number; unit: string }[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // 새 항목 입력
  const [newName, setNewName] = useState('')
  const [newQty, setNewQty] = useState('1')
  const [newPrice, setNewPrice] = useState('')
  const [newUnit, setNewUnit] = useState('개')

  const { execute: fetchItems } = useAction(getBookingItemsAction, {
    onSuccess: ({ data }) => {
      if (!data) return
      const loadedItems = data.items as Item[]
      // 저장된 항목이 없고 기존 단일 금액이 있으면, 그 금액을 '기본 청소 서비스' 편집 행으로
      // 처음부터 보여준다(로컬 전용). 사용자가 저장/수정할 때 비로소 DB에 반영됨.
      if (loadedItems.length === 0 && fallbackTotal > 0) {
        setItems([{ id: SEED_ID, name: '기본 청소 서비스', quantity: 1, unit_price: fallbackTotal, amount: fallbackTotal, unit: '정액' }])
      } else {
        setItems(loadedItems)
      }
      setChanges(data.changes as Change[])
      setServices(data.services ?? [])
      setLoaded(true)
      // 항목이 있으면 합계, 없으면 기존 단일 금액(fallback)을 상위에 반영
      onTotalChange?.(loadedItems.length > 0 ? loadedItems.reduce((s, it) => s + it.amount, 0) : fallbackTotal)
    },
  })

  const reload = useCallback(() => fetchItems({ bookingId }), [fetchItems, bookingId])

  useEffect(() => { reload() }, [reload])

  const { execute: addItem, isPending: adding } = useAction(addBookingItemAction, {
    onSuccess: () => { toast.success('항목을 추가했어요'); setNewName(''); setNewQty('1'); setNewPrice(''); setNewUnit('개'); reload() },
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
  // 가짜 '기본 청소 서비스' 행을 처음 저장할 때 — 실제 첫 항목으로 DB에 기록
  const { execute: saveBase } = useAction(addBookingItemAction, {
    onSuccess: () => { toast.success('저장했어요'); reload() },
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
    // 가짜 기본 행이면 update가 아니라 add로 실제 첫 항목을 만든다
    if (it.id === SEED_ID) {
      saveBase({ bookingId, name: it.name, quantity: it.quantity, unitPrice: it.unit_price, amount: it.amount, unit: it.unit })
      return
    }
    updateItem({ itemId: it.id, bookingId, name: it.name, quantity: it.quantity, unitPrice: it.unit_price, amount: it.amount, unit: it.unit })
  }

  function handleAdd() {
    if (!newName.trim()) { toast.error('항목 이름을 입력해주세요'); return }
    // 기본 행이 아직 DB에 없으면, 기존 단일 금액을 '기본'으로 먼저 깔아 총액 보존 (서버에서 자동 처리)
    const baseRow = items.find((it) => it.id === SEED_ID)
    const seedBaseAmount = baseRow ? String(baseRow.amount) : undefined
    addItem({ bookingId, name: newName, quantity: newQty, unitPrice: newPrice || '0', unit: newUnit, seedBaseAmount })
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
            아래에서 항목을 추가해 금액을 항목별로 나눠보세요.
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
                {/* 아직 저장 안 된 기본 행은 삭제 숨김 — 삭제해도 다시 생김 */}
                {it.id !== SEED_ID && (
                  <button
                    type="button"
                    onClick={() => { if (confirm(`'${it.name}' 항목을 뺄까요?`)) deleteItem({ itemId: it.id, bookingId }) }}
                    className="shrink-0 w-9 h-9 rounded-lg border border-border flex items-center justify-center text-destructive hover:bg-destructive/10"
                    aria-label="항목 빼기"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  inputMode="numeric"
                  value={String(it.quantity)}
                  onChange={(e) => handleRowChange(it.id, 'quantity', e.target.value)}
                  className="w-12 h-9 rounded-lg border border-border px-2 text-sm text-center shrink-0"
                />
                <span className="text-xs text-muted-foreground shrink-0">{qtyUnitOf(it.unit)} × {perLabelOf(it.unit)}</span>
                <input
                  inputMode="numeric"
                  value={formatThousands(String(it.unit_price))}
                  onChange={(e) => handleRowChange(it.id, 'unit_price', digitsOnly(e.target.value))}
                  placeholder={`${perLabelOf(it.unit)} 단가`}
                  className="flex-1 min-w-0 h-9 rounded-lg border border-border px-2.5 text-sm text-right"
                />
                <span className="text-xs text-muted-foreground shrink-0">원</span>
              </div>
              <div className="flex items-center gap-2 border-t border-dashed border-border pt-1.5">
                <span className="text-xs text-muted-foreground shrink-0">금액</span>
                <input
                  inputMode="numeric"
                  value={formatThousands(String(it.amount))}
                  onChange={(e) => handleRowChange(it.id, 'amount', digitsOnly(e.target.value))}
                  className="flex-1 min-w-0 h-9 rounded-lg border border-border px-2.5 text-sm text-right font-semibold"
                />
                <span className="text-xs text-muted-foreground shrink-0">원</span>
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
              const svc = services.find((s) => s.name === name)
              if (svc) {
                setNewUnit(svc.unit)
                if (svc.base_price > 0) setNewPrice(String(svc.base_price))
              }
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
          <span className="text-xs text-muted-foreground shrink-0">{qtyUnitOf(newUnit)} × {perLabelOf(newUnit)}</span>
          <input
            inputMode="numeric"
            value={formatThousands(newPrice)}
            onChange={(e) => setNewPrice(digitsOnly(e.target.value))}
            placeholder={`${perLabelOf(newUnit)} 단가`}
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
