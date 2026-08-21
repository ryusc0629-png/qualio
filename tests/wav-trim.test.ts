import { describe, it, expect } from 'vitest'
import { readWavInfo, trimWavSilence } from '@/lib/ai/wav'

// 문장을 하나씩 합성해 이어 붙이는데 파일마다 앞뒤에 짧은 무음이 붙는다.
// 그게 쌓여 문장 사이가 뜨고, 듣는 사람에게는 "숨 쉬는 시간"으로 들린다.
// 예전엔 0.12초를 감으로 잘랐다 — 어떤 건 무음이 남고 어떤 건 말끝이 씹혔다.

const RATE = 24000

/** 무음 head초 + 소리 body초 + 무음 tail초짜리 모노 WAV를 만든다 */
function makeWav(head: number, body: number, tail: number, amplitude = 8000): Buffer {
  const frames = Math.round((head + body + tail) * RATE)
  const data = Buffer.alloc(frames * 2)
  const bodyStart = Math.round(head * RATE)
  const bodyEnd = bodyStart + Math.round(body * RATE)
  for (let i = bodyStart; i < bodyEnd; i++) {
    // 사인파 비슷하게 — 0을 지나는 구간이 있어도 무음으로 오인하면 안 된다
    data.writeInt16LE(Math.round(Math.sin(i / 12) * amplitude), i * 2)
  }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0, 'ascii'); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8, 'ascii')
  h.write('fmt ', 12, 'ascii'); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28)
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36, 'ascii'); h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

describe('WAV 헤더 읽기', () => {
  it('샘플레이트·채널을 읽는다', () => {
    const info = readWavInfo(makeWav(0, 1, 0))
    expect(info?.sampleRate).toBe(RATE)
    expect(info?.channels).toBe(1)
    expect(info?.bitsPerSample).toBe(16)
  })

  it('WAV가 아니면 null', () => {
    expect(readWavInfo(Buffer.from('이건 wav가 아닙니다'))).toBeNull()
    expect(readWavInfo(Buffer.alloc(0))).toBeNull()
  })
})

describe('앞뒤 무음 잘라내기', () => {
  it('앞뒤 무음을 잘라내고 말만 남긴다', () => {
    const r = trimWavSilence(makeWav(0.5, 2.0, 0.8))
    expect(r).not.toBeNull()
    // 말 2초 + 앞뒤 여유 0.04초씩
    expect(r!.seconds).toBeGreaterThan(1.95)
    expect(r!.seconds).toBeLessThan(2.15)
    expect(r!.trimmedHead).toBeGreaterThan(0.4)
    expect(r!.trimmedTail).toBeGreaterThan(0.7)
  })

  it('잘라낸 길이가 헤더와 실제 데이터에 모두 반영된다', () => {
    const r = trimWavSilence(makeWav(0.5, 1.0, 0.5))!
    const info = readWavInfo(r.wav)!
    expect(info.dataLength).toBe(r.wav.length - 44)
    // 헤더에 적힌 길이와 실제 초가 맞아야 한다 — 안 맞으면 자막이 밀린다
    expect(info.dataLength / 2 / info.sampleRate).toBeCloseTo(r.seconds, 2)
  })

  it('말끝을 씹지 않는다 — 여유를 두고 자른다', () => {
    const r = trimWavSilence(makeWav(0.3, 1.0, 0.3))!
    expect(r.seconds).toBeGreaterThan(1.0)
  })

  it('무음이 없으면 거의 그대로 둔다', () => {
    const r = trimWavSilence(makeWav(0, 1.5, 0))!
    expect(r.seconds).toBeCloseTo(1.5, 1)
    expect(r.trimmedHead).toBe(0)
    expect(r.trimmedTail).toBe(0)
  })

  it('통째로 무음이면 null — 빈 소리를 자막 길이로 쓰면 안 된다', () => {
    expect(trimWavSilence(makeWav(1.0, 0, 0))).toBeNull()
  })

  it('말 중간의 조용한 구간은 건드리지 않는다', () => {
    // 소리 - 무음 - 소리 : 가운데는 문장 안의 자연스러운 끊김이라 남겨야 한다
    const a = makeWav(0.2, 0.5, 0)
    const gap = Buffer.alloc(Math.round(0.3 * RATE) * 2)
    const b = makeWav(0, 0.5, 0.2)
    const merged = Buffer.concat([a.subarray(44), gap, b.subarray(44)])
    const h = a.subarray(0, 44)
    h.writeUInt32LE(merged.length, 40)
    h.writeUInt32LE(36 + merged.length, 4)
    const r = trimWavSilence(Buffer.concat([h, merged]))!
    // 0.5 + 0.3(가운데) + 0.5 = 1.3초가 남아야 한다
    expect(r.seconds).toBeGreaterThan(1.25)
  })
})
