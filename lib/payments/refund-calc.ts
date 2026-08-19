// 환불 금액 산정 — 이용약관 제6조를 코드로 옮긴 것.
//
// 약관 원문(app/terms/page.tsx 제6조):
//   · 청약철회: 구독 결제 후 7일 이내 서비스를 이용하지 않은 경우 전액 환불
//   · 환불 사유: 서비스 장애, 7일 이내 미사용(단순 변심), 중복·오결제
//               구독 기간 중 이용 내역이 있으면 남은 기간에 대해 일할 계산하여 환불
//
// 왜 코드로 두는가: 손으로 계산하면 사람마다 다른 금액이 나오고, 그 차이가 그대로 분쟁이 된다.
// 화면에서도 이 함수 결과만 보여주고, 담당자가 금액을 직접 입력하지 않게 한다.

export type RefundKind =
  /** 7일 이내 + 이용 내역 없음 → 전액 */
  | 'full_withdrawal'
  /** 이용 내역 있음 → 남은 기간 일할 */
  | 'prorated'
  /** 서비스 장애·중복 결제 등 회사 귀책 → 전액 */
  | 'full_company_fault'

export interface RefundQuote {
  kind: RefundKind
  /** 환불 금액(원) */
  amount: number
  /** 결제 금액(원) */
  paidAmount: number
  /** 이용 기간 전체 일수 */
  totalDays: number
  /** 이미 쓴 일수 */
  usedDays: number
  /** 남은 일수 */
  remainingDays: number
  /** 담당자·고객에게 보여줄 산정 근거 한 줄 */
  reason: string
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

/** 날짜 차이를 '일' 단위로 (올림 없이 내림 — 쓴 날은 이미 쓴 것으로 본다) */
function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY)
}

/**
 * 환불 금액을 산정한다.
 *
 * @param paidAmount     실제 결제 금액(평생 할인이 적용된 청구액)
 * @param periodStart    이용 시작일(= 결제일)
 * @param periodEnd      이용 종료일
 * @param hasUsage       결제 후 서비스 이용 내역이 있는지
 * @param companyFault   서비스 장애·중복 결제 등 회사 귀책인지
 * @param now            기준 시각(테스트용, 기본 현재)
 */
export function quoteRefund(params: {
  paidAmount: number
  periodStart: string | Date
  periodEnd: string | Date
  hasUsage: boolean
  companyFault?: boolean
  now?: Date
}): RefundQuote {
  const { paidAmount, hasUsage, companyFault = false } = params
  const start = new Date(params.periodStart)
  const end = new Date(params.periodEnd)
  const now = params.now ?? new Date()

  const totalDays = Math.max(1, daysBetween(start, end))
  const usedDays = Math.min(totalDays, Math.max(0, daysBetween(start, now)))
  const remainingDays = Math.max(0, totalDays - usedDays)

  // 회사 귀책은 이용 여부·기간과 무관하게 전액
  if (companyFault) {
    return {
      kind: 'full_company_fault',
      amount: paidAmount,
      paidAmount, totalDays, usedDays, remainingDays,
      reason: '서비스 장애·중복 결제 등 회사 귀책 → 전액 환불',
    }
  }

  // 청약철회: 7일 이내 + 미사용이면 전액
  if (usedDays <= 7 && !hasUsage) {
    return {
      kind: 'full_withdrawal',
      amount: paidAmount,
      paidAmount, totalDays, usedDays, remainingDays,
      reason: `결제 후 ${usedDays}일 경과, 이용 내역 없음 → 청약철회로 전액 환불`,
    }
  }

  // 그 외에는 남은 기간 일할 계산. 원 단위 절사가 아니라 올림으로 고객에게 유리하게 둔다
  // (몇 백 원 때문에 분쟁이 나는 게 훨씬 비싸다).
  const amount = Math.min(paidAmount, Math.ceil((paidAmount * remainingDays) / totalDays))
  return {
    kind: 'prorated',
    amount,
    paidAmount, totalDays, usedDays, remainingDays,
    reason: `이용 내역 있음 → 남은 ${remainingDays}일 / 전체 ${totalDays}일 일할 계산`,
  }
}
