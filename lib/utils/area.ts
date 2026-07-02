// 면적 단위 유틸 — 평/㎡(헤베) 입력·환산·표기를 폼·시방서·인쇄에서 공용으로 사용
// 저장은 "450평"처럼 값+단위를 합친 문자열(text 컬럼 유지, 마이그레이션 불필요)

export const AREA_UNITS = ['평', '㎡'] as const
export type AreaUnit = (typeof AREA_UNITS)[number]

export const PYEONG_TO_SQM = 3.3058 // 1평 ≈ 3.3058㎡

// 단위 라벨 (드롭다운 표시용) — ㎡는 현장에서 '헤베'로도 부름
export const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  평: '평',
  '㎡': '㎡(헤베)',
}

// 다양한 표기(m², m2, 헤베, 제곱미터, py, pyeong 등)를 표준 단위로 인식
function detectUnit(s: string): AreaUnit | null {
  if (/㎡|m²|m2|헤베|제곱\s*미터|sqm/i.test(s)) return '㎡'
  if (/평|py(eong)?/i.test(s)) return '평'
  return null
}

// 저장된 면적 문자열("450평"/"1,488㎡"/"450 헤베")을 숫자값+단위로 분해 — 편집 시 복원용
export function parseArea(raw: string | null | undefined): { value: string; unit: AreaUnit } {
  const s = (raw ?? '').trim()
  const unit = detectUnit(s) ?? '평'
  // 숫자(소수·천단위 콤마 허용)만 추출
  const numMatch = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return { value: numMatch ? numMatch[0] : '', unit }
}

// 값+단위 → 저장용 문자열 ("450" + "평" = "450평"). 빈 값이면 빈 문자열
export function formatArea(value: string, unit: AreaUnit): string {
  const v = value.trim()
  return v ? `${v}${unit}` : ''
}

// 평↔㎡ 상호 환산 (단위 전환 시 숫자값을 실제로 바꿔 의미 보존)
export function convertArea(value: string, from: AreaUnit, to: AreaUnit): string {
  const n = Number(value)
  if (from === to || !value.trim() || Number.isNaN(n) || n <= 0) return value
  const converted = from === '평' ? n * PYEONG_TO_SQM : n / PYEONG_TO_SQM
  // 평은 소수1자리, ㎡는 정수로 반올림 (현장 관례)
  return to === '㎡' ? String(Math.round(converted)) : String(Math.round(converted * 10) / 10)
}

// 다른 단위 환산 안내 문구 ("약 1,488㎡"). 숫자가 아니면 null
export function areaConversionHint(value: string, unit: AreaUnit): string | null {
  const n = Number(value)
  if (!value.trim() || Number.isNaN(n) || n <= 0) return null
  return unit === '평'
    ? `약 ${Math.round(n * PYEONG_TO_SQM).toLocaleString()}㎡`
    : `약 ${(Math.round((n / PYEONG_TO_SQM) * 10) / 10).toLocaleString()}평`
}

// 표시/출력용 — 두 단위 함께 노출 ("450평 (약 1,488㎡)").
// 숫자로 해석 안 되는 자유 텍스트는 원본 그대로 반환
export function formatAreaWithBoth(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  const { value, unit } = parseArea(s)
  const hint = areaConversionHint(value, unit)
  if (!value || !hint) return s // 숫자 파싱 실패 → 원본 유지
  return `${value}${unit} (${hint})`
}
