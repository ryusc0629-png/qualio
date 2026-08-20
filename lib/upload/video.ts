// 현장에서 올리는 작업 영상 — 브라우저에서 알아서 줄여서 올린다.
//
// ⛔현장 직원·사장님에게 "영상을 줄여서 올리세요", "카메라를 FHD로 바꾸세요" 같은 걸
//   시키지 않는다. 폰 설정을 찾아 들어가는 건 우리 사용자(비테크 40~60대)에게 너무 어렵고,
//   현장에서 그러고 있을 시간도 없다. 찍은 대로 골라주면 나머지는 우리가 한다.
//
// 왜 줄여야 하나: 스토리지가 받는 건 50MB인데 4K 10초가 40~60MB다. 게다가 현장은 대개 LTE라
// 60MB를 올리는 데만 1분 가까이 걸린다. 최종 영상은 1080×1920으로 만들어지고 클립은
// 뒤에 깔리는 배경일 뿐이라, 4K 원본의 화질은 어차피 전부 버려진다.
//
// ⚠️ 줄이기는 '실패해도 되는' 최적화다(사진의 compressImage와 같은 원칙).
//    안 되는 폰에서는 원본을 그대로 올린다 — 못 올리는 것보다 낫다.

/**
 * 한 번에 올릴 수 있는 최대 크기(MB).
 *
 * Supabase 스토리지 실제 한계는 50MB다(2026-08-21 확인: 45MB 성공 / 51MB 413 EntityTooLarge).
 * 딱 맞추면 경계에서 실패하므로 45MB에서 막는다. 대개는 줄이기가 먼저 성공해서 여기까지 안 온다.
 */
export const VIDEO_MAX_MB = 45

/** 이보다 크면 줄여서 올린다 */
const COMPRESS_OVER_BYTES = 15 * 1024 * 1024
/** 줄일 때 목표 해상도(짧은 변). 최종 영상이 1080×1920이고 클립은 배경이라 이걸로 충분하다 */
const TARGET_SHORT_SIDE = 720
/** 줄일 때 목표 화질(bps) */
const TARGET_BITRATE = 2_500_000

/** 이보다 길면 앞부분만 쓰인다고 알려준다 */
export const VIDEO_MAX_SECONDS = 20
/** 이보다 짧으면 배경이 자주 갈아엎히므로 알려준다 */
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

/**
 * 올려도 되는 영상인지 본다. **줄이기를 끝낸 뒤에** 부른다.
 *
 * 막는 건 '올려봐야 실패하는 것'뿐이다. 가로 영상처럼 결과가 아쉬워질 뿐인 건
 * 알려주기만 하고 올린다 — 현장에서 다시 찍으러 갈 수는 없다.
 *
 * ⛔문구에 MB·해상도·카메라 설정을 쓰지 않는다. 우리 사용자는 그걸로 뭘 해야 할지 모른다.
 *   할 수 있는 건 '더 짧게 찍기' 하나뿐이라 그것만 말한다.
 */
export function checkVideo(file: File, meta: VideoMeta | null): VideoCheck {
  if (file.size > VIDEO_MAX_MB * 1024 * 1024) {
    // 여기까지 왔다는 건 줄이기가 안 되는 폰이라는 뜻이다. 할 수 있는 건 짧게 찍는 것뿐.
    const seconds =
      meta && meta.duration > 0
        ? Math.max(5, Math.floor((VIDEO_MAX_MB / (file.size / (1024 * 1024))) * meta.duration))
        : 10
    return {
      ok: false,
      error: `이 영상은 올리기엔 너무 길어요. ${seconds}초 안쪽으로 짧게 찍어서 올려주세요.`,
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
      warning: `${Math.round(meta.duration)}초짜리네요. 앞부분만 쓰여요. 5~10초면 딱 좋아요.`,
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

// ── 영상 줄이기 ────────────────────────────────────────────

/** 이 폰에서 만들 수 있는 영상 형식을 고른다. mp4가 되면 mp4로(호환성이 제일 좋다) */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null
}

/** video 태그에서 소리 트랙을 꺼낸다 (사파리는 접두사가 붙어 있다) */
function grabAudioTrack(video: HTMLVideoElement): MediaStreamTrack | null {
  try {
    const el = video as HTMLVideoElement & {
      captureStream?: () => MediaStream
      mozCaptureStream?: () => MediaStream
    }
    const capture = el.captureStream ?? el.mozCaptureStream
    if (!capture) return null
    return capture.call(el).getAudioTracks()[0] ?? null
  } catch {
    return null
  }
}

/**
 * 영상을 올리기 좋은 크기로 줄인다. 실패하면 원본을 그대로 돌려준다.
 *
 * 화면을 캔버스에 다시 그리면서 녹화하는 방식이라 영상 길이만큼 시간이 걸린다
 * (10초짜리면 10초). 그래서 진행률을 콜백으로 알려준다 — 안 알려주면 멈춘 줄 안다.
 */
export async function compressVideo(
  file: File,
  meta: VideoMeta | null,
  onProgress?: (percent: number) => void,
): Promise<File> {
  // 이미 작으면 굳이 시간 들이지 않는다
  if (file.size <= COMPRESS_OVER_BYTES) return file
  if (typeof document === 'undefined') return file

  const mimeType = pickMimeType()
  if (!mimeType) return file

  const duration = meta?.duration ?? 0
  if (!duration || !Number.isFinite(duration)) return file

  const objectUrl = URL.createObjectURL(file)

  try {
    const video = document.createElement('video')
    video.src = objectUrl
    video.playsInline = true
    // 소리는 녹화 트랙으로만 쓰고 현장에서 재생음이 들리진 않게 한다
    video.volume = 0

    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true })
      video.addEventListener('error', () => reject(new Error('메타데이터 실패')), { once: true })
      video.load()
    })

    const srcW = video.videoWidth
    const srcH = video.videoHeight
    if (!srcW || !srcH) return file

    // 짧은 변을 720에 맞춘다. 원본이 이미 그보다 작으면 키우지 않는다.
    const scale = Math.min(1, TARGET_SHORT_SIDE / Math.min(srcW, srcH))
    // 짝수로 맞춘다 — 홀수 해상도는 인코더가 거부하는 경우가 있다
    const w = Math.max(2, Math.round((srcW * scale) / 2) * 2)
    const h = Math.max(2, Math.round((srcH * scale) / 2) * 2)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    const stream = canvas.captureStream(30)
    const audio = grabAudioTrack(video)
    if (audio) stream.addTrack(audio)

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: TARGET_BITRATE,
    })

    const chunks: BlobPart[] = []
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    })

    const finished = new Promise<void>((resolve, reject) => {
      recorder.addEventListener('stop', () => resolve(), { once: true })
      recorder.addEventListener('error', () => reject(new Error('녹화 실패')), { once: true })
    })

    // 영상 길이의 2배 + 15초 안에 안 끝나면 포기하고 원본을 쓴다.
    // (백그라운드로 넘어가면 rAF가 멈춰 영영 안 끝날 수 있다)
    const guard = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop()
    }, duration * 2000 + 15_000)

    recorder.start()
    await video.play()

    await new Promise<void>((resolve) => {
      const draw = () => {
        if (video.ended || video.paused) {
          resolve()
          return
        }
        ctx.drawImage(video, 0, 0, w, h)
        onProgress?.(Math.min(99, Math.round((video.currentTime / duration) * 100)))
        requestAnimationFrame(draw)
      }
      video.addEventListener('ended', () => resolve(), { once: true })
      requestAnimationFrame(draw)
    })

    if (recorder.state === 'recording') recorder.stop()
    await finished
    clearTimeout(guard)

    const blob = new Blob(chunks, { type: mimeType.split(';')[0] })
    // 줄였는데 오히려 커졌으면(짧고 화면 변화가 심한 영상) 원본이 낫다
    if (blob.size === 0 || blob.size >= file.size) return file

    const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
    const name = file.name.replace(/\.[^.]+$/, '') + `.${ext}`
    return new File([blob], name, { type: blob.type, lastModified: Date.now() })
  } catch (err) {
    console.error('[Video] 줄이기 실패 — 원본으로 올립니다:', err)
    return file
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
