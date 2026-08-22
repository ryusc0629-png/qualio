// ────────────────────────────────────────────────────────────────────────────
// 퀄리오 모듈 요금제 — 확정된 가격의 단일 소스 (2026-08-22)
//
// 기존 3단 플랜(lib/config/plans.ts)을 대체할 구조다. 지금은 **가격 정의만** 여기에 두고,
// 결제·페이월은 기능이 준비된 축부터 하나씩 옮긴다.
// ⛔ 아직 안 만든 축(지역·카드 받기·자재 중개)을 결제 페이지에 올리지 말 것 —
//    없는 기능을 파는 순간 첫 결제 고객이 그대로 CS가 된다.
//
// ★값을 매기는 축이 다섯이다. 지금 3단 플랜은 축이 '사람' 하나뿐이라
//  도급으로 굴리는 업체는 아무리 커져도 우리 매출이 그대로였다.
//    사람   — 현장 Pro 9,900/명
//    지역   — 마케팅 Pro 89,000/지역
//    거래처 — 거래처 Pro 정기 매출의 1% (최소 129,000)
//    거래액 — 카드 받기 19,900 + 결제액 0.5%
//    시간   — 연 5% 이내 갱신 조정
//
// ⛔영구 할인을 만들지 말 것. 모듈 묶음 할인(2개 10%·3개 15%)을 검토했다가 폐지했다 —
//  업체당 매달 101,351원(14%)을 영구히 깎는데, 그 할인이 가장 큰 대상이
//  **모듈을 전부 사는 최고 고객**이었다. 1,000곳이면 연 12억, 배수 7배면 85억이 날아간다.
//  붙이게 만드는 건 첫 3개월 프로모션으로 한다(ARR을 안 깎는다).
//  연 선납 10%만 예외 — 약정을 대가로 주는 할인이라 실사에서 긍정 평가된다.
// ────────────────────────────────────────────────────────────────────────────

/** 기본 — 모든 업체가 낸다. 사장님 1명 포함 (공급가액) */
export const BASE_PRICE = 49_000

export type ModuleId = 'field' | 'marketing' | 'client'

interface ModuleSpec {
  id: ModuleId
  label: string
  /** 사장님이 자기 얘기인지 바로 알아볼 한 줄 */
  who: string
  /** 기준 가격 (공급가액) */
  price: number
  /** 무엇에 비례해 오르는지 — null이면 정액 */
  unit: 'worker' | 'region' | 'recurring' | null
  /** 1회 실측 원가(원) — 마진 확인용. 가격 근거가 아니라 검산용이다 */
  cost: number
}

export const MODULES: Record<ModuleId, ModuleSpec> = {
  /** 직원·도급사를 쓰는 업체. 샤플 Pro(6,300원)보다 41% 비싸지만 작업 보고서가 고객에게 나간다 */
  field: {
    id: 'field',
    label: '현장 Pro',
    who: '직원·도급사를 쓰는 업체',
    price: 9_900,
    unit: 'worker',
    cost: 1_244, // 직원 1명이 월 22건 보고서를 쓸 때
  },
  /**
   * 지역당 과금. ★첫 지역과 추가 지역 값이 같다 —
   * 대전에서 검색에 뜨려면 대전 글 24편을 새로 쓰고 대전 질문 30개를 따로 재야 해서
   * 원가가 한 원도 다르지 않다. 깎으면 "그럼 울산은 왜 89,000이냐"가 따라온다.
   */
  marketing: {
    id: 'marketing',
    label: '마케팅 Pro',
    who: '손님을 더 받고 싶은 업체',
    price: 89_000,
    unit: 'region',
    cost: 10_337, // 글24 + SNS12 + GEO 주1회 + 영상 5편 (1지역)
  },
  /** 빌딩·사무실과 계약하는 업체. 값은 거래처 '수'가 아니라 정기 계약 매출에 비례한다 */
  client: {
    id: 'client',
    label: '거래처 Pro',
    who: '빌딩·사무실과 계약하는 업체',
    price: 29_000, // 최소 요금 (아래 CLIENT_MIN과 같은 값)
    unit: 'recurring',
    cost: 4_955,
  },
}

/**
 * 거래처 Pro = 정기 계약 매출의 CLIENT_RATE, 최소 CLIENT_MIN.
 *
 * ⛔거래처 '곳수'로 매기지 말 것 — 2026-08-22에 곳수식(15곳 포함, 초과 5,900원)을 폐기했다.
 *   실제 계약을 보면 주5일은 월 190만원, 월2회는 10만원이라 단가가 19배 벌어진다.
 *   같은 2,310만원을 버는 업체인데 큰 계약 12곳이면 129,000원, 잘게 쪼갠 154곳이면
 *   949,100원이 나왔다. **7.4배 차이인데 우리 원가는 같다**(월간 보고서 한 장이 113원).
 *   매출로 매기면 같은 매출은 같은 요금이 된다.
 *
 * ★왜 매출에 비례하는 게 원가 논리로도 맞나:
 *   거래처 매출 = 방문 횟수 × 회당 단가다. 그리고 우리가 하는 일(작업 보고서 → 월간 보고서)은
 *   방문 횟수에 비례한다. 주5일 거래처는 한 달에 22번 가고 월2회 거래처는 2번 간다.
 *   즉 **매출에 비례한다는 건 일의 양에 비례한다는 뜻**이다.
 *
 * ★사장님께 설명하는 말:
 *   "주 5일 가는 거래처면 한 달에 22번 갑니다. 그 22번을 보고서로 정리하는 데
 *    사람이 3시간 씁니다. 44,000원이에요. 저희는 19,000원입니다."
 *
 * ★최소 요금은 29,000원이다(2026-08-22). 129,000원이었을 때는 정기 매출 1,290만원을
 *   넘어야 1%가 걸렸는데, 실제 고객은 전부 200만원대라 사실상 정액으로 동작했다.
 *   29,000원이면 정기 290만원부터 1%가 걸려 '커지면 같이 커진다'가 실제로 작동한다.
 *   타겟 구간(정기 2,300만원 이상)은 어차피 1%가 걸리므로 **매출은 그대로이고
 *   작은 업체의 문턱만 낮아진다.**
 * ⛔19,000원 아래로 내리지 말 것 — 바쁜 업체(월간리포트5·미팅6) 원가 4,955원 기준
 *   마진이 73.9%로 밴드(80~90%) 아래로 떨어진다. 29,000원이 82.9%로 바닥이다.
 *
 * ⚠️1.0%는 실측 전 구간에서 사람보다 싸다(190만원 거래처 2.3배 · 10만원 거래처 7.4배).
 *   0.5%로 낮추면 구독 ARPA가 757,602 → 530,435원으로 27% 줄고,
 *   500억 매각에 필요한 고객사가 491곳 → 648곳이 된다. 공정성은 요율과 무관하므로
 *   요율은 순수하게 '얼마를 받을 것인가'의 문제다.
 */
export const CLIENT_RATE = 0.01
export const CLIENT_MIN = 29_000
/** 최소 요금이 걸리는 선 — 정기 매출이 이 아래면 전부 CLIENT_MIN */
export const CLIENT_MIN_THRESHOLD = CLIENT_MIN / CLIENT_RATE

/** 정기 계약 매출로 거래처 Pro 요금을 계산한다 */
export function clientFeeFor(recurringRevenue: number): number {
  return Math.max(CLIENT_MIN, Math.round(Math.max(0, recurringRevenue) * CLIENT_RATE))
}

/** 카드 받기 — 옵션. 켠 업체만 낸다 */
export const CARD_BASE = 19_900
export const CARD_RATE = 0.005
/**
 * ★0원 + 1.0%가 아니라 기본료를 붙인 이유:
 *   변동 매출 비중이 47%면 "SaaS라기엔 절반이 변동"으로 읽혀 배수가 깎인다.
 *   기본료를 붙이면 구독 비중이 52.8% → 65.6%로 올라간다.
 */

// 자재 중개는 요금제에 넣지 않는다.
// 제휴 매장도 주문 기능도 없는데 요금 계산과 밸류에이션에 넣었다가 뺐다(2026-08-22).
// 안 만든 걸 숫자에 넣으면 ARPA도 매각가도 부풀어 보인다. 실제로 붙는 날 다시 넣는다.

/** 연 선납 할인 */
export const ANNUAL_DISCOUNT = 0.1
/** 갱신 시 올릴 수 있는 상한 — 신규 계약서에 넣는다 */
export const RENEWAL_UPLIFT_CAP = 0.05

export interface ModuleSelection {
  /** 직원·도급사 수 (사장님 본인 제외). 0이면 현장 Pro 미사용 */
  workers?: number
  /** 마케팅을 쓰는 지역 수. 0이면 미사용 */
  regions?: number
  /** 월 정기 계약 매출(원). 0이면 거래처 Pro 미사용 */
  recurringRevenue?: number
}

export interface ModuleQuoteLine {
  label: string
  amount: number
  /** 화면에 "9,900원 × 3명"처럼 풀어 보여줄 때 쓴다 */
  detail?: string
}

export interface ModuleQuote {
  lines: ModuleQuoteLine[]
  /** 월 공급가액 (부가세 별도, 할인 전) */
  monthly: number
  /** 연 선납 시 1년 공급가액 (10% 할인 적용) */
  annual: number
}

/**
 * 고른 모듈로 월 요금을 계산한다. **영구 할인은 없다 — 단순 합산이다.**
 *
 * ⚠️ 이 함수가 요금의 단일 소스다. 화면과 결제가 각자 계산하면
 *    "결제 금액이 올바르지 않습니다"로 정상 결제가 튕긴다(getChargeAmount와 같은 원칙).
 */
export function quoteModules(sel: ModuleSelection): ModuleQuote {
  const workers = Math.max(0, Math.floor(sel.workers ?? 0))
  const regions = Math.max(0, Math.floor(sel.regions ?? 0))
  const recurring = Math.max(0, Math.round(sel.recurringRevenue ?? 0))

  const lines: ModuleQuoteLine[] = [{ label: '기본', amount: BASE_PRICE }]

  if (workers > 0) {
    lines.push({
      label: MODULES.field.label,
      amount: MODULES.field.price * workers,
      detail: `${MODULES.field.price.toLocaleString()}원 × ${workers}명`,
    })
  }
  if (regions > 0) {
    lines.push({
      label: MODULES.marketing.label,
      amount: MODULES.marketing.price * regions,
      detail: regions > 1 ? `${MODULES.marketing.price.toLocaleString()}원 × ${regions}개 지역` : undefined,
    })
  }
  if (recurring > 0) {
    const fee = clientFeeFor(recurring)
    lines.push({
      label: MODULES.client.label,
      amount: fee,
      detail: fee === CLIENT_MIN
        ? `정기 매출 ${CLIENT_MIN_THRESHOLD.toLocaleString()}원까지 같은 값`
        : `정기 매출 ${recurring.toLocaleString()}원의 ${(CLIENT_RATE * 100).toFixed(1)}%`,
    })
  }

  const monthly = lines.reduce((sum, l) => sum + l.amount, 0)
  return {
    lines,
    monthly,
    annual: Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT)),
  }
}

/** 카드 받기를 켠 업체의 이번 달 수수료 (결제 통과액 기준, 공급가액) */
export function cardFeeFor(processedAmount: number): number {
  return CARD_BASE + Math.round(Math.max(0, processedAmount) * CARD_RATE)
}

/** 모듈 1개의 마진 — 숫자를 바꿀 때 검산용 */
export function marginOf(id: ModuleId): number {
  const m = MODULES[id]
  return 1 - m.cost / m.price
}
