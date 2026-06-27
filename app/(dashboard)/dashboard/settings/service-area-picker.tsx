'use client'

import { useState } from 'react'
import { X, Plus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KOREA_REGIONS, toAreaValue, isFarSido } from '@/lib/address/korea-regions'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
  homeSido: string | null // 업체 기준 시/도 (먼 지역 경고용)
}

// 당근식 2단계 출장 지역 선택 — 시/도(어미)를 고른 뒤 시군구(아들)를
// 여러 개 골라 "추가하기"로 한 번에 넣는다. 먼 지역 경고도 추가 시 1회만.
export function ServiceAreaPicker({ value, onChange, homeSido }: Props) {
  const [sidoIdx, setSidoIdx] = useState(0)
  const [staged, setStaged] = useState<string[]>([]) // 추가 전 임시 선택
  const region = KOREA_REGIONS[sidoIdx]

  // 시군구가 있으면 그 목록, 없으면(세종) 시/도 자체를 단일 선택지로
  const options = region.sigungu.length > 0
    ? region.sigungu.map((sg) => toAreaValue(region, sg))
    : [toAreaValue(region, null)]

  const changeSido = (idx: number) => {
    setSidoIdx(idx)
    setStaged([]) // 시/도 바뀌면 임시 선택 초기화
  }

  const toggleStaged = (v: string) =>
    setStaged((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))

  const removeAdded = (v: string) => onChange(value.filter((x) => x !== v))

  // 임시 선택분을 한 번에 추가 — 먼 지역이면 경고 1회
  const commitStaged = () => {
    if (staged.length === 0) return
    if (isFarSido(homeSido, region.sido)) {
      const ok = window.confirm(
        `${region.sido}는 업체 지역에서 먼 편이에요.\n\n출장 지역을 너무 넓게 잡으면 핵심 지역의 검색 노출이 오히려 약해질 수 있어요.\n\n${staged.length}곳을 그래도 추가할까요?`,
      )
      if (!ok) return
    }
    onChange([...new Set([...value, ...staged])])
    setStaged([])
  }

  const labelOf = (v: string) =>
    v.startsWith(region.short + ' ') ? v.slice(region.short.length + 1) : v

  return (
    <div className="space-y-3">
      {/* 1단계: 시/도(어미구역) 선택 */}
      <select
        value={sidoIdx}
        onChange={(e) => changeSido(Number(e.target.value))}
        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {KOREA_REGIONS.map((r, i) => (
          <option key={r.sido} value={i}>{r.sido}</option>
        ))}
      </select>

      {/* 2단계: 시군구(아들구역) 여러 개 선택 */}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const added = value.includes(opt)
          const isStaged = staged.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => (added ? removeAdded(opt) : toggleStaged(opt))}
              className={`h-9 px-3 rounded-full border text-xs transition-colors inline-flex items-center gap-1 ${
                added
                  ? 'border-primary bg-primary text-primary-foreground'
                  : isStaged
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {added && <Check className="h-3 w-3" />}
              {labelOf(opt)}
            </button>
          )
        })}
      </div>

      {/* 추가하기 — 임시 선택이 있을 때만 노출 */}
      {staged.length > 0 && (
        <Button type="button" onClick={commitStaged} className="w-full h-11 gap-1.5">
          <Plus className="h-4 w-4" />
          {staged.length}곳 추가하기
        </Button>
      )}

      {/* 추가된 출장 지역 전체 목록 */}
      {value.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t">
          <p className="text-xs text-muted-foreground">추가된 출장 지역 {value.length}곳</p>
          <div className="flex flex-wrap gap-1.5">
            {value.map((v) => (
              <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs">
                {v}
                <button
                  type="button"
                  onClick={() => removeAdded(v)}
                  aria-label={`${v} 삭제`}
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
