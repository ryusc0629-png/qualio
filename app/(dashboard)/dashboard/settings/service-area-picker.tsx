'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { KOREA_REGIONS, toAreaValue, isFarSido } from '@/lib/address/korea-regions'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
  homeSido: string | null // 업체 기준 시/도 (먼 지역 경고용)
}

// 당근식 2단계 출장 지역 선택 — 시/도 고른 뒤 시군구를 탭으로 토글.
export function ServiceAreaPicker({ value, onChange, homeSido }: Props) {
  const [sidoIdx, setSidoIdx] = useState(0)
  const region = KOREA_REGIONS[sidoIdx]

  // 시군구가 있으면 그 목록, 없으면(세종) 시/도 자체를 단일 선택지로
  const options = region.sigungu.length > 0
    ? region.sigungu.map((sg) => toAreaValue(region, sg))
    : [toAreaValue(region, null)]

  const remove = (v: string) => onChange(value.filter((x) => x !== v))

  // 시군구 선택 — 먼 지역이면 GEO 영향 경고 후 추가
  const handlePick = (v: string) => {
    if (value.includes(v)) {
      remove(v)
      return
    }
    if (isFarSido(homeSido, region.sido)) {
      const ok = window.confirm(
        `${region.sido}는 업체 지역에서 먼 편이에요.\n\n출장 지역을 너무 넓게 잡으면 핵심 지역의 검색 노출이 오히려 약해질 수 있어요.\n\n그래도 추가할까요?`,
      )
      if (!ok) return
    }
    onChange([...value, v])
  }

  return (
    <div className="space-y-3">
      {/* 1단계: 시/도 선택 */}
      <select
        value={sidoIdx}
        onChange={(e) => setSidoIdx(Number(e.target.value))}
        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {KOREA_REGIONS.map((r, i) => (
          <option key={r.sido} value={i}>{r.sido}</option>
        ))}
      </select>

      {/* 2단계: 시군구 토글 */}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = value.includes(opt)
          const label = opt.startsWith(region.short + ' ') ? opt.slice(region.short.length + 1) : opt
          return (
            <button
              key={opt}
              type="button"
              onClick={() => handlePick(opt)}
              className={`h-9 px-3 rounded-full border text-xs transition-colors ${
                active
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* 선택한 지역 목록 (전체) */}
      {value.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t">
          <p className="text-xs text-muted-foreground">선택한 출장 지역 {value.length}곳</p>
          <div className="flex flex-wrap gap-1.5">
            {value.map((v) => (
              <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs">
                {v}
                <button
                  type="button"
                  onClick={() => remove(v)}
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
