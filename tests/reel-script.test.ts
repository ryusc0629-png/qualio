import { describe, it, expect } from 'vitest'
import { planSegments } from '@/lib/creatomate/client'
import { scriptDuration, type ReelLine } from '@/lib/ai/reel-script'

// 릴스는 '나레이션이 뼈대'다. 자막·음성·화면 길이가 어긋나면 말이 끊기거나
// 소리 없이 화면만 멈춰 있는 구간이 생긴다(예전 구조가 딱 그랬고, 거기서 시청자가 나갔다).
// 이 테스트는 세 가지가 항상 같은 시간축 위에 있도록 고정한다.

function line(text: string, seconds: number, emphasis = false): ReelLine {
  return { text, seconds, emphasis }
}

const 대본: ReelLine[] = [
  line('입주청소 끝났는데 하얀 가루가 떨어진다고요?', 3.5, true),
  line('그건 벽지 붙일 때 쓴 도배풀입니다.', 3.0),
  line('물로 닦아도 마르면 또 올라옵니다.', 3.0),
  line('오늘 현장에서도 창틀 아래가 그랬습니다.', 3.2),
  line('걸레에 탄산수를 적셔 닦아보세요.', 2.8),
  line('기포가 풀을 녹여 힘이 덜 듭니다.', 2.8),
  line('시간이 지나도 다시 올라오지 않습니다.', 3.0),
  line('도배풀은 이렇게 잡으세요.', 2.5, true),
]

describe('릴스 화면 배치', () => {
  it('화면 5개(앞사진·클립3·뒷사진)로 나눈다', () => {
    expect(planSegments(대본)).toHaveLength(5)
  })

  it('첫 문장은 작업 전 사진에, 마지막 문장은 작업 후 사진에 붙는다', () => {
    const segs = planSegments(대본)
    expect(segs[0].lines.map((l) => l.line.text)).toEqual([대본[0].text])
    expect(segs[4].lines.map((l) => l.line.text)).toEqual([대본[7].text])
  })

  it('말 순서가 섞이지 않는다 — 화면을 건너가도 대본 순서 그대로', () => {
    const flat = planSegments(대본).flatMap((s) => s.lines.map((l) => l.line.text))
    expect(flat).toEqual(대본.map((l) => l.text))
  })

  it('구간이 빈틈·겹침 없이 이어진다', () => {
    const segs = planSegments(대본)
    let cursor = 0
    for (const seg of segs) {
      expect(seg.start).toBeCloseTo(cursor, 5)
      cursor += seg.duration
    }
    // 화면 전체 길이 = 나레이션 전체 길이 (소리 없이 남는 화면이 없다)
    expect(cursor).toBeCloseTo(scriptDuration(대본), 5)
  })

  it('자막이 뜨는 시각은 그 화면 안에 들어간다 — 잘려 나가지 않는다', () => {
    for (const seg of planSegments(대본)) {
      for (const { line: l, start } of seg.lines) {
        expect(start).toBeGreaterThanOrEqual(seg.start - 1e-6)
        expect(start + l.seconds).toBeLessThanOrEqual(seg.start + seg.duration + 1e-6)
      }
    }
  })

  it('문장이 적어도 화면 5개를 유지하고 빈 화면에 최소 시간을 준다', () => {
    // 클립 3개에 문장 1개씩도 못 갈 만큼 짧은 대본
    const 짧은대본 = [line('가', 2.2, true), line('나', 2.2), line('다', 2.2, true)]
    const segs = planSegments(짧은대본)
    expect(segs).toHaveLength(5)
    for (const seg of segs) expect(seg.duration).toBeGreaterThan(0)
  })
})

describe('대본 길이', () => {
  it('총 길이가 숏폼에 맞는 30초 안팎이다', () => {
    const d = scriptDuration(대본)
    expect(d).toBeGreaterThan(20)
    expect(d).toBeLessThan(45)
  })
})
