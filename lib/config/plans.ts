// 퀄리오 구독 플랜 정의 — 네이밍/금액 변경 시 이 파일만 수정
//
// 가격 철학 (2026-06 개편):
//   1) 가치 기반(value-based): 퀄리오는 검증된 +250만원/월 매출 상승을 준다.
//      가격은 그 ROI를 근거로 매긴다(매출의 ~3%로 매출 25%↑). 원가 기준 아님.
//   2) 랜딩→확장(land & expand): 신규/학원 수강생은 스타터로 싸게 들이고,
//      매출이 커지면 프로로 올라타게 한다. 이 상향 이동이 곧 NRR(밸류에이션 핵심).
//   3) 평균 ARPA 목표 30만 → "가운데(프로)"를 30만 근처에 둔다.
//      스타터가 평균을 내리고 스케일이 올리므로, 주력은 가운데여야 한다.
//   4) 구독은 정액 SaaS로 단순하게. 결제 take-rate·소모품은 별도 층으로 얹는다(섞지 않음).
//   5) 자동 포스팅은 "양"이 아니라 "질·채널·운영"으로 업셀한다(2026-06 개편).
//      GEO는 양산하면 오히려 저품질로 눌리므로, 발행량(autoPostLimit)은 마케팅 헤드라인이
//      아니라 원가 보호용 상한일 뿐. 상위 플랜의 가치는 심층 글(Sonnet)·SNS 채널 원고·
//      릴스/시공사례·전담 검수로 구성한다. (getPostModel / isChannelContentEnabled 참고)
//      일 발행은 전 플랜 1건으로 통일 — "하루 2건 양산" 패턴이 스팸 신호가 되는 것을 차단.
//
//   ※ 금액은 v1 제안값이다. 베타 사용자 WTP(지불의향)로 검증 후 확정한다.
//     올리기는 어렵고 내리긴 쉬우므로 앵커는 높게 잡았다.
import { formatMoney } from '@/lib/format/money'

export const PLANS = {
  beta: {
    id: 'beta' as const,
    name: 'Beta',
    label: '베타',
    tagline: null,
    price: 0,
    highlight: false,
    description: '무료 베타 기간 — 모든 기능 제한 없이 사용',
    target: '초기 사용자',
    autoPostLimit: 5,        // 월 자동 발행 한도
    autoDailyPostLimit: 1,   // 일 자동 발행 한도
    features: [
      '예약 관리',
      '고객 견적 폼',
      'AI 3단계 견적',
      '카카오 알림톡',
      'AI 자동 발행 월 5건',
    ],
  },
  starter: {
    id: 'starter' as const,
    name: 'Starter',
    label: '스타터',
    tagline: 'Tier 1. 스타터 (Starter)',
    price: 49_000,
    highlight: false,
    description: '"내 인건비/시간을 아껴주는 비서"',
    target: '신규 창업·1~2인 (학원 수강생 진입용)',
    autoPostLimit: 8,
    autoDailyPostLimit: 1,
    features: [
      '예약 관리',
      '고객 견적 폼',
      'AI 3단계 견적',
      '카카오 알림톡',
      '월간 통계 리포트',
      'AI 블로그 자동 발행 월 8건',
    ],
  },
  pro: {
    id: 'pro' as const,
    name: 'Pro',
    label: '프로',
    tagline: 'Tier 2. 프로 (Pro)',
    price: 290_000,
    highlight: true,
    description: '"알아서 돈을 벌어오는 영업실장"',
    target: '성장기·법인 거래처 보유 (주력 · 평균 ARPA)',
    autoPostLimit: 16,
    autoDailyPostLimit: 1,
    features: [
      'Starter 전체 기능',
      '다중 직원 계정',
      'AI 견적 자동 최적화',
      '고급 통계 대시보드',
      '우선 고객 지원',
      'AI 심층 글 자동 발행 월 16건 (전문가급)',
      'SNS 채널 원고 자동 생성 (네이버·당근·인스타)',
    ],
  },
  scale: {
    id: 'scale' as const,
    name: 'Scale',
    label: '스케일',
    tagline: 'Tier 3. 스케일 (Scale)',
    price: 490_000,
    highlight: false,
    description: '"내 브랜드를 지키는 요새"',
    target: '다지점·기업형 (앵커 · 전담 매니저)',
    autoPostLimit: 24,
    autoDailyPostLimit: 1,
    features: [
      'Pro 전체 기능',
      '다지점 통합 관리',
      '전용 계정 매니저',
      'SLA 응답 보장',
      '맞춤 온보딩 지원',
      'AI 심층 글 자동 발행 월 24건',
      '릴스·시공 사례 자동 생성 + 전담 검수',
    ],
  },
} as const

export type PlanId = keyof typeof PLANS
export type Plan = (typeof PLANS)[PlanId]

// 유료 플랜 목록 (결제 페이지에서 사용)
export const PAID_PLANS = [PLANS.starter, PLANS.pro, PLANS.scale] as const

// 금액 포맷 (39000 → "39,000원/월") — 통화 표기는 마켓 설정을 따른다
export function formatPrice(price: number): string {
  if (price === 0) return '무료'
  return `${formatMoney(price)}/월`
}

// 플랜 ID로 금액 조회 (결제 검증 시 사용)
export function getPlanPrice(planId: PlanId): number {
  return PLANS[planId].price
}

// 플랜별 월 자동 발행 한도 조회
export function getAutoPostLimit(planId: PlanId): number {
  return PLANS[planId].autoPostLimit
}

// 플랜별 일 자동 발행 한도 조회
export function getAutoDailyPostLimit(planId: PlanId): number {
  return PLANS[planId].autoDailyPostLimit
}

// 플랜별 자동 발행 본문 생성 모델 — 상위 플랜(프로·스케일)은 더 깊이 있는 심층 글(Sonnet),
// 하위 플랜은 기본 글(Haiku). "양"이 아닌 "질"로 업셀하는 핵심 노브.
export function getPostModel(planId: PlanId): string {
  return planId === 'pro' || planId === 'scale'
    ? 'claude-sonnet-4-6'
    : 'claude-haiku-4-5-20251001'
}

// 플랜별 SNS 채널 원고(네이버·당근·인스타) 자동 생성 여부.
// 스타터는 블로그(GEO 글)만 제공, 그 외(베타·프로·스케일)는 채널 원고 포함.
export function isChannelContentEnabled(planId: PlanId): boolean {
  return planId !== 'starter'
}
