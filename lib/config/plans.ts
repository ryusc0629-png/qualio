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
//   ★ 플랜을 가르는 축은 딱 3개다 (2026-08-16 확정). 기능 개수로 나누지 않는다.
//      Jobber·서비스타이탄이 지키는 두 원칙을 우리 기능에 옮긴 것:
//        · 습관을 만드는 기능은 절대 막지 않는다(하위 플랜이 쓸모없어지면 유입 자체가 끊긴다)
//        · 고객이 커질 때 같이 커지는 축에 값을 매긴다(사람 수·매출 모듈)
//
//      축1 사람 수(maxWorkers)   — 근태·급여·배정. 직원을 늘리며 크는 업종이라 요금과 함께 커진다
//      축2 법인·거래처(b2bModule) — 거래처 CRM·B2B 문서·월간 리포트·재방문. 매출을 키우는 묶음
//      축3 유입 엔진             — 글 품질(getPostModel)·SNS 채널 원고·발행량
//
//      ⛔ 절대 막지 말 것: 예약·일정, 고객 견적 폼, 3단계 견적, 고객 관리, 홈페이지,
//         알림톡, 매출·지출 장부. 특히 장부는 경쟁 앱(월 9,900원)이 그걸로 들어오는 중이라
//         유료 뒤에 두면 정면으로 진다.
//
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
    description: '무료 베타 기간 — 최상위(확장) 플랜의 모든 기능을 제한 없이 사용',
    target: '초기 사용자',
    // 베타는 최상위(확장) 플랜과 동일한 한도·품질을 제공한다.
    // 만족도를 최대로 끌어올려 유료 전환·이탈방지(편의성 락인)를 노리는 정책.
    autoPostLimit: 24,       // 월 자동 발행 한도 = 확장과 동일
    autoDailyPostLimit: 1,   // 일 자동 발행 한도 (전 플랜 공통, 스팸 방지)
    maxWorkers: null,        // 직원 수 무제한 (확장과 동일 대우)
    b2bModule: true,
    features: [
      '모든 기능 제한 없이',
      '예약·일정, 고객 견적 폼, 3단계 견적',
      '카카오 알림톡, 매출·지출 장부',
      '직원 수 제한 없음 (근태·급여·배정)',
      '거래처 영업 전부 (견적서·시방서·계약서·월간 리포트)',
      '전문가급 정성 글 자동 발행 월 24건',
      'SNS 채널 원고 자동 생성 (네이버·당근·인스타)',
      '릴스·시공 사례 영상 자동 생성',
    ],
  },
  starter: {
    id: 'starter' as const,
    name: 'Starter',
    label: '시작',
    tagline: null,
    price: 49_000,
    highlight: false,
    description: '"나 혼자 쓴다"',
    target: '직원 없이 혼자 뛰는 사장님',
    autoPostLimit: 8,
    autoDailyPostLimit: 1,
    maxWorkers: 1,           // 사장님 본인만 — 직원을 쓰기 시작하면 성장으로
    b2bModule: false,
    features: [
      '예약·일정 관리',
      '고객 견적 폼 · 3단계 견적 자동화',
      '카카오 알림톡',
      '매출·지출 장부',
      '홈페이지 자동 생성',
      '블로그 자동 발행 월 8건',
      '직원 등록 1명 (사장님 본인)',
    ],
  },
  pro: {
    id: 'pro' as const,
    name: 'Pro',
    label: '성장',
    tagline: null,
    price: 290_000,
    highlight: true,
    description: '"직원을 쓰고, 거래처를 늘린다"',
    target: '직원과 함께 일하고 법인 거래처를 늘리는 사장님',
    autoPostLimit: 16,
    autoDailyPostLimit: 1,
    maxWorkers: 5,
    b2bModule: true,         // 거래처 영업 묶음이 여기서 열린다 — 이 플랜의 핵심 가치
    features: [
      '시작 플랜 전체 기능',
      '직원 5명까지 (근태·급여·명세서·일정 배정)',
      '거래처 관리 · 상담 기록',
      '거래처 견적서 · 시방서 · 용역 계약서 자동 작성',
      '거래처 월간 리포트 자동 작성',
      '견적서 다시 열어본 손님 알림',
      '전문가급 정성 글 자동 발행 월 16건',
      'SNS 채널 원고 자동 생성 (네이버·당근·인스타)',
    ],
  },
  scale: {
    id: 'scale' as const,
    name: 'Scale',
    label: '확장',
    tagline: null,
    price: 490_000,
    highlight: false,
    description: '"여러 명을 굴리고, 브랜드를 키운다"',
    target: '팀을 여럿 굴리며 브랜드를 키우는 사장님',
    autoPostLimit: 24,
    autoDailyPostLimit: 1,
    maxWorkers: null,        // 무제한
    b2bModule: true,
    features: [
      '성장 플랜 전체 기능',
      '직원 수 제한 없음',
      '내 인터넷 주소(도메인)로 홈페이지 열기',
      '정성 글 자동 발행 월 24건',
      '릴스·시공 사례 영상 자동 생성 + 전담 검수',
      '전담 담당자 배정 · 문의 시 빠른 응답',
      '처음 설정 1:1 도와드림',
    ],
  },
} as const

export type PlanId = keyof typeof PLANS
export type Plan = (typeof PLANS)[PlanId]

// 유료 플랜 목록 (결제 페이지에서 사용)
export const PAID_PLANS = [PLANS.starter, PLANS.pro, PLANS.scale] as const

// ★PLANS의 price는 전부 '공급가액(부가세 별도)'다.
//   실제 카드에 청구되는 금액은 여기에 부가세 10%를 더한 값이다.
//   화면에 금액을 쓸 때는 반드시 "부가세 별도"임을 함께 밝히거나 withVat()로 총액을 보여줄 것.
//   ⚠️ 결제 금액 계산은 getChargeAmount()(lib/payments/pricing.ts) 하나만 쓴다 —
//      한쪽만 부가세를 더하면 "결제 금액이 올바르지 않습니다"로 정상 결제가 튕긴다.
export const VAT_RATE = 0.1

/** 공급가액 → 부가세 (원 단위 반올림) */
export function vatOf(supplyPrice: number): number {
  return Math.round(supplyPrice * VAT_RATE)
}

/** 공급가액 → 실제 청구 총액(부가세 포함) */
export function withVat(supplyPrice: number): number {
  return supplyPrice + vatOf(supplyPrice)
}

// 금액 포맷 (39000 → "39,000원/월") — 통화 표기는 마켓 설정을 따른다.
// ⚠️ 이 함수가 받는 값은 공급가액이다. 화면엔 "부가세 별도"를 함께 적을 것.
export function formatPrice(price: number): string {
  if (price === 0) return '무료'
  return `${formatMoney(price)}/월`
}

/** 부가세를 포함한 실제 청구액 표기 (49000 → "53,900원/월") */
export function formatPriceWithVat(supplyPrice: number): string {
  if (supplyPrice === 0) return '무료'
  return `${formatMoney(withVat(supplyPrice))}/월`
}

// 플랜 ID로 공급가액 조회 (결제 검증 시 사용 — 청구액은 여기에 부가세를 더한 값)
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
  // 베타는 최상위(확장) 대우 — 심층 글(Sonnet) 제공
  return planId === 'beta' || planId === 'pro' || planId === 'scale'
    ? 'claude-sonnet-4-6'
    : 'claude-haiku-4-5-20251001'
}

// 플랜별 SNS 채널 원고(네이버·당근·인스타) 자동 생성 여부.
// 스타터는 블로그(GEO 글)만 제공, 그 외(베타·프로·스케일)는 채널 원고 포함.
export function isChannelContentEnabled(planId: PlanId): boolean {
  return planId !== 'starter'
}

// [축1] 등록할 수 있는 직원 수 — null이면 제한 없음.
// 청소업은 사람을 늘리며 크는 업종이라, 요금이 고객의 성장과 함께 올라가는 축으로 쓴다.
export function getWorkerLimit(planId: PlanId): number | null {
  return PLANS[planId].maxWorkers
}

// [축2] 거래처(법인) 영업 묶음 사용 가능 여부.
// 거래처 관리·B2B 견적서/시방서/계약서·거래처 월간 리포트·재열람 알림이 여기에 묶인다.
// 개인 고객만 받는 1인 사장님에겐 없어도 되고, 거래처를 늘리는 사장님이 돈을 내는 이유가 된다.
export function isB2bModuleEnabled(planId: PlanId): boolean {
  return PLANS[planId].b2bModule
}
