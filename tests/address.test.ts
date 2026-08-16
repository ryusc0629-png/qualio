import { describe, it, expect } from 'vitest'
import { splitAddress, joinAddress, mergeAddressDetail } from '@/lib/address/format'

describe('주소 한 줄 형식', () => {
  it('기본 주소와 상세 주소를 나누고 합친다', () => {
    expect(splitAddress('울산 북구 중산서로 26 — 3층')).toEqual({ base: '울산 북구 중산서로 26', detail: '3층' })
    expect(splitAddress('울산 북구 중산서로 26')).toEqual({ base: '울산 북구 중산서로 26', detail: '' })
    expect(joinAddress('울산 북구 중산서로 26', '3층')).toBe('울산 북구 중산서로 26 — 3층')
    expect(joinAddress('울산 북구 중산서로 26', '  ')).toBe('울산 북구 중산서로 26')
  })
})

describe('견적서 현장 주소 → 거래처 주소 보강', () => {
  it('같은 건물이면 층·호수를 이어받는다', () => {
    // 실제 사례: 거래처엔 층이 없고 견적서에만 "3층"이 있어 고객 전환 때 다시 입력해야 했다
    expect(mergeAddressDetail('울산 북구 중산서로 26', '울산 북구 중산서로 26 — 3층')).toBe(
      '울산 북구 중산서로 26 — 3층',
    )
  })

  it('주소가 비어 있으면 현장 주소를 그대로 채운다', () => {
    expect(mergeAddressDetail(null, '울산 북구 중산서로 26 — 3층')).toBe('울산 북구 중산서로 26 — 3층')
    expect(mergeAddressDetail('', '울산 북구 중산서로 26')).toBe('울산 북구 중산서로 26')
  })

  it('본사와 현장이 다른 주소면 건드리지 않는다', () => {
    expect(mergeAddressDetail('울산 남구 삼산로 123', '울산 북구 중산서로 26 — 3층')).toBeNull()
  })

  it('이미 상세가 적혀 있으면 덮어쓰지 않는다', () => {
    expect(mergeAddressDetail('울산 북구 중산서로 26 — 2층', '울산 북구 중산서로 26 — 3층')).toBeNull()
  })

  it('이어받을 상세가 없으면 아무것도 하지 않는다', () => {
    expect(mergeAddressDetail('울산 북구 중산서로 26', '울산 북구 중산서로 26')).toBeNull()
    expect(mergeAddressDetail('울산 북구 중산서로 26', '')).toBeNull()
  })
})
