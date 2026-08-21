// 자동 작성 기능들의 하루 한도 (서버·테스트 공용 — server-only가 아니다).
//
// ★한도의 목적은 '아껴 쓰게 만드는 것'이 아니라 '한 곳이 폭주해도 원가가 터지지 않게' 하는 것이다.
//   그래서 **평범하게 쓰면 절대 못 닿는 높이**로 잡는다. 사장님이 한도를 만나면 그건 우리 실패다.
//
// ⚠️숫자의 근거는 기능별 1회 원가다(2026-08 실측):
//   미팅 정리 674원 · 월간 보고서 113원 · 글 83원 · 보고서 정리 57원 · 클레임 30원 · 견적 문구 19원
//   → 비싼 것만 촘촘히 막고, 싼 건 넉넉히 연다.
//
// ⛔한도를 낮추고 싶어지면 먼저 실제 사용량을 볼 것 —
//   숫자를 낮추는 건 원가를 아끼는 게 아니라 제품을 나쁘게 만드는 쪽일 때가 많다.

export const QUOTAS = {
  /** 미팅 녹음 → 정리. 1시간 녹음이 674원(대부분 받아쓰기 비용)이라 가장 비싸다 */
  meeting:  { scope: 'meeting-summary', limit: 3,  label: '미팅 정리' },
  /** 작업 보고서 전문 정리 — 현장이 많은 날을 감안해 넉넉히 */
  report:   { scope: 'report-writer',   limit: 40, label: '보고서 정리' },
  /** 거래처 문서(시방서·견적 뽑기) */
  document: { scope: 'b2b-document',    limit: 30, label: '문서 만들기' },
  /** 클레임 답변 초안 */
  claim:    { scope: 'claim-reply',     limit: 20, label: '답변 초안' },
  /** 견적 3단계 문구·서비스 구성 등 설정성 자동 작성 */
  setup:    { scope: 'setup-copy',      limit: 30, label: '문구 자동 작성' },
} as const

export type QuotaKey = keyof typeof QUOTAS

/**
 * 글 만들기(주제 생성 + 현장 메모 초안) 하루 한도.
 *
 * ⚠️이건 원가가 아니라 **검색 노출 보호**가 목적이다 —
 *   하루에 글을 몰아 올리면 검색엔진이 '양산'으로 보고 홈페이지 평가를 깎는다.
 *   5편은 상한이지 권장량이 아니다(검색만 보면 하루 한두 편이 가장 좋다).
 */
export const POST_DRAFT_SCOPE = 'post-draft'
export const POST_DRAFT_DAILY_LIMIT = 5
