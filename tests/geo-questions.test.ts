import { describe, it, expect } from 'vitest'
import { buildGeoQuestions, classifyGeoQuestion, toSearchArea } from '@/lib/geo/questions'

// GEO 측정은 '이길 수 있는 판'을 물어야 의미가 있다.
// 광역시 단위 "추천" 질문만 던지면 AI는 플랫폼·비교글을 인용하므로 동네 업체는 영원히 0%다.
// 이 테스트는 그때로 되돌아가지 않도록 규칙을 고정한다.

const 다트클린 = {
  businessName: '다트클린',
  address: '울산광역시 울주군 삼남읍 도호 1길 39-11 202동 3103호',
  serviceAreas: ['울산 중구', '울산 남구', '울산 동구', '부산 사하구'],
  serviceNames: ['입주청소 (평당)', '준공청소'],
  activeAreas: ['울산 남구'],
}

describe('GEO 질문 세트', () => {
  it('지역을 광역이 아니라 시군구까지 좁혀 묻는다', () => {
    const qs = buildGeoQuestions(다트클린)
    expect(qs.some((q) => q.includes('울주군'))).toBe(true)
    // 광역만 쓰는 질문은 벤치마크 1개로 제한
    const broadOnly = qs.filter((q) => classifyGeoQuestion(q, '다트클린') === 'broad')
    expect(broadOnly.length).toBeLessThanOrEqual(1)
  })

  it('실제로 일한 지역을 출장 지역보다 먼저 공략한다', () => {
    const qs = buildGeoQuestions(다트클린)
    const 남구 = qs.findIndex((q) => q.includes('울산 남구'))
    const 동구 = qs.findIndex((q) => q.includes('울산 동구'))
    expect(남구).toBeGreaterThan(-1)
    expect(남구).toBeLessThan(동구)
  })

  it('가격형 질문을 포함한다 (숫자로 답하는 페이지가 인용되므로)', () => {
    const qs = buildGeoQuestions(다트클린)
    expect(qs.some((q) => /비용|가격/.test(q))).toBe(true)
  })

  it('브랜드 질문은 넣지 않는다 (손님은 우리 이름을 모르는 채로 찾는다)', () => {
    const qs = buildGeoQuestions(다트클린)
    expect(qs.some((q) => q.includes('다트클린'))).toBe(false)
  })

  it('검색어가 아니라 사람이 말하듯 묻는 문장이다', () => {
    const qs = buildGeoQuestions(다트클린)
    // 조건이나 요청이 붙은 문장 — 짧은 키워드는 지도가 답하고 문장은 글이 답한다
    expect(qs.every((q) => /[.?]/.test(q))).toBe(true)
    expect(qs.every((q) => q.length >= 20)).toBe(true)
  })

  it('질문 수 상한을 넘지 않는다 (검색 API 비용 가드)', () => {
    const qs = buildGeoQuestions({
      businessName: '큰업체',
      address: '경기도 수원시',
      serviceAreas: Array.from({ length: 31 }, (_, i) => `경기 도시${i}시`),
      serviceNames: ['입주청소', '사무실청소', '에어컨청소', '준공청소'],
      activeAreas: [],
    })
    expect(qs.length).toBeLessThanOrEqual(12)
  })

  it('같은 입력이면 같은 질문이 나온다 (추세 비교가 유효하도록)', () => {
    expect(buildGeoQuestions(다트클린)).toEqual(buildGeoQuestions(다트클린))
  })

  it('서비스를 아직 안 넣은 업체도 지역만 있으면 측정한다', () => {
    // 설정을 덜 채운 업체도 첫 결과를 봐야 다음 행동(지역·서비스 채우기)으로 이어진다
    const qs = buildGeoQuestions({ serviceNames: [], address: '울산광역시 남구' })
    expect(qs.length).toBeGreaterThan(0)
    // 대부분은 시군구 질문이고, 광역 벤치마크 1개만 예외로 섞인다
    expect(qs.filter((q) => q.includes('울산 남구')).length).toBeGreaterThanOrEqual(qs.length - 1)
  })

  it('지역이 없으면 측정하지 않는다 (지역 질문을 지어낼 수는 없다)', () => {
    expect(buildGeoQuestions({ businessName: '다트클린', serviceNames: [], address: null })).toEqual([])
    expect(buildGeoQuestions({ serviceNames: [], address: null })).toEqual([])
  })
})

describe('주소 → 검색용 지역명', () => {
  it('상세 주소를 시군구까지만 접는다', () => {
    expect(toSearchArea('울산광역시 울주군 삼남읍 도호1길 39-11')).toBe('울산 울주군')
    expect(toSearchArea('서울특별시 강서구 공항대로 525')).toBe('서울 강서구')
  })

  it('이미 짧은 형태는 그대로 쓴다', () => {
    expect(toSearchArea('울산 남구')).toBe('울산 남구')
  })
})

describe('질문 성격 분류', () => {
  it('업체명이 들어가면 브랜드', () => {
    expect(classifyGeoQuestion('다트클린 후기', '다트클린')).toBe('brand')
  })
  it('비용·가격이 들어가면 가격형', () => {
    expect(classifyGeoQuestion('울산 남구에서 입주청소 맡기면 비용이 얼마나 드나요?', '다트클린')).toBe('price')
  })
  it('문장 안에 시군구가 있으면 로컬, 광역뿐이면 광역', () => {
    expect(classifyGeoQuestion('울산 남구에 입주청소 맡길 업체 추천해주세요.', '다트클린')).toBe('local')
    expect(classifyGeoQuestion('울산에서 입주청소 잘하는 업체 추천해주세요.', '다트클린')).toBe('broad')
  })
})
