import { describe, it, expect } from 'vitest'
import { extractBusinessNames } from '@/lib/geo/extract-names'

// 리더보드에 엉뚱한 말이 업체 이름으로 올라가면 화면 전체의 신뢰가 깎인다.
// 확실한 것만 건지고 애매하면 버린다 — 이 테스트가 그 기준이다.

describe('AI 답변에서 업체 이름 뽑기', () => {
  it('굵은 글씨로 강조된 상호를 잡는다', () => {
    const answer = '울산에서는 **에코크린기업**과 **청소플러스**가 자주 언급됩니다.'
    expect(extractBusinessNames(answer)).toEqual(['에코크린기업', '청소플러스'])
  })

  it('번호 목록의 상호를 잡는다', () => {
    const answer = [
      '1. 현대그린청소용역 - 옥동에 위치한 청소 용역 업체입니다',
      '2. 파워크린 - 삼산동 소재',
      '3. 다케어 - 남구 정동로',
    ].join('\n')
    expect(extractBusinessNames(answer)).toContain('현대그린청소용역')
    expect(extractBusinessNames(answer)).toContain('파워크린')
  })

  it('같은 이름이 여러 번 나와도 한 번만 센다', () => {
    const answer = '**에코크린기업**은 좋습니다. 다시 말해 **에코크린기업**을 추천합니다.'
    expect(extractBusinessNames(answer)).toEqual(['에코크린기업'])
  })

  it('업체명이 아닌 문장은 버린다', () => {
    const answer = [
      '- 비용은 평수에 따라 다릅니다',
      '- 견적을 먼저 받아보시는 것을 추천합니다',
      '- 네이버 블로그에서 후기를 확인하세요',
    ].join('\n')
    expect(extractBusinessNames(answer)).toEqual([])
  })

  it('청소업 상호로 보이지 않으면 넣지 않는다', () => {
    expect(extractBusinessNames('**삼성전자**와 **현대자동차**')).toEqual([])
  })

  it('조사가 붙어 나와도 상호만 남긴다', () => {
    expect(extractBusinessNames('**에코크린기업은** 반구동에 있습니다')).toEqual(['에코크린기업'])
  })

  it('너무 길거나 문장 같은 건 버린다', () => {
    const answer = '**울산 지역에서 사무실 청소를 잘하는 업체를 찾으신다면**'
    expect(extractBusinessNames(answer)).toEqual([])
  })

  it('빈 답변이면 빈 배열', () => {
    expect(extractBusinessNames('')).toEqual([])
  })

  it('체크리스트 항목을 상호로 착각하지 않는다', () => {
    // "업체 고를 때 확인할 것"에 AI가 나열하는 말들 — 리더보드 2위에 "청소 범위"가 올라간 적이 있다
    expect(extractBusinessNames('**청소 범위**를 확인하세요')).toEqual([])
    expect(extractBusinessNames('- 청소 범위와 주기\n- 환경 친화성\n- 서비스 만족도')).toEqual([])
    expect(extractBusinessNames('**청소 인력**과 **장비 수준**')).toEqual([])
  })

  it('굵은 글씨 뒤에 조사가 붙어도 상호만 남긴다', () => {
    // '**'의 첫 별표를 불릿으로 오인해 "*다트클린**은 울주군"을 통째로 집던 문제
    expect(extractBusinessNames('**다트클린**은 울주군에 있습니다')).toEqual(['다트클린'])
  })
})
