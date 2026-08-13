import { describe, it, expect } from 'vitest'
import { inputToUtcIso } from '@/lib/format/datetime'

// 이 테스트는 서버 타임존을 UTC로 고정해 돌린다(vitest.config.ts).
// 로컬(KST)에서는 통과하는데 Vercel(UTC)에서 9시간 밀리던 사고를 여기서 잡는다.

describe('예약 시각 저장 (입력 → UTC)', () => {
  it('오전 8시로 고른 값은 KST 8시로 저장된다 (UTC 전날 23시)', () => {
    expect(inputToUtcIso('2026-08-01T08:00')).toBe('2026-07-31T23:00:00.000Z')
  })

  it('자정에 가까운 시각도 하루 밀리지 않는다', () => {
    expect(inputToUtcIso('2026-08-01T00:30')).toBe('2026-07-31T15:30:00.000Z')
    expect(inputToUtcIso('2026-08-01T23:30')).toBe('2026-08-01T14:30:00.000Z')
  })

  it('월말·연말 경계에서도 날짜가 어긋나지 않는다', () => {
    expect(inputToUtcIso('2026-12-31T09:00')).toBe('2026-12-31T00:00:00.000Z')
    expect(inputToUtcIso('2027-01-01T08:00')).toBe('2026-12-31T23:00:00.000Z')
  })

  it('초까지 들어와도 같은 규칙을 따른다', () => {
    expect(inputToUtcIso('2026-08-01T08:00:00')).toBe('2026-07-31T23:00:00.000Z')
  })

  it('이미 타임존이 붙은 값은 그대로 해석한다 (드래그 이동 등 재전송)', () => {
    expect(inputToUtcIso('2026-08-01T08:00:00Z')).toBe('2026-08-01T08:00:00.000Z')
    expect(inputToUtcIso('2026-08-01T08:00:00+09:00')).toBe('2026-07-31T23:00:00.000Z')
  })

  it('저장한 값을 KST로 다시 읽으면 고른 시각 그대로다', () => {
    const saved = inputToUtcIso('2026-08-01T08:00')
    const shown = new Date(saved).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    expect(shown).toContain('08:00')
  })
})
