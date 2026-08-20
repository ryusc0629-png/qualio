// 현장에서 올리는 작업 영상 — 올리기 전에 브라우저에서 미리 확인한다.
//
// 왜 필요한가: 예전엔 200MB까지 통과시켰는데 스토리지가 실제로 받는 건 50MB다.
// 그래서 4K로 찍은 10초짜리(40~60MB)를 고르면 한참 올라가다가 마지막에
// "영상이 너무 커요"만 뜨고 끝났다. 현장에서 회선도 느린데 시간만 버린 셈이다.
// 고르는 즉시 재보고, 무엇을 바꾸면 되는지까지 알려준다.

/**
 * 한 번에 올릴 수 있는 최대 크기(MB).
 *
 * Supabase 스토리지 실제 한계는 50MB다(2026-08-21 확인: 45MB 성공 / 51MB 413 EntityTooLarge).
 * 딱 맞추면 경계에서 실패하므로 45MB에서 미리 막는다.
 */
export const VIDEO_MAX_MB = 45

/** 이 길이를 넘으면 파일이 커져서 대개 못 올린다 */
export const VIDEO_MAX_SECONDS = 20
/** 이보다 짧으면 릴스에서 화면이 계속 되감긴다 */
export const VIDEO_MIN_SECONDS = 3

export interface VideoMeta {
  /** 재생 길이(초) */
  duration: number
  width: number
  height: number
  /** 첫 프레임 미리보기 (data URL) */
  thumbnailUrl: string
}

/**
 * 영상 파일에서 길이·크기·첫 프레임을 읽는다.
 *
 * 썸네일을 뽑느라 어차피 video 태그에 한 번 올리므로, 그 김에 길이와 가로세로도 같이 읽는다.
 * 못 읽어도 업로드는 막지 않는다 — 읽기 실패는 '영상이 잘못됐다'는 뜻이 아니다.
 */
export function readVideoMeta(file: File): Promise<VideoMeta | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.src = objectUrl
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'

    // 폰에서 메타데이터조차 안 읽히는 코덱이 있다 — 영영 매달리지 않게 제한시간을 둔다
    const timer = setTimeout(() => {
      URL.revokeObjectURL(objectUrl)
      resolve(null)
    }, 10_000)

    const done = (meta: VideoMeta | null) => {
      clearTimeout(timer)
      URL.revokeObjectURL(objectUrl)
      resolve(meta)
    }

    video.addEventListener(
      'loadedmetadata',
      () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0
        const width = video.videoWidth
        const height = video.videoHeight

        // 첫 프레임을 잡으려면 조금 앞으로 감아야 한다(0초는 검은 화면인 경우가 많다)
        video.currentTime = Math.min(0.5, duration / 2)

        video.addEventListener(
          'seeked',
          () => {
            const canvas = document.createElement('canvas')
            canvas.width = 320
            canvas.height = 320
            const ctx = canvas.getContext('2d')
            if (ctx) ctx.drawImage(video, 0, 0, 320, 320)
            done({ duration, width, height, thumbnailUrl: canvas.toDataURL('image/jpeg', 0.8) })
          },
          { once: true },
        )
      },
      { once: true },
    )

    video.addEventListener('error', () => done(null), { once: true })
    video.load()
  })
}

export interface VideoCheck {
  /** false면 올리지 않는다 */
  ok: boolean
  /** 못 올리는 이유 + 무엇을 바꾸면 되는지 */
  error?: string
  /** 올리긴 하되 알려줄 것 (가로 영상 등) */
  warning?: string
}

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024))

/**
 * 올려도 되는 영상인지 본다.
 *
 * 막는 건 '올려봐야 실패하는 것'뿐이다. 가로 영상처럼 결과가 아쉬워질 뿐인 건
 * 알려주기만 하고 올린다 — 현장에서 다시 찍으러 갈 수는 없다.
 */
export function checkVideo(file: File, meta: VideoMeta | null): VideoCheck {
  const sizeMb = mb(file.size)

  if (file.size > VIDEO_MAX_MB * 1024 * 1024) {
    // 길이를 아는 경우엔 '몇 초로 줄이면 되는지'까지 계산해서 알려준다
    const hint =
      meta && meta.duration > 0
        ? `지금 ${Math.round(meta.duration)}초짜리 ${sizeMb}MB예요. ${Math.max(
            3,
            Math.floor((VIDEO_MAX_MB / sizeMb) * meta.duration),
          )}초 안쪽으로 찍으면 올라가요.`
        : `지금 ${sizeMb}MB인데 ${VIDEO_MAX_MB}MB까지만 올라가요.`
    return {
      ok: false,
      error: `${hint} 4K로 찍고 계시면 카메라 설정을 FHD(1080p)로 바꿔주세요.`,
    }
  }

  if (meta && meta.duration > 0 && meta.duration < VIDEO_MIN_SECONDS) {
    return {
      ok: true,
      warning: `${meta.duration.toFixed(1)}초는 좀 짧아요. 5~10초면 딱 좋아요.`,
    }
  }

  if (meta && meta.duration > VIDEO_MAX_SECONDS) {
    return {
      ok: true,
      warning: `${Math.round(meta.duration)}초짜리네요. 영상에는 앞부분만 쓰여요. 10초 안쪽이 제일 좋아요.`,
    }
  }

  if (meta && meta.width > 0 && meta.width > meta.height) {
    return {
      ok: true,
      warning: '가로로 찍으셨네요. 좌우가 잘려요. 다음엔 폰을 세워서 찍어주세요.',
    }
  }

  return { ok: true }
}
