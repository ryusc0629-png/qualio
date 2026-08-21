'use client'

// 규모 구간별 단가 입력 — "100평부터는 평당 22,000원" 같은 구간을 사장님이 직접 넣는다.
//
// 왜 필요한가:
//   평당 단가 하나로만 계산하면 250평 견적이 25,000 × 250 = 625만원으로 곧이곧대로 나온다.
//   큰 현장일수록 평당 단가를 낮춰 부르는 게 실제 관행인데 그게 반영이 안 됐다.
//   얼마를 낮출지는 업체마다 다르므로 숫자를 우리가 정하지 않고 입력받는다.

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Layers, Trash2, Plus } from 'lucide-react'
import { HelpNote } from '@/components/ui/help-note'

export interface VolumeTierRow {
  minSize: string
  price: string
}

interface Props {
  /** '평당' 또는 '개' — 그 외 단위에서는 이 화면 자체를 띄우지 않는다 */
  unit: string
  /** 기본 단가(원/평) — 구간에 못 미치는 규모에 적용되는 값. 미리보기 계산에 쓴다 */
  basePrice: number
  enabled: boolean
  onEnabledChange: (v: boolean) => void
  rows: VolumeTierRow[]
  onRowsChange: (rows: VolumeTierRow[]) => void
}

/** 저장 시 쓰는 변환 — 빈 줄·잘못된 값은 버리고 큰 구간부터 정렬 */
export function toVolumeTiers(rows: VolumeTierRow[]): Array<{ min_size: number; price: number }> {
  return rows
    .map((r) => ({ min_size: Number(r.minSize), price: Number(r.price) }))
    .filter((r) => Number.isFinite(r.min_size) && Number.isFinite(r.price) && r.min_size > 0 && r.price > 0)
    .sort((a, b) => a.min_size - b.min_size)
}

/** 불러오기 — DB에 저장된 값을 입력칸 문자열로 */
export function toVolumeTierRows(raw: unknown): VolumeTierRow[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is { min_size: number; price: number } =>
      !!r && typeof r === 'object' && 'min_size' in r && 'price' in r)
    .sort((a, b) => a.min_size - b.min_size)
    .map((r) => ({ minSize: String(r.min_size), price: String(r.price) }))
}

export function VolumeTierEditor({
  unit, basePrice, enabled, onEnabledChange, rows, onRowsChange,
}: Props) {
  const sizeLabel = unit === '개' ? '개' : '평'
  const perLabel  = unit === '개' ? '개당' : '평당'

  const updateRow = (idx: number, patch: Partial<VolumeTierRow>) => {
    onRowsChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  const addRow    = () => onRowsChange([...rows, { minSize: '', price: '' }])
  const removeRow = (idx: number) => onRowsChange(rows.filter((_, i) => i !== idx))

  const won = (n: number) => n.toLocaleString('ko-KR')

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => {
          const next = !enabled
          onEnabledChange(next)
          // 처음 켤 때 빈 줄 하나를 미리 깔아준다 (뭘 해야 할지 바로 보이도록)
          if (next && rows.length === 0) onRowsChange([{ minSize: '', price: '' }])
        }}
        className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
          enabled
            ? 'border-primary/40 bg-primary/5 text-primary'
            : 'border-dashed text-muted-foreground hover:text-foreground hover:border-border'
        }`}
      >
        <Layers className="h-3.5 w-3.5 shrink-0" />
        {enabled
          ? `규모가 크면 ${perLabel} 단가 낮추기 (클릭하면 해제)`
          : `규모가 크면 ${perLabel} 단가 낮추기 (예: 100${sizeLabel}부터 더 싸게)`}
      </button>

      {enabled && (
        <div className="space-y-2">
          {/* 설명은 접어둔다 — 화면이 안내로 꽉 차면 정작 채울 칸을 못 찾는다 */}
          <HelpNote summary={<b className="text-foreground">큰 현장은 자동으로 단가가 내려가요</b>}>
            <p>
              지금은 {basePrice > 0 ? `${perLabel} ${won(basePrice)}원` : '기본 단가'}이 규모와 상관없이 그대로 곱해져요.
              아래에 구간을 넣으면 그 {sizeLabel}수부터는 낮은 단가로 계산돼요.
            </p>
            <p>
              큰 구간부터 적용돼요. 예를 들어 100{sizeLabel}·300{sizeLabel} 두 구간을 넣으면
              250{sizeLabel} 문의는 100{sizeLabel} 구간 단가로 계산돼요.
            </p>
          </HelpNote>

          {rows.map((row, idx) => {
            const size  = Number(row.minSize)
            const price = Number(row.price)
            const valid = size > 0 && price > 0
            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={row.minSize}
                    onChange={(e) => updateRow(idx, { minSize: e.target.value.replace(/[^0-9]/g, '') })}
                    placeholder="100"
                    className="h-9 w-20 text-center"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">{sizeLabel}부터</span>
                  <span className="text-xs text-muted-foreground shrink-0">{perLabel}</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={row.price}
                    onChange={(e) => updateRow(idx, { price: e.target.value.replace(/[^0-9]/g, '') })}
                    placeholder="22000"
                    className="h-9 flex-1 text-right"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">원</span>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="p-1.5 text-muted-foreground hover:text-destructive shrink-0"
                    aria-label="구간 삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {valid && (
                  <p className="text-[11px] text-muted-foreground pl-1">
                    {size}{sizeLabel}이면 {won(size * price)}원
                    {basePrice > 0 && price < basePrice && (
                      <span className="text-primary font-medium">
                        {' '}(원래 {won(size * basePrice)}원)
                      </span>
                    )}
                  </p>
                )}
              </div>
            )
          })}

          <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full gap-1">
            <Plus className="h-3.5 w-3.5" />
            구간 추가
          </Button>

        </div>
      )}
    </div>
  )
}
