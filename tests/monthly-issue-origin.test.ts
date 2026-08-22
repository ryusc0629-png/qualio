import { describe, it, expect } from 'vitest'
import { buildMonthlySummary } from '@/lib/reports/monthly-summary'

// 거래처 월간 보고서의 '요청사항'과 '특이사항'이 섞여 있던 것을 고정한다.
//
// 예전 계산: 요청사항 = 모든 클레임. 그런데 정기 현장의 '금일 특이사항'도 claims에 쌓인다.
// 그래서 직원이 스스로 찾아 고친 것까지 '거래처가 요청한 것'으로 세어져,
// 성실히 적을수록 거래처 눈에는 "요청이 많은 달"로 보였다.
// 반대로 '특이사항' 지표는 preventive_note만 세는데 정기 현장엔 그 칸이 아예 없어
// 늘 0건으로 나갔다.
//
// 규칙: 요청사항·처리 = 거래처가 말한 것(사장님 접수)만 / 특이사항 = 현장이 찾은 것.

const 방문 = {
  id: 'b1',
  scheduled_at: '2026-08-10T01:00:00Z',
  status: 'completed',
  worker_id: null,
}

const 고객요청 = {
  id: 'c1',
  title: '화장실 냄새',
  content: null,
  status: 'open',
  resolution: null,
  created_at: '2026-08-11T01:00:00Z',
  resolved_at: null,
  createdByWorker: false, // 사장님이 접수 = 거래처가 말한 것
}

const 현장발견 = {
  id: 'c2',
  title: '탕비실 배수구 물 빠짐 느림',
  content: null,
  status: 'resolved',
  resolution: '뚫어서 정상으로 돌아왔어요',
  created_at: '2026-08-12T01:00:00Z',
  resolved_at: '2026-08-12T02:00:00Z',
  createdByWorker: true, // 현장이 스스로 발견
}

function summaryOf(issues: Parameters<typeof buildMonthlySummary>[0]['issues']) {
  return buildMonthlySummary({
    visits: [방문],
    reports: [],
    now: new Date('2026-08-31T00:00:00Z'),
    issues,
    requests: [],
  })
}

describe('요청사항과 특이사항 구분', () => {
  it('현장이 찾은 건은 요청사항으로 세지 않는다', () => {
    const s = summaryOf([고객요청, 현장발견])
    expect(s.issueCount).toBe(1)        // 거래처가 말한 것만
    expect(s.fieldIssues).toHaveLength(1) // 현장이 찾은 것은 따로
  })

  it('현장이 찾아 처리한 건이 요청 처리율을 부풀리지 않는다', () => {
    const s = summaryOf([고객요청, 현장발견])
    // 고객 요청 1건은 아직 미해결이므로 처리 0건이어야 한다.
    // 현장이 알아서 고친 걸 분자에 넣으면 "요청 1건 · 처리 1건"으로 보인다.
    expect(s.issueResolvedCount).toBe(0)
  })

  it('현장이 찾은 건만 있으면 요청사항은 0건이다', () => {
    const s = summaryOf([현장발견])
    expect(s.issueCount).toBe(0)
    expect(s.fieldIssues).toHaveLength(1)
  })

  it('처리 내용과 사진은 현장 건에도 그대로 실린다', () => {
    const s = summaryOf([{ ...현장발견, photo_urls: ['a.jpg'], resolution_photo_urls: ['b.jpg'] }])
    const it0 = s.fieldIssues[0]!
    expect(it0.resolution).toBe('뚫어서 정상으로 돌아왔어요')
    expect(it0.resolved).toBe(true)
    expect(it0.photos).toEqual(['a.jpg'])
    expect(it0.resolutionPhotos).toEqual(['b.jpg'])
  })

  it('미해결은 출처와 무관하게 다음 달로 넘긴다', () => {
    const s = summaryOf([고객요청, { ...현장발견, status: 'open', resolved_at: null }])
    expect(s.carriedOver).toHaveLength(2)
  })
})
