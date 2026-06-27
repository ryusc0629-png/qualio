'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { KOREA_REGIONS } from '@/lib/address/korea-regions'

interface Props {
  value: string
  onChange: (address: string) => void
}

// 기존 주소 문자열을 시/도·시군구·상세로 분해 (옛 자유입력 주소 마이그레이션용)
function splitAddress(address: string): { sidoIdx: number; sigungu: string; detail: string } {
  const norm = (address || '').normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!norm) return { sidoIdx: 0, sigungu: '', detail: '' }

  for (let i = 0; i < KOREA_REGIONS.length; i++) {
    const r = KOREA_REGIONS[i]
    const hit = norm.startsWith(r.sido) ? r.sido : norm.startsWith(r.short) ? r.short : null
    if (!hit) continue
    let rest = norm.slice(hit.length).trim()
    const sg = r.sigungu.find((s) => rest.startsWith(s)) ?? ''
    if (sg) rest = rest.slice(sg.length).trim()
    return { sidoIdx: i, sigungu: sg, detail: rest }
  }
  // 시/도를 못 찾으면 통째로 상세에 넣어 보존 (사장님이 다시 고르면 정리됨)
  return { sidoIdx: 0, sigungu: '', detail: norm }
}

// 업체 기준 주소 입력 — 시/도·시군구는 선택, 상세는 자유 입력.
// 지역 자동 인식(GEO)을 항상 시군구까지 보장하기 위해 구조화.
export function BaseAddressPicker({ value, onChange }: Props) {
  const init = splitAddress(value)
  const [sidoIdx, setSidoIdx] = useState(init.sidoIdx)
  const [sigungu, setSigungu] = useState(init.sigungu)
  const [detail, setDetail] = useState(init.detail)

  const region = KOREA_REGIONS[sidoIdx]

  // 세 값을 합쳐 주소 문자열 구성 후 상위로 전달
  const emit = (idx: number, sg: string, dt: string) => {
    const full = [KOREA_REGIONS[idx].sido, sg, dt.trim()].filter(Boolean).join(' ').trim()
    onChange(full)
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {/* 시/도 */}
        <select
          value={sidoIdx}
          onChange={(e) => {
            const idx = Number(e.target.value)
            setSidoIdx(idx)
            setSigungu('') // 시/도 바뀌면 시군구 초기화
            emit(idx, '', detail)
          }}
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {KOREA_REGIONS.map((r, i) => (
            <option key={r.sido} value={i}>{r.sido}</option>
          ))}
        </select>

        {/* 시군구 */}
        <select
          value={sigungu}
          onChange={(e) => {
            setSigungu(e.target.value)
            emit(sidoIdx, e.target.value, detail)
          }}
          disabled={region.sigungu.length === 0}
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <option value="">시·군·구 선택</option>
          {region.sigungu.map((sg) => (
            <option key={sg} value={sg}>{sg}</option>
          ))}
        </select>
      </div>

      {/* 상세 주소 (선택) */}
      <Input
        value={detail}
        onChange={(e) => {
          setDetail(e.target.value)
          emit(sidoIdx, sigungu, e.target.value)
        }}
        placeholder="상세 주소 (선택) — 예: 삼산로 123, 2층"
      />
      <p className="text-xs text-muted-foreground">
        시/도·시군구만 골라도 돼요. 상세 주소는 안 적어도 검색 노출에 문제없어요.
      </p>
    </div>
  )
}
