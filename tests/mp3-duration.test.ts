import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { mp3DurationSeconds } from '@/lib/ai/mp3-duration'

// 릴스 자막·화면 길이는 나레이션 mp3의 '실제' 길이에 맞춘다.
// 글자 수로 추정하면 문장마다 7~10자/초로 편차가 커서 뒤로 갈수록 자막이 목소리보다 밀린다.
// 이 파서가 틀리면 그 어긋남이 그대로 영상에 남으므로 ffprobe 실측값과 대조해 고정한다.

const FIXTURES = join(import.meta.dirname, 'fixtures')

// [파일명, ffprobe로 잰 실제 길이(초)]
const CASES: [string, number][] = [
  ['t_cbr64.mp3', 6.5],      // CBR 64k 44.1kHz 스테레오
  ['t_vbr.mp3', 6.5],        // VBR
  ['t_24k_mono.mp3', 6.5],   // 24kHz 모노 (TTS가 흔히 내보내는 형태)
  ['t_id3.mp3', 3.0],        // 앞에 ID3v2 태그가 붙은 파일
]

describe('mp3 길이 재기', () => {
  for (const [name, expected] of CASES) {
    it(`${name} 길이를 ffprobe와 같게 잰다`, () => {
      const path = join(FIXTURES, name)
      if (!existsSync(path)) {
        throw new Error(`테스트용 mp3가 없어요: ${path}`)
      }
      const got = mp3DurationSeconds(readFileSync(path))
      expect(got).not.toBeNull()
      // 프레임 단위(약 0.026초)로 재므로 0.1초 안쪽이면 맞는 것
      expect(Math.abs(got! - expected)).toBeLessThan(0.1)
    })
  }

  it('mp3가 아니면 추정하지 않고 실패를 알린다', () => {
    expect(mp3DurationSeconds(Buffer.from('이건 mp3가 아니라 그냥 글자입니다'))).toBeNull()
    expect(mp3DurationSeconds(Buffer.alloc(0))).toBeNull()
  })
})
