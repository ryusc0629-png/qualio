// 자동 작성 기능들의 한도 (서버·테스트 공용 — server-only가 아니다).
//
// ★한도의 목적은 '아껴 쓰게 만드는 것'이 아니라 '한 곳이 폭주해도 원가가 터지지 않게' 하는 것이다.
//   그래서 **평범하게 쓰면 절대 못 닿는 높이**로 잡는다. 사장님이 한도를 만나면 그건 우리 실패다.
//
// ⚠️숫자의 근거는 기능별 1회 원가다(2026-08 실측):
//   미팅 정리 674원 · 월간 보고서 113원 · 글 83원 · 보고서 정리 57원 · 클레임 30원 · 견적 문구 19원
//   → 비싼 것만 촘촘히 막고, 싼 건 넉넉히 연다.
//
// ⚠️요금제마다 다르게 준다. 시작(49,000)과 확장(490,000)은 요금이 10배 차이인데
//   같은 한도를 주면 시작 플랜에서만 마진이 무너진다.
//
// ⛔한도를 낮추고 싶어지면 먼저 실제 사용량을 볼 것 —
//   숫자를 낮추는 건 원가를 아끼는 게 아니라 제품을 나쁘게 만드는 쪽일 때가 많다.

import type { PlanId } from '@/lib/config/plans'

/**
 * 한도를 세는 기간.
 *
 * 'month' — 몰아 쓰는 게 정상인 기능. 미팅은 어떤 주에 5건, 다음 주에 0건이다.
 *           하루로 끊으면 정상적인 사용을 막는다.
 * 'day'   — 현장 수에 비례하는 기능. 하루 단위가 자연스럽다.
 */
export type QuotaPeriod = 'day' | 'month'

interface QuotaSpec {
  scope: string
  label: string
  period: QuotaPeriod
  /** 요금제별 한도. 베타는 확장과 같은 대우(플랜 설계 원칙) */
  limits: Record<PlanId, number>
}

export const QUOTAS = {
  /**
   * 미팅 녹음 → 정리. 1시간 녹음이 674원(대부분 받아쓰기)이라 가장 비싸다.
   * ★월 단위로 센다 — 미팅은 몰아서 잡히는 게 정상이다.
   */
  meeting: {
    scope: 'meeting-summary',
    label: '미팅 정리',
    period: 'month',
    limits: { beta: 60, starter: 4, pro: 25, scale: 60 },
  },
  /** 작업 보고서 전문 정리 — 현장 수에 비례한다 */
  report: {
    scope: 'report-writer',
    label: '보고서 정리',
    period: 'day',
    limits: { beta: 70, starter: 7, pro: 35, scale: 70 },
  },
  /** 거래처 문서(시방서·견적 뽑기) */
  document: {
    scope: 'b2b-document',
    label: '문서 만들기',
    period: 'day',
    limits: { beta: 30, starter: 3, pro: 15, scale: 30 },
  },
  /** 클레임 답변 초안 */
  claim: {
    scope: 'claim-reply',
    label: '답변 초안',
    period: 'day',
    limits: { beta: 25, starter: 3, pro: 12, scale: 25 },
  },
  /** 견적 3단계 문구·서비스 구성 등 설정성 자동 작성 */
  setup: {
    scope: 'setup-copy',
    label: '문구 자동 작성',
    period: 'day',
    limits: { beta: 35, starter: 6, pro: 20, scale: 35 },
  },
} as const satisfies Record<string, QuotaSpec>

export type QuotaKey = keyof typeof QUOTAS

/** 이 요금제에서 이 기능을 몇 번 쓸 수 있는지 */
export function quotaLimit(key: QuotaKey, planId: PlanId): number {
  return QUOTAS[key].limits[planId]
}

/**
 * 글 만들기(주제 생성 + 현장 메모 초안) 하루 한도.
 *
 * ⚠️이건 원가가 아니라 **검색 노출 보호**가 목적이다 —
 *   하루에 글을 몰아 올리면 검색엔진이 '양산'으로 보고 홈페이지 평가를 깎는다.
 *   5편은 상한이지 권장량이 아니다(검색만 보면 하루 한두 편이 가장 좋다).
 *   그래서 이것만은 요금제와 무관하게 같다.
 */
export const POST_DRAFT_SCOPE = 'post-draft'
export const POST_DRAFT_DAILY_LIMIT = 5
