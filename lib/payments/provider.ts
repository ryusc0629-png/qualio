// 결제 PG 선택 — 포트원(기본)과 토스를 함께 운영하기 위한 얇은 추상화 레이어.
//
// 왜 필요한가: 포트원·토스 두 심사를 동시에 진행 중이라, 앱은 두 결제창을 모두
// 띄울 수 있어야 한다. 심사 기간에는 실사용자/포트원 심사원은 기본(포트원)을,
// 토스 심사원은 `/upgrade?pg=toss`로 토스 결제창을 확인한다.
// 토스가 승인되면 DEFAULT_PAYMENT_PROVIDER를 'toss'로 바꾸거나 env로 덮어써
// 전체를 토스로 전환한다(코드 한 줄 or 환경변수).
export type PaymentProvider = 'portone' | 'toss'

// 현재 라이브 기본 PG. 토스 승인 후 아래 값을 'toss'로 바꾸거나,
// 배포 없이 바꾸려면 NEXT_PUBLIC_DEFAULT_PAYMENT_PROVIDER=toss 를 설정한다.
export const DEFAULT_PAYMENT_PROVIDER: PaymentProvider =
  process.env.NEXT_PUBLIC_DEFAULT_PAYMENT_PROVIDER === 'toss' ? 'toss' : 'portone'

// ?pg= 쿼리값을 안전한 PaymentProvider로 변환 (알 수 없는 값이면 기본 PG)
export function resolvePaymentProvider(pg?: string | null): PaymentProvider {
  if (pg === 'toss') return 'toss'
  if (pg === 'portone') return 'portone'
  return DEFAULT_PAYMENT_PROVIDER
}

// 결제 식별자 형식: {businessId}_{planId}_{timestamp}
// businessId(UUID)에는 '_'가 없으므로 '_'로 분리하면 안전하게 되돌릴 수 있다.
// 서버 검증에서 planId를 파싱해 기대 금액과 실제 결제 금액을 대조한다.
export function buildPaymentId(businessId: string, planId: string): string {
  return `${businessId}_${planId}_${Date.now()}`
}

// 결제 식별자에서 businessId·planId 추출 (형식이 어긋나면 null)
export function parsePaymentId(
  paymentId: string
): { businessId: string; planId: string } | null {
  const parts = paymentId.split('_')
  if (parts.length < 3) return null
  return { businessId: parts[0], planId: parts[1] }
}
