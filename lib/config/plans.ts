// 퀄리오 구독 플랜 정의 — 네이밍/금액 변경 시 이 파일만 수정
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
    price: 39_000,
    highlight: false,
    description: '"내 인건비/시간을 아껴주는 비서"',
    target: '1~2인 부부 창업, 영세 업체',
    autoPostLimit: 10,
    autoDailyPostLimit: 1,
    features: [
      '예약 관리',
      '고객 견적 폼',
      'AI 3단계 견적',
      '카카오 알림톡',
      '월간 통계 리포트',
      'AI 자동 발행 월 10건',
    ],
  },
  pro: {
    id: 'pro' as const,
    name: 'Pro',
    label: '프로',
    tagline: 'Tier 2. 프로 (Pro)',
    price: 149_000,
    highlight: true,
    description: '"알아서 돈을 벌어오는 영업실장"',
    target: '월 매출 1천만원 이상, 상위 20%',
    autoPostLimit: 30,
    autoDailyPostLimit: 2,
    features: [
      'Starter 전체 기능',
      '다중 직원 계정',
      'AI 견적 자동 최적화',
      '고급 통계 대시보드',
      '우선 고객 지원',
      'AI 자동 발행 월 30건',
    ],
  },
  scale: {
    id: 'scale' as const,
    name: 'Scale',
    label: '스케일',
    tagline: 'Tier 3. 스케일 (Scale)',
    price: 299_000,
    highlight: false,
    description: '"내 브랜드를 지키는 요새"',
    target: '다수 팀/지점 보유 기업형',
    autoPostLimit: 60,
    autoDailyPostLimit: 2,
    features: [
      'Pro 전체 기능',
      '다지점 통합 관리',
      '전용 계정 매니저',
      'SLA 응답 보장',
      '맞춤 온보딩 지원',
      'AI 자동 발행 월 60건',
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
