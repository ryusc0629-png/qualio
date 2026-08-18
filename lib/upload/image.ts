// 현장에서 사진을 빨리 올리기 위한 도구.
//
// 무엇이 느렸나:
// 1) 폰 사진을 원본 그대로 올렸다. 아이폰 사진 한 장이 3~5MB고, 현장은 대개 LTE다.
// 2) 한 장씩 순서대로 올렸다. 5장이면 그냥 5배 걸린다.
//
// 어떻게 고쳤나:
// 1) 올리기 전에 긴 변 1600px으로 줄이고 JPEG로 다시 굽는다 → 보통 3MB가 250KB 안팎이 된다.
//    보고서·후기에 쓰는 사진은 폰 화면과 A4 인쇄가 끝이라 1600px이면 충분하다.
// 2) 여러 장을 동시에 올린다(기본 3개). 무한정 늘리면 현장 회선에서 오히려 느려진다.
//
// ⚠️ 압축은 '실패해도 되는' 최적화다. 어떤 이유로든 안 되면 원본을 그대로 올린다 —
//    사진을 못 올리는 것보다 느리게라도 올라가는 게 낫다.

const MAX_SIDE = 1600
const QUALITY = 0.82
/** 이보다 작으면 굳이 다시 굽지 않는다 */
const SKIP_UNDER = 400 * 1024

/**
 * 사진을 올리기 좋은 크기로 줄인다. 실패하면 원본을 그대로 돌려준다.
 *
 * EXIF 회전은 createImageBitmap의 imageOrientation으로 처리한다 —
 * 이걸 안 하면 세로로 찍은 사진이 눕는다.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    if (file.size <= SKIP_UNDER) return file
    if (typeof createImageBitmap !== 'function') return file

    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { width, height } = bitmap

    const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
    const w = Math.round(width * scale)
    const h = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    )
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    // HEIC를 못 여는 브라우저 등 — 원본으로 올린다
    return file
  }
}

/**
 * 여러 개를 동시에(기본 3개씩) 처리한다. 결과 순서는 입력 순서를 지킨다.
 * 순차 처리보다 체감이 크게 빨라지는 대신, 너무 늘리면 현장 회선에서 되레 느려진다.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  limit = 3,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  async function run() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await worker(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}
