'use client'

import { useState } from 'react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createServiceItemAction, createServiceItemsAction } from '@/lib/actions/services'
import { Plus, X, ChevronDown } from 'lucide-react'

// 자주 쓰는 서비스 — 골라서 한 번에 담는다. 가격은 나중에 넣어도 되므로 이름·단위만 정해 둔다.
// unit: 고객에게 무엇을 물어볼지와 같은 뜻 ('평당'=평수, '개'=개수, '상담'=안 물어봄)
const PRESETS: { name: string; category: string; unit: AskValue }[] = [
  { name: '사무실 정기청소', category: '사무실',   unit: '평당' },
  { name: '상가 정기청소',   category: '상업 공간', unit: '평당' },
  { name: '입주 청소',       category: '주거 공간', unit: '평당' },
  { name: '이사 청소',       category: '주거 공간', unit: '평당' },
  { name: '준공 청소',       category: '특수/시공', unit: '평당' },
  { name: '거주 청소',       category: '주거 공간', unit: '평당' },
  { name: '에어컨 청소',     category: '가전 케어', unit: '개' },
  { name: '유리창 청소',     category: '기타',     unit: '상담' },
  { name: '바닥 왁스',       category: '기타',     unit: '평당' },
  { name: '특수 청소',       category: '특수/시공', unit: '상담' },
]

// 고객에게 무엇을 물어볼지 — 이 값이 곧 단위가 된다
type AskValue = '평당' | '개' | '상담'

const ASK_OPTIONS: { value: AskValue; title: string; desc: string }[] = [
  { value: '평당', title: '평수를 물어봐요', desc: '사무실·상가·집처럼 넓이로 정해지는 청소' },
  { value: '개',   title: '개수를 물어봐요', desc: '에어컨·창문처럼 개수로 정해지는 청소' },
  { value: '상담', title: '안 물어봐요',     desc: '봐야 아는 청소. 연락처만 받아요' },
]

export function AddServiceForm() {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [name, setName] = useState('')
  const [ask, setAsk] = useState<AskValue>('평당')
  const [showPrice, setShowPrice] = useState(false)
  const [price, setPrice] = useState('')

  const closeAndReset = () => {
    setPicked([])
    setName('')
    setAsk('평당')
    setShowPrice(false)
    setPrice('')
    setOpen(false)
  }

  const bulk = useAction(createServiceItemsAction, {
    onSuccess: ({ data }) => {
      const added = data?.added ?? 0
      toast.success(added > 0 ? `서비스 ${added}개를 추가했어요!` : '이미 등록된 서비스예요')
      closeAndReset()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 눌러주세요'),
  })

  const single = useAction(createServiceItemAction, {
    onSuccess: () => {
      toast.success('서비스가 추가됐어요!')
      closeAndReset()
    },
    onError: ({ error }) => toast.error(error.serverError ?? '다시 눌러주세요'),
  })

  const isPending = bulk.isPending || single.isPending

  const togglePreset = (presetName: string) =>
    setPicked((prev) => (prev.includes(presetName) ? prev.filter((n) => n !== presetName) : [...prev, presetName]))

  const addPicked = () => {
    const items = PRESETS.filter((p) => picked.includes(p.name)).map((p) => ({
      name: p.name,
      category: p.category,
      unit: p.unit,
      base_price: 0, // 가격은 나중에 — 그 전까지는 문의가 '상담'으로 접수된다
    }))
    if (items.length === 0) return
    bulk.execute({ items })
  }

  const addOne = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('서비스 이름을 적어주세요 (예: 사무실 정기청소)')
      return
    }
    single.execute({
      name: trimmed,
      unit: ask,
      base_price: showPrice ? Number(price.replace(/[^0-9]/g, '')) || 0 : 0,
    })
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full h-12">
        <Plus className="h-4 w-4 mr-1" />
        서비스 추가
      </Button>
    )
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-5 w-full">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">서비스 추가</h3>
        <Button type="button" variant="ghost" size="sm" onClick={closeAndReset}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* ① 자주 쓰는 서비스 — 눌러서 고르고 한 번에 추가 */}
      <section className="space-y-2">
        <Label className="text-sm">자주 쓰는 서비스에서 고르기</Label>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const on = picked.includes(p.name)
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => togglePreset(p.name)}
                className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                  on
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
              >
                {on && <span className="mr-1">✓</span>}
                {p.name}
              </button>
            )
          })}
        </div>
        <Button
          type="button"
          className="w-full h-12"
          disabled={picked.length === 0 || isPending}
          onClick={addPicked}
        >
          {isPending ? '추가 중...' : picked.length > 0 ? `고른 ${picked.length}개 추가하기` : '위에서 골라주세요'}
        </Button>
      </section>

      {/* ② 직접 적기 — 이름 + 무엇을 물어볼지 */}
      <section className="space-y-3 border-t pt-4">
        <Label className="text-sm">직접 적기</Label>

        <div className="space-y-1">
          <Label htmlFor="svc-name" className="text-xs text-muted-foreground">서비스 이름 (필수)</Label>
          <Input
            id="svc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 사무실 정기청소"
            className="h-12"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">고객에게 무엇을 물어볼까요?</Label>
          <div className="grid gap-2">
            {ASK_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setAsk(o.value)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  ask === o.value ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
                }`}
              >
                <p className="text-sm font-semibold">{o.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{o.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 가격은 선택 — 접어둔다 */}
        <div className="rounded-lg border border-dashed">
          <button
            type="button"
            onClick={() => setShowPrice((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <span>가격도 지금 정할래요 (안 정해도 돼요)</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showPrice ? 'rotate-180' : ''}`} />
          </button>
          {showPrice && (
            <div className="px-3 pb-3 space-y-1">
              <Input
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder={ask === '개' ? '예: 80000 (1대 금액)' : ask === '평당' ? '예: 15000 (1평 금액)' : '예: 100000'}
                className="h-12"
              />
              <p className="text-[11px] text-muted-foreground">
                금액을 넣으면 문의가 들어올 때 예상 금액이 함께 계산돼요. 고객 화면에는 안 보여요.
              </p>
            </div>
          )}
        </div>

        <Button type="button" variant="outline" className="w-full h-12" disabled={isPending} onClick={addOne}>
          {isPending ? '추가 중...' : '이 서비스 추가하기'}
        </Button>
      </section>

      <p className="text-[11px] text-muted-foreground leading-relaxed border-t pt-3">
        가격·플랜은 나중에 목록에서 <span className="font-medium text-foreground">수정</span>을 눌러 언제든 넣을 수 있어요.
        가격을 안 넣은 서비스는 문의가 들어오면 금액 없이 <span className="font-medium text-foreground">상담 요청</span>으로 접수돼요.
      </p>
    </div>
  )
}
