import { describe, it, expect } from 'vitest'
import { extractPersonName, customerFacingWorkerName } from '@/lib/workers/customer-facing-name'

// 2026-08-22 실제 사고를 그대로 재현한다.
// 도급팀 상호가 고객 알림톡에 실려 나갔다 — 다시는 상호가 통과하면 안 되는 입력.
describe('도급사 상호는 고객에게 나가지 않는다', () => {
  it('상호를 떼고 사람 이름만 내보낸다', () => {
    expect(customerFacingWorkerName('리멤버클린 김성현 팀장님', '다트클린', { isContractor: true }))
      .toBe('김성현 팀장님')
  })

  it('도급사에 직함이 안 적혀 있으면 팀장으로 채운다', () => {
    expect(customerFacingWorkerName('리멤버클린 김성현', '다트클린', { isContractor: true }))
      .toBe('김성현 팀장님')
    expect(customerFacingWorkerName('박기호', '아찌클린', { isContractor: true }))
      .toBe('박기호 팀장님')
  })

  it('적어둔 직함이 있으면 그대로 존중한다', () => {
    expect(customerFacingWorkerName('한빛클린 정소영 실장', '다트클린', { isContractor: true }))
      .toBe('정소영 실장님')
  })

  // 이름만 덜렁 부르면 현장에서 일하는 사람이 가장 낮게 불린다(사장님 지적 8-22)
  it('직원은 직함이 없으면 매니저로 채운다', () => {
    expect(customerFacingWorkerName('류승찬', '다트클린')).toBe('류승찬 매니저님')
  })

  it('적어둔 직함은 직원에게도 그대로 존중한다', () => {
    expect(customerFacingWorkerName('김준휘 반장', '거북클린케어')).toBe('김준휘 반장님')
    expect(customerFacingWorkerName('류승찬 실장', '다트클린')).toBe('류승찬 실장님')
  })

  it('사람 이름이 없으면 업체명으로 대체한다 — 추측해서 내보내지 않는다', () => {
    expect(customerFacingWorkerName('베이스케어', '다트클린', { isContractor: true }))
      .toBe('다트클린 담당자')
    expect(customerFacingWorkerName('OK클린서비스', '다트클린', { isContractor: true }))
      .toBe('다트클린 담당자')
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

  it('연락처·메모가 섞여 들어오면 막는다', () => {
    expect(customerFacingWorkerName('김성현 010-1234-5678', '다트클린')).toBe('다트클린 담당자')
    expect(customerFacingWorkerName('Remember Clean', '다트클린')).toBe('다트클린 담당자')
  })

  it("'님'을 두 번 붙이지 않는다", () => {
    expect(customerFacingWorkerName('박기호님', '아찌클린')).toBe('박기호 매니저님')
    expect(customerFacingWorkerName('김성현 팀장님', '다트클린')).toBe('김성현 팀장님')
  })
})

describe('extractPersonName', () => {
  it('상호가 앞에 붙어 있어도 사람 이름을 찾는다', () => {
    expect(extractPersonName('리멤버클린 김성현 팀장님')).toBe('김성현')
    expect(extractPersonName('미소 김성현 팀장')).toBe('김성현')
    expect(extractPersonName('박기호')).toBe('박기호')
    expect(extractPersonName('다니엘')).toBe('다니엘')
  })

  it('사람 이름이 없으면 null', () => {
    expect(extractPersonName('베이스케어')).toBeNull()
    expect(extractPersonName('김성현 리멤버클린')).toBeNull()  // 상호가 뒤에 오면 포기한다
    expect(extractPersonName('박')).toBeNull()
    expect(extractPersonName('')).toBeNull()
  })
})
