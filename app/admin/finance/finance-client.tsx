'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import {
  FINANCE_CATEGORIES,
  CATEGORY_MAP,
  SUBSCRIPTION_PRESETS,
} from '@/lib/admin/finance-categories'
import {
  upsertHqSubscriptionAction,
  deleteHqSubscriptionAction,
  addHqExpenseAction,
  deleteHqExpenseAction,
  updateHqRateAction,
} from '@/lib/actions/hq-finance'

export interface HqSubscription {
  id: string
  name: string
  category: string
  amount: number
  currency: string
  cycle: string
  next_billing_date: string | null
  active: boolean
  memo: string | null
}
export interface HqExpense {
  id: string
  spent_on: string
  name: string
  category: string
  amount: number
  currency: string
  amount_krw: number
  memo: string | null
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`

function subMonthlyKrw(s: HqSubscription, rate: number): number {
  const base = s.currency === 'USD' ? s.amount * rate : s.amount
  return Math.round(s.cycle === 'yearly' ? base / 12 : base)
}
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00+09:00').getTime()
  return Math.ceil((d - Date.now()) / 86400000)
}
function fmtAmount(amount: number, currency: string): string {
  return currency === 'USD'
    ? `$${amount.toLocaleString('en-US')}`
    : `${amount.toLocaleString('ko-KR')}원`
}

const inputCls =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring'

// 분류 선택 — 어려운 회계 용어(매출원가/판관비) 없이 항목만 고르면 됨.
// 각 항목의 COGS/판관비 매핑은 시스템이 자동 처리(finance-categories.ts).
function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">어떤 비용인가요?</option>
      {FINANCE_CATEGORIES.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  )
}

function CategoryBadge({ categoryId }: { categoryId: string }) {
  const c = CATEGORY_MAP[categoryId]
  if (!c) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${c.color}1a`, color: c.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
      {c.label}
    </span>
  )
}

export function FinanceClient({
  subscriptions,
  expenses,
  rate,
}: {
  subscriptions: HqSubscription[]
  expenses: HqExpense[]
  rate: number
}) {
  const router = useRouter()
  const refresh = () => router.refresh()

  // ── 구독 다이얼로그 ──
  const emptySub = {
    id: '',
    name: '',
    category: '',
    amount: '',
    currency: 'KRW',
    cycle: 'monthly',
    next_billing_date: '',
    memo: '',
  }
  const [subOpen, setSubOpen] = useState(false)
  const [subForm, setSubForm] = useState<typeof emptySub>(emptySub)

  const upsertSub = useAction(upsertHqSubscriptionAction, {
    onSuccess: () => {
      toast.success('저장됐어요!')
      setSubOpen(false)
      refresh()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })
  const deleteSub = useAction(deleteHqSubscriptionAction, {
    onSuccess: () => {
      toast.success('삭제됐어요')
      refresh()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  const openNewSub = () => {
    setSubForm(emptySub)
    setSubOpen(true)
  }
  const openEditSub = (s: HqSubscription) => {
    setSubForm({
      id: s.id,
      name: s.name,
      category: s.category,
      amount: String(s.amount),
      currency: s.currency,
      cycle: s.cycle,
      next_billing_date: s.next_billing_date ?? '',
      memo: s.memo ?? '',
    })
    setSubOpen(true)
  }
  const submitSub = () => {
    const amount = Number(subForm.amount)
    if (!subForm.name.trim()) return toast.error('이름을 입력해주세요')
    if (!subForm.category) return toast.error('분류를 선택해주세요')
    if (!amount || amount <= 0) return toast.error('금액을 입력해주세요')
    upsertSub.execute({
      id: subForm.id || undefined,
      name: subForm.name,
      category: subForm.category,
      amount,
      currency: subForm.currency,
      cycle: subForm.cycle,
      next_billing_date: subForm.next_billing_date,
      memo: subForm.memo,
    })
  }
  const applyPreset = (name: string) => {
    const p = SUBSCRIPTION_PRESETS.find((x) => x.name === name)
    if (!p) return setSubForm((f) => ({ ...f, name }))
    setSubForm((f) => ({ ...f, name: p.name, category: p.category, currency: p.currency }))
  }

  // ── 지출 다이얼로그 ──
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const emptyExp = { spent_on: today, name: '', category: '', amount: '', currency: 'KRW', memo: '' }
  const [expOpen, setExpOpen] = useState(false)
  const [expForm, setExpForm] = useState<typeof emptyExp>(emptyExp)

  const addExp = useAction(addHqExpenseAction, {
    onSuccess: () => {
      toast.success('기록됐어요!')
      setExpOpen(false)
      refresh()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })
  const deleteExp = useAction(deleteHqExpenseAction, {
    onSuccess: () => {
      toast.success('삭제됐어요')
      refresh()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })
  const openNewExp = () => {
    setExpForm({ ...emptyExp, spent_on: today })
    setExpOpen(true)
  }
  const submitExp = () => {
    const amount = Number(expForm.amount)
    if (!expForm.name.trim()) return toast.error('항목을 입력해주세요')
    if (!expForm.category) return toast.error('분류를 선택해주세요')
    if (!amount || amount <= 0) return toast.error('금액을 입력해주세요')
    addExp.execute({
      spent_on: expForm.spent_on,
      name: expForm.name,
      category: expForm.category,
      amount,
      currency: expForm.currency,
      memo: expForm.memo,
    })
  }

  // ── 환율 다이얼로그 ──
  const [rateOpen, setRateOpen] = useState(false)
  const [rateVal, setRateVal] = useState(String(rate))
  const updateRate = useAction(updateHqRateAction, {
    onSuccess: () => {
      toast.success('환율을 바꿨어요')
      setRateOpen(false)
      refresh()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 시도해주세요'),
  })

  return (
    <div className="space-y-8">
      {/* 정기결제(고정비) */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">🔁 정기결제 (고정비)</h2>
            <p className="text-xs text-muted-foreground">
              AI·소프트웨어·광고 등 매달 나가는 돈. USD는 환율로 원화 환산됩니다.
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={openNewSub}>
            <Plus className="h-4 w-4" /> 구독 추가
          </Button>
        </div>

        {subscriptions.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background py-10 text-center">
            <p className="text-sm text-muted-foreground">아직 등록된 정기결제가 없어요</p>
            <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={openNewSub}>
              <Plus className="h-4 w-4" /> 첫 구독 추가하기
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {subscriptions.map((s) => {
              const d = daysUntil(s.next_billing_date)
              const soon = d !== null && d >= 0 && d <= 7
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold truncate">{s.name}</span>
                      <CategoryBadge categoryId={s.category} />
                      {s.cycle === 'yearly' && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                          연 결제
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {fmtAmount(s.amount, s.currency)}
                      {s.currency === 'USD' && <span> · 월 {won(subMonthlyKrw(s, rate))}</span>}
                      {s.next_billing_date && (
                        <span className={soon ? 'text-amber-600 font-medium' : ''}>
                          {' '}
                          · 다음 결제 {s.next_billing_date}
                          {soon ? ` (${d}일 뒤)` : ''}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="mr-1 text-sm font-bold tabular-nums">
                      {won(subMonthlyKrw(s, rate))}
                      <span className="text-[11px] font-normal text-muted-foreground">/월</span>
                    </span>
                    <button
                      onClick={() => openEditSub(s)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                      aria-label="수정"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`'${s.name}' 정기결제를 삭제할까요?`)) deleteSub.execute({ id: s.id })
                      }}
                      className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* 이번 달 지출 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">🧾 이번 달 지출 (일회성)</h2>
            <p className="text-xs text-muted-foreground">세금·수수료·단발 구매 등 이번 달 실제 지출</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={openNewExp}>
            <Plus className="h-4 w-4" /> 지출 기록
          </Button>
        </div>

        {expenses.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background py-10 text-center">
            <p className="text-sm text-muted-foreground">이번 달 기록된 지출이 없어요</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {expenses.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold truncate">{e.name}</span>
                    <CategoryBadge categoryId={e.category} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.spent_on}
                    {e.currency === 'USD' && ` · ${fmtAmount(e.amount, e.currency)}`}
                    {e.memo ? ` · ${e.memo}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="mr-1 text-sm font-bold tabular-nums">{won(e.amount_krw)}</span>
                  <button
                    onClick={() => {
                      if (confirm(`'${e.name}' 지출을 삭제할까요?`)) deleteExp.execute({ id: e.id })
                    }}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 환율 설정 */}
      <section className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
        <div>
          <p className="text-sm font-medium">USD → KRW 환율</p>
          <p className="text-xs text-muted-foreground">달러 구독을 원화로 환산할 때 쓰는 값</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tabular-nums">$1 = {won(rate)}</span>
          <Button variant="outline" size="sm" onClick={() => setRateOpen(true)}>
            수정
          </Button>
        </div>
      </section>

      {/* ── 구독 추가/수정 다이얼로그 ── */}
      <Dialog open={subOpen} onOpenChange={setSubOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{subForm.id ? '정기결제 수정' : '정기결제 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">이름 (필수)</label>
              <Input
                list="sub-presets"
                placeholder="예: Claude API, Vercel"
                value={subForm.name}
                onChange={(e) => applyPreset(e.target.value)}
                className="h-11"
              />
              <datalist id="sub-presets">
                {SUBSCRIPTION_PRESETS.map((p) => (
                  <option key={p.name} value={p.name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">분류 (필수)</label>
              <CategorySelect
                value={subForm.category}
                onChange={(v) => setSubForm((f) => ({ ...f, category: v }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">금액 (필수)</label>
                <Input
                  inputMode="decimal"
                  placeholder="예: 20"
                  value={subForm.amount}
                  onChange={(e) => setSubForm((f) => ({ ...f, amount: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">통화</label>
                <select
                  className={inputCls}
                  value={subForm.currency}
                  onChange={(e) => setSubForm((f) => ({ ...f, currency: e.target.value }))}
                >
                  <option value="KRW">원 (₩)</option>
                  <option value="USD">달러 ($)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">결제 주기</label>
                <select
                  className={inputCls}
                  value={subForm.cycle}
                  onChange={(e) => setSubForm((f) => ({ ...f, cycle: e.target.value }))}
                >
                  <option value="monthly">매달</option>
                  <option value="yearly">매년</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">다음 결제일 (선택)</label>
                <Input
                  type="date"
                  value={subForm.next_billing_date}
                  onChange={(e) =>
                    setSubForm((f) => ({ ...f, next_billing_date: e.target.value }))
                  }
                  className="h-11"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full h-11"
              onClick={submitSub}
              disabled={upsertSub.isPending}
            >
              {upsertSub.isPending ? '저장 중...' : '저장하기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 지출 기록 다이얼로그 ── */}
      <Dialog open={expOpen} onOpenChange={setExpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>지출 기록</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">날짜</label>
                <Input
                  type="date"
                  value={expForm.spent_on}
                  onChange={(e) => setExpForm((f) => ({ ...f, spent_on: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">통화</label>
                <select
                  className={inputCls}
                  value={expForm.currency}
                  onChange={(e) => setExpForm((f) => ({ ...f, currency: e.target.value }))}
                >
                  <option value="KRW">원 (₩)</option>
                  <option value="USD">달러 ($)</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">항목 (필수)</label>
              <Input
                placeholder="예: 세무 기장료, 명함 인쇄"
                value={expForm.name}
                onChange={(e) => setExpForm((f) => ({ ...f, name: e.target.value }))}
                className="h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">분류 (필수)</label>
                <CategorySelect
                  value={expForm.category}
                  onChange={(v) => setExpForm((f) => ({ ...f, category: v }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">금액 (필수)</label>
                <Input
                  inputMode="decimal"
                  placeholder="예: 110000"
                  value={expForm.amount}
                  onChange={(e) => setExpForm((f) => ({ ...f, amount: e.target.value }))}
                  className="h-11"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">메모 (선택)</label>
              <Input
                placeholder="간단한 메모"
                value={expForm.memo}
                onChange={(e) => setExpForm((f) => ({ ...f, memo: e.target.value }))}
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-11" onClick={submitExp} disabled={addExp.isPending}>
              {addExp.isPending ? '기록 중...' : '기록하기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 환율 수정 다이얼로그 ── */}
      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>환율 수정 (USD → KRW)</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <label className="text-sm font-medium">$1 = ? 원</label>
            <Input
              inputMode="numeric"
              value={rateVal}
              onChange={(e) => setRateVal(e.target.value)}
              className="h-11"
            />
          </div>
          <DialogFooter>
            <Button
              className="w-full h-11"
              onClick={() => {
                const v = Number(rateVal)
                if (!v || v <= 0) return toast.error('환율을 입력해주세요')
                updateRate.execute({ usd_krw_rate: v })
              }}
              disabled={updateRate.isPending}
            >
              {updateRate.isPending ? '저장 중...' : '저장하기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
