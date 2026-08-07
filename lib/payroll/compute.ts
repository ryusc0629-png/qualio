// 급여 계산 공용 로직 — 급여 관리 페이지와 명세서 페이지, 장부 반영 액션이 같은 계산을 쓰도록 한곳에 모은다.

export type PayType = 'hourly' | 'daily' | 'per_visit'

export const PAY_TYPE_LABEL: Record<PayType, string> = {
  hourly: '시급',
  daily: '일급',
  per_visit: '건당',
}

// 급여 방식별 단가 단위(입력 안내용)
export const PAY_TYPE_UNIT: Record<PayType, string> = {
  hourly: '원/시간',
  daily: '원/일',
  per_visit: '원/건',
}

export function isPayType(v: string | null | undefined): v is PayType {
  return v === 'hourly' || v === 'daily' || v === 'per_visit'
}

export interface PayrollVisit {
  id: string
  scheduled_at: string
  customer_name: string | null
  service_address: string | null
  checkin_at: string | null
  checkout_at: string | null
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
  amount: number
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

// 급여 금액 계산 — 방식·단가 미설정이면 0
export function computeAmount(
  payType: PayType | null,
  payRate: number | null,
  s: { visitCount: number; hours: number; workDays: number },
): number {
  if (!payType || !payRate) return 0
  if (payType === 'hourly') return Math.round(s.hours * payRate)
  if (payType === 'daily') return s.workDays * payRate
  return s.visitCount * payRate // per_visit
}
