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
}

describe('GEO 질문 세트', () => {
  it('지역을 광역이 아니라 시군구까지 좁혀 묻는다', () => {
    const qs = buildGeoQuestions(다트클린)
    expect(qs.some((q) => q.includes('울주군'))).toBe(true)
    // 광역만 쓰는 질문은 벤치마크 1개로 제한
    const broadOnly = qs.filter((q) => classifyGeoQuestion(q, '다트클린') === 'broad')
    expect(broadOnly.length).toBeLessThanOrEqual(1)
  })

  it('설정한 지역만 묻는다 — 다른 지역은 절대 끼어들지 않는다', () => {
    // 예약 주소로 지역을 추론하던 때, 테스트로 넣은 예약 한 건 때문에
    // 울산 업체에 '경기 오산시' 질문이 만들어졌다. 진실은 설정 한 곳에만 둔다.
    const 울산업체 = {
      address: '울산광역시 울주군 삼남읍',
      serviceAreas: ['울산 중구', '울산 남구', '울산 동구'],
      serviceNames: ['사무실 정기청소'],
    }
    const weeks = ['2026-W30', '2026-W31', '2026-W32', '2026-W33', '2026-W34', '2026-W35']
    const 허용 = ['울산 울주군', '울산 중구', '울산 남구', '울산 동구', '울산']
    for (const w of weeks) {
      for (const q of buildGeoQuestions(울산업체, w)) {
        expect(허용.some((a) => q.includes(a))).toBe(true)
      }
    }
  })

  it('출장 지역은 사장님이 넣은 순서를 따른다', () => {
    const qs = buildGeoQuestions(
      {
        address: '울산광역시 울주군 삼남읍',
        serviceAreas: ['울산 중구', '울산 남구', '울산 동구'],
        serviceNames: ['사무실 정기청소'],
      },
      '2026-W34',
    )
    // 사업장 주소(울주군)가 고정 3개를 차지한다
    expect(qs.slice(0, 3).every((q) => q.includes('울산 울주군'))).toBe(true)
  })

  it('주가 바뀌면 다른 질문을 돌려 묻는다 (넓게 훑기)', () => {
    const a = buildGeoQuestions(다트클린, '2026-W33')
    const b = buildGeoQuestions(다트클린, '2026-W34')
    expect(a).not.toEqual(b)
    // 앞 3개는 추세가 끊기지 않도록 고정
    expect(a.slice(0, 3)).toEqual(b.slice(0, 3))
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

  it('질문 수 상한을 넘지 않는다 (호출 수 = 질문 × 엔진)', () => {
    const qs = buildGeoQuestions({
      businessName: '큰업체',
      address: '경기도 수원시',
      serviceAreas: Array.from({ length: 31 }, (_, i) => `경기 도시${i}시`),
      serviceNames: ['입주청소', '사무실청소', '에어컨청소', '준공청소'],
    })
    expect(qs.length).toBeLessThanOrEqual(30)
  })

  it('같은 주에는 같은 질문이 나온다 (추세 비교가 유효하도록)', () => {
    expect(buildGeoQuestions(다트클린, '2026-W34')).toEqual(buildGeoQuestions(다트클린, '2026-W34'))
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

  it('도 이름은 사람들이 쓰는 약칭으로 줄인다', () => {
    // 접미사만 떼면 "경상북도"가 "경상북"이 된다 — 실제로 그런 질문이 만들어졌다
    expect(toSearchArea('경상북도 경주시')).toBe('경북 경주시')
    expect(toSearchArea('충청남도 천안시 서북구')).toBe('충남 천안시')
    expect(toSearchArea('경상남도 김해시')).toBe('경남 김해시')
  })

  it('도 소속은 구가 아니라 시로 부른다', () => {
    // "경기 분당구"가 아니라 "경기 성남시"라고 검색한다
    expect(toSearchArea('경기 성남시 분당구 고기로 25')).toBe('경기 성남시')
    expect(toSearchArea('경기도 수원시 영통구')).toBe('경기 수원시')
    // 광역시는 그대로 구를 쓴다
    expect(toSearchArea('서울특별시 강서구 공항대로 525')).toBe('서울 강서구')
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
