// 거래처(고객)의 '영업 상태' 단계 — 자동 파생되는 일회성/정기계약중 배지와는 별개 축.
// 전환된 거래처라도 새 정기계약 등을 영업 중일 때 손으로 지정한다.
// 파이프라인(리드) 단계와 같은 어휘를 써서 사장님이 헷갈리지 않게 한다. NULL/'' = 영업 없음.

export const SALES_STAGES = [
  { value: 'contacted',   label: '연락함',    className: 'bg-blue-100 text-blue-700' },
  { value: 'follow_up',   label: '현장 방문',  className: 'bg-indigo-100 text-indigo-700' },
  { value: 'quoted',      label: '견적 보냄',  className: 'bg-amber-100 text-amber-700' },
  { value: 'negotiating', label: '금액 협의',  className: 'bg-orange-100 text-orange-700' },
] as const

export const SALES_STAGE_VALUES = SALES_STAGES.map((s) => s.value)

// 값이 활성 영업 단계인지(= 허브에 '영업 중'으로 노출) — NULL/'' 이면 false
export function isActiveSalesStage(stage: string | null | undefined): boolean {
  return !!stage && (SALES_STAGE_VALUES as readonly string[]).includes(stage)
}

export function salesStageMeta(stage: string | null | undefined) {
  return SALES_STAGES.find((s) => s.value === stage) ?? null
}
