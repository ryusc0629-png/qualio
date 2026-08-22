import { describe, it, expect } from 'vitest'
import {
  looksLikePersonName,
  customerFacingWorkerName,
  customerFacingWorkerNames,
} from '@/lib/workers/customer-facing-name'

// 2026-08-22 실제 사고를 그대로 재현한다.
// 도급팀 상호가 고객 알림톡에 실려 나갔다 — 다시는 통과하면 안 되는 입력.
describe('도급사 상호가 고객에게 나가지 않는다', () => {
  it('상호 + 사람 이름 + 직함이 붙은 이름은 업체명으로 대체한다', () => {
    expect(customerFacingWorkerName('리멤버클린 김성현 팀장님', '다트클린')).toBe('다트클린 담당자')
  })

  it('상호만 등록된 도급팀도 대체한다', () => {
    expect(customerFacingWorkerName('베이스케어', '다트클린')).toBe('다트클린 담당자')
    expect(customerFacingWorkerName('한빛청소', '다트클린')).toBe('다트클린 담당자')
    expect(customerFacingWorkerName('OK클린서비스', '다트클린')).toBe('다트클린 담당자')
  })

  it('사람 이름은 그대로 쓰고 님을 한 번만 붙인다', () => {
    expect(customerFacingWorkerName('박기호', '아찌클린')).toBe('박기호님')
    expect(customerFacingWorkerName('김성현 팀장', '다트클린')).toBe('김성현 팀장님')
    expect(customerFacingWorkerName('김성현 팀장님', '다트클린')).toBe('김성현 팀장님')
  })

  it('이름이 비어 있어도 빈 값을 내보내지 않는다 (알림톡이 거부한다)', () => {
    expect(customerFacingWorkerName(null, '다트클린')).toBe('다트클린 담당자')
    expect(customerFacingWorkerName('   ', '다트클린')).toBe('다트클린 담당자')
    expect(customerFacingWorkerName(null, '')).toBe('담당자')
  })

  it('사람을 가리키지 않는 말은 내보내지 않는다', () => {
    expect(customerFacingWorkerName('알바생', '클린청소')).toBe('클린청소 담당자')
    expect(customerFacingWorkerName('미배정', '클린청소')).toBe('클린청소 담당자')
  })

  it('연락처·메모가 섞여 들어와도 막는다', () => {
    expect(customerFacingWorkerName('김성현 010-1234-5678', '다트클린')).toBe('다트클린 담당자')
    expect(customerFacingWorkerName('Remember Clean', '다트클린')).toBe('다트클린 담당자')
  })
})

describe('looksLikePersonName', () => {
  it('사람 이름으로 보이는 것만 통과', () => {
    expect(looksLikePersonName('류승찬')).toBe(true)
    expect(looksLikePersonName('다니엘')).toBe(true)
    expect(looksLikePersonName('한두희 반장')).toBe(true)
  })

  it('상호·군더더기는 막는다', () => {
    expect(looksLikePersonName('리멤버클린 김성현 팀장님')).toBe(false)
    expect(looksLikePersonName('베이스케어')).toBe(false)
    expect(looksLikePersonName('김성현 리멤버')).toBe(false)  // 직함이 아닌 두 번째 덩어리
    expect(looksLikePersonName('박')).toBe(false)
  })
})

describe('customerFacingWorkerNames (문서용 목록)', () => {
  it('통과한 이름만 남기고 중복을 지운다', () => {
    expect(customerFacingWorkerNames(['박기호', '리멤버클린 김성현 팀장님', '박기호님']))
      .toEqual(['박기호님'])
  })

  it('전부 걸러지면 빈 배열 — 그 줄은 그리지 않는다', () => {
    expect(customerFacingWorkerNames(['리멤버클린 김성현 팀장님', '베이스케어'])).toEqual([])
  })
})
