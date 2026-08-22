import { describe, it, expect } from 'vitest'
import { computeVisitStatus, summarizeLockup } from '@/lib/lockup/today'

// '오늘 현장' 상태 판정 — 2026-08-22에 실제로 틀렸던 규칙이라 테스트로 고정한다.
//
// 무슨 일이 있었나: 문단속을 안 켠 현장은 도착·마감 사진을 아예 안 올린다
// (checkin_at·checkout_at은 그 사진을 올릴 때만 찍힌다). 그런데 판정은 그 두 값만 보고 있어서,
// 작업 항목만 쓰는 현장이 종일 '미도착'으로 떴다. 화면이 거짓말을 한 것이다.
// ⛔이 테스트를 지우거나 완화하지 말 것.

const ITEMS = [
  { id: 'a', label: '화장실 바닥' },
  { id: 'b', label: '유리창' },
]

// 방문 한 건 만들기 — 안 넘긴 값은 전부 비어 있는 상태로 둔다
function visit(over: Partial<Parameters<typeof computeVisitStatus>[0]> = {}) {
  return {
    id: 'bk-1',
    customer_name: '테스트',
    service_address: '울산 어딘가',
    scheduled_at: '2026-08-22T01:00:00.000Z',
    worker_id: null,
    contract_id: 'c-1',
    checkin_at: null,
    checkout_at: null,
    open_photo_urls: null,
    lockup_photo_urls: null,
    checkin_lat: null,
    checkin_lng: null,
    site_lat: null,
    site_lng: null,
    checklist_photos: null,
    ...over,
  } as Parameters<typeof computeVisitStatus>[0]
}

const duration = new Map([['c-1', 60]])
const NOW = new Date('2026-08-22T05:00:00.000Z').getTime()

describe('문단속을 켠 현장 — 도착·마감 사진으로 판정', () => {
  const opts = { lockupById: new Map([['c-1', true]]), checklistByContract: new Map([['c-1', ITEMS]]) }

  it('마감했으면 done', () => {
    expect(computeVisitStatus(visit({ checkout_at: '2026-08-22T04:00:00.000Z' }), duration, NOW, opts)).toBe('done')
  })

  it('아직 도착 안 했으면 not_arrived', () => {
    expect(computeVisitStatus(visit(), duration, NOW, opts)).toBe('not_arrived')
  })

  it('도착했고 예상 시간 안이면 working', () => {
    const justArrived = new Date(NOW - 10 * 60 * 1000).toISOString()
    expect(computeVisitStatus(visit({ checkin_at: justArrived }), duration, NOW, opts)).toBe('working')
  })

  it('예상 시간을 한참 넘겼으면 overdue', () => {
    const longAgo = new Date(NOW - 5 * 60 * 60 * 1000).toISOString()
    expect(computeVisitStatus(visit({ checkin_at: longAgo }), duration, NOW, opts)).toBe('overdue')
  })
})

describe('문단속을 안 켠 현장 — 작업 항목 진행으로 판정', () => {
  const opts = { lockupById: new Map([['c-1', false]]), checklistByContract: new Map([['c-1', ITEMS]]) }

  it('★도착 사진이 없어도 항목을 다 채웠으면 done (예전엔 종일 미도착이었다)', () => {
    const v = visit({ checklist_photos: { a: ['u1'], b: ['u2'] } })
    expect(computeVisitStatus(v, duration, NOW, opts)).toBe('done')
  })

  it('일부만 채웠으면 working', () => {
    const v = visit({ checklist_photos: { a: ['u1'] } })
    expect(computeVisitStatus(v, duration, NOW, opts)).toBe('working')
  })

  it('아무것도 안 올렸으면 not_arrived', () => {
    expect(computeVisitStatus(visit(), duration, NOW, opts)).toBe('not_arrived')
  })

  it('★마감 기한이 없으므로 아무리 오래돼도 overdue가 되면 안 된다', () => {
    const longAgo = new Date(NOW - 12 * 60 * 60 * 1000).toISOString()
    const v = visit({ checkin_at: longAgo, checklist_photos: { a: ['u1'] } })
    expect(computeVisitStatus(v, duration, NOW, opts)).not.toBe('overdue')
  })
})

describe('홈 요약도 같은 규칙을 따른다', () => {
  it('문단속 안 켠 현장이 미마감으로 잡히면 안 된다', () => {
    const opts = { lockupById: new Map([['c-1', false]]), checklistByContract: new Map([['c-1', ITEMS]]) }
    const longAgo = new Date(NOW - 12 * 60 * 60 * 1000).toISOString()
    const s = summarizeLockup([visit({ checkin_at: longAgo })], duration, NOW, opts)
    expect(s.overdue).toBe(0)
    expect(s.total).toBe(1)
  })
})
