import { describe, it, expect } from 'vitest'
import { checkVideo, VIDEO_MAX_MB, type VideoMeta } from '@/lib/upload/video'

// 현장에서 영상을 고르면 '올려봐야 실패할 것'만 막고, 나머지는 알려주기만 한다.
// 예전엔 200MB까지 통과시켜 놓고 스토리지(50MB)에서 떨어뜨려서,
// 느린 현장 회선으로 한참 올린 뒤에야 실패를 알았다.

function file(sizeMb: number): File {
  return { size: sizeMb * 1024 * 1024, name: 'clip.mp4', type: 'video/mp4' } as File
}

function meta(duration: number, width = 1080, height = 1920): VideoMeta {
  return { duration, width, height, thumbnailUrl: '' }
}

describe('영상 올리기 전 검사', () => {
  it('스토리지가 못 받는 크기는 올리기 전에 막는다', () => {
    const r = checkVideo(file(VIDEO_MAX_MB + 20), meta(10))
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })

  it('너무 클 때 몇 초로 줄이면 되는지 알려준다', () => {
    // 20초 130MB → 45MB에 맞추려면 6초쯤
    const r = checkVideo(file(130), meta(20))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/초 안쪽으로 찍으면/)
    expect(r.error).toMatch(/1080p|FHD/)
  })

  it('길이를 못 읽었어도 크기만으로 막을 수 있다', () => {
    const r = checkVideo(file(120), null)
    expect(r.ok).toBe(false)
    expect(r.error).toContain(`${VIDEO_MAX_MB}MB`)
  })

  it('알맞은 영상은 아무 말 없이 통과한다', () => {
    const r = checkVideo(file(12), meta(8))
    expect(r.ok).toBe(true)
    expect(r.error).toBeUndefined()
    expect(r.warning).toBeUndefined()
  })

  it('가로 영상은 막지 않고 잘린다고만 알려준다', () => {
    // 현장에서 다시 찍으러 갈 수는 없다 — 막으면 보고서 자체를 못 낸다
    const r = checkVideo(file(12), meta(8, 1920, 1080))
    expect(r.ok).toBe(true)
    expect(r.warning).toMatch(/가로/)
  })

  it('너무 짧은 영상은 올리되 알려준다', () => {
    const r = checkVideo(file(3), meta(1.5))
    expect(r.ok).toBe(true)
    expect(r.warning).toMatch(/짧/)
  })

  it('너무 긴 영상은 올리되 앞부분만 쓰인다고 알려준다', () => {
    const r = checkVideo(file(30), meta(45))
    expect(r.ok).toBe(true)
    expect(r.warning).toMatch(/앞부분/)
  })

  it('경계값(45MB 딱)은 통과시킨다', () => {
    expect(checkVideo(file(VIDEO_MAX_MB), meta(10)).ok).toBe(true)
  })
})
