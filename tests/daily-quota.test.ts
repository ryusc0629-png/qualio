import { describe, it, expect } from 'vitest'
import { QUOTAS, quotaLimit, POST_DRAFT_DAILY_LIMIT, type QuotaKey } from '@/lib/ratelimit/quotas'
import { PLANS, type PlanId } from '@/lib/config/plans'

// 한도의 목적은 '아껴 쓰게 만드는 것'이 아니라 '한 곳이 폭주해도 마진이 안 무너지게' 하는 것이다.
// 평범하게 쓰면 절대 못 닿는 높이여야 하고, 사장님이 한도를 만나면 그건 우리 실패다.
//
// 숫자를 바꾸고 싶어질 때 이 테스트가 근거를 상기시킨다.

/** 기능별 1회 원가(원) — 2026-08 실측 */
const 원가: Record<QuotaKey, number> = {
  meeting: 674,   // 1시간 녹음 받아쓰기 + 정리 (가장 비싸다)
  report: 57,
  document: 28,
  claim: 30,
  setup: 19,
}

const 유료플랜: PlanId[] = ['starter', 'pro', 'scale']
const 기능들 = Object.keys(원가) as QuotaKey[]

/** 이 요금제에서 모든 한도를 끝까지 쓸 때의 월 최대 지출(원) */
function 월최대지출(plan: PlanId): number {
  let sum = 0
  for (const key of 기능들) {
    const limit = quotaLimit(key, plan)
    const 월횟수 = QUOTAS[key].period === 'month' ? limit : limit * 30
    sum += 월횟수 * 원가[key]
  }
  return sum
}

describe('요금제별 한도', () => {
  it('모든 기능에 모든 요금제의 한도가 있다', () => {
    for (const key of 기능들) {
      for (const plan of Object.keys(PLANS) as PlanId[]) {
        expect(quotaLimit(key, plan), `${key}/${plan} 한도 없음`).toBeGreaterThan(0)
      }
    }
  })

  it('요금이 비쌀수록 한도가 크거나 같다', () => {
    for (const key of 기능들) {
      expect(quotaLimit(key, 'starter')).toBeLessThanOrEqual(quotaLimit(key, 'pro'))
      expect(quotaLimit(key, 'pro')).toBeLessThanOrEqual(quotaLimit(key, 'scale'))
    }
  })

  it('베타는 확장과 같은 대우를 받는다', () => {
    // 플랜 설계 원칙 — 베타는 최상위 한도로 만족도를 끌어올려 유료 전환을 노린다
    for (const key of 기능들) {
      expect(quotaLimit(key, 'beta')).toBe(quotaLimit(key, 'scale'))
    }
  })
})

describe('마진 보호', () => {
  it('한도를 끝까지 써도 월 원가가 요금의 절반을 넘지 않는다', () => {
    // 매일 모든 버튼을 한도까지 누르는 건 현실에서 거의 불가능하다.
    // 그래도 그 최악에서조차 적자가 나면 안 된다.
    for (const plan of 유료플랜) {
      const 지출 = 월최대지출(plan)
      const 요금 = PLANS[plan].price
      expect(지출, `${plan}: 최악 ${지출}원 / 요금 ${요금}원`).toBeLessThan(요금 * 0.5)
    }
  })

  it('비싼 요금제일수록 원가 비중이 낮다 — 상위 플랜이 이익을 끌고 간다', () => {
    const 비중 = (p: PlanId) => 월최대지출(p) / PLANS[p].price
    expect(비중('scale')).toBeLessThan(비중('starter'))
  })
})

describe('정상 사용은 한도에 안 닿는다', () => {
  it('혼자 뛰는 사장님(시작)의 하루가 한도 안에 넉넉히 들어간다', () => {
    // 현장 3곳 → 보고서 3건, 문서 1건, 클레임 0~1건. 다시 만들기까지 2배로 잡는다.
    // ⚠️3배까지는 못 준다 — 49,000원 요금으로는 원가가 안 맞는다(테스트가 아래에서 막는다)
    expect(quotaLimit('report', 'starter')).toBeGreaterThanOrEqual(3 * 2)
    expect(quotaLimit('document', 'starter')).toBeGreaterThanOrEqual(1 * 2)
    expect(quotaLimit('claim', 'starter')).toBeGreaterThanOrEqual(1 * 2)
  })

  it('현장 10곳 도는 업체(성장)의 하루가 한도 안에 들어간다', () => {
    expect(quotaLimit('report', 'pro')).toBeGreaterThanOrEqual(10 * 2)
    expect(quotaLimit('document', 'pro')).toBeGreaterThanOrEqual(3 * 2)
  })

  it('미팅은 몰아 잡히므로 달 단위로 센다', () => {
    // 어떤 주에 5건, 다음 주에 0건이 정상이다. 하루로 끊으면 정상 사용을 막는다.
    expect(QUOTAS.meeting.period).toBe('month')
    expect(quotaLimit('meeting', 'starter')).toBeGreaterThanOrEqual(4) // 주 1회는 된다
  })

  it('현장 수에 비례하는 기능은 날 단위로 센다', () => {
    for (const key of ['report', 'document', 'claim', 'setup'] as QuotaKey[]) {
      expect(QUOTAS[key].period).toBe('day')
    }
  })
})

describe('글 만들기 한도는 성격이 다르다', () => {
  it('요금제와 무관하게 하루 5편 — 검색 노출 보호가 목적이다', () => {
    // 원가가 아니라 '몰아 올리면 검색 평가가 깎인다'는 이유로 걸린 한도라
    // 상위 플랜에 더 준다고 좋을 게 없다
    expect(POST_DRAFT_DAILY_LIMIT).toBe(5)
  })
})
