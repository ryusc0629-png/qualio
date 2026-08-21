import { describe, it, expect } from 'vitest'
import { planVisuals } from '@/lib/creatomate/client'
import { toCaptions, scriptDuration, type ReelLine } from '@/lib/ai/reel-script'

// 릴스에서 시간을 정하는 건 오직 나레이션이다.
// 자막은 문장을 1~2초 조각으로 쪼개 계속 넘어가고, 영상은 뒤에 깔리는 배경일 뿐이라
// 자막이 무슨 말을 하는지와 맞출 필요가 없다.
// (예전엔 자막 길이에 맞춰 클립을 늘렸다 줄였다 해서 짧은 클립이 계속 되감겼다)

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

const 총길이 = scriptDuration(대본)

describe('자막 조각내기', () => {
  const caps = toCaptions(대본)

  it('한 조각이 1~2초쯤만 머문다 — 못 읽을 만큼 스쳐 지나가지 않는다', () => {
    // 조각 수만 정하고 글자 수 비례로 나누면 짧은 조각이 0.2초처럼 나온다.
    // 그건 화면에 떴다 사라지는 것이지 자막이 아니다.
    for (const c of caps) {
      expect(c.seconds, `"${c.text}"가 너무 빨리 지나감`).toBeGreaterThanOrEqual(0.6)
      expect(c.seconds, `"${c.text}"가 너무 오래 머묾`).toBeLessThanOrEqual(2.2)
    }
  })

  it('문장 수보다 조각이 많다 — 통째로 띄우지 않는다', () => {
    expect(caps.length).toBeGreaterThan(대본.length)
  })

  it('조각을 이어 붙이면 원래 문장이 그대로 나온다', () => {
    // 글자가 빠지거나 순서가 바뀌면 말이 안 된다
    const joined = caps.map((c) => c.text).join(' ')
    expect(joined).toBe(대본.map((l) => l.text).join(' '))
  })

  it('빈틈·겹침 없이 이어지고, 전체 길이가 나레이션과 같다', () => {
    let cursor = 0
    for (const c of caps) {
      expect(c.start).toBeCloseTo(cursor, 1)
      cursor += c.seconds
    }
    expect(cursor).toBeCloseTo(총길이, 1)
  })

  it('한 문장에서 쪼개진 조각들은 그 문장의 음성 길이를 정확히 나눠 갖는다', () => {
    // 여기가 어긋나면 뒤 문장부터 목소리와 자막이 밀린다
    let ci = 0
    let lineStart = 0
    for (const l of 대본) {
      let sum = 0
      const start = caps[ci].start
      while (ci < caps.length && caps[ci].start < lineStart + l.seconds - 1e-6) {
        sum += caps[ci].seconds
        ci++
      }
      expect(start).toBeCloseTo(lineStart, 1)
      expect(sum).toBeCloseTo(l.seconds, 1)
      lineStart += l.seconds
    }
  })

  it('강조 문장은 조각도 전부 강조로 남는다', () => {
    expect(caps[0].emphasis).toBe(true)
    expect(caps[caps.length - 1].emphasis).toBe(true)
    expect(caps.some((c) => !c.emphasis)).toBe(true)
  })

  it('아주 짧은 문장은 억지로 쪼개지 않는다', () => {
    const one = toCaptions([line('네', 1.0, false)])
    expect(one).toHaveLength(1)
    expect(one[0].text).toBe('네')
  })
})

describe('배경 화면 깔기', () => {
  it('앞사진으로 시작해 뒷사진으로 끝난다', () => {
    const v = planVisuals(총길이, 'before.jpg', [{ url: 'a.mp4', duration: 8 }], 'after.jpg')
    expect(v[0].source).toBe('before.jpg')
    expect(v[v.length - 1].source).toBe('after.jpg')
  })

  it('나레이션 전체를 빈틈없이 덮는다', () => {
    const v = planVisuals(
      총길이,
      'before.jpg',
      [{ url: 'a.mp4', duration: 5 }, { url: 'b.mp4', duration: 4 }],
      'after.jpg',
    )
    let cursor = 0
    for (const item of v) {
      expect(item.start).toBeCloseTo(cursor, 1)
      cursor += item.duration
    }
    expect(cursor).toBeCloseTo(총길이, 1)
  })

  it('클립이 짧으면 처음부터 다시 돈다 — 한 클립을 늘려 되감지 않는다', () => {
    const v = planVisuals(총길이, 'b.jpg', [{ url: 'a.mp4', duration: 3 }], 'a.jpg')
    const videos = v.filter((x) => x.kind === 'video')
    expect(videos.length).toBeGreaterThan(1)
    // 마지막 한 바퀴만 잘리고 나머지는 원래 길이 그대로
    for (const item of videos.slice(0, -1)) expect(item.duration).toBeCloseTo(3, 1)
  })

  it('영상이 하나도 없어도 사진 두 장으로 만들어진다', () => {
    const v = planVisuals(총길이, 'b.jpg', [], 'a.jpg')
    expect(v.every((x) => x.kind === 'image')).toBe(true)
    const covered = v.reduce((s, x) => s + x.duration, 0)
    expect(covered).toBeCloseTo(총길이, 1)
  })

  it('클립이 길면 남는 시간만큼만 잘라 쓴다', () => {
    const v = planVisuals(총길이, 'b.jpg', [{ url: 'a.mp4', duration: 60 }], 'a.jpg')
    const videos = v.filter((x) => x.kind === 'video')
    expect(videos).toHaveLength(1)
    expect(videos[0].duration).toBeLessThan(60)
  })

  it('길이가 0으로 들어온 클립은 건너뛴다 (예전 보고서)', () => {
    const v = planVisuals(
      총길이,
      'b.jpg',
      [{ url: 'x.mp4', duration: 0 }, { url: 'y.mp4', duration: 6 }],
      'a.jpg',
    )
    expect(v.some((x) => x.source === 'x.mp4')).toBe(false)
    expect(v.some((x) => x.source === 'y.mp4')).toBe(true)
  })

  it('클립이 아주 짧아도 무한히 돌지 않는다', () => {
    const v = planVisuals(총길이, 'b.jpg', [{ url: 'a.mp4', duration: 0.2 }], 'a.jpg')
    expect(v.length).toBeLessThan(210)
  })
})
