// 급여 계산 공용 로직 — 급여 관리 페이지와 명세서 페이지, 장부 반영 액션이 같은 계산을 쓰도록 한곳에 모은다.
//
// 급여 = 기본급 + 추가 지급·공제
//  - 도급사의 기본급은 여기서 계산하지 않는다. 도급 계약서의 배분 조건으로 이미 계산되고 있어서
//    (lib/finance/subcontract-settlement.ts) 그 값을 그대로 가져다 쓴다. 두 화면이 다른 금액을
//    말하지 않게 하려는 것이다.
//  - 직원의 기본급은 급여 방식(월급/건당/일급/시급) × 재료(근무일수·건수·시간)로 계산한다.
//  - 현장마다 다르게 준 돈(어떤 현장은 일당, 어떤 현장은 추가 업무 수당)은 방식 하나로 담을 수 없어
//    '추가 지급' 줄로 따로 얹는다.

export type PayType = 'monthly' | 'hourly' | 'daily' | 'per_visit'

export const PAY_TYPE_LABEL: Record<PayType, string> = {
  monthly: '월급',
  hourly: '시급',
  daily: '일급',
  per_visit: '건당',
}

// 급여 방식별 단가 단위(입력 안내용)
export const PAY_TYPE_UNIT: Record<PayType, string> = {
  monthly: '원/월',
  hourly: '원/시간',
  daily: '원/일',
  per_visit: '원/건',
}

// 급여 방식이 무엇을 세는지 — 화면에서 "무엇에 곱해지는 값인지" 한 줄로 알려준다
export const PAY_TYPE_BASIS: Record<PayType, string> = {
  monthly: '근무와 상관없이 매달 같은 금액',
  hourly: '도착~마감 기록이 있는 시간만',
  daily: '현장에 나간 날 수',
  per_visit: '완료한 현장 건수',
}

export function isPayType(v: string | null | undefined): v is PayType {
  return v === 'monthly' || v === 'hourly' || v === 'daily' || v === 'per_visit'
}

export interface PayrollVisit {
  id: string
  scheduled_at: string
  customer_name: string | null
  service_address: string | null
  checkin_at: string | null
  checkout_at: string | null
}

/** 기본급 위에 얹는 한 줄 — 현장에 준 일당, 추가 업무 수당, 공제(음수) */
export interface PayrollExtra {
  id: string
  label: string
  amount: number
  bookingId: string | null
  /** 현장에 붙은 줄이면 '8월 17일 · 이승찬' 같은 표시용 문구 */
  bookingLabel: string | null
}

export interface WorkerPayroll {
  worker: {
    id: string
    name: string
    type: string // 'employee' | 'contractor'
    pay_type: PayType | null
    pay_rate: number | null
  }
  visits: PayrollVisit[]
  visitCount: number
  hours: number // 도착~마감 시각이 둘 다 있는 방문의 근무시간 합계
  workDays: number // 근무한 날짜 수(KST)
  /** 도급사인가 — 도급사는 기본급을 도급 정산에서 가져오고 장부도 그쪽에서 넣는다 */
  isContractor: boolean
  /** 기본급 */
  baseAmount: number
  /** 기본급이 어떻게 나온 금액인지 한 줄 설명 */
  baseLabel: string
  /** 기본급을 자동으로 낼 수 없는 이유. 있으면 화면이 무엇을 채워야 하는지 안내한다 */
  baseBlocked: string | null
  extras: PayrollExtra[]
  extraTotal: number
  /** 실제 지급액 = 기본급 + 추가 지급·공제 */
  amount: number
  /**
   * 추가 지급 줄을 붙일 수 있는 그 달 현장 목록(취소 제외).
   * 완료 체크가 며칠씩 밀리는 게 보통이라 완료 전 현장도 고를 수 있어야 한다.
   */
  bookingOptions: { id: string; label: string }[]
}

// 두 시각 사이 시간(시간 단위, 음수·비정상은 0)
export function hoursBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0
  const h = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000
  return h > 0 ? h : 0
}

// KST 기준 날짜 문자열(YYYY-MM-DD)
export function kstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// 방문 목록으로 근무 요약 계산
export function summarizeVisits(visits: PayrollVisit[]): { visitCount: number; hours: number; workDays: number } {
  let hours = 0
  const days = new Set<string>()
  for (const v of visits) {
    hours += hoursBetween(v.checkin_at, v.checkout_at)
    days.add(kstDate(v.scheduled_at))
  }
  return { visitCount: visits.length, hours, workDays: days.size }
}

// 직원 기본급 계산 — 방식·단가 미설정이면 0
export function computeAmount(
  payType: PayType | null,
  payRate: number | null,
  s: { visitCount: number; hours: number; workDays: number },
): number {
  if (!payType || !payRate) return 0
  if (payType === 'monthly') return payRate // 근무 기록과 무관하게 매달 같은 금액
  if (payType === 'hourly') return Math.round(s.hours * payRate)
  if (payType === 'daily') return s.workDays * payRate
  return s.visitCount * payRate // per_visit
}

const won = (n: number) => n.toLocaleString('ko-KR')

/** 직원 기본급이 무슨 계산으로 나온 금액인지 한 줄로 (명세서·카드 공용) */
export function describeEmployeeBase(
  payType: PayType | null,
  payRate: number | null,
  s: { visitCount: number; hours: number; workDays: number },
): string {
  if (!payType || !payRate) return '급여 방식과 단가를 정해주세요'
  if (payType === 'monthly') return `월급 ${won(payRate)}원`
  if (payType === 'hourly') return `${s.hours.toFixed(1)}시간 × ${won(payRate)}원`
  if (payType === 'daily') return `${s.workDays}일 × ${won(payRate)}원`
  return `${s.visitCount}건 × ${won(payRate)}원`
}
